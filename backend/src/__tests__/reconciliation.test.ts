import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performStartupReconciliation } from '../server';
import { prisma } from '../config/db';
import { emailQueue, addBulkEmailJobsToQueue } from '../queue/emailQueue';
import { EmailStatus } from '@prisma/client';

// Mock dependencies
vi.mock('../config/db', () => ({
  prisma: {
    email: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $disconnect: vi.fn(),
  },
  checkDatabaseConnection: vi.fn().mockResolvedValue(true),
}));

vi.mock('../queue/emailQueue', () => ({
  emailQueue: {
    getJob: vi.fn(),
  },
  addBulkEmailJobsToQueue: vi.fn(),
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../config/env', () => ({
  config: {
    port: 5000,
  }
}));

vi.mock('../app', () => ({
  createApp: vi.fn().mockReturnValue({
    listen: vi.fn(),
  })
}));

vi.mock('../config/redis', () => ({
  checkRedisConnection: vi.fn().mockResolvedValue(true),
}));

vi.mock('../config/elasticsearch', () => ({
  initializeElasticsearchIndex: vi.fn().mockResolvedValue(true),
}));

describe('Startup Reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Existing BullMQ job is not duplicated', async () => {
    const emailId = 'email-1';
    vi.mocked(prisma.email.findMany).mockResolvedValueOnce([{
      id: emailId,
      userId: 'user-1',
      senderId: 'sender-1',
      recipient: 'test@test.com',
      subject: 'Test',
      body: 'Test',
      scheduledAt: new Date(Date.now() + 10000), // future
      status: EmailStatus.QUEUED,
      idempotencyKey: 'key-1'
    } as any]);

    // BullMQ already has the job
    vi.mocked(emailQueue.getJob).mockResolvedValueOnce({ id: emailId } as any);

    await performStartupReconciliation();

    expect(emailQueue.getJob).toHaveBeenCalledWith(emailId);
    expect(addBulkEmailJobsToQueue).not.toHaveBeenCalled();
  });

  it('2. Missing BullMQ job is recreated', async () => {
    const emailId = 'email-2';
    vi.mocked(prisma.email.findMany).mockResolvedValueOnce([{
      id: emailId,
      userId: 'user-2',
      senderId: 'sender-2',
      recipient: 'test@test.com',
      subject: 'Test',
      body: 'Test',
      scheduledAt: new Date(Date.now() + 10000),
      status: EmailStatus.SCHEDULED,
      idempotencyKey: 'key-2'
    } as any]);

    vi.mocked(emailQueue.getJob).mockResolvedValueOnce(null);

    await performStartupReconciliation();

    expect(emailQueue.getJob).toHaveBeenCalledWith(emailId);
    expect(addBulkEmailJobsToQueue).toHaveBeenCalledTimes(1);
    
    const callArgs = vi.mocked(addBulkEmailJobsToQueue).mock.calls[0][0];
    expect(callArgs).toHaveLength(1);
    expect(callArgs[0].payload.emailId).toBe(emailId);
  });

  it('3. Future scheduled email receives the correct delay', async () => {
    const futureDate = new Date(Date.now() + 50000);
    vi.mocked(prisma.email.findMany).mockResolvedValueOnce([{
      id: 'email-3',
      userId: 'user-3',
      senderId: 'sender-3',
      recipient: 'test@test.com',
      subject: 'Test',
      body: 'Test',
      scheduledAt: futureDate,
      status: EmailStatus.SCHEDULED,
      idempotencyKey: 'key-3'
    } as any]);

    vi.mocked(emailQueue.getJob).mockResolvedValueOnce(null);

    await performStartupReconciliation();

    const callArgs = vi.mocked(addBulkEmailJobsToQueue).mock.calls[0][0];
    expect(callArgs[0].delayMs).toBeGreaterThan(0);
    expect(callArgs[0].delayMs).toBeLessThanOrEqual(50000);
  });

  it('4. Past-due email is immediately executable', async () => {
    const pastDate = new Date(Date.now() - 50000);
    vi.mocked(prisma.email.findMany).mockResolvedValueOnce([{
      id: 'email-4',
      userId: 'user-4',
      senderId: 'sender-4',
      recipient: 'test@test.com',
      subject: 'Test',
      body: 'Test',
      scheduledAt: pastDate,
      status: EmailStatus.QUEUED,
      idempotencyKey: 'key-4'
    } as any]);

    vi.mocked(emailQueue.getJob).mockResolvedValueOnce(null);

    await performStartupReconciliation();

    const callArgs = vi.mocked(addBulkEmailJobsToQueue).mock.calls[0][0];
    expect(callArgs[0].delayMs).toBe(0);
  });

  it('5. Running reconciliation twice does not create duplicate jobs', async () => {
    const email = {
      id: 'email-5',
      userId: 'user-5',
      senderId: 'sender-5',
      recipient: 'test@test.com',
      subject: 'Test',
      body: 'Test',
      scheduledAt: new Date(),
      status: EmailStatus.QUEUED,
      idempotencyKey: 'key-5'
    };

    vi.mocked(prisma.email.findMany).mockResolvedValue([email as any]);

    vi.mocked(emailQueue.getJob).mockResolvedValueOnce(null);
    await performStartupReconciliation();
    expect(addBulkEmailJobsToQueue).toHaveBeenCalledTimes(1);

    vi.mocked(emailQueue.getJob).mockResolvedValueOnce({ id: email.id } as any);
    await performStartupReconciliation();
    expect(addBulkEmailJobsToQueue).toHaveBeenCalledTimes(1);
  });

  it('6. A recovered PROCESSING email follows the existing recovery policy', async () => {
    vi.mocked(prisma.email.updateMany).mockResolvedValueOnce({ count: 1 });
    vi.mocked(prisma.email.updateMany).mockResolvedValueOnce({ count: 0 });
    
    const pastDate = new Date(Date.now() - 5 * 60 * 1000);
    vi.mocked(prisma.email.findMany).mockResolvedValueOnce([{
      id: 'email-stale',
      userId: 'user',
      senderId: 'sender',
      recipient: 'test@test.com',
      subject: 'Test',
      body: 'Test',
      scheduledAt: pastDate,
      status: EmailStatus.QUEUED,
      idempotencyKey: 'key-stale'
    } as any]);

    vi.mocked(emailQueue.getJob).mockResolvedValueOnce(null);

    await performStartupReconciliation();

    const updateCalls = vi.mocked(prisma.email.updateMany).mock.calls;
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    expect(updateCalls[0][0].where).toMatchObject({
      status: EmailStatus.PROCESSING,
    });
    
    expect(addBulkEmailJobsToQueue).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(addBulkEmailJobsToQueue).mock.calls[0][0];
    expect(callArgs[0].payload.emailId).toBe('email-stale');
    expect(callArgs[0].delayMs).toBe(0);
  });
});
