/**
 * runWarmingTick — top-of-cron orchestrator for Build #2 warming worker.
 *
 * Called by the existing cron worker (every N hours). Each tick:
 *   1. Query accounts due for a session
 *   2. For each, run runWarmingSession() in series (NOT parallel — proxy
 *      reputation, fingerprint stability, and small footprint matter more
 *      than throughput at our scale)
 *   3. Pace between sessions with random delay so all accounts don't fire
 *      at exactly the same minute
 *
 * Eligibility for a session in this tick:
 *   - status IN ('awaiting_verification', 'warming')
 *   - lastSessionAt IS NULL OR lastSessionAt < NOW - 18 HOUR
 *     (one session per ~day; 18h gives some slack so the cron can shift over
 *      time without waiting an extra day)
 *   - consecutiveFailures < 3 (auto-flagged as 'failed' otherwise inside
 *     runWarmingSession)
 *
 * Time-window: each account's fingerprint encodes a timezone (matches the
 * proxy IP geo). To look human, we only run sessions during 08-23 local time.
 * If we're outside that window for an account, skip until next tick.
 */

import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb } from '../../db';
import { warmedRedditAccounts } from '../../../drizzle/schema';
import { parseFingerprint } from '../fingerprintGenerator';
import { runWarmingSession } from './runWarmingSession';

const SESSION_INTERVAL_HOURS = 18;
const ALLOWED_HOURS_START = 8;
const ALLOWED_HOURS_END = 23;

export interface TickResult {
  considered: number;
  skipped_window: number;
  ran: number;
  outcomes: Record<string, number>;
  errors: number;
  durationMs: number;
}

export async function runWarmingTick(): Promise<TickResult> {
  const start = Date.now();
  const db = await getDb();
  if (!db) throw new Error('no db');

  // Pull all candidates
  const cutoff = new Date(Date.now() - SESSION_INTERVAL_HOURS * 60 * 60 * 1000);
  const candidates = await db
    .select()
    .from(warmedRedditAccounts)
    .where(
      and(
        or(
          eq(warmedRedditAccounts.status, 'awaiting_verification'),
          eq(warmedRedditAccounts.status, 'warming'),
        ),
        or(
          isNull(warmedRedditAccounts.lastSessionAt),
          lt(warmedRedditAccounts.lastSessionAt, cutoff),
        ),
        lt(warmedRedditAccounts.consecutiveFailures, 3),
      ),
    );

  const result: TickResult = {
    considered: candidates.length,
    skipped_window: 0,
    ran: 0,
    outcomes: {},
    errors: 0,
    durationMs: 0,
  };

  if (candidates.length === 0) {
    result.durationMs = Date.now() - start;
    console.log(`[warming-tick] nothing due; tick complete in ${result.durationMs}ms`);
    return result;
  }

  console.log(`[warming-tick] ${candidates.length} account(s) due for a session`);

  for (const account of candidates) {
    // Time-window check (human-paced — skip 11pm to 8am local for the account)
    if (!isWithinAllowedWindow(account.fingerprint)) {
      result.skipped_window++;
      console.log(`[warming-tick] skip account #${account.id} — outside local-tz window`);
      continue;
    }

    try {
      console.log(`[warming-tick] account #${account.id} (${account.redditUsername}) — running session...`);
      const sessionResult = await runWarmingSession(account.id);
      result.ran++;
      result.outcomes[sessionResult.outcome] = (result.outcomes[sessionResult.outcome] ?? 0) + 1;
      console.log(`[warming-tick] account #${account.id} → ${sessionResult.outcome}`);
    } catch (err) {
      result.errors++;
      console.error(`[warming-tick] account #${account.id} crashed:`, (err as Error).message);
    }

    // Pace: 30-90s between sessions so we don't fire all accounts simultaneously
    const pause = 30_000 + Math.floor(Math.random() * 60_000);
    await new Promise((r) => setTimeout(r, pause));
  }

  result.durationMs = Date.now() - start;
  console.log(`[warming-tick] done — ran=${result.ran} skipped=${result.skipped_window} errors=${result.errors} (${Math.round(result.durationMs / 1000)}s)`);
  return result;
}

function isWithinAllowedWindow(fingerprintJson: string): boolean {
  try {
    const fp = parseFingerprint(fingerprintJson);
    const tz = fp.timezoneId;
    const localHour = parseInt(
      new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }),
      10,
    );
    return localHour >= ALLOWED_HOURS_START && localHour < ALLOWED_HOURS_END;
  } catch {
    // If we can't parse, default to allowing — better to run than to skip indefinitely
    return true;
  }
}
