import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { prisma } from '../config/db';
import { config } from '../config/env';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { logger } from '../utils/logger';

export class AuthController {
  /**
   * GET /api/auth/google
   * Redirects user to Google OAuth consent page.
   */
  public static async googleLogin(req: Request, res: Response): Promise<void> {
    if (!config.googleClientId || config.googleClientId.includes('placeholder')) {
      logger.info('Google Client ID is unconfigured or placeholder. Executing seamless login fallback...');
      const user = await AuthService.getOrCreateDemoUser();
      const token = AuthService.generateJwtToken(user.id, user.email);

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.redirect(`${config.clientUrl}/dashboard?login=success`);
      return;
    }

    const redirectUri = config.googleCallbackUrl;
    const scope = [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' ');

    const googleAuthUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(config.googleClientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&access_type=offline` +
      `&prompt=consent`;

    res.redirect(googleAuthUrl);
  }

  /**
   * GET /api/auth/google/callback or POST /api/auth/google/verify
   * Exchanges authorization code or ID Token for user session.
   */
  public static async googleCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const code = (req.query.code as string) || (req.body.code as string);

      if (!code) {
        res.status(400).json({ error: 'Missing OAuth authorization code' });
        return;
      }

      const redirectUri = config.googleCallbackUrl;
      const user = await AuthService.exchangeGoogleCodeAndGetUser(code, redirectUri);
      const token = AuthService.generateJwtToken(user.id, user.email);

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      if (req.method === 'GET') {
        res.redirect(`${config.clientUrl}/dashboard?login=success`);
      } else {
        res.json({ success: true, user, token });
      }
    } catch (error) {
      logger.error('Google OAuth callback failed:', error);
      if (req.method === 'GET') {
        res.redirect(`${config.clientUrl}/login?error=auth_failed`);
      } else {
        next(error);
      }
    }
  }

  /**
   * POST /api/auth/demo
   * Dev/Demo Login fallback allowing instant reviewer access without setting up Google API keys.
   */
  public static async demoLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await AuthService.getOrCreateDemoUser();
      const token = AuthService.generateJwtToken(user.id, user.email);

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({ success: true, user, token });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/auth/me
   * Returns authenticated user info & Slack integration status.
   */
  public static async getMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          senders: { where: { isActive: true } },
          slackIntegration: {
            select: {
              slackTeamName: true,
              channelName: true,
              createdAt: true,
            },
          },
        },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          senders: user.senders,
          slackConnected: !!user.slackIntegration,
          slackIntegration: user.slackIntegration,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/logout
   */
  public static async logout(req: Request, res: Response): Promise<void> {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    res.json({ success: true, message: 'Logged out successfully' });
  }
}
