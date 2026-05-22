import { getDb } from '../server/db.js';
import { warmedRedditAccounts, redditAccountAuditLog } from '../drizzle/schema.js';
import { desc, gte } from 'drizzle-orm';
async function main() {
  const db = await getDb(); if (!db) return;
  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const recent = await db.select().from(warmedRedditAccounts).where(gte(warmedRedditAccounts.createdAt, fiveHoursAgo)).orderBy(desc(warmedRedditAccounts.createdAt));
  console.log('=== ACCOUNTS CREATED IN LAST 5 HOURS ===');
  for (const a of recent) {
    console.log(`#${a.id} status=${a.status} username=${a.redditUsername || '(none)'} fail=${a.failureReason} adspowerProfile=${a.adspowerProfileId} createdAt=${a.createdAt}`);
  }
  console.log('\n=== RECENT AUDIT LOG ===');
  const logs = await db.select().from(redditAccountAuditLog).where(gte(redditAccountAuditLog.createdAt, fiveHoursAgo)).orderBy(desc(redditAccountAuditLog.createdAt));
  for (const l of logs.slice(0, 15)) {
    console.log(`  ${l.createdAt} acct=${l.accountId} action=${l.action} actor=${l.actorVaId} note=${(l.notes||'').slice(0,120)}`);
  }
}
main().then(()=>process.exit(0)).catch(e => { console.error(e); process.exit(1); });
