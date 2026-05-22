/**
 * Reddit Account Poster — executes individual redditAccountTasks rows.
 *
 * Worker tick (Phase D worker integration) calls executeNextTask() which:
 *   1. Atomically claims one pending task whose scheduledAt <= now
 *   2. Loads the account + proxy + fingerprint
 *   3. Launches Patchright session
 *   4. Dispatches to the right handler based on taskType
 *   5. Captures result, updates task row + account state
 *   6. Saves session cookies for next time
 *
 * Handlers:
 *   warmup_subscribe        join a subreddit
 *   warmup_lurk             open a thread, scroll, dwell
 *   warmup_upvote           upvote N posts in a subreddit
 *   warmup_comment_neutral  comment on a hot thread, content from contentGenerator
 *   warmup_textpost_neutral submit a text post, content from contentGenerator
 *   promotional_comment     reply to a discovered thread (redditDrafts.draftText)
 *   promotional_textpost    text post about industry insight
 *   shadowban_check         AyrA probe → no Patchright needed
 *   dormant_maintenance     1 upvote/day to keep account alive (Day 90+)
 *
 * Captcha circuit breaker: if 3+ captchas hit in past hour for the same
 * account, set captchaCircuitOpenedAt and stop posting from it for 24h.
 */

import { eq, and, lte, sql, isNull } from 'drizzle-orm';
import crypto from 'crypto';
import type { Page } from 'patchright';
import { getDb } from '../db';
import {
  clientRedditAccounts,
  redditAccountTasks,
  redditDrafts,
  redditThreads,
  type RedditAccountTask,
  type ClientRedditAccount,
} from '../../drizzle/schema';
import { decrypt } from '../encryption';
import { parseFingerprint } from './fingerprintGenerator';
import { getProxyForAccount, getProxyConnection, flagProxy } from './proxyManager';
import { launchAccountSession, applyStoredLocalStorage, checkLoginState, humanType } from './patchrightDriver';
import { captureSession } from './sessionPersistence';
import { detectCaptcha, solveCaptchaOnPage } from './captchaSolver';
import {
  generateWarmupComment,
  generateWarmupTextPost,
  generatePromotionalComment,
  pickNeutralWarmupSubreddit,
} from './contentGenerator';
import { checkAccount } from './shadowbanChecker';

const STUCK_THRESHOLD_MS = 10 * 60 * 1000;  // tasks stuck in_progress > 10 min get reset
const CAPTCHA_HOURLY_LIMIT = 3;             // circuit breaker
const CAPTCHA_COOL_HOURS = 24;

