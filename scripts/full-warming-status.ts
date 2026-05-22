import { getDb } from '../server/db.js';
import { warmedRedditAccounts, warmingSessionLog } from '../drizzle/schema.js';
import { desc, eq } from 'drizzle-orm';
async function main() {
  const db = await getDb(); if (!db) return;
  const accounts = await db.select().from(warmedRedditAccounts).orderBy(desc(warmedRedditAccounts.id));
  console.log('=== ALL ACCOUNTS ===');
  for (const a of accounts) {
    console.log(JSON.stringify({
      id: a.id, username: a.redditUsername, status: a.status,
      day: `${a.dayNumber}/${a.warmingTargetDays}`,
      fails: a.consecutiveFailures, proxy: a.proxyId,
      cookies: !!a.encryptedCookies,
      lastSession: a.lastSessionAt,
      warmedAt: a.warmedAt,
      failureReason: a.failureReason,
    }));
  }
  console.log('\n=== ACCOUNT #4 SESSIONS (chronological) ===');
  const sessions = await db.select().from(warmingSessionLog).where(eq(warmingSessionLog.accountId, 4)).orderBy(warmingSessionLog.startedAt);
  for (const s of sessions) {
    const dur = s.completedAt && s.startedAt
      ? Math.round((new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)
      : '?';
    console.log(`  #${s.sessionNumber} day=${s.dayNumber} ${s.outcome.padEnd(22)} login=${s.loginSucceeded ? 'Y' : 'N'} dur=${dur}s started=${s.startedAt}`);
    if (s.actionsAttempted) console.log(`     attempted: ${JSON.stringify(s.actionsAttempted)}`);
    if (s.actionsCompleted) console.log(`     completed: ${JSON.stringify(s.actionsCompleted)}`);
    if (s.errorDetail) console.log(`     err: ${s.errorDetail.slice(0,150)}`);
  }
}
main().then(()=>process.exit(0)).catch(e => { console.error(e); process.exit(1); });
