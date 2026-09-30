import { Queue } from 'bullmq';
import { redisConnectionOptions } from '../config/redis';
import { logger } from '../utils/logger';

export const EMAIL_QUEUE_NAME = 'email-queue';

export interface EmailJobPayload {
  emailId: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string; // ISO string
  idempotencyKey: string;
  interEmailReservedAt?: number;
}

export const emailQueue = new Queue<EmailJobPayload>(EMAIL_QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    removeOnComplete: { age: 86400, count: 5000 },
    removeOnFail: { age: 604800, count: 10000 },
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

export async function addEmailJobToQueue(
  payload: EmailJobPayload,
  delayMs: number
): Promise<string> {
  const safeDelay = Math.max(0, delayMs);
  const job = await emailQueue.add('send-email', payload, {
    jobId: payload.emailId, // Stable job ID matching PostgreSQL Email primary key
    delay: safeDelay,
  });
  logger.info(`Enqueued job ${job.id} for email ${payload.emailId} with delay ${safeDelay}ms`);
  return job.id || payload.emailId;
}

export async function addBulkEmailJobsToQueue(
  jobsData: { payload: EmailJobPayload; delayMs: number }[]
) {
  const bulkJobs = jobsData.map((item) => ({
    name: 'send-email',
    data: item.payload,
    opts: {
      jobId: item.payload.emailId,
      delay: Math.max(0, item.delayMs),
    },
  }));

  const addedJobs = await emailQueue.addBulk(bulkJobs);
  logger.info(`Bulk enqueued ${addedJobs.length} email jobs to BullMQ`);
  return addedJobs;
}
