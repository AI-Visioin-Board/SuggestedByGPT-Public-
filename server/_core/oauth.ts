/**
 * Supabase Auth Routes — Magic Link Login
 *
 * Replaces the Manus OAuth callback. Users log in via email magic links
 * powered by Supabase Auth. Flow:
 *
 * 1. POST /api/auth/magic-link  → sends magic link email via Supabase
 * 2. GET  /api/auth/callback     → verifies token, creates session, redirects
 *
 * Supabase handles email delivery, rate limiting, and token verification.
 * We handle session creation (JWT cookie) and user record management.
 */

import { COOKIE_NAME, SESSION_TTL_MS } from '@shared/const';
import type { Express, Request, Response } from 'express';
import * as db from '../db';
import { getSessionCookieOptions } from './cookies';
import { isAllowedOrigin, checkMagicLinkRate, getClientIp } from './rateLimiter';
import { sdk } from './sdk';
import { getSupabaseClient } from './supabase';

export function registerAuthRoutes(app: Express) {
  /**
   * Send a magic link to the user's email.
   * The link redirects to /api/auth/callback with a token.
   */
  app.post('/api/auth/magic-link', async (req: Request, res: Response) => {
    // C8: CSRF protection — require custom header (cannot be sent by simple form POST)
    if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // H1: Rate limit magic link requests (5 per 10 min per IP)
    const ip = getClientIp(req);
    if (!checkMagicLinkRate(ip)) {
      res.status(429).json({ error: 'Too many requests. Please wait a few minutes.' });
      return;
    }

    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    try {
      const supabase = getSupabaseClient();

      // C9: Build callback URL — only use APP_URL or validated origins.
      // Never trust raw req.headers.origin to prevent open redirects.
      const requestOrigin = req.headers.origin as string | undefined;
      const validOrigin = requestOrigin && isAllowedOrigin(requestOrigin) ? requestOrigin : null;
      const appUrl = process.env.APP_URL || validOrigin;

      if (!appUrl) {
        console.error('[Auth] APP_URL not set and no valid Origin header. Cannot build safe redirect URL.');
        res.status(500).json({ error: 'Server misconfiguration — APP_URL not set' });
        return;
      }
      const redirectTo = `${appUrl.replace(/\/$/, '')}/api/auth/callback`;

      console.log(`[Auth] Sending magic link to ${email.trim().toLowerCase()}, redirect: ${redirectTo}`);

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        console.error('[Auth] Magic link send failed:', error.message);
        res.status(400).json({ error: 'Failed to send magic link. Please try again.' });
        return;
      }

      res.json({ success: true, message: 'Magic link sent! Check your email.' });
    } catch (error) {
      console.error('[Auth] Magic link error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Handle Supabase magic link callback.
   * Supabase redirects here with token_hash and type params after the user clicks the link.
   */
  app.get('/api/auth/callback', async (req: Request, res: Response) => {
    const tokenHash = req.query.token_hash as string | undefined;
    const type = req.query.type as string | undefined;
    const code = req.query.code as string | undefined;

    console.log(`[Auth] Callback hit — code: ${code ? 'yes' : 'no'}, token_hash: ${tokenHash ? 'yes' : 'no'}, type: ${type || 'none'}, query keys: ${Object.keys(req.query).join(',')}`);

    try {
      const supabase = getSupabaseClient();
      let supabaseUser: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null = null;

      if (code) {
        // PKCE flow — exchange code for session
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('[Auth] Code exchange failed:', error.message);
          res.redirect('/login?error=auth_failed');
          return;
        }
        supabaseUser = data.user;
      } else if (tokenHash && type) {
        // OTP / magic link flow
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'magiclink' | 'email',
        });
        if (error) {
          console.error('[Auth] Token verification failed:', error.message);
          res.redirect('/login?error=auth_failed');
          return;
        }
        supabaseUser = data.user;
      } else {
        console.error('[Auth] Callback missing params. Full URL:', req.originalUrl);
        res.redirect('/login?error=missing_params');
        return;
      }

      if (!supabaseUser) {
        console.error('[Auth] No user returned from Supabase verification');
        res.redirect('/login?error=no_user');
        return;
      }

      const userId = supabaseUser.id;
      const email = supabaseUser.email || '';

      // Resolve the best available name — never overwrite a real name with an email prefix.
      // Priority: Supabase metadata → existing DB name → client fullName → email prefix
      let name = (supabaseUser.user_metadata?.name as string) || '';

      // Check if there's a pre-created user with this email (e.g. VA created by admin)
      // that has a placeholder openId — if so, update it to the real Supabase UUID
      let existingUser: Awaited<ReturnType<typeof db.getUserByOpenId>> | undefined;
      try {
        const { getUserByEmail } = await import('../db.js');
        const existingByEmail = await getUserByEmail(email);
        if (existingByEmail) {
          existingUser = existingByEmail;
          if (existingByEmail.openId.startsWith('pending_')) {
            console.log(`[Auth] Found pre-created user (id=${existingByEmail.id}, role=${existingByEmail.role}) with placeholder openId — updating to real Supabase UUID`);
            const { updateUserOpenId } = await import('../db.js');
            await updateUserOpenId(existingByEmail.id, userId);
          }
        }
      } catch (linkErr) {
        console.warn('[Auth] Pre-created user migration check failed:', linkErr);
      }

      if (!name && existingUser?.name) {
        // Keep the existing name from our DB if it's already set
        name = existingUser.name;
      }

      if (!name && email) {
        // Try to resolve from a client record (created during intake form)
        try {
          const { getDb: getDatabase } = await import('../db.js');
          const database = await getDatabase();
          if (database) {
            const { clients } = await import('../../drizzle/schema.js');
            const { eq } = await import('drizzle-orm');
            const clientResult = await database.select({ fullName: clients.fullName })
              .from(clients).where(eq(clients.email, email)).limit(1);
            if (clientResult[0]?.fullName) {
              name = clientResult[0].fullName;
            }
          }
        } catch {
          // Non-critical — continue with what we have
        }
      }

      if (!name) {
        name = email.split('@')[0] || '';
      }

      // Upsert user in our MySQL database
      await db.upsertUser({
        openId: userId, // Store Supabase UUID as openId
        name,
        email,
        loginMethod: 'magic_link',
        lastSignedIn: new Date(),
      });

      // Link client record if one exists with matching email
      try {
        if (email) {
          const { linkClientToUser } = await import('../clientDb.js');
          const user = await db.getUserByOpenId(userId);
          if (user) {
            await linkClientToUser(email, user.id);
          }
        }
      } catch (linkError) {
        console.warn('[Auth] Failed to link client record:', linkError);
        // Non-critical — don't fail the login
      }

      // ── Delegate Detection ──
      // Check if this email is a delegate for any client account(s)
      const { getDelegationsByEmail, getClientByEmail } = await import('../clientDb.js');
      const delegations = await getDelegationsByEmail(email);
      const hasOwnClient = await getClientByEmail(email);

      // Determine delegation context for the JWT
      let delegateClientId: number | undefined;
      let delegateClientName: string | undefined;
      let redirectOverride: string | undefined;

      if (delegations.length === 1 && !hasOwnClient) {
        // Single delegation, no own account → auto-login as that client
        delegateClientId = delegations[0].clientId;
        delegateClientName = delegations[0].businessName;
        console.log(`[Auth] Delegate login: ${email} → client #${delegateClientId} (${delegateClientName})`);
      } else if (delegations.length > 0) {
        // Multiple delegations OR has own account + delegation(s) → account picker
        redirectOverride = '/portal/select-account';
        console.log(`[Auth] Delegate with ${delegations.length} delegation(s) + own account: ${!!hasOwnClient} → picker`);
      }

      // Create our own JWT session token
      const sessionToken = await sdk.createSessionToken(userId, {
        email,
        name,
        expiresInMs: SESSION_TTL_MS,
        delegateClientId,
        delegateClientName,
      });

      // Set session cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_TTL_MS });

      // Redirect based on role or delegation
      const dbUser = await db.getUserByOpenId(userId);
      const defaultPath = dbUser?.role === 'admin' ? '/admin' : dbUser?.role === 'assistant' ? '/assistant' : '/portal';
      const redirectPath = redirectOverride || (delegateClientId ? '/portal' : defaultPath);
      res.redirect(redirectPath);
    } catch (error) {
      console.error('[Auth] Callback error:', error);
      res.redirect('/login?error=auth_error');
    }
  });
}

// Keep backward-compatible export name
export const registerOAuthRoutes = registerAuthRoutes;
