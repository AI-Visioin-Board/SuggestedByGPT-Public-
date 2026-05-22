/**
 * Warmed Reddit Accounts — tRPC router (Build #1, 2026-04-26)
 *
 * Backs the VA admin panel signup flow:
 *   1. VA opens portal → tab → clicks Generate Account
 *      → `generate` mints email+password, reserves proxy, returns config
 *   2. Frontend calls AdsPower Local API on VA's PC, creates profile, opens browser
 *      → `setAdsPowerProfile` records adspowerProfileId on the row
 *   3. VA does Reddit signup in the AdsPower window (manual)
 *   4. VA pastes Reddit username, frontend grabs cookies via AdsPower API
 *      → `markCreated` validates + stores cookies, flips status='awaiting_verification'
 *   5. Cancel / abandon paths handled by `cancel` + TTL cleanup cron
 *
 * Architectural notes in CLAUDE.md Section 16 (next session-end run).
 *
 * All procedures require `assistantProcedure` (role IN 'assistant', 'admin').
 * VA users have role='assistant' in our system.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, asc, gte, lt, isNull, sql } from 'drizzle-orm';
import { router, assistantProcedure } from '../_core/trpc';
import { getDb } from '../db';
import {
  warmedRedditAccounts,
  emailDomainPool,
  redditAccountAuditLog,
  redditProxyPool,
  inboundEmails,
} from '../../drizzle/schema';
import { encrypt } from '../encryption';
import {
  generateUniqueEmail,
  generatePassword,
  incrementDomainCount,
  recordDomainRejection,
} from '../reddit/emailGenerator';
import {
  reserveProxyForGenerate,
  confirmProxyAssignment,
  releaseReservedProxy,
  getProxyConnection,
} from '../reddit/proxyManager';
import { generateFingerprint, serializeFingerprint } from '../reddit/fingerprintGenerator';
import { checkAndUpdateProxy } from '../reddit/proxyHealthChecker';

const PENDING_TTL_MIN = 30;

const REDDIT_USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;

/** Cookie shape (Playwright canonical, also what AdsPower client normalizes to). */
const CookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string(),
  expires: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
});

