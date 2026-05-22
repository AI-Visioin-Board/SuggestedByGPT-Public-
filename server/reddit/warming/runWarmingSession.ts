/**
 * runWarmingSession — per-account warming session orchestrator.
 *
 * For ONE warmed_reddit_accounts row, do this:
 *   1. Decrypt password (and cookies if available)
 *   2. Launch Patchright with account's proxy + fingerprint
 *   3. Login:
 *        - Cookie-first: load saved cookies, navigate to reddit.com, check
 *          for logged-in state. If yes → 'login_via_cookies'.
 *        - Otherwise: navigate to /login, type credentials, submit. If
 *          success → 'login_via_password'. If captcha → 'captcha_at_login'.
 *          If "verify your device" email request → 'device_verification_required'.
 *   4. Run day-N action script (browse a few threads, scroll, dwell)
 *   5. Capture cookies from context, encrypt, persist on the row
 *   6. Increment dayNumber + lastSessionAt; flip status if dayNumber >= target
 *   7. Always log a warming_session_log row + update consecutiveFailures
 *
 * Outcomes are explicit enums in the log (warmingSessionLog.outcome) so the
 * triage UI can group failures by mode.
 *
 * Designed to be called by runWarmingTick, but exported for one-off testing.
 */

import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../../db';
import {
  warmedRedditAccounts,
  warmingSessionLog,
  redditProxyPool,
} from '../../../drizzle/schema';
import { decrypt, encrypt } from '../../encryption';
import { launchAccountSession, checkLoginState, humanType, rand, jitter } from '../patchrightDriver';
import { parseFingerprint } from '../fingerprintGenerator';
import { getProxyConnection } from '../proxyManager';
import { detectCaptcha } from '../captchaSolver';
import { getActionsForDay, browseThread, dwell, upvoteOnePost, saveOnePost, joinCurrentSub, commentOnThread } from './dayActions';
import path from 'path';
import fs from 'fs';
import os from 'os';

interface RunResult {
  outcome:
    | 'success'
    | 'login_via_cookies'
    | 'login_via_password'
    | 'captcha_at_login'
    | 'device_verification_required'
    | 'wrong_password'
    | 'rate_limited'
    | 'proxy_failed'
    | 'account_suspended'
    | 'crashed'
    | 'other_error';
  loginSucceeded: boolean;
  actionsAttempted: Record<string, number>;
  actionsCompleted: Record<string, number>;
  errorDetail?: string;
  screenshotPath?: string;
  /** Should we increment dayNumber + flip 'warming'/'warmed' state? */
  countAsProgress: boolean;
  /** Should consecutiveFailures be reset (success) or incremented (failure)? */
  resetFailures: boolean;
  /** Ad-hoc: should the account be flagged as a hard failure? */
  flagFailure?: 'failed' | 'captcha_blocked' | 'verification_required' | 'account_suspended';
}

const SCREENSHOT_DIR = path.join(os.tmpdir(), 'sbgpt-warming');

