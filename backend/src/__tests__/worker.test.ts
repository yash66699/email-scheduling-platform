import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEmailWorker } from '../queue/worker';
import { RateLimiterService } from '../services/rateLimiterService';
import { EtherealService } from '../services/etherealService';
import { prisma } from '../config/db';
import { EmailStatus } from '@prisma/client';
import * as bullmq from 'bullmq';

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((queueName, processor) => {
    return {
      on: vi.fn(),
      processor,
    };
  }),
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    addBulk: vi.fn(),
    getJob: vi.fn(),
  })),
}));

vi.mock('../services/rateLimiterService', () => ({
  RateLimiterService: {
    checkAndIncrementRateLimit: vi.fn(),
    reserveInterEmailSlot: vi.fn(),
    shouldNotifySlack: vi.fn().mockResolvedValue(false),
  },
}));

vi.mock('../services/etherealService', () => ({
  EtherealService: {
    sendEmail: vi.fn().mockResolvedValue({ messageId: 'msg-123', previewUrl: 'url' }),
  },
}));

vi.mock('../services/slackService', () => ({
  SlackService: {
    sendRateLimitNotification: vi.fn(),
  },
}));

vi.mock('../services/elasticsearchService', () => ({
  ElasticsearchService: {
    indexEmail: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../config/db', () => ({
  prisma: {
    email: {
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({ createdAt: new Date() }),
    },
  },
}));

describe('Worker Throttling Flow', () => {
  let processor: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const worker: any = createEmailWorker();
    processor = worker.processor;
  });

  const mockJob = (data: any = {}) => ({
    id: 'job-1',
    data: {
      emailId: 'email-1',
      userId: 'user-1',
      senderId: 'sender-1',
      recipient: 'test@test.com',
      subject: 'Test',
      body: 'Test',
      scheduledAt: new Date().toISOString(),
      idempotencyKey: 'key',
      ...data,
    },
    updateData: vi.fn().mockResolvedValue(true),
    moveToDelayed: vi.fn().mockResolvedValue(true),
  });

  const setupPrisma = () => {
    vi.mocked(prisma.email.findUnique).mockResolvedValue({
      id: 'email-1',
      status: EmailStatus.QUEUED,
      sender: {
        email: 'sender@test.com',
        maxEmailsPerHour: 100,
        minDelayMsBetweenSend: 2000,
      },
    } as any);
  };

  it('1. No reservation marker + immediate reservation -> hourly check proceeds', async () => {
    setupPrisma();
    const job = mockJob();
    const token = 'token-1';

    vi.mocked(RateLimiterService.reserveInterEmailSlot).mockResolvedValue({
      allowedNow: true,
      delayMs: 0,
      reservedAt: Date.now(),
    });

    vi.mocked(RateLimiterService.checkAndIncrementRateLimit).mockResolvedValue({
      allowed: true,
      currentCount: 1,
      maxLimit: 100,
      msUntilNextHour: 3600000,
    });

    const result = await processor(job, token);

    expect(RateLimiterService.reserveInterEmailSlot).toHaveBeenCalled();
    expect(RateLimiterService.checkAndIncrementRateLimit).toHaveBeenCalled();
    expect(result.status).toBe('SENT');
  });

  it('2. No reservation marker + future reservation -> job delayed and marker persisted', async () => {
    setupPrisma();
    const job = mockJob();
    const token = 'token-2';

    vi.mocked(RateLimiterService.reserveInterEmailSlot).mockResolvedValue({
      allowedNow: false,
      delayMs: 2000,
      reservedAt: Date.now() + 2000,
    });

    const result = await processor(job, token);

    expect(RateLimiterService.reserveInterEmailSlot).toHaveBeenCalled();
    expect(RateLimiterService.checkAndIncrementRateLimit).not.toHaveBeenCalled();
    expect(job.updateData).toHaveBeenCalledWith(expect.objectContaining({
      interEmailReservedAt: expect.any(Number),
    }));
    expect(job.moveToDelayed).toHaveBeenCalled();
    expect(result.status).toBe('RESCHEDULED_INTER_EMAIL_DELAY');
  });

  it('3 & 4. Existing reservation marker in future -> reserveInterEmailSlot NOT called, job delayed', async () => {
    setupPrisma();
    const futureTime = Date.now() + 5000;
    const job = mockJob({ interEmailReservedAt: futureTime });
    const token = 'token-3';

    const result = await processor(job, token);

    expect(RateLimiterService.reserveInterEmailSlot).not.toHaveBeenCalled();
    expect(RateLimiterService.checkAndIncrementRateLimit).not.toHaveBeenCalled();
    expect(job.moveToDelayed).toHaveBeenCalledWith(futureTime, token);
    expect(result.status).toBe('RESCHEDULED_INTER_EMAIL_DELAY');
  });

  it('5. Existing reservation marker due/past -> reserveInterEmailSlot NOT called and hourly check proceeds', async () => {
    setupPrisma();
    const job = mockJob({ interEmailReservedAt: Date.now() - 1000 });
    const token = 'token-5';

    vi.mocked(RateLimiterService.checkAndIncrementRateLimit).mockResolvedValue({
      allowed: true,
      currentCount: 1,
      maxLimit: 100,
      msUntilNextHour: 3600000,
    });

    const result = await processor(job, token);

    expect(RateLimiterService.reserveInterEmailSlot).not.toHaveBeenCalled();
    expect(RateLimiterService.checkAndIncrementRateLimit).toHaveBeenCalled();
    expect(job.updateData).toHaveBeenCalledWith(expect.objectContaining({
      interEmailReservedAt: undefined,
    }));
    expect(result.status).toBe('SENT');
  });

  it('6 & 7. Existing reservation marker due + hourly hit -> cleared and hourly rescheduling occurs', async () => {
    setupPrisma();
    const job = mockJob({ interEmailReservedAt: Date.now() - 1000 });
    const token = 'token-6';

    vi.mocked(RateLimiterService.checkAndIncrementRateLimit).mockResolvedValue({
      allowed: false,
      currentCount: 101,
      maxLimit: 100,
      msUntilNextHour: 10000,
    });

    const result = await processor(job, token);

    expect(RateLimiterService.reserveInterEmailSlot).not.toHaveBeenCalled();
    expect(RateLimiterService.checkAndIncrementRateLimit).toHaveBeenCalled();
    expect(job.updateData).toHaveBeenCalledWith(expect.objectContaining({
      interEmailReservedAt: undefined,
    }));
    expect(job.moveToDelayed).toHaveBeenCalled();
    expect(result.status).toBe('RESCHEDULED_RATE_LIMITED');
  });
});
