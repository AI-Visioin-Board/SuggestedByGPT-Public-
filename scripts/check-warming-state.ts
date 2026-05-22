import { getDb } from '../server/db.js';
import { warmedRedditAccounts, warmingSessionLog } from '../drizzle/schema.js';
import { desc, eq } from 'drizzle-orm';
async function main() {
  const db = await getDb();
  if (!db) { console.log('NO DB'); return; }
  const accounts = await db.select().from(warmedRedditAccounts).orderBy(desc(warmedRedditAccounts.id));
  console.log('=== ACCOUNTS ===');
  for (const a of accounts) {
    console.log(`#${a.id} ${a.redditUsername || '(no username)'} status=${a.status} day=${a.dayNumber}/${a.warmingTargetDays} fails=${a.consecutiveFailures} proxy=${a.proxyId} lastSession=${a.lastSessionAt} cookies=${a.encryptedCookies ? 'present' : 'NULL'} pwd=${a.encryptedPassword ? 'present' : 'NULL'}`);
  }
  console.log('\n=== SESSION LOG (account 4) ===');
  const sessions = await db.select().from(warmingSessionLog).where(eq(warmingSessionLog.accountId, 4)).orderBy(desc(warmingSessionLog.startedAt));
  for (const s of sessions) {
    console.log(`session#${s.sessionNumber} day=${s.dayNumber} outcome=${s.outcome} login=${s.loginSucceeded} started=${s.startedAt} completed=${s.completedAt}`);
    if (s.errorDetail) console.log(`  err: ${s.errorDetail.slice(0,400)}`);
    if (s.actionsAttempted) console.log(`  attempted: ${JSON.stringify(s.actionsAttempted)}`);
    if (s.actionsCompleted) console.log(`  completed: ${JSON.stringify(s.actionsCompleted)}`);
    if (s.screenshotPath) console.log(`  screenshot: ${s.screenshotPath}`);
  }
  console.log(`\nTotal sessions logged: ${sessions.length}`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
