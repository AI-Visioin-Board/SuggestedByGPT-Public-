/**
 * Reddit Account Creator — full programmatic signup orchestrator
 *
 * For a given client, this:
 *   1. Generates a Reddit username (from business name) + 24-char password
 *   2. Allocates an email alias on inboxsbgpt.com
 *   3. Allocates a clean Webshare ISP IP from the pool
 *   4. Generates a per-account browser fingerprint matching the IP's geo
 *   5. Encrypts all secrets, inserts clientRedditAccounts row
 *   6. Launches Patchright with proxy + fingerprint
 *   7. Drives reddit.com/register: types email, username, password
 *   8. Solves any reCAPTCHA via 2Captcha
 *   9. Submits the form
 *   10. Polls the redditVerificationQueue for the code/link
 *   11. Types the code OR navigates to the magic link
 *   12. Confirms account is logged in via /api/me.json
 *   13. Saves session cookies (encrypted) to DB
 *   14. Returns success — caller schedules warm-up tasks via accountWarmup
 *
 * On any failure: marks the account 'flagged' with a failureReason and
 * notifies owner. Account is not auto-retried — manual review required.
 */

import { eq, and, isNull, lte } from 'drizzle-orm';
import crypto from 'crypto';
import type { Page } from 'patchright';
import { getDb } from '../db';
import {
  clientRedditAccounts,
  redditVerificationQueue,
  type ClientRedditAccount,
  type InsertClientRedditAccount,
} from '../../drizzle/schema';
import { ENV } from '../_core/env';
import { encrypt } from '../encryption';
import { generateUsernameCandidates } from './usernameGenerator';
import { generateFingerprint, serializeFingerprint } from './fingerprintGenerator';
import { assignProxyToAccount, getProxyConnection, flagProxy } from './proxyManager';
import { checkAndUpdateProxy } from './proxyHealthChecker';
import { launchAccountSession, humanType, checkLoginState, humanDwell, humanMouseMove, humanGaussianType, jitter, rand } from './patchrightDriver';
import { captureSession } from './sessionPersistence';
import { solveCaptchaOnPage, detectCaptcha } from './captchaSolver';

export interface CreateAccountInput {
  clientId: number;
  businessName: string;
  /** Override headless for tests. Default true (production). */
  headless?: boolean;
  /** Override account email domain for tests. */
  emailDomain?: string;
}

export interface CreateAccountResult {
  success: boolean;
  accountId: number;
  redditUsername?: string;
  failureReason?: string;
}

const POLL_INTERVAL_MS = 5_000;
const VERIFICATION_TIMEOUT_MS = 5 * 60 * 1000;
const SIGNUP_FORM_TIMEOUT_MS = 60 * 1000;

function generatePassword(): string {
  // 24 chars, mixed alphanumeric + safe special. Reddit accepts this.
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(24);
  let out = '';
  for (let i = 0; i < 24; i++) {
    out += charset[bytes[i]! % charset.length];
  }
  return out;
}

function buildEmailAlias(redditUsername: string, domain: string): string {
  // Use the reddit username as the email local part — easy traceability.
  // Reddit usernames are 3-20 chars, all alphanumeric/underscore — safe for email.
  return `${redditUsername.toLowerCase()}@${domain}`;
}

/**
 * Drain unconsumed verification queue rows for the given email alias.
 * Returns the first matching row if available, marks it consumed.
 */
