import { getDb } from '../server/db';
import { sql } from 'drizzle-orm';
(async () => {
  const db = await getDb();
  if (!db) { console.log('no db'); return; }
  // First — list all columns to see what cookie-related fields actually exist
  const cols: any = await db.execute(sql`SHOW COLUMNS FROM warmed_reddit_accounts`);
  const colList = Array.isArray(cols[0]) ? cols[0] : cols;
  console.log('\n=== ALL COLUMNS in warmed_reddit_accounts ===');
  for (const c of colList) {
    console.log(' ', c.Field, '·', c.Type);
  }
  // Now select the rows with safe column names
  const rows: any = await db.execute(sql`
    SELECT id, redditUsername, status, dayNumber, warmedAt, createdAt,
           encryptedCookies IS NOT NULL AS has_cookies,
           OCTET_LENGTH(encryptedCookies) AS cookies_len
    FROM warmed_reddit_accounts ORDER BY id ASC
  `);
  const list = Array.isArray(rows[0]) ? rows[0] : rows;
  console.log('\n=== ACCOUNT-BY-ACCOUNT COOKIE STATUS ===');
  for (const r of list) console.log(' ', JSON.stringify(r));
  process.exit(0);
})();
