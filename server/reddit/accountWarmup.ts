/**
 * Reddit Account Warmup Schedule Generator
 *
 * After accountCreator finishes (status=warming_up, dayNumber=0), this
 * module generates the 30-day warm-up task schedule for the account:
 *
 *   Days 1-5:   lurk + upvote only (no comments). Subscribe to ~15-20 subs.
 *   Days 6-14:  2-4 comments/day in unrelated friendly subs. NO links.
 *   Days 15-29: 1-2 text posts/day (no links). Build to 100+ karma.
 *   Day 30:     transition gate — accountPoster checks karma, runs shadowban
 *               check; if healthy → status=ready, promotional phase activates.
 *
 * Tasks are inserted into redditAccountTasks with scheduledAt jittered
 * within the account's "active hours" (8am-11pm in proxy IP's timezone).
 * Worker (Phase D worker tick) pulls due tasks and executes via accountPoster.
 *
 * Day 0 has no tasks — Reddit flags accounts that act within minutes of
 * signup. First task is scheduled for Day 1, ~24h after creation.
 */

import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../db';
import {
  clientRedditAccounts,
  redditAccountTasks,
  type ClientRedditAccount,
  type InsertRedditAccountTask,
} from '../../drizzle/schema';
import { pickNeutralWarmupSubreddit } from './contentGenerator';

// ── Scheduling parameters ──

const ACTIVE_HOURS_START = 8;   // 8am local
const ACTIVE_HOURS_END = 23;    // 11pm local
const REST_DAYS = 1;            // skip first 24h after signup

interface DayProfile {
  upvotes: number;
  lurks: number;
  subscribes: number;
  neutralComments: number;
  neutralTextPosts: number;
}

const WARMUP_PROFILES: Record<number, DayProfile> = {
  // Day 1-5: pure lurk
  1: { upvotes: 5,  lurks: 4, subscribes: 5, neutralComments: 0, neutralTextPosts: 0 },
  2: { upvotes: 7,  lurks: 4, subscribes: 4, neutralComments: 0, neutralTextPosts: 0 },
  3: { upvotes: 8,  lurks: 5, subscribes: 4, neutralComments: 0, neutralTextPosts: 0 },
  4: { upvotes: 8,  lurks: 5, subscribes: 3, neutralComments: 0, neutralTextPosts: 0 },
  5: { upvotes: 10, lurks: 5, subscribes: 2, neutralComments: 0, neutralTextPosts: 0 },
  // Days 6-14: comments begin
  6:  { upvotes: 8,  lurks: 4, subscribes: 1, neutralComments: 2, neutralTextPosts: 0 },
  7:  { upvotes: 10, lurks: 4, subscribes: 1, neutralComments: 3, neutralTextPosts: 0 },
  8:  { upvotes: 8,  lurks: 3, subscribes: 1, neutralComments: 3, neutralTextPosts: 0 },
  9:  { upvotes: 8,  lurks: 4, subscribes: 0, neutralComments: 4, neutralTextPosts: 0 },
  10: { upvotes: 10, lurks: 3, subscribes: 0, neutralComments: 4, neutralTextPosts: 0 },
  11: { upvotes: 8,  lurks: 4, subscribes: 0, neutralComments: 3, neutralTextPosts: 0 },
  12: { upvotes: 8,  lurks: 3, subscribes: 0, neutralComments: 4, neutralTextPosts: 0 },
  13: { upvotes: 10, lurks: 3, subscribes: 0, neutralComments: 4, neutralTextPosts: 0 },
  14: { upvotes: 8,  lurks: 3, subscribes: 0, neutralComments: 3, neutralTextPosts: 0 },
  // Days 15-29: text posts begin
  15: { upvotes: 8,  lurks: 2, subscribes: 0, neutralComments: 3, neutralTextPosts: 1 },
  16: { upvotes: 10, lurks: 2, subscribes: 0, neutralComments: 3, neutralTextPosts: 1 },
  17: { upvotes: 8,  lurks: 2, subscribes: 0, neutralComments: 4, neutralTextPosts: 1 },
  18: { upvotes: 8,  lurks: 2, subscribes: 0, neutralComments: 3, neutralTextPosts: 2 },
  19: { upvotes: 10, lurks: 2, subscribes: 0, neutralComments: 4, neutralTextPosts: 1 },
  20: { upvotes: 8,  lurks: 2, subscribes: 0, neutralComments: 3, neutralTextPosts: 1 },
  21: { upvotes: 8,  lurks: 2, subscribes: 0, neutralComments: 4, neutralTextPosts: 2 },
  22: { upvotes: 10, lurks: 2, subscribes: 0, neutralComments: 3, neutralTextPosts: 1 },
  23: { upvotes: 8,  lurks: 2, subscribes: 0, neutralComments: 4, neutralTextPosts: 1 },
  24: { upvotes: 8,  lurks: 2, subscribes: 0, neutralComments: 3, neutralTextPosts: 2 },
  25: { upvotes: 10, lurks: 1, subscribes: 0, neutralComments: 4, neutralTextPosts: 1 },
  26: { upvotes: 8,  lurks: 2, subscribes: 0, neutralComments: 3, neutralTextPosts: 1 },
  27: { upvotes: 8,  lurks: 2, subscribes: 0, neutralComments: 4, neutralTextPosts: 2 },
  28: { upvotes: 10, lurks: 1, subscribes: 0, neutralComments: 3, neutralTextPosts: 1 },
  29: { upvotes: 8,  lurks: 2, subscribes: 0, neutralComments: 3, neutralTextPosts: 1 },
  // Day 30: transition check (no warmup tasks; gate runs)
};

