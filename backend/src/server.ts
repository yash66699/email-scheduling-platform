import { createApp } from './app';
import { config } from './config/env';
import { checkDatabaseConnection, prisma } from './config/db';
import { checkRedisConnection } from './config/redis';
import { initializeElasticsearchIndex } from './config/elasticsearch';
import { EmailStatus } from '@prisma/client';
import { logger } from './utils/logger';

import { emailQueue, addBulkEmailJobsToQueue, EmailJobPayload } from './queue/emailQueue';

export async function performStartupReconciliation(): Promise<void> {
  try {
    logger.info('Performing startup database & worker reconciliation check...');
    const now = new Date();

    // 1. Reset emails stuck in PROCESSING for > 3 minutes back to QUEUED
    const threeMinutesAgo = new Date(now.getTime() - 3 * 60 * 1000);
    const staleProcessingEmails = await prisma.email.updateMany({
      where: {
        status: EmailStatus.PROCESSING,
        updatedAt: { lt: threeMinutesAgo },
        providerMessageId: null,
      },
      data: {
        status: EmailStatus.QUEUED,
        updatedAt: now,
      },
    });

    // 2. Reset past-due SCHEDULED emails back to QUEUED for worker execution
    const pastDueEmails = await prisma.email.updateMany({
      where: {
        status: EmailStatus.SCHEDULED,
        scheduledAt: { lt: now },
      },
      data: {
        status: EmailStatus.QUEUED,
        updatedAt: now,
      },
    });

    if (staleProcessingEmails.count > 0 || pastDueEmails.count > 0) {
      logger.info(
        `Reconciliation complete: Reset ${staleProcessingEmails.count} stale PROCESSING emails and ${pastDueEmails.count} past-due SCHEDULED emails to QUEUED.`
      );
    }

    // 3. Find all emails that should be in the queue:
    // This includes QUEUED, SCHEDULED, RATE_LIMITED, and PROCESSING.
    const pendingEmails = await prisma.email.findMany({
      where: {
        status: { in: [EmailStatus.QUEUED, EmailStatus.SCHEDULED, EmailStatus.RATE_LIMITED, EmailStatus.PROCESSING] }
      }
    });

    if (pendingEmails.length === 0) {
      logger.info('Reconciliation complete: All email queue states synced. No pending emails.');
      return;
    }

    let jobsAlreadyPresent = 0;
    let jobsReEnqueued = 0;
    let jobsSkipped = 0;
    const jobsToEnqueue: { payload: EmailJobPayload; delayMs: number }[] = [];

    const chunkSize = 500;
    for (let i = 0; i < pendingEmails.length; i += chunkSize) {
      const chunk = pendingEmails.slice(i, i + chunkSize);
      
      const jobChecks = await Promise.all(
        chunk.map(async (email) => {
          const job = await emailQueue.getJob(email.id);
          if (job) {
             return { email, exists: true };
          }
          return { email, exists: false };
        })
      );

      for (const { email, exists } of jobChecks) {
        if (exists) {
          jobsAlreadyPresent++;
        } else {
          // Reconstruct payload
          const payload: EmailJobPayload = {
            emailId: email.id,
            userId: email.userId,
            senderId: email.senderId,
            recipient: email.recipient,
            subject: email.subject,
            body: email.body,
            scheduledAt: email.scheduledAt.toISOString(),
            idempotencyKey: email.idempotencyKey,
          };

          // Calculate delay
          let delayMs = 0;
          if (email.scheduledAt.getTime() > Date.now()) {
            delayMs = email.scheduledAt.getTime() - Date.now();
          }

          jobsToEnqueue.push({ payload, delayMs });
          jobsReEnqueued++;
        }
      }
    }

    if (jobsToEnqueue.length > 0) {
      await addBulkEmailJobsToQueue(jobsToEnqueue);
    }

    logger.info(
      `Queue sync: ${jobsAlreadyPresent} jobs already present, ${jobsReEnqueued} jobs re-enqueued, ${jobsSkipped} jobs skipped.`
    );

  } catch (error) {
    logger.error('Startup reconciliation error (non-fatal):', error);
  }
}

async function startServer(): Promise<void> {
  const app = createApp();

  const [dbOk, redisOk] = await Promise.all([
    checkDatabaseConnection(),
    checkRedisConnection(),
  ]);

  if (!dbOk || !redisOk) {
    logger.warn('WARNING: System starting with degraded infrastructure. Ensure Database & Redis are reachable.');
  }

  // Initialize Elasticsearch background index asynchronously
  initializeElasticsearchIndex().catch((err) => {
    logger.warn('Elasticsearch initialization deferred:', err);
  });

  // Perform startup reconciliation for restart persistence safety
  await performStartupReconciliation();

  const server = app.listen(config.port, () => {
    logger.info(`================================================================`);
    logger.info(`🚀 ReachInbox API Server running on port ${config.port}`);
    logger.info(`📊 BullBoard Queue Dashboard: http://localhost:${config.port}/admin/queues`);
    logger.info(`================================================================`);
  });

  const gracefulShutdown = async () => {
    logger.info('Shutting down API server gracefully...');
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Database disconnected. Process exiting.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

startServer().catch((error) => {
  logger.error('Failed to start API server:', error);
  process.exit(1);
});
