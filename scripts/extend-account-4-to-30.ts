/**
 * One-off: extend account #4 from warmingTargetDays=2 (already `warmed`)
 * back into the active warming pipeline at warmingTargetDays=30. Keeps the
 * cookies, proxy, and dayNumber=2 progress; flips status `warmed → warming`
 * and clears `warmedAt` so the cron picks it back up.
 */
import { getDb } from '../server/db.js';
import { warmedRedditAccounts } from '../drizzle/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb(); if (!db) { console.log('NO DB'); process.exit(1); }

  const [before] = await db.select().from(warmedRedditAccounts).where(eq(warmedRedditAccounts.id, 4));
  console.log('BEFORE:', JSON.stringify({
    id: before.id, status: before.status,
    day: `${before.dayNumber}/${before.warmingTargetDays}`,
    warmedAt: before.warmedAt, lastSession: before.lastSessionAt,
  }));

  await db.update(warmedRedditAccounts).set({
    status: 'warming',
    warmingTargetDays: 30,
    warmedAt: null,
    consecutiveFailures: 0,
    failureReason: null,
    updatedAt: new Date(),
  }).where(eq(warmedRedditAccounts.id, 4));

  const [after] = await db.select().from(warmedRedditAccounts).where(eq(warmedRedditAccounts.id, 4));
  console.log('AFTER: ', JSON.stringify({
    id: after.id, status: after.status,
    day: `${after.dayNumber}/${after.warmingTargetDays}`,
    warmedAt: after.warmedAt, lastSession: after.lastSessionAt,
    cookies: !!after.encryptedCookies, proxy: after.proxyId,
  }));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
