import { getDb } from '../server/db.js';
import { warmedRedditAccounts, warmingSessionLog } from '../drizzle/schema.js';
import { desc, eq } from 'drizzle-orm';
async function main() {
  const db = await getDb(); if (!db) return;
  const [a] = await db.select().from(warmedRedditAccounts).where(eq(warmedRedditAccounts.id, 4));
  console.log('=== ACCOUNT #4 ===');
  console.log(JSON.stringify({
    id: a.id, username: a.redditUsername, status: a.status,
    dayNumber: a.dayNumber, fails: a.consecutiveFailures, proxy: a.proxyId,
    lastSession: a.lastSessionAt, failureReason: a.failureReason,
    cookies: !!a.encryptedCookies, pwd: !!a.encryptedPassword
  }, null, 2));
  console.log('\n=== LATEST SESSION ===');
  const [s] = await db.select().from(warmingSessionLog).where(eq(warmingSessionLog.accountId, 4)).orderBy(desc(warmingSessionLog.startedAt)).limit(1);
  console.log(JSON.stringify({
    sessionNumber: s.sessionNumber, dayNumber: s.dayNumber, outcome: s.outcome,
    loginSucceeded: s.loginSucceeded, started: s.startedAt, completed: s.completedAt,
    err: s.errorDetail?.slice(0,200), screenshotPath: s.screenshotPath,
  }, null, 2));
}
main().then(() => process.exit(0));
