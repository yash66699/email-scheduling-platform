import nodemailer from 'nodemailer';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export interface SendEmailOptions {
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  body: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
}

export interface SendEmailResult {
  messageId: string;
  previewUrl: string | false;
}

export class EtherealService {
  private static cachedTransporter: nodemailer.Transporter | null = null;
  private static cachedAccount: { user: string; pass: string } | null = null;

  /**
   * Initializes or returns cached Nodemailer transporter for Ethereal Email.
   */
  private static async getTransporter(
    options: SendEmailOptions
  ): Promise<nodemailer.Transporter> {
    // 1. If global REAL_SMTP credentials are in .env, use them for actual inbox delivery
    if (config.realSmtpHost && config.realSmtpUser && config.realSmtpPass) {
      return nodemailer.createTransport({
        host: config.realSmtpHost,
        port: config.realSmtpPort || 587,
        secure: config.realSmtpPort === 465,
        auth: {
          user: config.realSmtpUser,
          pass: config.realSmtpPass,
        },
      });
    }

    // 2. If specific non-placeholder credentials provided in sender, use them
    if (
      options.smtpUser &&
      options.smtpPass &&
      options.smtpUser !== 'ethereal_user' &&
      options.smtpPass !== 'ethereal_pass'
    ) {
      return nodemailer.createTransport({
        host: options.smtpHost || 'smtp.ethereal.email',
        port: options.smtpPort || 587,
        secure: false,
        auth: {
          user: options.smtpUser,
          pass: options.smtpPass,
        },
      });
    }

    // Reuse or dynamically generate an Ethereal test account
    if (!this.cachedTransporter) {
      logger.info('Generating dynamic Ethereal Email test account for SMTP sending...');
      const testAccount = await nodemailer.createTestAccount();
      this.cachedAccount = { user: testAccount.user, pass: testAccount.pass };
      this.cachedTransporter = nodemailer.createTransport({
        pool: true,
        maxConnections: 1,
        maxMessages: 100,
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      logger.info(
        `Ethereal Test Account Created -> User: ${testAccount.user} | Pass: ${testAccount.pass} | Web Login: https://ethereal.email/login`
      );
    }

    return this.cachedTransporter;
  }

  /**
   * Sends an email via Ethereal SMTP and returns provider messageId & test preview URL.
   */
  public static async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const transporter = await this.getTransporter(options);
    const senderEmail = (config.realSmtpHost && config.realSmtpUser) ? config.realSmtpUser : options.fromEmail;

    const mailOptions = {
      from: `"${options.fromName}" <${senderEmail}>`,
      to: options.to,
      subject: options.subject,
      text: options.body,
      html: `<div style="font-family: sans-serif; padding: 20px; line-height: 1.6;">${options.body.replace(/\n/g, '<br/>')}</div>`,
    };

    const info = await transporter.sendMail(mailOptions);
    const previewUrl = nodemailer.getTestMessageUrl(info);

    logger.info(
      `Email sent via Ethereal: MessageID=${info.messageId}, Recipient=${options.to}, Preview=${previewUrl}`
    );

    return {
      messageId: info.messageId,
      previewUrl: previewUrl || false,
    };
  }
}