async function pollVerificationQueue(emailAlias: string, timeoutMs: number): Promise<{ code?: string; magicLink?: string } | null> {
  const db = await getDb();
  if (!db) return null;
  const start = Date.now();
  const aliasLower = emailAlias.toLowerCase();

  while (Date.now() - start < timeoutMs) {
    const [row] = await db.select()
      .from(redditVerificationQueue)
      .where(and(
        eq(redditVerificationQueue.emailAlias, aliasLower),
        isNull(redditVerificationQueue.consumedAt),
      ))
      .limit(1);

    if (row) {
      // Mark consumed so retries don't re-pick it
      await db.update(redditVerificationQueue)
        .set({ consumedAt: new Date() })
        .where(eq(redditVerificationQueue.id, row.id));
      return {
        code: row.code || undefined,
        magicLink: row.magicLink || undefined,
      };
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  return null;
}

// Reddit's signup as of April 2026 is a multi-step wizard built on Shreddit
// web components. Real <input>s live inside shadow DOM, so plain CSS selectors
// miss them — we use Patchright's getByLabel/getByRole/getByPlaceholder which
// pierce shadow roots.
//
// Flow:
//   step 1: email     → Continue
//   step 2: OTP code  → Continue   (we get the code from redditVerificationQueue)
//   step 3: username  → Continue
//   step 4: password  → Sign Up

const typeDelay = () => 60 + Math.floor(Math.random() * 50);

// Reddit's signup uses Lit-based <faceplate-text-input> elements where the real
// <input> lives in the open shadow root. Patchright's getByLabel/getByRole
// don't pierce these reliably for `faceplate-*` because the <label> is in light
// DOM but the <input> is in shadow with no aria-labelledby bridge. Use
// the Patchright `>>>` shadow-piercing combinator (or a direct child locator
// from the custom element) instead.
function emailLocators(page: Page) {
  return [
    () => page.locator('faceplate-text-input[name="email"] input').first(),
    () => page.locator('faceplate-text-input[name="email"] >>> input').first(),
    () => page.locator('input[name="email"], input[type="email"], input[autocomplete="email"]').first(),
    () => page.getByRole('textbox', { name: /email/i }).first(),
  ];
}

async function fillEmailStep(page: Page, email: string): Promise<boolean> {
  for (const make of emailLocators(page)) {
    try {
      const loc = make();
      await loc.waitFor({ state: 'visible', timeout: 8000 });
      // Move mouse to field with Bézier path before clicking
      const box = await loc.boundingBox();
      if (box) await humanMouseMove(page, box.x + box.width / 2, box.y + box.height / 2, 20);
      await loc.click();
      await page.waitForTimeout(jitter(400));
      await loc.fill('');
      // Gaussian-distributed inter-char delay = more human than uniform
      await humanGaussianType(page, email, 90, 30);
      console.log('[accountCreator] email filled');
      // Trigger blur so faceplate-text-input's internal validator fires —
      // otherwise the Continue button stays disabled.
      try {
        await page.locator('faceplate-text-input[name="email"]').first().evaluate((el: any) => {
          if (typeof el.blur === 'function') el.blur();
          // Also dispatch a real blur event in case the element doesn't expose blur()
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        });
      } catch { /* non-fatal */ }
      await page.waitForTimeout(jitter(600));
      return true;
    } catch { /* try next locator */ }
  }
  console.log('[accountCreator] email field not found');
  return false;
}

async function clickContinue(page: Page, label: string = 'continue'): Promise<boolean> {
  await page.waitForTimeout(800);
  try {
    await page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first().click({ timeout: 5000 });
    console.log(`[accountCreator] clicked ${label}`);
    return true;
  } catch {
    try {
      await page.keyboard.press('Enter');
      console.log(`[accountCreator] pressed Enter as ${label} fallback`);
      return true;
    } catch {
      return false;
    }
  }
}

async function fillOtpStep(page: Page, code: string): Promise<boolean> {
  // Reddit's OTP step uses faceplate-otp-input or faceplate-text-input[name="code"]
  const otpLocators = [
    () => page.locator('faceplate-otp-input input').first(),
    () => page.locator('faceplate-text-input[name="code"] input').first(),
    () => page.locator('input[autocomplete="one-time-code"], input[inputmode="numeric"]').first(),
    () => page.getByRole('textbox', { name: /code|otp/i }).first(),
  ];
  for (const make of otpLocators) {
    try {
      const loc = make();
      await loc.waitFor({ state: 'visible', timeout: 12000 });
      const box = await loc.boundingBox();
      if (box) await humanMouseMove(page, box.x + box.width / 2, box.y + box.height / 2, 18);
      await loc.click();
      await page.waitForTimeout(jitter(400));
      await loc.fill('');
      await humanGaussianType(page, code, 110, 35);
      console.log('[accountCreator] OTP code typed');
      // Blur to fire validator
      try {
        await page.locator('faceplate-text-input[name="code"], faceplate-otp-input').first().evaluate((el: any) => {
          if (typeof el.blur === 'function') el.blur();
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        });
      } catch { /* non-fatal */ }
      await page.waitForTimeout(jitter(500));
      return true;
    } catch { /* next */ }
  }
  console.log('[accountCreator] OTP field not found');
  return false;
}

async function fillUsernameStep(page: Page, username: string): Promise<boolean> {
  const usernameLocators = [
    () => page.locator('faceplate-text-input[name="username"] input').first(),
    () => page.locator('faceplate-text-input[name="username"] >>> input').first(),
    () => page.locator('input[name="username"]').first(),
    () => page.getByRole('textbox', { name: /username/i }).first(),
  ];
  for (const make of usernameLocators) {
    try {
      const loc = make();
      await loc.waitFor({ state: 'visible', timeout: 10000 });
      const box = await loc.boundingBox();
      if (box) await humanMouseMove(page, box.x + box.width / 2, box.y + box.height / 2, 18);
      await loc.click();
      await page.waitForTimeout(jitter(400));
      await loc.fill('');
      await humanGaussianType(page, username, 95, 30);
      console.log('[accountCreator] username typed');
      try {
        await page.locator('faceplate-text-input[name="username"]').first().evaluate((el: any) => {
          if (typeof el.blur === 'function') el.blur();
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        });
      } catch { /* non-fatal */ }
      await page.waitForTimeout(jitter(500));
      return true;
    } catch { /* next */ }
  }
  console.log('[accountCreator] username field not found');
  return false;
}

async function fillPasswordStep(page: Page, password: string): Promise<boolean> {
  const passwordLocators = [
    () => page.locator('faceplate-text-input[name="password"] input').first(),
    () => page.locator('faceplate-text-input[name="password"] >>> input').first(),
    () => page.locator('input[name="password"], input[type="password"]').first(),
    () => page.getByRole('textbox', { name: /password/i }).first(),
  ];
  for (const make of passwordLocators) {
    try {
      const loc = make();
      await loc.waitFor({ state: 'visible', timeout: 8000 });
      const box = await loc.boundingBox();
      if (box) await humanMouseMove(page, box.x + box.width / 2, box.y + box.height / 2, 18);
      await loc.click();
      await page.waitForTimeout(jitter(400));
      await humanGaussianType(page, password, 100, 35);
      console.log('[accountCreator] password typed');
      try {
        await page.locator('faceplate-text-input[name="password"]').first().evaluate((el: any) => {
          if (typeof el.blur === 'function') el.blur();
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        });
      } catch { /* non-fatal */ }
      await page.waitForTimeout(jitter(500));
      return true;
    } catch { /* next */ }
  }
  console.log('[accountCreator] password field not found');
  return false;
}

/**
 * Submit the signup form. Solves reCAPTCHA if present.
 */
async function submitSignupForm(page: Page): Promise<{ submitted: boolean; needsCaptcha: boolean }> {
  // Detect captcha first
  const captcha = await detectCaptcha(page);
  let needsCaptcha = false;

  if (captcha) {
    needsCaptcha = true;
    console.log('[accountCreator] CAPTCHA detected — solving via 2Captcha...');
    try {
      await solveCaptchaOnPage(page);
    } catch (err) {
      console.error('[accountCreator] captcha solve failed:', (err as Error).message);
      return { submitted: false, needsCaptcha: true };
    }
  }

  // Click Sign Up button
  const submitClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a'));
    for (const b of buttons) {
      const t = (b.textContent || '').trim().toLowerCase();
      if (t === 'sign up' || t === 'create account' || t === 'register' || t === 'continue') {
        (b as HTMLElement).click();
        return true;
      }
    }
    return false;
  });

  if (!submitClicked) {
    await page.keyboard.press('Enter');
  }

  await page.waitForTimeout(4000);
  return { submitted: true, needsCaptcha };
}

