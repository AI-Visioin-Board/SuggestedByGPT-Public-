import 'dotenv/config';
import { eq, and, inArray } from 'drizzle-orm';
import { getDb } from '../server/db';
import { clientRedditAccounts, redditVerificationQueue, redditProxyPool } from '../drizzle/schema';

(async () => {
  const db = await getDb();
  if (!db) throw new Error('no db');
  const existing = await db.select().from(clientRedditAccounts).where(eq(clientRedditAccounts.clientId, 4));
  console.log(`[cleanup] found ${existing.length} rows for clientId=4`);
  for (const row of existing) {
    console.log(`  - id=${row.id} username=${row.redditUsername} status=${row.status} email=${row.emailAlias} proxy=${row.proxyId}`);
  }
  if (existing.length === 0) { console.log('[cleanup] nothing to do'); process.exit(0); }
  // Release any assigned proxies back to 'available'
  const proxyIds = existing.map(r => r.proxyId).filter((p): p is number => p != null);
  if (proxyIds.length) {
    await db.update(redditProxyPool).set({ status: 'available', assignedAccountId: null, assignedAt: null }).where(inArray(redditProxyPool.id, proxyIds));
    console.log(`[cleanup] released ${proxyIds.length} proxies`);
  }
  // Clear any verification queue rows for those email aliases
  const aliases = existing.map(r => r.emailAlias?.toLowerCase()).filter((e): e is string => !!e);
  if (aliases.length) {
    for (const a of aliases) await db.delete(redditVerificationQueue).where(eq(redditVerificationQueue.emailAlias, a));
    console.log(`[cleanup] cleared verification queue for ${aliases.length} aliases`);
  }
  await db.delete(clientRedditAccounts).where(eq(clientRedditAccounts.clientId, 4));
  console.log('[cleanup] deleted clientReddit_accounts rows for clientId=4');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
