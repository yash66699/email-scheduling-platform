import { describe, it, expect, vi, beforeEach } from 'vitest';
import nodemailer from 'nodemailer';
import { EtherealService } from '../services/etherealService';
import { config } from '../config/env';

vi.mock('nodemailer', () => {
  return {
    default: {
      createTestAccount: vi.fn(),
      createTransport: vi.fn(),
      getTestMessageUrl: vi.fn(),
    },
  };
});

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../config/env', () => ({
  config: {
    realSmtpHost: '',
    realSmtpUser: '',
    realSmtpPass: '',
  },
}));

describe('EtherealService SMTP Pooling Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the cached transporter by cheating private access
    (EtherealService as any).cachedTransporter = null;
    (EtherealService as any).cachedAccount = null;
  });

  it('configures connection pooling for dynamic Ethereal fallback', async () => {
    const mockTransporter = {
      sendMail: vi.fn().mockResolvedValue({ messageId: '123' }),
    };

    (nodemailer.createTestAccount as any).mockResolvedValue({
      user: 'test_user',
      pass: 'test_pass',
    });
    
    (nodemailer.createTransport as any).mockReturnValue(mockTransporter);
    (nodemailer.getTestMessageUrl as any).mockReturnValue('http://preview.url');

    await EtherealService.sendEmail({
      fromEmail: 'sender@example.com',
      fromName: 'Sender Name',
      to: 'recipient@example.com',
      subject: 'Test Subject',
      body: 'Test Body',
      smtpUser: 'ethereal_user', // This triggers the dynamic fallback
      smtpPass: 'ethereal_pass',
    });

    expect(nodemailer.createTestAccount).toHaveBeenCalled();
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        pool: true,
        maxConnections: 1,
        maxMessages: 100,
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: 'test_user',
          pass: 'test_pass',
        },
      })
    );
  });
});