/** Audit log helper. */
async function audit(args: {
  accountId: number | null;
  vaId: number | null;
  action:
    | 'generate'
    | 'mark_created'
    | 'cancel'
    | 'reissue_email'
    | 'extend_session'
    | 'cookie_access'
    | 'password_view'
    | 'mark_phone_blocked'
    | 'mark_email_blocked'
    | 'manual_status_change';
  detail?: unknown;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(redditAccountAuditLog).values({
    accountId: args.accountId,
    vaId: args.vaId,
    action: args.action,
    detail: args.detail ?? null,
  });
}

export const redditAccountsRouter = router({
  /** List warmed accounts. Filterable by status. */
  list: assistantProcedure
    .input(
      z.object({
        status: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no db' });
      const where = input.status
        ? eq(warmedRedditAccounts.status, input.status as any)
        : undefined;
      const rows = await db
        .select()
        .from(warmedRedditAccounts)
        .where(where as any)
        .orderBy(desc(warmedRedditAccounts.createdAt))
        .limit(input.limit);
      // Strip encrypted secrets before returning
      return rows.map((r) => ({
        ...r,
        encryptedPassword: undefined,
        encryptedCookies: undefined,
      }));
    }),

  /** Get a single account by id, with recent inbound emails for its alias. */
  get: assistantProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no db' });
      const [account] = await db
        .select()
        .from(warmedRedditAccounts)
        .where(eq(warmedRedditAccounts.id, input.id));
      if (!account) throw new TRPCError({ code: 'NOT_FOUND' });
      const emails = await db
        .select()
        .from(inboundEmails)
        .where(eq(inboundEmails.emailAlias, account.emailAlias))
        .orderBy(desc(inboundEmails.receivedAt))
        .limit(20);
      const auditLog = await db
        .select()
        .from(redditAccountAuditLog)
        .where(eq(redditAccountAuditLog.accountId, input.id))
        .orderBy(desc(redditAccountAuditLog.occurredAt))
        .limit(20);
      return {
        account: { ...account, encryptedPassword: undefined, encryptedCookies: undefined },
        inboundEmails: emails,
        auditLog,
      };
    }),

  /** Get the VA's currently-active pending row (state recovery on page reload). */
  getActiveForCurrentVa: assistantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no db' });
    const userId = (ctx.user as any).id;
    const [account] = await db
      .select()
      .from(warmedRedditAccounts)
      .where(
        and(
          eq(warmedRedditAccounts.status, 'pending'),
          eq(warmedRedditAccounts.createdByVaId, userId),
          gte(warmedRedditAccounts.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(warmedRedditAccounts.createdAt))
      .limit(1);
    if (!account) return null;
    return { ...account, encryptedPassword: undefined, encryptedCookies: undefined };
  }),

  /**
   * Mint email + password, reserve a proxy, generate fingerprint, insert pending row.
   * Frontend then takes the returned config and creates an AdsPower profile via
   * AdsPower's Local API on the VA's machine.
   *
   * Returns: accountId, emailAlias, password (cleartext, copied to frontend
   * once for VA to paste), fingerprint, proxyConfig.
   */
  generate: assistantProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no db' });
    const vaId = (ctx.user as any).id;

    // Reject if this VA already has an active pending session
    const [existingActive] = await db
      .select({ id: warmedRedditAccounts.id })
      .from(warmedRedditAccounts)
      .where(
        and(
          eq(warmedRedditAccounts.status, 'pending'),
          eq(warmedRedditAccounts.createdByVaId, vaId),
          gte(warmedRedditAccounts.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (existingActive) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'You already have an active signup. Finish or cancel it first.',
      });
    }

    // Reserve a proxy atomically
    const proxy = await reserveProxyForGenerate(vaId);
    if (!proxy) {
      throw new TRPCError({
        code: 'SERVICE_UNAVAILABLE',
        message: 'No clean proxies available. Wait a few minutes or contact admin.',
      });
    }

    // Refresh proxy reputation + geo
    const rep = await checkAndUpdateProxy(proxy);

    // Generate fingerprint + email + password
    const seed = `acct-${proxy.id}-${Date.now()}`;
    const fingerprint = generateFingerprint({
      seed,
      proxyTimezone: rep.timezone || proxy.geoTimezone || undefined,
      proxyLocale: 'en-US',
      proxyLat: rep.lat,
      proxyLng: rep.lng,
    });

    let email: { local: string; domain: string; alias: string };
    try {
      email = await generateUniqueEmail();
    } catch (err) {
      // If email gen fails, release proxy and bail
      await releaseReservedProxy(proxy.id);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Email generation failed: ${(err as Error).message}`,
      });
    }
    const password = generatePassword();

    // Insert pending row
    const expiresAt = new Date(Date.now() + PENDING_TTL_MIN * 60 * 1000);
    const insertResult = await db.insert(warmedRedditAccounts).values({
      emailAlias: email.alias,
      emailDomain: email.domain,
      encryptedPassword: encrypt(password),
      proxyId: proxy.id,
      fingerprint: serializeFingerprint(fingerprint),
      status: 'pending',
      expiresAt,
      heartbeatAt: new Date(),
      warmingTargetDays: 30, // bumped from 2 (first-batch test) → 30 (real ramp) on 2026-04-30
      createdByVaId: vaId,
    });
    const accountId =
      (insertResult as any)?.insertId ??
      (Array.isArray(insertResult) ? (insertResult[0] as any)?.insertId : undefined);
    if (!accountId) {
      // Should never happen but handle gracefully
      await releaseReservedProxy(proxy.id);
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'failed to insert row' });
    }

    // Increment domain count
    await incrementDomainCount(email.domain);

    // Audit
    await audit({ accountId, vaId, action: 'generate', detail: { emailAlias: email.alias, proxyId: proxy.id } });

    // Return everything frontend needs to call AdsPower Local API
    const proxyConn = getProxyConnection(proxy);
    const fp = fingerprint;
    return {
      accountId,
      emailAlias: email.alias,
      password,
      expiresAt: expiresAt.toISOString(),
      fingerprint: {
        userAgent: fp.userAgent,
        viewport: fp.viewport,
        screen: fp.screen,
        locale: fp.locale,
        timezoneId: fp.timezoneId,
        platform: fp.platform,
        languages: fp.languages,
        os: fp.os,
        uaFamily: fp.uaFamily,
        uaVersion: fp.uaVersion,
        geoLat: fp.geoLat,
        geoLng: fp.geoLng,
        secChUa: fp.secChUa,
        secChUaPlatform: fp.secChUaPlatform,
        secChUaMobile: fp.secChUaMobile,
        hardwareConcurrency: fp.hardwareConcurrency,
        deviceMemory: fp.deviceMemory,
        colorScheme: fp.colorScheme,
        reducedMotion: fp.reducedMotion,
      },
      proxyConfig: {
        host: proxyConn.server.replace(/^https?:\/\//, '').split(':')[0],
        port: Number(proxyConn.server.replace(/^https?:\/\//, '').split(':')[1]),
        username: proxyConn.username,
        password: proxyConn.password,
      },
      profileName: `r-${vaId}-${accountId}-${email.local}`,
    };
  }),

  /** Frontend reports back the AdsPower profileId after creating the profile. */
  setAdsPowerProfile: assistantProcedure
    .input(
      z.object({
        accountId: z.number().int(),
        adspowerProfileId: z.string().min(1).max(100),
        adspowerWsEndpoint: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no db' });
      const vaId = (ctx.user as any).id;
      const [account] = await db
        .select()
        .from(warmedRedditAccounts)
        .where(eq(warmedRedditAccounts.id, input.accountId));
      if (!account) throw new TRPCError({ code: 'NOT_FOUND' });
      if (account.createdByVaId !== vaId && (ctx.user as any).role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your account' });
      }
      await db
        .update(warmedRedditAccounts)
        .set({
          adspowerProfileId: input.adspowerProfileId,
          adspowerWsEndpoint: input.adspowerWsEndpoint ?? null,
          heartbeatAt: new Date(),
        })
        .where(eq(warmedRedditAccounts.id, input.accountId));
      return { ok: true };
    }),

  /** VA finished signup. Validate username + cookies, encrypt + store, flip status. */
  markCreated: assistantProcedure
    .input(
      z.object({
        accountId: z.number().int(),
        redditUsername: z.string().regex(REDDIT_USERNAME_RE, 'invalid Reddit username'),
        cookies: z.array(CookieSchema).max(200),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no db' });
      const vaId = (ctx.user as any).id;

      const [account] = await db
        .select()
        .from(warmedRedditAccounts)
        .where(eq(warmedRedditAccounts.id, input.accountId));
      if (!account) throw new TRPCError({ code: 'NOT_FOUND' });
      if (account.createdByVaId !== vaId && (ctx.user as any).role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your account' });
      }
      if (account.status !== 'pending') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Account is in status '${account.status}', cannot mark created`,
        });
      }

      // Filter cookies to Reddit domains
      const redditCookies = input.cookies.filter((c) =>
        /reddit\.com|redd\.it|redditmedia/.test(c.domain),
      );
      // Cookies are nice-to-have but NOT required. AdsPower's Base plan
      // ($5.40/mo) doesn't expose the cookie-extract endpoint at all (404 on
      // /user/cookie/get; the v2 endpoint /api/v2/browser-profile/cookies
      // requires Professional plan $30/mo). When cookies are absent, the
      // warming worker (Build #2) re-authenticates with the stored password
      // on its first session, which produces fresh cookies anyway. The
      // tradeoff is one extra login event for that account; not a blocker.
      const authNames = ['reddit_session', 'token_v2', 'loid', 'session_tracker'];
      const haveAuth = redditCookies.some((c) => authNames.includes(c.name));
      const cookieMode =
        redditCookies.length === 0
          ? 'no_cookies_warm_via_password'
          : haveAuth && redditCookies.length >= 3
          ? 'cookies_full'
          : 'cookies_partial';
      if (cookieMode === 'cookies_partial') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Reddit cookies look incomplete (got ${redditCookies.length} cookies, ${haveAuth ? 'auth present' : 'no auth cookie'}). Make sure you're logged in inside the AdsPower window before marking created — or proceed with no cookies (warming worker will re-login).`,
        });
      }

      // Confirm proxy assignment (was 'reserved', now 'assigned' permanently)
      if (account.proxyId) {
        await confirmProxyAssignment(account.proxyId, account.id);
      }

      // Persist
      await db
        .update(warmedRedditAccounts)
        .set({
          redditUsername: input.redditUsername,
          encryptedCookies:
            redditCookies.length > 0 ? encrypt(JSON.stringify(redditCookies)) : null,
          status: 'awaiting_verification',
          updatedAt: new Date(),
        })
        .where(eq(warmedRedditAccounts.id, input.accountId));

      await audit({
        accountId: input.accountId,
        vaId,
        action: 'mark_created',
        detail: {
          redditUsername: input.redditUsername,
          cookieCount: redditCookies.length,
          cookieMode,
          authCookies: redditCookies.filter((c) => authNames.includes(c.name)).map((c) => c.name),
        },
      });

      return { ok: true, accountId: input.accountId, cookieMode };
    }),

  /** VA cancels mid-signup. Release proxy, mark cancelled, audit. */
  cancel: assistantProcedure
    .input(z.object({ accountId: z.number().int(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no db' });
      const vaId = (ctx.user as any).id;
      const [account] = await db
        .select()
        .from(warmedRedditAccounts)
        .where(eq(warmedRedditAccounts.id, input.accountId));
      if (!account) throw new TRPCError({ code: 'NOT_FOUND' });
      if (account.createdByVaId !== vaId && (ctx.user as any).role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      if (account.status !== 'pending') {
        return { ok: true, alreadyTerminal: true };
      }
      if (account.proxyId) {
        await releaseReservedProxy(account.proxyId);
      }
      await db
        .update(warmedRedditAccounts)
        .set({ status: 'cancelled', failureReason: input.reason ?? 'va_cancelled', updatedAt: new Date() })
        .where(eq(warmedRedditAccounts.id, input.accountId));
      await audit({ accountId: input.accountId, vaId, action: 'cancel', detail: { reason: input.reason ?? 'va_cancelled' } });
      return { ok: true };
    }),

  /** Frontend pings every ~30s while signup is active. Detects abandonment for cleanup. */
  heartbeat: assistantProcedure
    .input(z.object({ accountId: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no db' });
      const [account] = await db
        .select({ status: warmedRedditAccounts.status, expiresAt: warmedRedditAccounts.expiresAt })
        .from(warmedRedditAccounts)
        .where(eq(warmedRedditAccounts.id, input.accountId));
      if (!account) throw new TRPCError({ code: 'NOT_FOUND' });
      if (account.status !== 'pending') return { ok: true, terminal: true };
      await db
        .update(warmedRedditAccounts)
        .set({ heartbeatAt: new Date() })
        .where(eq(warmedRedditAccounts.id, input.accountId));
      return { ok: true, expiresAt: account.expiresAt };
    }),

  /** Push expiresAt out by another 30 minutes. */
  extendSession: assistantProcedure
    .input(z.object({ accountId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no db' });
      const vaId = (ctx.user as any).id;
      const newExpiry = new Date(Date.now() + PENDING_TTL_MIN * 60 * 1000);
      await db
        .update(warmedRedditAccounts)
        .set({ expiresAt: newExpiry, heartbeatAt: new Date() })
        .where(
          and(
            eq(warmedRedditAccounts.id, input.accountId),
            eq(warmedRedditAccounts.status, 'pending'),
          ),
        );
      await audit({ accountId: input.accountId, vaId, action: 'extend_session', detail: { newExpiry: newExpiry.toISOString() } });
      return { ok: true, expiresAt: newExpiry.toISOString() };
    }),

  /** Reddit refused the email. Mint a new one on a different domain. Cap at 2 reissues. */
  reissueEmail: assistantProcedure
    .input(z.object({ accountId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no db' });
      const vaId = (ctx.user as any).id;
      const [account] = await db
        .select()
        .from(warmedRedditAccounts)
        .where(eq(warmedRedditAccounts.id, input.accountId));
      if (!account) throw new TRPCError({ code: 'NOT_FOUND' });
      if (account.status !== 'pending') {
        throw new TRPCError({ code: 'CONFLICT', message: 'Not in pending status' });
      }
      if (account.emailReissueCount >= 2) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Already reissued twice. Mark as email_blocked instead.',
        });
      }
      // Record old domain rejection
      await recordDomainRejection(account.emailDomain);
      // Mint new email
      const newEmail = await generateUniqueEmail();
      await db
        .update(warmedRedditAccounts)
        .set({
          emailAlias: newEmail.alias,
          emailDomain: newEmail.domain,
          emailReissueCount: account.emailReissueCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(warmedRedditAccounts.id, input.accountId));
      await incrementDomainCount(newEmail.domain);
      await audit({
        accountId: input.accountId,
        vaId,
        action: 'reissue_email',
        detail: {
          oldEmail: account.emailAlias,
          oldDomain: account.emailDomain,
          newEmail: newEmail.alias,
          newDomain: newEmail.domain,
          reissueCount: account.emailReissueCount + 1,
        },
      });
      return { ok: true, newEmailAlias: newEmail.alias };
    }),

  /** Reddit demanded phone verification. Abandon, retire proxy. */
  markPhoneBlocked: assistantProcedure
    .input(z.object({ accountId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no db' });
      const vaId = (ctx.user as any).id;
      const [account] = await db
        .select()
        .from(warmedRedditAccounts)
        .where(eq(warmedRedditAccounts.id, input.accountId));
      if (!account) throw new TRPCError({ code: 'NOT_FOUND' });
      // Retire proxy (Reddit flagged the IP)
      if (account.proxyId) {
        await db
          .update(redditProxyPool)
          .set({ status: 'flagged', flaggedAt: new Date(), reputationFlagged: true, assignedAccountId: null })
          .where(eq(redditProxyPool.id, account.proxyId));
      }
      await db
        .update(warmedRedditAccounts)
        .set({ status: 'phone_blocked', failureReason: 'reddit_demanded_phone', updatedAt: new Date() })
        .where(eq(warmedRedditAccounts.id, input.accountId));
      await audit({ accountId: input.accountId, vaId, action: 'mark_phone_blocked', detail: { proxyRetired: account.proxyId } });
      return { ok: true };
    }),

  /** Reddit refused all email attempts. Abandon. Don't retire proxy (proxy is fine). */
  markEmailBlocked: assistantProcedure
    .input(z.object({ accountId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no db' });
      const vaId = (ctx.user as any).id;
      const [account] = await db
        .select()
        .from(warmedRedditAccounts)
        .where(eq(warmedRedditAccounts.id, input.accountId));
      if (!account) throw new TRPCError({ code: 'NOT_FOUND' });
      if (account.proxyId) {
        await releaseReservedProxy(account.proxyId);
      }
      await db
        .update(warmedRedditAccounts)
        .set({ status: 'email_blocked', failureReason: 'all_email_domains_rejected', updatedAt: new Date() })
        .where(eq(warmedRedditAccounts.id, input.accountId));
      await audit({ accountId: input.accountId, vaId, action: 'mark_email_blocked' });
      return { ok: true };
    }),

  /**
   * Operator/admin trigger: run a warming session NOW for one account,
   * out-of-band from the cron. Useful for manual testing right after VA
   * creates an account — don't have to wait for the next 6h tick.
   *
   * Returns immediately with `started: true`. The actual session runs in the
   * background and writes its result to warming_session_log + updates the
   * account row, picked up by polling on the dashboard.
   */
  runSessionNow: assistantProcedure
    .input(z.object({ accountId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no db' });
      const [account] = await db
        .select()
        .from(warmedRedditAccounts)
        .where(eq(warmedRedditAccounts.id, input.accountId));
      if (!account) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!['awaiting_verification', 'warming'].includes(account.status)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Cannot run a session — account status is '${account.status}', not 'awaiting_verification' or 'warming'.`,
        });
      }
      // Fire and forget — don't block the request waiting 5-12 min
      (async () => {
        try {
          const { runWarmingSession } = await import('../reddit/warming/runWarmingSession');
          const result = await runWarmingSession(input.accountId);
          console.log(`[manualRun] account #${input.accountId} → ${result.outcome}`);
        } catch (err) {
          console.error(`[manualRun] account #${input.accountId} crashed:`, (err as Error).message);
        }
      })();
      await audit({ accountId: input.accountId, vaId: (ctx.user as any).id, action: 'manual_status_change', detail: { trigger: 'runSessionNow' } });
      return { started: true, accountId: input.accountId };
    }),

  /**
   * Recent warming session log entries for one account.
   * Used by the dashboard drill-down — click an account row to see its
   * session history, outcomes, error details, screenshot paths.
   */
  getSessions: assistantProcedure
    .input(z.object({ accountId: z.number().int(), limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'no db' });
      const { warmingSessionLog } = await import('../../drizzle/schema');
      const rows = await db
        .select()
        .from(warmingSessionLog)
        .where(eq(warmingSessionLog.accountId, input.accountId))
        .orderBy(desc(warmingSessionLog.startedAt))
        .limit(input.limit);
      return rows;
    }),
});

export type RedditAccountsRouter = typeof redditAccountsRouter;
