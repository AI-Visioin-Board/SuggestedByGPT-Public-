#!/usr/bin/env node
/**
 * One-shot migration runner for 0027_action_items_requires_client_action.
 *
 * Why a custom script: drizzle-kit's _journal.json only tracks up to 0014, but
 * migrations 0015-0027 were applied manually (raw SQL). Running
 * `drizzle-kit migrate` would try to re-apply 0015-0026 and conflict. So
 * apply 0027 directly via mysql2.
 *
 * Idempotent — checks for the column before adding.
 *
 * Usage: railway run --service suggestedbygpt node scripts/apply-migration-0027.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mysql from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '..', 'drizzle', '0027_action_items_requires_client_action.sql');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required (run via `railway run`)');
  process.exit(1);
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log('[migration 0027] Connected to DB');

// Idempotency check: does the column already exist?
const [cols] = await conn.execute(
  `SELECT COLUMN_NAME FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'action_items'
     AND COLUMN_NAME = 'requiresClientAction'`,
);

if (cols.length > 0) {
  console.log('[migration 0027] Column action_items.requiresClientAction already exists — skipping.');
  await conn.end();
  process.exit(0);
}

const rawSql = readFileSync(sqlPath, 'utf8');
// Strip line comments AND blank lines, then split on ;. Only `--` line comments
// are used in this migration (no /* */ blocks).
const stripped = rawSql
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n');
const statements = stripped
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

console.log(`[migration 0027] Applying ${statements.length} statement(s)...`);
for (const stmt of statements) {
  console.log(`> ${stmt.slice(0, 100).replace(/\s+/g, ' ')}${stmt.length > 100 ? '...' : ''}`);
  await conn.query(stmt);
}

// Verify
const [verify] = await conn.execute(
  `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
   FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'action_items'
     AND COLUMN_NAME = 'requiresClientAction'`,
);

if (verify.length === 0) {
  console.error('[migration 0027] FAILED — column not present after apply.');
  await conn.end();
  process.exit(2);
}

console.log('[migration 0027] OK:', verify[0]);

// Sanity: count rows in action_items so we know we hit the right DB
const [count] = await conn.execute('SELECT COUNT(*) AS n FROM action_items');
console.log(`[migration 0027] action_items currently has ${count[0].n} rows; all default to requiresClientAction=true.`);

await conn.end();
process.exit(0);