const WORKER_ID = `worker-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;

export interface TaskResult {
  success: boolean;
  resultUrl?: string;
  resultMessage?: string;
  captchaHit?: boolean;
}

// ── Atomic task claim ────────────────────────────────────────────────────

/**
 * Atomically claim the next due task. Two concurrent workers won't pick
 * up the same row.
 */
export async function claimNextTask(): Promise<RedditAccountTask | null> {
  const db = await getDb();
  if (!db) return null;

  // Reset stuck tasks first (more than 10 min in_progress = worker died)
  const stuckCutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);
  await db.update(redditAccountTasks)
    .set({ status: 'pending', workerId: null })
    .where(and(
      eq(redditAccountTasks.status, 'in_progress'),
      lte(redditAccountTasks.updatedAt, stuckCutoff),
    ));

  // Find candidates
  const candidates = await db.select()
    .from(redditAccountTasks)
    .where(and(
      eq(redditAccountTasks.status, 'pending'),
      lte(redditAccountTasks.scheduledAt, new Date()),
    ))
    .limit(5);

  for (const candidate of candidates) {
    const result = await db.update(redditAccountTasks)
      .set({ status: 'in_progress', workerId: WORKER_ID })
      .where(and(
        eq(redditAccountTasks.id, candidate.id),
        eq(redditAccountTasks.status, 'pending'),
      ));
    const affected = (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows;
    if (affected && affected > 0) {
      return { ...candidate, status: 'in_progress' as const, workerId: WORKER_ID };
    }
  }

  return null;
}

// ── Captcha circuit breaker ──────────────────────────────────────────────

/**
 * Whether the captcha circuit is currently open for the account.
 *
 * C8: when the cool-down has expired, we MUST also reset the counter
 * (captchaHitsLastHour=0, captchaCircuitOpenedAt=null) so the next single
 * captcha doesn't immediately re-trip the circuit. Without this, the
 * counter monotonically increases and the account is bricked after the
 * first 3 captchas — forever.
 */
async function isCircuitOpen(account: ClientRedditAccount): Promise<boolean> {
  if (!account.captchaCircuitOpenedAt) return false;
  const cooledAt = account.captchaCircuitOpenedAt.getTime() + CAPTCHA_COOL_HOURS * 60 * 60 * 1000;
  if (Date.now() < cooledAt) return true;
  // Cool-down expired — reset state so we don't immediately re-trip.
  const db = await getDb();
  if (db) {
    await db.update(clientRedditAccounts)
      .set({ captchaHitsLastHour: 0, captchaCircuitOpenedAt: null })
      .where(eq(clientRedditAccounts.id, account.id));
  }
  return false;
}

async function recordCaptchaHit(accountId: number, currentHits: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Use SQL-level increment to avoid lost-update races between concurrent tasks.
  await db.update(clientRedditAccounts)
    .set({ captchaHitsLastHour: sql`${clientRedditAccounts.captchaHitsLastHour} + 1` })
    .where(eq(clientRedditAccounts.id, accountId));

  const projectedNewHits = currentHits + 1;
  if (projectedNewHits >= CAPTCHA_HOURLY_LIMIT) {
    await db.update(clientRedditAccounts)
      .set({ captchaCircuitOpenedAt: new Date() })
      .where(eq(clientRedditAccounts.id, accountId));
    console.warn(`[accountPoster] Account #${accountId} hit ${projectedNewHits} captchas → circuit OPEN for ${CAPTCHA_COOL_HOURS}h`);
  }
}

// ── Per-task handlers ────────────────────────────────────────────────────

async function handleSubscribe(page: Page, task: RedditAccountTask): Promise<TaskResult> {
  const sub = task.targetSubreddit || pickNeutralWarmupSubreddit(`${task.id}`);
  await page.goto(`https://www.reddit.com/r/${sub}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000 + Math.random() * 3000);

  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const b of buttons) {
      const t = (b.textContent || '').trim().toLowerCase();
      if (t === 'join' || t === 'subscribe') {
        (b as HTMLElement).click();
        return true;
      }
    }
    return false;
  });

  return { success: clicked, resultMessage: clicked ? `joined r/${sub}` : `join button not found in r/${sub}` };
}

async function handleLurk(page: Page, task: RedditAccountTask): Promise<TaskResult> {
  const sub = task.targetSubreddit || pickNeutralWarmupSubreddit(`${task.id}`);
  await page.goto(`https://www.reddit.com/r/${sub}/hot/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000 + Math.random() * 3000);

  // Scroll a few times, dwell on the page
  for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) {
    await page.evaluate(() => window.scrollBy(0, 600 + Math.random() * 400));
    await page.waitForTimeout(2500 + Math.random() * 4000);
  }

  return { success: true, resultMessage: `lurked in r/${sub}` };
}

