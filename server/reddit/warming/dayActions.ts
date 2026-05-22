/**
 * Day-N action library for the Reddit warming worker.
 *
 * Maps `dayNumber` to a concrete sequence of human-paced actions to perform
 * inside a logged-in Reddit session. Goal: each session should look like a
 * normal user opening Reddit for a few minutes — NOT like a script repeatedly
 * doing the exact same thing on the same subs.
 *
 * Design constraints:
 *   - Conservative ramp: zero engagement in early days (just browse), gradual
 *     introduction of upvotes / comments / posts.
 *   - Randomized per-call: pick from a curated pool of safe subs, randomize
 *     scroll depths, dwell times, action counts (within limits).
 *   - Idempotent against state we don't control: never retry an action that
 *     might double-fire (e.g., upvoting the same post twice flips it back).
 *   - Time budget per session: ~5-12 min on average. Real users aren't on
 *     Reddit for 30s and gone.
 *
 * Status (2026-04-30): first batch validated end-to-end on account #4
 * (warmingTargetDays=2 reached `warmed`, day 1 password login + day 2 cookie
 * login both successful). The lurk-only env gate has been removed — real
 * accounts now run the full day-N ramp. Default `warmingTargetDays` bumped
 * from 2 → 30.
 *
 * Comments are NO LONGER pulled from a hardcoded phrase pool — they're
 * generated per-thread by `commentGenerator.ts` with the avoid-ai-writing
 * system prompt baked in. See that file for the rule list.
 */

import type { Page } from 'patchright';
import { generateRedditComment } from './commentGenerator';

export interface DayActions {
  description: string;
  /** Suggested time to spend in this session (ms). Real implementation jitters around this. */
  budgetMs: number;
  attempted: { browse: number; upvote: number; subscribe: number; comment: number; post: number };
  /** Subreddits this day's session is allowed to engage in (lurk anywhere). */
  allowedSubs: string[];
}

// Curated pool of "safe" subs — high-volume, lenient on new accounts, English,
// permissive about low-karma comments. Avoid: politically-charged subs, niche
// subs with strict mod rules, subs that auto-remove low-karma posters.
const SAFE_SUBS = [
  'CasualConversation',
  'decidingtobebetter',
  'socialskills',
  'mildlyinteresting',
  'todayilearned',
  'Showerthoughts',
  'AskReddit',
  'NoStupidQuestions',
  'self',
  'pics',
];

// Fully randomized but seedable for repro
function rand(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickN<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]!);
  }
  return out;
}

/**
 * Deterministic action plan for a given dayNumber.
 *
 * Days 1-2: lurk only. NO upvote, NO comment. (Account-establishment phase.)
 * Days 3-5: + 2-4 upvotes per session.
 * Days 6-10: + saving 1-2 posts (hidden from feed; passive engagement).
 * Days 11-20: + 1 short LLM-generated comment per session in a permissive sub.
 * Days 21-29: + 2-3 comments, mix of subs.
 * Day 30+: + 1 self-text post in a low-stakes sub.
 *
 * The lurk-only env gate (WARMING_LURK_ONLY) was removed once the first batch
 * (account #4) validated. All accounts now run the real ramp.
 */
export function getActionsForDay(dayNumber: number): DayActions {
  if (dayNumber <= 2) {
    return {
      description: 'Lurk only',
      budgetMs: rand(4 * 60_000, 8 * 60_000),
      attempted: { browse: rand(3, 5), upvote: 0, subscribe: 0, comment: 0, post: 0 },
      allowedSubs: pickN(SAFE_SUBS, 3),
    };
  }
  if (dayNumber <= 5) {
    return {
      description: 'Lurk + a few upvotes',
      budgetMs: rand(5 * 60_000, 10 * 60_000),
      attempted: { browse: rand(4, 6), upvote: rand(2, 4), subscribe: 0, comment: 0, post: 0 },
      allowedSubs: pickN(SAFE_SUBS, 4),
    };
  }
  if (dayNumber <= 10) {
    return {
      description: 'Lurk + upvotes + save 1-2 posts',
      budgetMs: rand(6 * 60_000, 11 * 60_000),
      attempted: { browse: rand(5, 7), upvote: rand(3, 5), subscribe: rand(0, 1), comment: 0, post: 0 },
      allowedSubs: pickN(SAFE_SUBS, 5),
    };
  }
  if (dayNumber <= 20) {
    return {
      description: 'Engagement: 1 short comment in a permissive sub',
      budgetMs: rand(7 * 60_000, 12 * 60_000),
      attempted: { browse: rand(5, 8), upvote: rand(3, 6), subscribe: 0, comment: 1, post: 0 },
      allowedSubs: pickN(SAFE_SUBS, 5),
    };
  }
  return {
    description: 'Light comment activity, mix of subs',
    budgetMs: rand(8 * 60_000, 13 * 60_000),
    attempted: { browse: rand(6, 9), upvote: rand(4, 7), subscribe: 0, comment: rand(2, 3), post: 0 },
    allowedSubs: pickN(SAFE_SUBS, 6),
  };
}

// ─── Action implementations (used by runWarmingSession) ──────────────────

