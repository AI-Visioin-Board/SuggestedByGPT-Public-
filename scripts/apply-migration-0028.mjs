#!/usr/bin/env node
/**
 * One-shot migration runner for 0028_blog_content.
 *
 * Follows the same pattern as scripts/apply-migration-0027.mjs:
 *   drizzle-kit's _journal.json only tracks up to 0014, but migrations
 *   0015-0028 were applied manually (raw SQL). Running `drizzle-kit migrate`
 *   would try to re-apply 0015-0027 and conflict.
 *
 * This migration adds:
 *   - client_content_config table
 *   - client_blog_post table
 *   - client_content_topic table
 *   - client_citation_check table
 *   - oauth_token table
 *   - blog_posts.clientShowcaseId column (ALTER, ADD COLUMN IF NOT EXISTS)
 *
 * Idempotent — the SQL uses `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF
 * NOT EXISTS`, but we also do a JS-level pre-check so we can log clearly.
 *
 * Usage: railway run --service suggestedbygpt node scripts/apply-migration-0028.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mysql from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '..', 'drizzle', '0028_blog_content.sql');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required (run via `railway run` or set env)');
  process.exit(1);
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);
console.log('[migration 0028] Connected to DB');

// ─── Pre-flight: capture state of existing tables we will NOT modify ───
// This is the "do no harm" gate. We snapshot counts before and after.
const beforeCounts = {};
const monitoredTables = ['clients', 'orders', 'deliverables', 'client_credentials', 'guest_posts', 'blog_posts'];
for (const tbl of monitoredTables) {
  const [r] = await conn.execute(`SELECT COUNT(*) AS n FROM ${tbl}`).catch(() => [[{ n: 'table_missing' }]]);
  beforeCounts[tbl] = r[0].n;
}
console.log('[migration 0028] BEFORE — row counts of existing tables:', beforeCounts);

// ─── Idempotency check: are the new tables already present? ───
const [existingTables] = await conn.execute(`
  SELECT TABLE_NAME FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME IN ('client_content_config','client_blog_post','client_content_topic','client_citation_check','oauth_token')
`);
const alreadyApplied = new Set(existingTables.map(r => r.TABLE_NAME));
console.log(`[migration 0028] Pre-flight: ${alreadyApplied.size}/5 new tables already exist:`, [...alreadyApplied]);

// ─── Check blog_posts.clientShowcaseId column ───
const [showcaseCol] = await conn.execute(`
  SELECT COLUMN_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'blog_posts'
    AND COLUMN_NAME = 'clientShowcaseId'
`);
const showcaseColExists = showcaseCol.length > 0;
console.log(`[migration 0028] Pre-flight: blog_posts.clientShowcaseId exists = ${showcaseColExists}`);

if (alreadyApplied.size === 5 && showcaseColExists) {
  console.log('[migration 0028] All schema changes already present — nothing to do.');
  await conn.end();
  process.exit(0);
}

// ─── Apply the migration ───
const rawSql = readFileSync(sqlPath, 'utf8');
const stripped = rawSql
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n');
const allStatements = stripped
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

// Partition: CREATE TABLE / CREATE INDEX for new tables are idempotent (CREATE
// TABLE IF NOT EXISTS). The ALTER TABLE blog_posts and its index are NOT
// idempotent (MySQL 8 doesn't support IF NOT EXISTS on ALTER). We pre-check.
const blogPostsAlterStatements = allStatements.filter(s =>
  /ALTER\s+TABLE\s+`?blog_posts`?\s+ADD\s+COLUMN|CREATE\s+INDEX\s+`?idx_blog_posts_showcase`?/i.test(s)
);
const otherStatements = allStatements.filter(s => !blogPostsAlterStatements.includes(s));

console.log(`[migration 0028] Applying ${otherStatements.length} idempotent statement(s) + ${blogPostsAlterStatements.length} pre-checked statement(s)...`);
let applied = 0, skipped = 0;

// Apply idempotent (CREATE TABLE / CREATE INDEX) statements first
for (const stmt of otherStatements) {
  const preview = stmt.slice(0, 100).replace(/\s+/g, ' ');
  try {
    await conn.query(stmt);
    console.log(`  ✓ ${preview}${stmt.length > 100 ? '...' : ''}`);
    applied++;
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('already exists') || msg.includes('Duplicate key name')) {
      console.log(`  ⊘ skipped (already applied): ${preview}${stmt.length > 100 ? '...' : ''}`);
      skipped++;
    } else {
      console.error(`  ✗ FAILED: ${preview}`);
      console.error(`    ${msg}`);
      await conn.end();
      process.exit(2);
    }
  }
}

// Apply blog_posts ALTER + index only if column doesn't exist yet
if (!showcaseColExists) {
  for (const stmt of blogPostsAlterStatements) {
    const preview = stmt.slice(0, 100).replace(/\s+/g, ' ');
    try {
      await conn.query(stmt);
      console.log(`  ✓ ${preview}${stmt.length > 100 ? '...' : ''}`);
      applied++;
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('Duplicate column name') || msg.includes('Duplicate key name')) {
        console.log(`  ⊘ skipped (already applied): ${preview}${stmt.length > 100 ? '...' : ''}`);
        skipped++;
      } else {
        console.error(`  ✗ FAILED: ${preview}`);
        console.error(`    ${msg}`);
        await conn.end();
        process.exit(2);
      }
    }
  }
} else {
  console.log('  ⊘ blog_posts.clientShowcaseId already exists — skipping ALTER + INDEX.');
  skipped += blogPostsAlterStatements.length;
}
console.log(`[migration 0028] Statements applied=${applied} skipped=${skipped}`);

// ─── Post-flight: verify all 5 tables + the column now exist ───
const [verifyTables] = await conn.execute(`
  SELECT TABLE_NAME FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME IN ('client_content_config','client_blog_post','client_content_topic','client_citation_check','oauth_token')
`);
const verified = new Set(verifyTables.map(r => r.TABLE_NAME));
if (verified.size !== 5) {
  console.error(`[migration 0028] FAILED — expected 5 new tables, found ${verified.size}:`, [...verified]);
  await conn.end();
  process.exit(3);
}
console.log('[migration 0028] All 5 new tables present.');

const [verifyCol] = await conn.execute(`
  SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'blog_posts'
    AND COLUMN_NAME = 'clientShowcaseId'
`);
if (verifyCol.length === 0) {
  console.error('[migration 0028] FAILED — blog_posts.clientShowcaseId not present.');
  await conn.end();
  process.exit(3);
}
console.log('[migration 0028] blog_posts.clientShowcaseId present:', verifyCol[0]);

// ─── Damage check: row counts of existing tables UNCHANGED ───
const afterCounts = {};
for (const tbl of monitoredTables) {
  const [r] = await conn.execute(`SELECT COUNT(*) AS n FROM ${tbl}`).catch(() => [[{ n: 'table_missing' }]]);
  afterCounts[tbl] = r[0].n;
}
console.log('[migration 0028] AFTER — row counts of existing tables:', afterCounts);

let dataChanged = false;
for (const tbl of monitoredTables) {
  if (String(beforeCounts[tbl]) !== String(afterCounts[tbl])) {
    console.error(`[migration 0028] ❌ DATA CHANGED in ${tbl}: ${beforeCounts[tbl]} → ${afterCounts[tbl]}`);
    dataChanged = true;
  }
}
if (dataChanged) {
  console.error('[migration 0028] ❌ Existing data was modified — this should not happen for a purely additive migration.');
  await conn.end();
  process.exit(4);
}
console.log('[migration 0028] ✓ All existing table row counts unchanged. No damage.');

// ─── Sanity: new tables are empty ───
const newTables = ['client_content_config', 'client_blog_post', 'client_content_topic', 'client_citation_check', 'oauth_token'];
for (const tbl of newTables) {
  const [r] = await conn.execute(`SELECT COUNT(*) AS n FROM ${tbl}`);
  console.log(`[migration 0028]   ${tbl}: ${r[0].n} rows (expected 0)`);
}

console.log('\n[migration 0028] ✓ MIGRATION COMPLETE. Schema additions:\n');
console.log('  • client_content_config        — per-Dominator-order content program config');
console.log('  • client_blog_post             — per-article tracking');
console.log('  • client_content_topic         — per-client topic queue');
console.log('  • client_citation_check        — weekly citation monitor results');
console.log('  • oauth_token                  — Shopify + Wix OAuth tokens');
console.log('  • blog_posts.clientShowcaseId  — nullable column for Showcase fallback mode');
console.log('\n[migration 0028] Existing tables unchanged. Safe.');

await conn.end();
process.exit(0);