async function handleUpvote(page: Page, task: RedditAccountTask): Promise<TaskResult> {
  const sub = task.targetSubreddit || pickNeutralWarmupSubreddit(`${task.id}`);
  await page.goto(`https://www.reddit.com/r/${sub}/hot/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000 + Math.random() * 2000);

  const upvoted = await page.evaluate(() => {
    // New Reddit upvote selector: button[aria-label*="upvote" i] or shreddit-post buttons
    const candidates = Array.from(document.querySelectorAll(
      'button[aria-label*="upvote" i], shreddit-post button[upvote], shreddit-post-container button[aria-pressed]'
    ));
    if (candidates.length === 0) return false;
    // Pick a random one in the top half
    const target = candidates[Math.floor(Math.random() * Math.min(5, candidates.length))]!;
    (target as HTMLElement).click();
    return true;
  });

  return { success: upvoted, resultMessage: upvoted ? `upvoted in r/${sub}` : `no upvote target in r/${sub}` };
}

async function handleNeutralComment(
  page: Page,
  task: RedditAccountTask,
  account: ClientRedditAccount,
): Promise<TaskResult> {
  const sub = task.targetSubreddit || pickNeutralWarmupSubreddit(`${task.id}`);

  // Open a hot thread in the sub
  await page.goto(`https://www.reddit.com/r/${sub}/hot/.json`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const threadInfo = await page.evaluate(() => {
    try {
      const j = JSON.parse(document.body.innerText || '{}');
      const children = j?.data?.children || [];
      const text = children.find((c: any) => c.data?.is_self && !c.data?.locked && !c.data?.archived);
      if (!text) return null;
      return { permalink: text.data.permalink, title: text.data.title, selftext: text.data.selftext };
    } catch { return null; }
  });

  if (!threadInfo) return { success: false, resultMessage: `no eligible thread in r/${sub}` };

  // Generate a neutral comment using existing contentGenerator
  const commentText = await generateWarmupComment(
    {
      accountId: account.id,
      redditUsername: account.redditUsername,
      businessName: '',   // intentionally blank — never reveal in neutral comments
      industry: '',
    },
    { subreddit: sub, title: threadInfo.title, body: threadInfo.selftext },
  );

  // Navigate to the thread
  await page.goto(`https://www.reddit.com${threadInfo.permalink}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000 + Math.random() * 3000);

  // Find reply textarea, type, submit
  return await postComment(page, commentText, `comment in r/${sub}`);
}

async function handleNeutralTextPost(
  page: Page,
  task: RedditAccountTask,
  account: ClientRedditAccount,
): Promise<TaskResult> {
  const sub = task.targetSubreddit || 'CasualConversation';
  const post = await generateWarmupTextPost(
    {
      accountId: account.id,
      redditUsername: account.redditUsername,
      businessName: '',
      industry: '',
    },
    sub,
  );

  await page.goto(`https://www.reddit.com/r/${sub}/submit/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  return await submitTextPost(page, post.title, post.body, `textpost in r/${sub}`);
}

async function handlePromotionalComment(
  page: Page,
  task: RedditAccountTask,
  account: ClientRedditAccount,
): Promise<TaskResult> {
  if (!task.draftId) return { success: false, resultMessage: 'no draftId on promotional task' };
  const db = await getDb();
  if (!db) return { success: false, resultMessage: 'db unavailable' };

  const [draft] = await db.select().from(redditDrafts).where(eq(redditDrafts.id, task.draftId)).limit(1);
  if (!draft) return { success: false, resultMessage: `draft #${task.draftId} not found` };

  // Navigate to the thread (target URL must be the thread permalink)
  const threadUrl = task.targetThreadId
    ? `https://www.reddit.com/comments/${task.targetThreadId}`
    : null;
  if (!threadUrl) return { success: false, resultMessage: 'no targetThreadId' };

  await page.goto(threadUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000 + Math.random() * 3000);

  return await postComment(page, draft.draftText, `promotional comment from draft #${draft.id}`);
}

// ── Shared comment + textpost submitters ─────────────────────────────────

async function postComment(page: Page, text: string, label: string): Promise<TaskResult> {
  // Find the reply box. Reddit's new UI uses contenteditable.
  const replySelectors = [
    'shreddit-composer [contenteditable="true"]',
    '[data-testid="comment-submission-form-richtext"]',
    '[contenteditable="true"][role="textbox"]',
    'textarea[name="text"]',
  ];

  let replyEl = null;
  for (const sel of replySelectors) {
    try {
      replyEl = await page.waitForSelector(sel, { timeout: 8000, state: 'visible' });
      if (replyEl) break;
    } catch { /* next */ }
  }
  if (!replyEl) return { success: false, resultMessage: `${label}: reply box not found` };

  await replyEl.click();
  await page.waitForTimeout(400);
  await page.keyboard.type(text, { delay: 30 + Math.floor(Math.random() * 50) });
  await page.waitForTimeout(1500);

  // Click Comment / Reply button
  const submitted = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const b of buttons) {
      const t = (b.textContent || '').trim().toLowerCase();
      if (t === 'comment' || t === 'reply' || t === 'post comment') {
        (b as HTMLElement).click();
        return true;
      }
    }
    return false;
  });

  if (!submitted) return { success: false, resultMessage: `${label}: submit button not found` };

  await page.waitForTimeout(5000);
  // Best-effort capture of comment URL
  const url = page.url();
  return { success: true, resultUrl: url, resultMessage: label };
}