export async function browseThread(page: Page, sub: string): Promise<boolean> {
  try {
    await page.goto(`https://www.reddit.com/r/${sub}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await dwell(page, rand(15_000, 35_000));
    // Scroll a few times — random distance, jittered timing
    const scrolls = rand(3, 6);
    for (let i = 0; i < scrolls; i++) {
      const distance = rand(400, 1200);
      await page.mouse.wheel(0, distance);
      await dwell(page, rand(800, 2500));
    }
    // Pick a thread and click into it
    const threads = await page.locator('a[data-testid="post-title"], article a[href*="/comments/"]').all();
    if (threads.length === 0) return false;
    const thread = threads[Math.floor(Math.random() * Math.min(threads.length, 6))]!;
    await thread.click({ timeout: 5000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    await dwell(page, rand(20_000, 60_000));
    // Scroll within the thread
    for (let i = 0; i < rand(2, 4); i++) {
      await page.mouse.wheel(0, rand(300, 900));
      await dwell(page, rand(1200, 3500));
    }
    return true;
  } catch {
    return false;
  }
}

export async function dwell(page: Page, ms: number): Promise<void> {
  await page.waitForTimeout(ms);
}

/**
 * Upvote ONE post on the current page. Idempotent guard: skip if already
 * upvoted (Reddit shows the upvote button as "active" via aria-pressed).
 * Returns true if a fresh upvote was registered, false if skipped/failed.
 */
export async function upvoteOnePost(page: Page): Promise<boolean> {
  try {
    // Reddit's new UI uses faceplate-tracker upvote-button; older uses different.
    const btn = page.locator(
      [
        'button[aria-label="upvote"]',
        'button[data-test-id="post-vote-up"]',
        'shreddit-post button:has(svg[icon-name="upvote-outline"])',
      ].join(','),
    ).first();
    if (!(await btn.isVisible({ timeout: 3000 }).catch(() => false))) return false;
    const pressed = await btn.getAttribute('aria-pressed').catch(() => null);
    if (pressed === 'true') return false; // already upvoted, don't toggle off
    await btn.click({ timeout: 5000 });
    await dwell(page, rand(800, 1800));
    return true;
  } catch {
    return false;
  }
}

/**
 * Save (bookmark) ONE post on the current page. Same idempotent guard.
 * Saving is a low-risk passive engagement signal Reddit values.
 */
export async function saveOnePost(page: Page): Promise<boolean> {
  try {
    const btn = page.locator('button[aria-label="save" i], button:has-text("Save")').first();
    if (!(await btn.isVisible({ timeout: 3000 }).catch(() => false))) return false;
    const txt = await btn.textContent().catch(() => '');
    if (txt && /unsave/i.test(txt)) return false;
    await btn.click({ timeout: 5000 });
    await dwell(page, rand(600, 1500));
    return true;
  } catch {
    return false;
  }
}

/**
 * Post a short comment on the current thread.
 *
 * Comment text is generated per-thread by `generateRedditComment`, which reads
 * the thread title + top comments and produces a context-aware reply with
 * anti-AI-writing rules baked in (no em dashes, no Tier-1 vocabulary, casual
 * lowercase, 6-25 words). If generation fails (no API key, context unreadable,
 * banned vocab in output) we SKIP the comment rather than fall back to canned
 * text — canned text is exactly the pattern Reddit's anti-bot fingerprints.
 *
 * `customText` override is for testing only; production calls should pass
 * undefined and let the generator handle it.
 */
export async function commentOnThread(page: Page, customText?: string): Promise<boolean> {
  try {
    const text = customText ?? (await generateRedditComment(page));
    if (!text) {
      // Generator declined to produce a comment — likely missing context or
      // post-filter rejection. Skip rather than emit a fallback.
      return false;
    }
    // Try to find the comment textarea — Reddit's new UI uses a faceplate-textarea
    const composer = page.locator(
      'shreddit-composer textarea, textarea[placeholder*="comment" i], faceplate-textarea-input textarea',
    ).first();
    if (!(await composer.isVisible({ timeout: 5000 }).catch(() => false))) return false;
    await composer.click();
    await dwell(page, rand(400, 1200));
    // Type with human-like cadence
    for (const ch of text) {
      await composer.type(ch);
      await dwell(page, rand(40, 110));
    }
    await dwell(page, rand(800, 2000));
    // Submit button — usually labeled "Comment" or has type=submit
    const submit = page.locator('button:has-text("Comment"), button[type="submit"]').filter({ hasText: /comment/i }).first();
    if (!(await submit.isVisible({ timeout: 3000 }).catch(() => false))) return false;
    await submit.click({ timeout: 5000 });
    await dwell(page, rand(2000, 4000));
    return true;
  } catch {
    return false;
  }
}

/**
 * Subscribe to (join) the current subreddit. Idempotent guard via button text.
 */
export async function joinCurrentSub(page: Page): Promise<boolean> {
  try {
    const btn = page.locator('button:has-text("Join")').first();
    if (!(await btn.isVisible({ timeout: 3000 }).catch(() => false))) return false;
    await btn.click({ timeout: 5000 });
    await dwell(page, rand(1000, 2500));
    return true;
  } catch {
    return false;
  }
}