// ── Active hours in account's timezone ──

/**
 * Pick a random scheduled time on the given day, within the IP's active
 * hours (8am-11pm local). Returns a UTC Date for DB storage.
 */
function pickActiveHourTime(targetDayUtc: Date, timezone: string): Date {
  // Get the start-of-day in the proxy's local timezone, then offset
  // randomly into the active window.
  const hour = ACTIVE_HOURS_START + Math.floor(Math.random() * (ACTIVE_HOURS_END - ACTIVE_HOURS_START));
  const minute = Math.floor(Math.random() * 60);
  const second = Math.floor(Math.random() * 60);

  // Build "YYYY-MM-DDTHH:MM:SS" in the local TZ, then convert to UTC.
  // Quick approximation: get the offset by formatting through Intl.
  const dateStr = targetDayUtc.toISOString().slice(0, 10); // "2026-04-25"
  const localStr = `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;

  // Use Intl to compute the offset for `timezone` on that date
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(targetDayUtc);
    const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+0';
    const m = offsetPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
    let offsetMinutes = 0;
    if (m) {
      const sign = m[1] === '-' ? -1 : 1;
      offsetMinutes = sign * (parseInt(m[2]!, 10) * 60 + parseInt(m[3] || '0', 10));
    }
    // localStr represents wall time in `timezone`. UTC = wall - offset.
    const wallTimeAsUtc = new Date(localStr + 'Z').getTime(); // pretend it's UTC
    return new Date(wallTimeAsUtc - offsetMinutes * 60 * 1000);
  } catch {
    // Fallback: treat localStr as UTC
    return new Date(localStr + 'Z');
  }
}

// ── Main entry: build the full 30-day schedule for an account ──

/**
 * Generate all warmup tasks for the account from Day 1 through Day 29.
 * Inserts directly into redditAccountTasks.
 *
 * Day 30 is intentionally not scheduled here — the worker's daily tick
 * detects accounts at dayNumber=29 with all tasks done and runs the
 * Day 30 transition (karma check + shadowban check + status flip).
 */
export async function scheduleWarmupForAccount(account: ClientRedditAccount): Promise<{ tasksInserted: number }> {
  const db = await getDb();
  if (!db) throw new Error('DB not available');

  if (account.status !== 'warming_up') {
    throw new Error(`Account #${account.id} status is ${account.status}, expected warming_up`);
  }

  const timezone = account.proxyTimezone || 'America/Chicago';
  const startDate = account.createdAt || new Date();

  const tasks: InsertRedditAccountTask[] = [];

  for (let day = 1; day <= 29; day++) {
    const profile = WARMUP_PROFILES[day];
    if (!profile) continue;

    const dayUtc = new Date(startDate.getTime() + day * 24 * 60 * 60 * 1000);

    // Subscribe tasks
    for (let i = 0; i < profile.subscribes; i++) {
      tasks.push({
        accountId: account.id,
        taskType: 'warmup_subscribe',
        scheduledAt: pickActiveHourTime(dayUtc, timezone),
        status: 'pending',
        dayNumber: day,
        targetSubreddit: pickNeutralWarmupSubreddit(`${account.id}:d${day}:s${i}`),
      });
    }

    // Lurk tasks
    for (let i = 0; i < profile.lurks; i++) {
      tasks.push({
        accountId: account.id,
        taskType: 'warmup_lurk',
        scheduledAt: pickActiveHourTime(dayUtc, timezone),
        status: 'pending',
        dayNumber: day,
        targetSubreddit: pickNeutralWarmupSubreddit(`${account.id}:d${day}:l${i}`),
      });
    }

    // Upvote tasks (executed on a hot thread in a subscribed sub)
    for (let i = 0; i < profile.upvotes; i++) {
      tasks.push({
        accountId: account.id,
        taskType: 'warmup_upvote',
        scheduledAt: pickActiveHourTime(dayUtc, timezone),
        status: 'pending',
        dayNumber: day,
      });
    }

    // Neutral comments (Days 6+)
    for (let i = 0; i < profile.neutralComments; i++) {
      tasks.push({
        accountId: account.id,
        taskType: 'warmup_comment_neutral',
        scheduledAt: pickActiveHourTime(dayUtc, timezone),
        status: 'pending',
        dayNumber: day,
        targetSubreddit: pickNeutralWarmupSubreddit(`${account.id}:d${day}:c${i}`),
      });
    }

    // Neutral text posts (Days 15+)
    for (let i = 0; i < profile.neutralTextPosts; i++) {
      tasks.push({
        accountId: account.id,
        taskType: 'warmup_textpost_neutral',
        scheduledAt: pickActiveHourTime(dayUtc, timezone),
        status: 'pending',
        dayNumber: day,
        targetSubreddit: pickNeutralWarmupSubreddit(`${account.id}:d${day}:t${i}`),
      });
    }
  }

  // Daily shadowban check (every 5 days during warmup)
  for (let day = 5; day <= 30; day += 5) {
    const dayUtc = new Date(startDate.getTime() + day * 24 * 60 * 60 * 1000);
    tasks.push({
      accountId: account.id,
      taskType: 'shadowban_check',
      scheduledAt: pickActiveHourTime(dayUtc, timezone),
      status: 'pending',
      dayNumber: day,
    });
  }

  // Bulk insert
  if (tasks.length === 0) return { tasksInserted: 0 };

  // Drizzle bulk insert (mysql)
  await db.insert(redditAccountTasks).values(tasks);

  console.log(`[accountWarmup] Scheduled ${tasks.length} warmup tasks for account #${account.id} u/${account.redditUsername}`);
  return { tasksInserted: tasks.length };
}

/**
 * Day 30 transition: check karma, run shadowban verification, flip
 * account status. Called from worker tick when dayNumber reaches 30.
 */
export async function evaluateDay30Transition(accountId: number, currentKarma: number, isShadowbanned: boolean): Promise<{
  outcome: 'ready' | 'extended_warmup' | 'shadowbanned';
}> {
  const db = await getDb();
  if (!db) throw new Error('DB not available');

  if (isShadowbanned) {
    await db.update(clientRedditAccounts)
      .set({ status: 'shadowbanned', shadowbanned: true })
      .where(eq(clientRedditAccounts.id, accountId));
    console.log(`[accountWarmup] Account #${accountId} shadowbanned at Day 30`);
    return { outcome: 'shadowbanned' };
  }

  if (currentKarma < 100) {
    // Extend warm-up by 14 days
    console.log(`[accountWarmup] Account #${accountId} karma=${currentKarma}, extending warm-up`);
    return { outcome: 'extended_warmup' };
  }

  await db.update(clientRedditAccounts)
    .set({ status: 'ready' })
    .where(eq(clientRedditAccounts.id, accountId));
  console.log(`[accountWarmup] Account #${accountId} graduated → ready (karma=${currentKarma})`);
  return { outcome: 'ready' };
}