export async function runWarmingSession(accountId: number): Promise<RunResult> {
  const dbMaybe = await getDb();
  if (!dbMaybe) throw new Error('no db');
  const db = dbMaybe; // narrowed; closures below need this stable reference
  const [account] = await db.select().from(warmedRedditAccounts).where(eq(warmedRedditAccounts.id, accountId));
  if (!account) throw new Error(`account #${accountId} not found`);
  if (!account.proxyId) throw new Error(`account #${accountId} has no proxy assigned`);

  // Determine session number for log
  const [{ count }] = await db.execute(
    sql`SELECT COUNT(*) AS count FROM warming_session_log WHERE accountId = ${account.id}`,
  ) as any;
  const sessionNumber = (Number(count) || 0) + 1;
  const dayNumber = (account.dayNumber ?? 0) + 1; // session N corresponds to day N

  fs.mkdirSync(path.join(SCREENSHOT_DIR, String(account.id)), { recursive: true });
  const screenshotPath = path.join(SCREENSHOT_DIR, String(account.id), `${sessionNumber}-${Date.now()}.png`);

  // Bookkeeping: insert pending log row, fill in outcome at end
  const [logInsertResult] = await db.insert(warmingSessionLog).values({
    accountId: account.id,
    sessionNumber,
    dayNumber,
    proxyId: account.proxyId,
    outcome: 'crashed', // pessimistic default; overwritten on completion
    loginSucceeded: false,
  });
  const logId = (logInsertResult as any)?.insertId;

  // Load proxy + fingerprint
  const [proxy] = await db.select().from(redditProxyPool).where(eq(redditProxyPool.id, account.proxyId));
  if (!proxy) {
    return finalize(logId, {
      outcome: 'proxy_failed',
      loginSucceeded: false,
      actionsAttempted: {},
      actionsCompleted: {},
      errorDetail: `Proxy ${account.proxyId} not found`,
      countAsProgress: false,
      resetFailures: false,
      flagFailure: 'failed',
    });
  }
  const proxyConn = getProxyConnection(proxy);
  const fingerprint = parseFingerprint(account.fingerprint);

  // Decrypt creds + cookies
  const password = decrypt(account.encryptedPassword);
  const savedCookies: any[] = account.encryptedCookies
    ? JSON.parse(decrypt(account.encryptedCookies))
    : [];

  const result = await runOneSession({
    account,
    fingerprint,
    proxyConn,
    password,
    savedCookies,
    screenshotPath,
    dayNumber,
  });

  return finalize(logId, result);

  async function finalize(logId: number, r: RunResult): Promise<RunResult> {
    // Update the log row with the final result
    await db.update(warmingSessionLog).set({
      outcome: r.outcome,
      loginSucceeded: r.loginSucceeded,
      actionsAttempted: r.actionsAttempted,
      actionsCompleted: r.actionsCompleted,
      errorDetail: r.errorDetail ?? null,
      screenshotPath: r.screenshotPath ?? null,
      completedAt: new Date(),
    }).where(eq(warmingSessionLog.id, logId));

    // Update the account row
    const updates: Record<string, any> = {
      lastSessionAt: new Date(),
      updatedAt: new Date(),
    };
    if (r.resetFailures) updates.consecutiveFailures = 0;
    else updates.consecutiveFailures = (account.consecutiveFailures ?? 0) + 1;

    if (r.countAsProgress) {
      const newDay = dayNumber;
      updates.dayNumber = newDay;
      // Status transitions
      if (account.status === 'awaiting_verification') {
        updates.status = 'warming';
      }
      if (newDay >= (account.warmingTargetDays ?? 30)) {
        updates.status = 'warmed';
        updates.warmedAt = new Date();
      }
    }
    if (r.flagFailure) {
      updates.status = r.flagFailure;
      updates.failureReason = r.errorDetail ?? r.outcome;
    }
    // 3 consecutive failures → flag as failed regardless of specific outcome
    if (!r.resetFailures && (account.consecutiveFailures ?? 0) + 1 >= 3 && !r.flagFailure) {
      updates.status = 'failed';
      updates.failureReason = `3 consecutive failures: ${r.outcome} ${r.errorDetail ?? ''}`.slice(0, 1000);
    }
    await db.update(warmedRedditAccounts).set(updates).where(eq(warmedRedditAccounts.id, account.id));

    return r;
  }
}

interface SessionInputs {
  account: typeof warmedRedditAccounts.$inferSelect;
  fingerprint: ReturnType<typeof parseFingerprint>;
  proxyConn: ReturnType<typeof getProxyConnection>;
  password: string;
  savedCookies: any[];
  screenshotPath: string;
  dayNumber: number;
}

