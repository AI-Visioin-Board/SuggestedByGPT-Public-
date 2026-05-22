import { getDb } from '../server/db.js';
import { warmedRedditAccounts } from '../drizzle/schema.js';
import { eq } from 'drizzle-orm';
async function main() {
  const db = await getDb(); if (!db) return;
  await db.update(warmedRedditAccounts).set({
    status: 'awaiting_verification',
    consecutiveFailures: 0,
    failureReason: null,
    lastSessionAt: null, // wipe so cron picks it up immediately
    updatedAt: new Date(),
  }).where(eq(warmedRedditAccounts.id, 4));
  const [a] = await db.select().from(warmedRedditAccounts).where(eq(warmedRedditAccounts.id, 4));
  console.log('reset done →', JSON.stringify({ id: a.id, status: a.status, fails: a.consecutiveFailures, lastSession: a.lastSessionAt }));
}
main().then(()=>process.exit(0));
