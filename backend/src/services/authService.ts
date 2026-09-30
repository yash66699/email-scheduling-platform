import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';
import { config } from '../config/env';
import { logger } from '../utils/logger';

const googleClient = new OAuth2Client(config.googleClientId, config.googleClientSecret);

export interface JwtPayload {
  userId: string;
  email: string;
}

export class AuthService {
  /**
   * Exchanges Google OAuth authorization code for tokens and upserts user in database.
   */
  public static async exchangeGoogleCodeAndGetUser(code: string, redirectUri: string): Promise<any> {
    let googleId: string;
    let email: string;
    let name: string;
    let avatarUrl: string | undefined;

    try {
      // Google requires the exact redirect_uri used during the authorization request
      const client = new OAuth2Client(config.googleClientId, config.googleClientSecret, redirectUri);
      const { tokens } = await client.getToken(code);

      if (tokens.id_token) {
        const ticket = await client.verifyIdToken({
          idToken: tokens.id_token,
          audience: config.googleClientId,
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
          throw new Error('Invalid Google ID token payload');
        }
        googleId = payload.sub;
        email = payload.email;
        name = payload.name || payload.email.split('@')[0];
        avatarUrl = payload.picture;
      } else if (tokens.access_token) {
        // Fallback: verify via Google userinfo endpoint
        const res = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (!res.ok) {
          throw new Error('Failed to verify Google access token with userinfo endpoint');
        }
        const data = (await res.json()) as any;
        googleId = data.sub;
        email = data.email;
        name = data.name || email.split('@')[0];
        avatarUrl = data.picture;
      } else {
        throw new Error('No identity tokens returned from Google exchange');
      }
    } catch (err) {
      logger.error('Google OAuth token exchange or verification failed');
      throw new Error('OAuth Token Exchange Failed');
    }

    const user = await prisma.user.upsert({
      where: { googleId },
      create: {
        googleId,
        email,
        name,
        avatarUrl,
      },
      update: {
        name,
        avatarUrl,
      },
    });

    // Ensure default Sender exists for this user
    await this.ensureDefaultSender(user.id, user.email, user.name);

    return user;
  }

  /**
   * Creates or returns a Demo User for immediate reviewer testing.
   */
  public static async getOrCreateDemoUser(): Promise<any> {
    const demoGoogleId = 'demo-google-id-12345';
    const email = 'alex.engineer@reachinbox.ai';
    const name = 'Alex Chen (ReachInbox Demo)';
    const avatarUrl = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';

    const user = await prisma.user.upsert({
      where: { googleId: demoGoogleId },
      create: {
        googleId: demoGoogleId,
        email,
        name,
        avatarUrl,
      },
      update: {
        name,
        avatarUrl,
      },
    });

    await this.ensureDefaultSender(user.id, user.email, user.name);
    return user;
  }

  /**
   * Guarantees at least one active sender exists for the user.
   */
  public static async ensureDefaultSender(userId: string, userEmail: string, userName: string) {
    const existingSender = await prisma.sender.findFirst({
      where: { userId },
    });

    if (!existingSender) {
      await prisma.sender.create({
        data: {
          userId,
          email: userEmail,
          displayName: userName,
          maxEmailsPerHour: config.defaultHourlyLimit,
          minDelayMsBetweenSend: config.defaultMinDelayMs,
        },
      });
      logger.info(`Created default sender ${userEmail} for user ${userId}`);
    }
  }

  /**
   * Signs a JWT session token.
   */
  public static generateJwtToken(userId: string, email: string): string {
    return jwt.sign({ userId, email }, config.jwtSecret, { expiresIn: '7d' });
  }

  /**
   * Verifies a JWT session token.
   */
  public static verifyJwtToken(token: string): JwtPayload {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  }
}