// ── Main entry point ──────────────────────────────────────────────────────

export async function createRedditAccountForClient(input: CreateAccountInput): Promise<CreateAccountResult> {
  const db = await getDb();
  if (!db) return { success: false, accountId: -1, failureReason: 'db_unavailable' };

  const emailDomain = input.emailDomain || ENV.accountsEmailDomain;
  if (!emailDomain) {
    return { success: false, accountId: -1, failureReason: 'ACCOUNTS_EMAIL_DOMAIN not configured' };
  }

  console.log(`[accountCreator] Starting signup for client #${input.clientId} (${input.businessName})`);

  // ── Step 1: pick a username (will retry with variants if taken) ──
  const candidates = generateUsernameCandidates(input.businessName, 5);
  if (candidates.length === 0) {
    return { success: false, accountId: -1, failureReason: 'no_username_candidates' };
  }

  // ── Step 2: generate creds early (before any DB or proxy mutation) ──
  const password = generatePassword();
  const username = candidates[0]!;
  const emailAlias = buildEmailAlias(username, emailDomain);

  // ── Step 3: insert account row FIRST so we have a real id to assign the proxy to.
  //   C9 fix: previously we called assignProxyToAccount(0) before insert,
  //   which left the proxy with assignedAccountId=0 if signup failed early.
  //   Now we insert with proxyId=null + status='pending_creation', then claim
  //   a proxy with the real account id.
  //   C10 fix: use the standard mysql2 [{ insertId, affectedRows }, fields[]]
  //   destructure pattern instead of fragile `(result as any)[0]?.insertId`. ──
  const tempInsert: InsertClientRedditAccount = {
    clientId: input.clientId,
    redditUsername: username,
    encryptedPassword: encrypt(password),
    fingerprint: '{}',  // populated after fingerprint generation below
    emailAlias,
    proxyId: null,
    proxyTimezone: null,
    status: 'pending_creation',
    dayNumber: 0,
  };

  const insertResult = await db.insert(clientRedditAccounts).values(tempInsert);
  // Drizzle/mysql2 returns ResultSetHeader (with insertId) directly, not wrapped in array
  const insertId =
    (insertResult as any)?.insertId ??
    (Array.isArray(insertResult) ? (insertResult[0] as any)?.insertId : undefined);
  if (!insertId || insertId <= 0) {
    return { success: false, accountId: -1, failureReason: 'account_insert_failed_no_id' };
  }
  const accountId: number = insertId;

  // ── Step 4: allocate proxy + check reputation ──
  let proxy;
  try {
    proxy = await assignProxyToAccount(accountId);
  } catch (err) {
    await markFlagged(accountId, `no_proxy_available: ${(err as Error).message}`);
    return { success: false, accountId, failureReason: `no_proxy_available: ${(err as Error).message}` };
  }

  // Verify the proxy's reputation. If flagged, release it back and bail.
  const rep = await checkAndUpdateProxy(proxy);
  if (!rep.clean) {
    // Release the proxy (so a future signup can re-evaluate) and flag account.
    const { redditProxyPool } = await import('../../drizzle/schema');
    await db.update(redditProxyPool)
      .set({ assignedAccountId: null, status: 'flagged' })
      .where(eq(redditProxyPool.id, proxy.id));
    await markFlagged(accountId, `proxy_reputation_flagged: ${rep.flags.join(',')}`);
    return { success: false, accountId, failureReason: `proxy_reputation_flagged: ${rep.flags.join(',')}` };
  }

  // ── Step 5: generate fingerprint matching proxy geo, update account row ──
  // Pass per-IP lat/lng so the fingerprint includes geolocation API support
  // matching the actual proxy IP. Reddit cross-checks navigator.geolocation
  // against IP geo — mismatch is a hard fingerprint signal.
  const fingerprint = generateFingerprint({
    seed: `${input.clientId}:${username}`,
    proxyTimezone: rep.timezone || proxy.geoTimezone || undefined,
    proxyLocale: 'en-US',
    proxyLat: rep.lat ?? (proxy.geoLat ? Number(proxy.geoLat) : undefined),
    proxyLng: rep.lng ?? (proxy.geoLng ? Number(proxy.geoLng) : undefined),
  });

  await db.update(clientRedditAccounts)
    .set({
      fingerprint: serializeFingerprint(fingerprint),
      proxyId: proxy.id,
      proxyTimezone: rep.timezone || proxy.geoTimezone,
      status: 'creating',
    })
    .where(eq(clientRedditAccounts.id, accountId));

  console.log(`[accountCreator] Created account row #${accountId} username=u/${username} alias=${emailAlias}`);

  // ── Step 5: launch Patchright with proxy + fingerprint ──
  const proxyConn = getProxyConnection(proxy);
  const session = await launchAccountSession({
    accountId,
    fingerprint,
    proxyServer: proxyConn.server,
    proxyUsername: proxyConn.username,
    proxyPassword: proxyConn.password,
    headless: input.headless ?? true,
  });

  let outcome: CreateAccountResult = {
    success: false,
    accountId,
    failureReason: 'unknown_error',
  };

  try {
    // ── Step 6: warm-touch sequence BEFORE /register ──
    // Research finding §3: fresh ISP IPs that go directly to /register get
    // burned 1-in-3 because they have no cookies/history. Real users land
    // on Reddit via Google or organic browsing. Build that history first.
    console.log('[accountCreator] Warm-touch: google → reddit.com → r/popular → /register');

    // Touch 1: Google (sets a referer for the next nav)
    try {
      await session.page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await humanDwell(session.page, 4000);
    } catch (e) {
      console.warn('[accountCreator] google touch failed:', (e as Error).message);
    }

    // Touch 2: reddit.com homepage (logged out browse — sets _recaptcha, loid cookies)
    await session.page.goto('https://www.reddit.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await humanDwell(session.page, 7000);

    // Touch 3: r/popular (more cookie depth + Reddit UI activity)
    await session.page.goto('https://www.reddit.com/r/popular/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await humanDwell(session.page, 6000);

    // Now /register — IP looks like a returning visitor, not a fresh bot
    await session.page.goto('https://www.reddit.com/register', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await session.page.waitForTimeout(jitter(5000));  // give Shreddit + JS challenge time
    await humanDwell(session.page, 4000);  // additional dwell on /register before any action

    // ── Step 7a: type email + click Continue ──
    if (!await fillEmailStep(session.page, emailAlias)) {
      outcome.failureReason = 'email_step_failed';
      await markFlagged(accountId, outcome.failureReason);
      return outcome;
    }
    await clickContinue(session.page, 'continue');
    await session.page.waitForTimeout(4000);

    // Reddit may show a captcha here if the IP looks suspicious.
    try {
      const captcha = await detectCaptcha(session.page);
      if (captcha) {
        console.log('[accountCreator] Captcha after email step — solving via 2Captcha');
        await solveCaptchaOnPage(session.page);
        await clickContinue(session.page, 'continue');
        await session.page.waitForTimeout(3500);
      }
    } catch (e) {
      console.warn('[accountCreator] Captcha attempt failed (non-fatal):', (e as Error).message);
    }

    // ── Step 7b: poll verification queue for OTP, type it ──
    await db.update(clientRedditAccounts)
      .set({ status: 'verifying' })
      .where(eq(clientRedditAccounts.id, accountId));

    console.log('[accountCreator] Polling verification queue...');
    const verification = await pollVerificationQueue(emailAlias, VERIFICATION_TIMEOUT_MS);

    if (!verification) {
      outcome.failureReason = 'verification_email_timeout';
      await markFlagged(accountId, outcome.failureReason);
      return outcome;
    }

    if (verification.magicLink) {
      console.log('[accountCreator] Magic link received — navigating');
      await session.page.goto(verification.magicLink, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } else if (verification.code) {
      console.log(`[accountCreator] OTP received: ${verification.code}`);
      if (!await fillOtpStep(session.page, verification.code)) {
        outcome.failureReason = 'verification_code_field_not_found';
        await markFlagged(accountId, outcome.failureReason);
        return outcome;
      }
      await clickContinue(session.page, 'continue');
      await session.page.waitForTimeout(3500);
    }

    // ── Step 7c: username step ──
    if (!await fillUsernameStep(session.page, username)) {
      outcome.failureReason = 'username_step_failed';
      await markFlagged(accountId, outcome.failureReason);
      return outcome;
    }
    await clickContinue(session.page, 'continue');
    await session.page.waitForTimeout(3500);

    // ── Step 7d: password step + final submit ──
    if (!await fillPasswordStep(session.page, password)) {
      outcome.failureReason = 'password_step_failed';
      await markFlagged(accountId, outcome.failureReason);
      return outcome;
    }
    // Final captcha check + click Sign Up / Continue
    try {
      const captcha = await detectCaptcha(session.page);
      if (captcha) {
        console.log('[accountCreator] Captcha at final submit — solving');
        await solveCaptchaOnPage(session.page);
      }
    } catch { /* non-fatal */ }
    // Final button may be "Sign Up" or "Continue"
    const submittedFinal =
      await clickContinue(session.page, 'sign up') ||
      await clickContinue(session.page, 'continue') ||
      await clickContinue(session.page, 'create account');
    if (!submittedFinal) {
      outcome.failureReason = 'final_submit_button_not_found';
      await markFlagged(accountId, outcome.failureReason);
      return outcome;
    }

    await session.page.waitForTimeout(7000);

    // ── Step 11: confirm logged in ──
    const loggedInUser = await checkLoginState(session.page);
    if (!loggedInUser) {
      outcome.failureReason = 'post_verification_login_check_failed';
      await markFlagged(accountId, outcome.failureReason);
      return outcome;
    }

    if (loggedInUser.toLowerCase() !== username.toLowerCase()) {
      outcome.failureReason = `username_mismatch_post_signup: expected=${username} got=${loggedInUser}`;
      await markFlagged(accountId, outcome.failureReason);
      return outcome;
    }

    // ── Step 12: capture session cookies ──
    const encryptedCookies = await captureSession(session.context, session.page);
    await db.update(clientRedditAccounts)
      .set({
        status: 'warming_up',
        encryptedCookies,
        lastSessionAt: new Date(),
      })
      .where(eq(clientRedditAccounts.id, accountId));

    // ── Step 13: schedule the 30-day warm-up tasks (C2) ──
    // Without this the account sits at dayNumber=0 forever and the worker
    // tick has nothing to pull. Re-fetch the row so accountWarmup sees
    // status='warming_up'.
    try {
      const [refreshedAccount] = await db.select().from(clientRedditAccounts)
        .where(eq(clientRedditAccounts.id, accountId)).limit(1);
      if (refreshedAccount) {
        const { scheduleWarmupForAccount } = await import('./accountWarmup');
        const sched = await scheduleWarmupForAccount(refreshedAccount);
        console.log(`[accountCreator] Scheduled ${sched.tasksInserted} warm-up tasks`);
      }
    } catch (err) {
      // Non-fatal — account is created, scheduling can be retried by a worker tick.
      console.warn('[accountCreator] Warm-up scheduling failed (non-fatal):', (err as Error).message);
    }

    console.log(`[accountCreator] ✓ Account u/${username} created successfully (#${accountId})`);

    outcome = {
      success: true,
      accountId,
      redditUsername: username,
    };
    return outcome;
  } catch (err) {
    outcome.failureReason = `exception: ${(err as Error).message?.slice(0, 200)}`;
    await markFlagged(accountId, outcome.failureReason);
    return outcome;
  } finally {
    await session.cleanup();
  }
}

async function markFlagged(accountId: number, reason: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(clientRedditAccounts)
    .set({
      status: 'flagged',
      failureReason: reason,
    })
    .where(eq(clientRedditAccounts.id, accountId));
  console.log(`[accountCreator] ✗ Account #${accountId} flagged: ${reason}`);
}