async function submitTextPost(page: Page, title: string, body: string, label: string): Promise<TaskResult> {
  // Find title field
  const titleSelectors = [
    'textarea[name="title"]',
    'textarea[placeholder*="Title" i]',
    'input[name="title"]',
    'shreddit-composer textarea',
  ];
  let titleEl = null;
  for (const sel of titleSelectors) {
    try {
      titleEl = await page.waitForSelector(sel, { timeout: 6000, state: 'visible' });
      if (titleEl) break;
    } catch { /* next */ }
  }
  if (!titleEl) return { success: false, resultMessage: `${label}: title field not found` };

  await titleEl.click();
  await titleEl.type(title, { delay: 50 });
  await page.waitForTimeout(800);

  // Find body field
  const bodySelectors = [
    '[contenteditable="true"][role="textbox"]',
    'shreddit-composer [contenteditable="true"]',
    'textarea[name="text"]',
  ];
  let bodyEl = null;
  for (const sel of bodySelectors) {
    try {
      bodyEl = await page.$(sel);
      if (bodyEl && await bodyEl.isVisible()) break;
      bodyEl = null;
    } catch { /* next */ }
  }
  if (bodyEl) {
    await bodyEl.click();
    await page.waitForTimeout(300);
    await page.keyboard.type(body, { delay: 30 });
  }
  await page.waitForTimeout(1500);

  // Click Post
  const submitted = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const b of buttons) {
      const t = (b.textContent || '').trim().toLowerCase();
      if (t === 'post') {
        (b as HTMLElement).click();
        return true;
      }
    }
    return false;
  });

  if (!submitted) return { success: false, resultMessage: `${label}: post button not found` };
  await page.waitForTimeout(5000);

  return { success: true, resultUrl: page.url(), resultMessage: label };
}

// ── Main task executor ──────────────────────────────────────────────────

