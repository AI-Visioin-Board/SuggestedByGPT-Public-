/**
 * Auth SDK — Session Management
 *
 * Handles JWT session creation and verification.
 * Replaces the Manus OAuth SDK. The initial authentication is now
 * handled by Supabase magic links (see auth-routes.ts), but session
 * management stays as self-signed JWTs for tRPC context.
 */

import { COOKIE_NAME, SESSION_TTL_MS } from '@shared/const';
import { ForbiddenError } from '@shared/_core/errors';
import { parse as parseCookieHeader } from 'cookie';
import type { Request } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import type { User } from '../../drizzle/schema';
import * as db from '../db';
import { ENV } from './env';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

export type SessionPayload = {
  userId: string;   // Supabase user UUID (stored as openId in users table)
  email: string;
  name: string;
  delegateClientId?: number;      // if set, this session is acting on behalf of this client
  delegateClientName?: string;    // business name for the delegate banner
};

class AuthSDK {
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
    return new TextEncoder().encode(secret);
  }

  /**
   * Create a session token for a user.
   * Called after successful Supabase auth verification.
   */
  async createSessionToken(
    userId: string,
    options: { email?: string; name?: string; expiresInMs?: number; delegateClientId?: number; delegateClientName?: string } = {},
  ): Promise<string> {
    return this.signSession(
      {
        userId,
        email: options.email || '',
        name: options.name || '',
        delegateClientId: options.delegateClientId,
        delegateClientName: options.delegateClientName,
      },
      options,
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {},
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? SESSION_TTL_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    const claims: Record<string, unknown> = {
      userId: payload.userId,
      email: payload.email,
      name: payload.name,
    };
    if (payload.delegateClientId) {
      claims.delegateClientId = payload.delegateClientId;
      claims.delegateClientName = payload.delegateClientName || '';
    }

    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null,
  ): Promise<{ userId: string; email: string; name: string; delegateClientId?: number; delegateClientName?: string } | null> {
    if (!cookieValue) {
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ['HS256'],
      });

      // Support both new format (userId) and legacy format (openId)
      const userId = (payload.userId ?? payload.openId) as string | undefined;
      const email = (payload.email ?? '') as string;
      const name = (payload.name ?? '') as string;
      const delegateClientId = payload.delegateClientId as number | undefined;
      const delegateClientName = (payload.delegateClientName ?? '') as string;

      if (!isNonEmptyString(userId)) {
        console.warn('[Auth] Session payload missing userId');
        return null;
      }

      return {
        userId, email, name,
        ...(delegateClientId ? { delegateClientId, delegateClientName } : {}),
      };
    } catch (error) {
      console.warn('[Auth] Session verification failed', String(error));
      return null;
    }
  }

  /**
   * Authenticate an Express request using the session cookie.
   * Used by tRPC context to identify the current user.
   */
  async authenticateRequest(req: Request): Promise<User> {
    const { user } = await this.authenticateRequestWithDelegation(req);
    return user;
  }

  /**
   * Authenticate and also return delegation info from the JWT.
   * Avoids double JWT verification when context needs both user + delegation.
   */
  async authenticateRequestWithDelegation(req: Request): Promise<{
    user: User;
    delegateClientId?: number;
    delegateClientName?: string;
  }> {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError('Invalid session cookie');
    }

    const signedInAt = new Date();
    let user = await db.getUserByOpenId(session.userId);

    // If user not in DB, create them from session data
    if (!user) {
      try {
        await db.upsertUser({
          openId: session.userId,
          name: session.name || null,
          email: session.email || null,
          loginMethod: 'magic_link',
          lastSignedIn: signedInAt,
        });
        user = await db.getUserByOpenId(session.userId);
      } catch (error) {
        console.error('[Auth] Failed to create user from session:', error);
        throw ForbiddenError('Failed to create user record');
      }
    }

    if (!user) {
      throw ForbiddenError('User not found');
    }

    // Update last signed in
    await db.upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt,
    });

    return {
      user,
      delegateClientId: session.delegateClientId,
      delegateClientName: session.delegateClientName,
    };
  }
}

export const sdk = new AuthSDK();
