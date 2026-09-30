import { Worker, Job } from 'bullmq';
import { EMAIL_QUEUE_NAME, EmailJobPayload } from './emailQueue';
import { redisConnectionOptions } from '../config/redis';
import { prisma } from '../config/db';
import { EmailStatus } from '@prisma/client';
import { RateLimiterService } from '../services/rateLimiterService';
import { EtherealService } from '../services/etherealService';
import { SlackService } from '../services/slackService';
import { ElasticsearchService } from '../services/elasticsearchService';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export function createEmailWorker(): Worker<EmailJobPayload> {
  const worker = new Worker<EmailJobPayload>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobPayload>, token?: string) => {
      const { emailId, userId, senderId, recipient, subject, body, scheduledAt, idempotencyKey } =
        job.data;

      logger.info(
        `[Worker Thread ${process.pid}] Processing job ${job.id} for Email ID: ${emailId} -> Recipient: ${recipient}`
      );

      // 1. Fetch Email and Sender from PostgreSQL
      const emailRecord = await prisma.email.findUnique({
        where: { id: emailId },
        include: { sender: true },
      });

      if (!emailRecord) {
        logger.warn(`Email record ${emailId} not found in database. Skipping job.`);
        return { status: 'CANCELLED_NOT_FOUND' };
      }

      if (emailRecord.status === EmailStatus.SENT) {
        logger.info(`Email ${emailId} is already marked SENT in database. Skipping idempotent execution.`);
        return { status: 'SKIPPED_ALREADY_SENT' };
      }

      // 2. Atomic State Transition: QUEUED/SCHEDULED/RATE_LIMITED -> PROCESSING
      const updatedRows = await prisma.email.updateMany({
        where: {
          id: emailId,
          status: { in: [EmailStatus.SCHEDULED, EmailStatus.QUEUED, EmailStatus.RATE_LIMITED] },
        },
        data: {
          status: EmailStatus.PROCESSING,
          updatedAt: new Date(),
        },
      });

      if (updatedRows.count === 0 && emailRecord.status !== EmailStatus.PROCESSING) {
        logger.warn(`Email ${emailId} state locked by another worker thread. Skipping.`);
        return { status: 'SKIPPED_LOCKED' };
      }

      const sender = emailRecord.sender;
      const maxHourlyLimit = sender.maxEmailsPerHour || config.defaultHourlyLimit;
      const minDelayMs = sender.minDelayMsBetweenSend || config.defaultMinDelayMs;

      // 3. Reserve/check inter-email slot (Bug 1 & Bug 2 Fix)
      const reservedAtMarker = job.data.interEmailReservedAt;

      if (reservedAtMarker !== undefined) {
        if (reservedAtMarker > Date.now()) {
          // Existing reservation is not due yet.
          // Do NOT reserve another slot.
          const nextExecutionDate = new Date(reservedAtMarker);

          await prisma.email.update({
            where: { id: emailId },
            data: {
              status: EmailStatus.QUEUED,
              scheduledAt: nextExecutionDate,
              updatedAt: new Date(),
            },
          });

          if (token) {
            await job.moveToDelayed(reservedAtMarker, token);
          }

          return {
            status: 'RESCHEDULED_INTER_EMAIL_DELAY',
            rescheduledFor: nextExecutionDate.toISOString(),
          };
        }

        // Existing reservation is now due.
        // Consume the reservation and continue.
        await job.updateData({
          ...job.data,
          interEmailReservedAt: undefined,
        });
      } else {
        // No reservation exists.
        const reservation = await RateLimiterService.reserveInterEmailSlot(
          senderId,
          minDelayMs
        );

        if (!reservation.allowedNow) {
          logger.debug(
            `Sender ${sender.email} inter-email delay hit. Rescheduling job ${job.id} by ${reservation.delayMs}ms`
          );

          const nextExecutionDate = new Date(reservation.reservedAt);

          await prisma.email.update({
            where: { id: emailId },
            data: {
              status: EmailStatus.QUEUED,
              scheduledAt: nextExecutionDate,
              updatedAt: new Date(),
            },
          });

          await job.updateData({
            ...job.data,
            interEmailReservedAt: reservation.reservedAt,
          });

          if (token) {
            await job.moveToDelayed(reservation.reservedAt, token);
          }

          return {
            status: 'RESCHEDULED_INTER_EMAIL_DELAY',
            rescheduledFor: nextExecutionDate.toISOString(),
          };
        }
      }

      // 4. Atomic Redis Sliding Hour Window Rate-Limit Check
      const rateCheck = await RateLimiterService.checkAndIncrementRateLimit(
        senderId,
        maxHourlyLimit
      );

      if (!rateCheck.allowed) {
        logger.warn(
          `Sender ${sender.email} hit hourly limit (${maxHourlyLimit}/hr). Rescheduling job ${job.id} by ${rateCheck.msUntilNextHour}ms`
        );

        const nextWindowDate = new Date(Date.now() + rateCheck.msUntilNextHour);

        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: EmailStatus.RATE_LIMITED,
            scheduledAt: nextWindowDate,
            updatedAt: new Date(),
          },
        });

        const shouldNotify = await RateLimiterService.shouldNotifySlack(senderId);
        if (shouldNotify) {
          SlackService.sendRateLimitNotification(
            userId,
            sender.email,
            maxHourlyLimit,
            nextWindowDate.toISOString()
          ).catch((err) => logger.error('Background Slack notify error:', err));
        }

        if (token) {
          await job.moveToDelayed(Date.now() + rateCheck.msUntilNextHour, token);
        }

        return {
          status: 'RESCHEDULED_RATE_LIMITED',
          rescheduledFor: nextWindowDate.toISOString(),
        };
      }

      // 5. Execute SMTP Send via Ethereal Mail
      try {
        const sendResult = await EtherealService.sendEmail({
          fromEmail: sender.email,
          fromName: sender.displayName,
          to: recipient,
          subject,
          body,
          smtpHost: sender.smtpHost,
          smtpPort: sender.smtpPort,
          smtpUser: sender.smtpUser,
          smtpPass: sender.smtpPass,
        });

        const sentAt = new Date();

        // 6. Update PostgreSQL DB to SENT
        const updatedEmail = await prisma.email.update({
          where: { id: emailId },
          data: {
            status: EmailStatus.SENT,
            sentAt,
            providerMessageId: typeof sendResult.previewUrl === 'string' ? sendResult.previewUrl : sendResult.messageId,
            failureReason: null,
            updatedAt: sentAt,
          },
        });

        // 7. Sync update to Elasticsearch
        ElasticsearchService.indexEmail({
          id: emailId,
          userId,
          senderId,
          senderEmail: sender.email,
          recipient,
          subject,
          body,
          status: EmailStatus.SENT,
          scheduledAt,
          sentAt: sentAt.toISOString(),
          createdAt: updatedEmail.createdAt.toISOString(),
        }).catch((err) => logger.warn('Non-blocking ES index update warning:', err));

        logger.info(
          `[SUCCESS] Email ${emailId} sent to ${recipient}. Ethereal Preview: ${sendResult.previewUrl || 'N/A'}`
        );

        return {
          status: 'SENT',
          messageId: sendResult.messageId,
          previewUrl: sendResult.previewUrl,
        };
      } catch (sendError: any) {
        logger.error(`SMTP sending error for email ${emailId}:`, sendError);

        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: EmailStatus.FAILED,
            failureReason: sendError.message || 'SMTP send failed',
            updatedAt: new Date(),
          },
        });

        throw sendError; // Triggers BullMQ retry backoff
      }
    },
    {
      connection: redisConnectionOptions,
      concurrency: config.workerConcurrency,
    }
  );

  worker.on('completed', (job) => {
    logger.debug(`Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed with error:`, err);
  });

  return worker;
}
