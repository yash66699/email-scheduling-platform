import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../services/authService';
import { prisma } from '../config/db';

const { mockGetToken, mockVerifyIdToken } = vi.hoisted(() => ({
  mockGetToken: vi.fn(),
  mockVerifyIdToken: vi.fn(),
}));

vi.mock('google-auth-library', () => {
  return {
    OAuth2Client: vi.fn().mockImplementation(() => ({
      getToken: mockGetToken,
      verifyIdToken: mockVerifyIdToken,
    })),
  };
});

vi.mock('../config/db', () => ({
  prisma: {
    user: {
      upsert: vi.fn(),
    },
    sender: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

global.fetch = vi.fn();

describe('AuthService OAuth Token Exchange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('A & B. Exhcanges auth code and verifies ID token when present', async () => {
    mockGetToken.mockResolvedValueOnce({
      tokens: { id_token: 'mock_id_token' },
    });

    mockVerifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ sub: 'g-123', email: 'test@test.com', name: 'Test User' }),
    });

    (prisma.user.upsert as any).mockResolvedValueOnce({ id: 'u-123', email: 'test@test.com' });

    await AuthService.exchangeGoogleCodeAndGetUser('mock_code', 'http://localhost');

    expect(mockGetToken).toHaveBeenCalledWith('mock_code');
    expect(mockVerifyIdToken).toHaveBeenCalledWith(expect.objectContaining({ idToken: 'mock_id_token' }));
    expect(prisma.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { googleId: 'g-123' },
      create: expect.objectContaining({ email: 'test@test.com' }),
    }));
  });

  it('C. Uses userinfo fallback if only access_token is present', async () => {
    mockGetToken.mockResolvedValueOnce({
      tokens: { access_token: 'mock_access_token' },
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sub: 'g-456', email: 'fallback@test.com', name: 'Fallback User' }),
    });

    (prisma.user.upsert as any).mockResolvedValueOnce({ id: 'u-456', email: 'fallback@test.com' });

    await AuthService.exchangeGoogleCodeAndGetUser('mock_code', 'http://localhost');

    expect(mockGetToken).toHaveBeenCalledWith('mock_code');
    expect(global.fetch).toHaveBeenCalledWith('https://www.googleapis.com/oauth2/v3/userinfo', expect.objectContaining({
      headers: { Authorization: 'Bearer mock_access_token' },
    }));
    expect(prisma.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { googleId: 'g-456' },
      create: expect.objectContaining({ email: 'fallback@test.com' }),
    }));
  });

  it('D. Exchange failure is handled cleanly', async () => {
    mockGetToken.mockRejectedValueOnce(new Error('Network Error'));

    await expect(AuthService.exchangeGoogleCodeAndGetUser('bad_code', 'http://localhost')).rejects.toThrowError('OAuth Token Exchange Failed');
  });

  it('E. Raw tokens are not logged', async () => {
    const { logger } = await import('../utils/logger');
    mockGetToken.mockRejectedValueOnce(new Error('Network Error'));

    try {
      await AuthService.exchangeGoogleCodeAndGetUser('secret_code_123', 'http://localhost');
    } catch (e) {}

    expect(logger.error).toHaveBeenCalledWith('Google OAuth token exchange or verification failed');
    // Ensure raw code or token is not in the error log string
    const loggedErrorArgs = (logger.error as any).mock.calls.flat();
    expect(loggedErrorArgs.join(' ')).not.toContain('secret_code_123');
  });
});
