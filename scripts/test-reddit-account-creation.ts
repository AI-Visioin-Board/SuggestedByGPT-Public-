#!/usr/bin/env tsx
/**
 * Phase F: End-to-end test of Reddit account creation pipeline.
 *
 * Runs the full accountCreator flow against:
 *   - A real Webshare ISP proxy (allocated from synced pool)
 *   - A real Patchright + Chromium signup
 *   - Real Reddit /register
 *   - Real reCAPTCHA solved by 2Captcha
 *   - Real verification email captured by Cloudflare Worker
 *   - Real verification code/link applied
 *   - Encrypted cookies saved to DB
 *
 * Usage:
 *   tsx scripts/test-reddit-account-creation.ts <test-business-name>
 *
 * Example:
 *   tsx scripts/test-reddit-account-creation.ts "Acme Test Plumbing"
 *
 * Prerequisites (will fail loud if missing):
 *   - All env vars set (WEBSHARE_API_TOKEN, TWO_CAPTCHA_API_KEY, etc.)
 *   - Migration 0022 applied to the connected DB
 *   - Webshare proxy pool already synced (script does this automatically if empty)
 *   - 2Captcha account funded (>$0 balance)
 */

import 'dotenv/config';
import { createRedditAccountForClient } from '../server/reddit/accountCreator';
import { syncProxyPool, getPoolStats } from '../server/reddit/proxyManager';
import { getBalance } from '../server/reddit/captchaSolver';
import { getDb } from '../server/db';
import { clients, users } from '../drizzle/schema';
import { ENV } from '../server/_core/env';

const businessName = process.argv[2] || 'Test Business Phase F';

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Phase F: End-to-end Reddit account creation test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Business name: ${businessName}`);
  console.log('');

  // ─── Pre-flight checks ───
  console.log('[Preflight] Checking env...');
  const missing: string[] = [];
  if (!ENV.webshareApiToken) missing.push('WEBSHARE_API_TOKEN');
  if (!ENV.twoCaptchaApiKey) missing.push('TWO_CAPTCHA_API_KEY');
  if (!ENV.accountsEmailDomain) missing.push('ACCOUNTS_EMAIL_DOMAIN');
  if (!ENV.internalWebhookSecret) missing.push('INTERNAL_WEBHOOK_SECRET');
  if (process.env.CREDENTIAL_ENCRYPTION_KEY?.length !== 64) missing.push('CREDENTIAL_ENCRYPTION_KEY (64-char hex)');
  if (missing.length) {
    console.error(`✗ Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log('  ✓ All env vars present');

  console.log('[Preflight] Checking 2Captcha balance...');
  const balance = await getBalance();
  console.log(`  balance: $${balance ?? 'unknown'}`);
  if (balance !== null && balance < 0.10) {
    console.error('✗ 2Captcha balance below $0.10. Fund the account first.');
    process.exit(1);
  }

  console.log('[Preflight] Checking proxy pool...');
  let stats = await getPoolStats();
  console.log(`  pool: ${stats.total} total, ${stats.available} available, ${stats.flagged} flagged`);
  if (stats.available === 0) {
    console.log('[Preflight] Pool empty — syncing from Webshare...');
    const sync = await syncProxyPool();
    console.log(`  +${sync.added} added, ${sync.poolSize} total`);
    stats = await getPoolStats();
  }
  if (stats.available === 0) {
    console.error('✗ No proxies available even after sync. Subscribe to a Webshare plan.');
    process.exit(1);
  }

  // ─── Create or fetch test client ───
  console.log('');
  console.log('[Client] Creating test client row...');
  const db = await getDb();
  if (!db) {
    console.error('✗ DB not available');
    process.exit(1);
  }

  // Use a unique email per run to avoid collisions
  const testEmail = `phasef-test-${Date.now()}@suggestedbygpt.com`;

  // 1. Create a user row first (clients.userId is required, no default)
  const userInsert = await db.insert(users).values({
    email: testEmail,
    name: 'Phase F Test',
    role: 'client',
  });
  const userId = (userInsert as any)?.insertId
    ?? (Array.isArray(userInsert) ? (userInsert[0] as any)?.insertId : undefined);
  if (!userId) {
    console.error('✗ Failed to create test user');
    process.exit(1);
  }

  // 2. Create the client row tied to the user
  const insertResult = await db.insert(clients).values({
    userId,
    fullName: 'Phase F Test',
    email: testEmail,
    businessName,
    industry: 'Software / Test',
    targetLocation: 'Atlanta, GA',
    onboardingCompleted: true,
  });
  const clientId = (insertResult as any)?.insertId
    ?? (Array.isArray(insertResult) ? (insertResult[0] as any)?.insertId : undefined);
  console.log(`  ✓ test user #${userId} + client #${clientId} (${testEmail})`);

  // ─── Run account creation ───
  console.log('');
  console.log('[Phase F] Running createRedditAccountForClient...');
  console.log('  This will: allocate proxy → reputation check → launch Patchright →');
  console.log('             reddit.com/register → fill creds → solve captcha → submit →');
  console.log('             poll verification queue → enter code → confirm logged in');
  console.log('  Total: ~90-120 seconds with real network');
  console.log('');

  const startedAt = Date.now();
  const result = await createRedditAccountForClient({
    clientId,
    businessName,
    headless: false,  // visible so we can watch
  });
  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (result.success) {
    console.log(`✓ SUCCESS — u/${result.redditUsername} created in ${elapsedSec}s`);
    console.log(`  account #${result.accountId}, status=warming_up`);
    console.log('');
    console.log('Next: schedule the warm-up tasks via accountWarmup.scheduleWarmupForAccount');
    console.log('      then flip REDDIT_AUTOMATION_ENABLED=true on Railway and watch the worker tick');
  } else {
    console.log(`✗ FAILED — ${result.failureReason} (${elapsedSec}s)`);
    console.log(`  account #${result.accountId} marked flagged`);
    console.log('');
    console.log('Inspect: SELECT * FROM client_reddit_accounts WHERE id =', result.accountId);
    console.log('         SELECT * FROM reddit_proxy_pool WHERE assignedAccountId =', result.accountId);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  process.exit(result.success ? 0 : 1);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