export async function executeTask(task: RedditAccountTask): Promise<TaskResult> {
  const db = await getDb();
  if (!db) return { success: false, resultMessage: 'db unavailable' };

  // Shadowban check is a no-Patchright path
  if (task.taskType === 'shadowban_check') {
    const [account] = await db.select().from(clientRedditAccounts)
      .where(eq(clientRedditAccounts.id, task.accountId)).limit(1);
    if (!account) return { success: false, resultMessage: 'account not found' };
    const sb = await checkAccount(account);
    return {
      success: true,
      resultMessage: sb.shadowbanned
        ? `SHADOWBANNED via ${sb.source}`
        : `clean (karma=${sb.karma}) via ${sb.source}`,
    };
  }

  const [account] = await db.select().from(clientRedditAccounts)
    .where(eq(clientRedditAccounts.id, task.accountId)).limit(1);
  if (!account) return { success: false, resultMessage: 'account not found' };

  // Circuit breaker check
  if (await isCircuitOpen(account)) {
    return { success: false, resultMessage: 'captcha_circuit_open_24h' };
  }

  if (account.status === 'shadowbanned' || account.status === 'flagged' || account.status === 'retired') {
    return { success: false, resultMessage: `account_status=${account.status}` };
  }

  // Load proxy + fingerprint
  const proxy = await getProxyForAccount(account.id);
  if (!proxy) return { success: false, resultMessage: 'no_proxy_assigned' };
  const proxyConn = getProxyConnection(proxy);
  const fingerprint = parseFingerprint(account.fingerprint);

  // Launch session
  const session = await launchAccountSession({
    accountId: account.id,
    fingerprint,
    proxyServer: proxyConn.server,
    proxyUsername: proxyConn.username,
    proxyPassword: proxyConn.password,
    encryptedSession: account.encryptedCookies || undefined,
    headless: true,
  });

  let result: TaskResult = { success: false };

  try {
    // Verify still logged in
    const loggedInUser = await checkLoginState(session.page);
    if (!loggedInUser || loggedInUser.toLowerCase() !== account.redditUsername.toLowerCase()) {
      // Re-login flow
      await session.page.goto('https://www.reddit.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await session.page.waitForTimeout(2000);
      try {
        await humanType(session.page, 'input[name="username"]', account.redditUsername);
        await humanType(session.page, 'input[name="password"]', decrypt(account.encryptedPassword));
        // Captcha?
        const captcha = await detectCaptcha(session.page);
        if (captcha) {
          await recordCaptchaHit(account.id, account.captchaHitsLastHour);
          await solveCaptchaOnPage(session.page);
          result.captchaHit = true;
        }
        await session.page.keyboard.press('Enter');
        await session.page.waitForTimeout(5000);
      } catch (e) {
        return { success: false, resultMessage: `relogin_failed: ${(e as Error).message.slice(0, 80)}` };
      }
    }

    // Apply localStorage if cached
    await applyStoredLocalStorage(session.page, account.encryptedCookies || undefined);

    // Dispatch by task type
    switch (task.taskType) {
      case 'warmup_subscribe':
        result = await handleSubscribe(session.page, task);
        break;
      case 'warmup_lurk':
        result = await handleLurk(session.page, task);
        break;
      case 'warmup_upvote':
      case 'dormant_maintenance':
        result = await handleUpvote(session.page, task);
        break;
      case 'warmup_comment_neutral':
        result = await handleNeutralComment(session.page, task, account);
        break;
      case 'warmup_textpost_neutral':
        result = await handleNeutralTextPost(session.page, task, account);
        break;
      case 'promotional_comment':
        result = await handlePromotionalComment(session.page, task, account);
        break;
      default:
        result = { success: false, resultMessage: `unhandled_task_type:${task.taskType}` };
    }

    // Save session cookies for next time
    if (result.success) {
      try {
        const cookies = await captureSession(session.context, session.page);
        await db.update(clientRedditAccounts)
          .set({ encryptedCookies: cookies, lastSessionAt: new Date() })
          .where(eq(clientRedditAccounts.id, account.id));
      } catch { /* best-effort */ }
    }
  } catch (err) {
    result = { success: false, resultMessage: `exception: ${(err as Error).message?.slice(0, 200)}` };
  } finally {
    await session.cleanup();
  }

  return result;
}

/**
 * Pull + execute one task. Updates DB row with result. Used by worker tick.
 *
 * On successful promotional posts, also updates the linked redditDrafts row
 * (status='posted', postedAt, postedByUserId) and the linked redditThreads
 * row (status='posted'). Without this, redditEngagementExecutor's batch
 * completion poller never sees the deliverable resolve. (Code review C5)
 */
export async function executeNextTask(): Promise<{ taskId: number | null; success: boolean; message?: string }> {
  const task = await claimNextTask();
  if (!task) return { taskId: null, success: false };

  const db = await getDb();
  const result = await executeTask(task);

  if (db) {
    // Determine final status. If failed but retries remain, send back to pending.
    const MAX_RETRIES = 3;
    const willRetry = !result.success && task.retryCount < MAX_RETRIES;
    const finalStatus = result.success
      ? 'success' as const
      : willRetry ? 'pending' as const : 'failed' as const;
    const nextScheduledAt = willRetry
      ? new Date(Date.now() + Math.pow(2, task.retryCount) * 30_000) // exponential backoff: 30s, 1m, 2m
      : task.scheduledAt;

    await db.update(redditAccountTasks)
      .set({
        status: finalStatus,
        executedAt: result.success ? new Date() : null,
        resultUrl: result.resultUrl || null,
        resultMessage: result.resultMessage || null,
        retryCount: result.success ? task.retryCount : task.retryCount + 1,
        scheduledAt: nextScheduledAt,
        workerId: null,
      })
      .where(eq(redditAccountTasks.id, task.id));

    // C5: cascade success to draft + thread for promotional tasks
    if (result.success && task.draftId && task.taskType === 'promotional_comment') {
      try {
        await db.update(redditDrafts)
          .set({
            status: 'posted',
            postedAt: new Date(),
            // postedByUserId left null — no synthetic system user yet
          })
          .where(eq(redditDrafts.id, task.draftId));

        if (task.targetThreadId) {
          await db.update(redditThreads)
            .set({ status: 'posted' })
            .where(eq(redditThreads.redditPostId, task.targetThreadId));
        }
      } catch (e) {
        console.warn('[accountPoster] Failed to cascade success to draft/thread:', (e as Error).message);
      }
    }
  }

  return { taskId: task.id, success: result.success, message: result.resultMessage };
}
