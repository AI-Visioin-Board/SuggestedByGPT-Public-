/**
 * Pending TTL cleanup — runs periodically (every 5 min) to:
 *   - Find pending warmedRedditAccounts rows that have either:
 *       (a) expiresAt < NOW (TTL fired), or
 *       (b) heartbeatAt < NOW - 5min (frontend abandoned)
 *   - Flip them to status='cancelled' with reason
 *   - Release their reserved proxy back to 'available'
 *   - Audit log the cleanup
 *
 * NOTE: AdsPower-side profile cleanup happens client-side when the dashboard
 * detects orphaned profiles vs server-side state. This server-side cleanup
 * only handles DB state; AdsPower profiles in the VA's account will be
 * reconciled by the dashboard on its next page load.
 */

import { eq, and, lt, or } from 'drizzle-orm';
import { getDb } from '../db';
import { warmedRedditAccounts, redditAccountAuditLog } from '../../drizzle/schema';
import { releaseReservedProxy } from './proxyManager';

const TTL_CHECK_INTERVAL_MS = 5 * 60 * 1000;       // every 5 min
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;        // 5 min without heartbeat = abandoned

let started = false;

export async function runPendingTtlCleanup(): Promise<{ cleaned: number; errors: number }> {
  const db = await getDb();
  if (!db) return { cleaned: 0, errors: 0 };

  const now = new Date();
  const heartbeatCutoff = new Date(now.getTime() - HEARTBEAT_TIMEOUT_MS);

  // Find pending rows that should be terminated
  const stale = await db
    .select()
    .from(warmedRedditAccounts)
    .where(
      and(
        eq(warmedRedditAccounts.status, 'pending'),
        or(
          lt(warmedRedditAccounts.expiresAt, now),
          lt(warmedRedditAccounts.heartbeatAt, heartbeatCutoff),
        ) as any,
      ) as any,
    );

  if (stale.length === 0) return { cleaned: 0, errors: 0 };

  let cleaned = 0;
  let errors = 0;
  for (const row of stale) {
    try {
      const reason = row.expiresAt && row.expiresAt < now ? 'ttl_expired' : 'heartbeat_lost';
      if (row.proxyId) {
        await releaseReservedProxy(row.proxyId);
      }
      await db
        .update(warmedRedditAccounts)
        .set({
          status: 'cancelled',
          failureReason: reason,
          updatedAt: now,
        })
        .where(eq(warmedRedditAccounts.id, row.id));
      await db.insert(redditAccountAuditLog).values({
        accountId: row.id,
        vaId: null,
        action: 'cancel',
        detail: { source: 'ttl_cleanup', reason },
      });
      cleaned++;
    } catch (err) {
      console.error(`[ttl-cleanup] failed for account #${row.id}:`, (err as Error).message);
      errors++;
    }
  }
  if (cleaned > 0) {
    console.log(`[ttl-cleanup] terminated ${cleaned} stale pending row(s) (${errors} errors)`);
  }
  return { cleaned, errors };
}

export function startPendingTtlCleanupInterval(): void {
  if (started) return;
  started = true;
  setTimeout(() => {
    runPendingTtlCleanup().catch(e => console.error('[ttl-cleanup] initial run error:', e));
  }, 30_000);
  setInterval(() => {
    runPendingTtlCleanup().catch(e => console.error('[ttl-cleanup] tick error:', e));
  }, TTL_CHECK_INTERVAL_MS);
  console.log('[ttl-cleanup] interval started (every 5 min)');
}