async function runOneSession(inp: SessionInputs): Promise<RunResult> {
  const actions = getActionsForDay(inp.dayNumber);
  const attempted = { ...actions.attempted };
  const completed = { browse: 0, upvote: 0, subscribe: 0, comment: 0, post: 0 };
  let session: Awaited<ReturnType<typeof launchAccountSession>> | null = null;

  try {
    session = await launchAccountSession({
      accountId: inp.account.id,
      fingerprint: inp.fingerprint,
      proxyServer: inp.proxyConn.server,
      proxyUsername: inp.proxyConn.username,
      proxyPassword: inp.proxyConn.password,
      headless: true,
    });
    const { context, page } = session;

    // ── Step 1: cookie-first login attempt ──
    if (inp.savedCookies.length > 0) {
      try {
        await context.addCookies(inp.savedCookies);
      } catch (err) {
        // Non-fatal — proceed to navigate, may auto-fall through to password login
        console.warn('[warming] addCookies failed:', (err as Error).message);
      }
    }

    await page.goto('https://www.reddit.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await dwell(page, jitter(5000));

    let loginMode: 'login_via_cookies' | 'login_via_password' | null = null;
    const loggedIn = (await checkLoginState(page)) !== null;

    if (loggedIn) {
      loginMode = 'login_via_cookies';
    } else {
      // ── Step 2: password login fallback ──
      await page.goto('https://www.reddit.com/login/', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await dwell(page, jitter(3000));

      // Check for captcha BEFORE typing
      const captchaPre = await detectCaptcha(page);
      if (captchaPre) {
        try { await page.screenshot({ path: inp.screenshotPath, fullPage: false }); } catch {}
        return {
          outcome: 'captcha_at_login',
          loginSucceeded: false,
          actionsAttempted: attempted,
          actionsCompleted: completed,
          errorDetail: `Captcha (${captchaPre.type}) on /login before submit`,
          screenshotPath: inp.screenshotPath,
          countAsProgress: false,
          resetFailures: false,
          flagFailure: 'captcha_blocked',
        };
      }

      // Type username + password
      // Reddit's login form selectors have shifted — try a couple
      const userSelectors = ['input[name="username"]', 'input[autocomplete="username"]', '#login-username'];
      const passSelectors = ['input[name="password"]', 'input[type="password"]', '#login-password'];
      let userField: string | null = null;
      let passField: string | null = null;
      for (const s of userSelectors) {
        if (await page.locator(s).first().isVisible().catch(() => false)) { userField = s; break; }
      }
      for (const s of passSelectors) {
        if (await page.locator(s).first().isVisible().catch(() => false)) { passField = s; break; }
      }
      if (!userField || !passField) {
        try { await page.screenshot({ path: inp.screenshotPath, fullPage: false }); } catch {}
        return {
          outcome: 'other_error',
          loginSucceeded: false,
          actionsAttempted: attempted,
          actionsCompleted: completed,
          errorDetail: 'Could not find Reddit login form fields',
          screenshotPath: inp.screenshotPath,
          countAsProgress: false,
          resetFailures: false,
        };
      }
      await humanType(page, userField, inp.account.redditUsername!);
      await dwell(page, jitter(800));
      await humanType(page, passField, inp.password);
      await dwell(page, jitter(700));
      await page.locator('button[type="submit"], button:has-text("Log in")').first().click({ timeout: 5000 });
      await dwell(page, jitter(5000));

      // Check post-submit state
      const postUrl = page.url();
      if (/suspended/i.test(postUrl)) {
        try { await page.screenshot({ path: inp.screenshotPath, fullPage: false }); } catch {}
        return {
          outcome: 'account_suspended', loginSucceeded: false,
          actionsAttempted: attempted, actionsCompleted: completed,
          errorDetail: `Redirected to ${postUrl}`,
          screenshotPath: inp.screenshotPath,
          countAsProgress: false, resetFailures: false,
          flagFailure: 'failed',
        };
      }
      const verifyEmail = await page.locator('text=/verify your email|check your email|new device/i').first().isVisible().catch(() => false);
      if (verifyEmail) {
        try { await page.screenshot({ path: inp.screenshotPath, fullPage: false }); } catch {}
        return {
          outcome: 'device_verification_required', loginSucceeded: false,
          actionsAttempted: attempted, actionsCompleted: completed,
          errorDetail: 'Reddit demanded device verification email',
          screenshotPath: inp.screenshotPath,
          countAsProgress: false, resetFailures: false,
          flagFailure: 'verification_required',
        };
      }
      const incorrect = await page.locator('text=/incorrect|invalid|wrong/i').first().isVisible().catch(() => false);
      if (incorrect) {
        try { await page.screenshot({ path: inp.screenshotPath, fullPage: false }); } catch {}
        return {
          outcome: 'wrong_password', loginSucceeded: false,
          actionsAttempted: attempted, actionsCompleted: completed,
          errorDetail: 'Reddit reported incorrect credentials',
          screenshotPath: inp.screenshotPath,
          countAsProgress: false, resetFailures: false,
          flagFailure: 'failed',
        };
      }
      const captchaPost = await detectCaptcha(page);
      if (captchaPost) {
        try { await page.screenshot({ path: inp.screenshotPath, fullPage: false }); } catch {}
        return {
          outcome: 'captcha_at_login', loginSucceeded: false,
          actionsAttempted: attempted, actionsCompleted: completed,
          errorDetail: `Captcha (${captchaPost.type}) appeared after submit`,
          screenshotPath: inp.screenshotPath,
          countAsProgress: false, resetFailures: false,
          flagFailure: 'captcha_blocked',
        };
      }

      // Verify we're actually logged in now
      await page.goto('https://www.reddit.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      const postLoginCheck = (await checkLoginState(page)) !== null;
      if (!postLoginCheck) {
        try { await page.screenshot({ path: inp.screenshotPath, fullPage: false }); } catch {}
        return {
          outcome: 'other_error', loginSucceeded: false,
          actionsAttempted: attempted, actionsCompleted: completed,
          errorDetail: 'Login form submitted but session check shows not logged in',
          screenshotPath: inp.screenshotPath,
          countAsProgress: false, resetFailures: false,
        };
      }
      loginMode = 'login_via_password';
    }

    // ── Step 3: run day-N action script ──
    // Budgets get decremented as actions fire; remaining = unused at end.
    let upvoteBudget = attempted.upvote;
    let saveBudget = attempted.subscribe; // schema: subscribe = save+join, kept for compat
    let commentBudget = attempted.comment;
    for (let i = 0; i < attempted.browse; i++) {
      const sub = actions.allowedSubs[i % actions.allowedSubs.length]!;
      const ok = await browseThread(page, sub);
      if (!ok) continue;
      completed.browse++;

      // Inside-thread actions (only fire when budgets allow + jitter)
      if (upvoteBudget > 0 && Math.random() < 0.6) {
        if (await upvoteOnePost(page)) {
          completed.upvote++;
          upvoteBudget--;
        }
      }
      if (saveBudget > 0 && Math.random() < 0.4) {
        if (await saveOnePost(page)) {
          completed.subscribe++;
          saveBudget--;
        }
      }
      // Save the comment for the LAST visited thread of the session
      if (commentBudget > 0 && i === attempted.browse - 1) {
        if (await commentOnThread(page)) {
          completed.comment++;
          commentBudget--;
        }
      }
    }
    // joinCurrentSub is wired in for future use (day 6+ in dead-code branch)
    void joinCurrentSub;

    // ── Step 4: capture cookies for next session ──
    try {
      const allCookies = await context.cookies();
      const reddit = allCookies.filter((c) => /reddit\.com|redd\.it|redditmedia/.test(c.domain));
      if (reddit.length > 0) {
        const innerDb = await getDb();
        if (innerDb) {
          await innerDb.update(warmedRedditAccounts)
            .set({ encryptedCookies: encrypt(JSON.stringify(reddit)) })
            .where(eq(warmedRedditAccounts.id, inp.account.id));
        }
      }
    } catch (err) {
      console.warn('[warming] cookie capture failed:', (err as Error).message);
    }

    return {
      outcome: loginMode!,
      loginSucceeded: true,
      actionsAttempted: attempted,
      actionsCompleted: completed,
      countAsProgress: true,
      resetFailures: true,
    };
  } catch (err) {
    const msg = (err as Error).message;
    let path: string | undefined;
    if (session) {
      try {
        await session.page.screenshot({ path: inp.screenshotPath, fullPage: false });
        path = inp.screenshotPath;
      } catch {}
    }
    return {
      outcome: 'crashed',
      loginSucceeded: false,
      actionsAttempted: attempted,
      actionsCompleted: completed,
      errorDetail: msg.slice(0, 1000),
      screenshotPath: path,
      countAsProgress: false,
      resetFailures: false,
    };
  } finally {
    if (session) {
      try { await session.cleanup(); } catch {}
    }
  }
}
