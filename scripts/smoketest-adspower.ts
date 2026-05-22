#!/usr/bin/env tsx
/**
 * Phase 1 — AdsPower local-API smoke test.
 *
 * Validates the full Build-#1 architecture before we write the production code.
 *
 * Run on the SAME MACHINE that has AdsPower installed and running. The script
 * talks to AdsPower's Local API at http://127.0.0.1:50325 — it can't reach a
 * remote AdsPower install.
 *
 * Pre-reqs (one-time):
 *   1. AdsPower installed on this machine + signed in to a paid account
 *   2. Local API enabled (Settings → API → Open Local API)
 *   3. ADSPOWER_API_KEY env var set to the API key from Settings → API
 *
 * What this script does:
 *   1. Ping AdsPower (verify it's running + reachable)
 *   2. Allocate a clean Webshare proxy from our pool
 *   3. Generate a fingerprint matching the proxy geo
 *   4. Create an AdsPower profile via Local API with the proxy + fingerprint
 *   5. Start the browser → opens visible Chrome window on this machine
 *   6. Pause for 8 minutes — operator manually navigates to reddit.com/register,
 *      signs up an account end-to-end, ends up logged in
 *   7. Get cookies via API, normalize to Playwright shape, dump to JSON
 *   8. Stop the browser, delete the profile (cleanup)
 *   9. Print pass/fail summary
 *
 * Pass criteria (all must be true):
 *   ✓ Profile creates without error
 *   ✓ Browser opens with proxy active (verify by visiting ipinfo.io inside)
 *   ✓ Reddit signup completes successfully (you see the home feed)
 *   ✓ Cookie capture returns ≥3 reddit.com cookies
 *   ✓ Recognized auth cookies present (reddit_session, token_v2, edgebucket, loid)
 *
 * Usage (on the Windows machine with AdsPower running):
 *   ADSPOWER_API_KEY=... npx tsx scripts/smoketest-adspower.ts
 */

import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { getDb } from '../server/db';
import { redditProxyPool } from '../drizzle/schema';
import { generateFingerprint, serializeFingerprint } from '../server/reddit/fingerprintGenerator';
import { getProxyConnection } from '../server/reddit/proxyManager';
import { checkAndUpdateProxy } from '../server/reddit/proxyHealthChecker';
import {
  ping,
  createProfile,
  deleteProfile,
  startBrowser,
  stopBrowser,
  getCookies,
  normalizeCookie,
} from '../server/reddit/adsPowerClient';
import readline from 'readline';
import fs from 'fs';

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

(async () => {
  const db = await getDb();
  if (!db) throw new Error('no db');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Phase 1 — AdsPower smoke test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ── 1. Ping AdsPower ──
  console.log('[1/8] Pinging AdsPower at http://127.0.0.1:50325 ...');
  try {
    await ping();
    console.log('      ✓ AdsPower is up');
  } catch (err) {
    console.error('      ✗ AdsPower not reachable:', (err as Error).message);
    console.error('      Make sure AdsPower app is open and Local API is enabled.');
    process.exit(1);
  }

  // ── 2. Allocate proxy ──
  console.log('\n[2/8] Allocating a clean Webshare proxy...');
  const [proxy] = await db
    .select()
    .from(redditProxyPool)
    .where(eq(redditProxyPool.status, 'available'))
    .limit(1);
  if (!proxy) throw new Error('No available proxies');
  console.log(`      Proxy: ${proxy.ipAddress}:${proxy.port} (id=${proxy.id})`);

  const rep = await checkAndUpdateProxy(proxy);
  if (!rep.clean) throw new Error(`Proxy flagged: ${rep.flags.join(',')}`);
  console.log(`      Reputation: clean tz=${rep.timezone}`);

  // ── 3. Generate fingerprint ──
  console.log('\n[3/8] Generating fingerprint...');
  const fingerprint = generateFingerprint({
    seed: `smoke-adspower-${proxy.id}-${Date.now()}`,
    proxyTimezone: rep.timezone || proxy.geoTimezone || undefined,
    proxyLocale: 'en-US',
    proxyLat: rep.lat,
    proxyLng: rep.lng,
  });
  console.log(`      ${fingerprint.uaFamily} ${fingerprint.uaVersion} | ${fingerprint.viewport.width}x${fingerprint.viewport.height} | ${fingerprint.timezoneId}`);

  // ── 4. Create AdsPower profile ──
  console.log('\n[4/8] Creating AdsPower profile via Local API...');
  const proxyConn = getProxyConnection(proxy);
  const profileName = `smoke-${proxy.id}-${Date.now().toString(36)}`;
  let profileId: string;
  try {
    const created = await createProfile({
      name: profileName,
      user_proxy_config: {
        proxy_soft: 'other',
        proxy_type: 'http',
        proxy_host: proxy.ipAddress,
        proxy_port: String(proxy.port),
        proxy_user: proxyConn.username,
        proxy_password: proxyConn.password,
      },
      fingerprint_config: {
        ua: fingerprint.userAgent,
        language: fingerprint.languages,
        timezone: fingerprint.timezoneId,
        screen_resolution: `${fingerprint.screen.width}_${fingerprint.screen.height}`,
        webrtc: 'proxy',
        location: 'allow',
        longitude: fingerprint.geoLng != null ? String(fingerprint.geoLng) : undefined,
        latitude: fingerprint.geoLat != null ? String(fingerprint.geoLat) : undefined,
        hardware_concurrency: fingerprint.hardwareConcurrency,
        device_memory: fingerprint.deviceMemory,
      },
      domain_name: 'reddit.com',
      remark: 'smoke test — DELETE after run',
    });
    profileId = created.id;
    console.log(`      Profile id: ${profileId}`);
  } catch (err) {
    console.error('      ✗ Profile create failed:', (err as Error).message);
    throw err;
  }

  // Cleanup helper — always runs at end
  let cleaned = false;
  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    console.log('\n[8/8] Cleanup: stopping browser + deleting profile...');
    try { await stopBrowser(profileId); } catch (e) { console.warn('      stopBrowser:', (e as Error).message); }
    try { await deleteProfile(profileId); console.log('      ✓ Profile deleted'); } catch (e) { console.warn('      deleteProfile:', (e as Error).message); }
  }
  process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

  try {
    // ── 5. Start browser ──
    console.log('\n[5/8] Starting browser (visible Chrome window)...');
    const startResult = await startBrowser(profileId);
    console.log(`      Puppeteer WS: ${startResult.ws.puppeteer}`);
    console.log(`      Debug port:   ${startResult.debug_port}`);
    console.log('      ✓ Chrome should be open on your screen, pre-loaded to reddit.com');

    // ── 6. Manual signup pause ──
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Manual steps in the AdsPower-managed Chrome window:');
    console.log('    1. Verify the proxy is active — visit https://ipinfo.io and confirm');
    console.log('       it shows a US-based Webshare IP (NOT your real IP).');
    console.log('    2. Navigate to https://www.reddit.com/register/');
    console.log('    3. Use a fresh email + password (any throwaway works for this test).');
    console.log('    4. Solve captcha + OTP + pick username + interests wizard.');
    console.log('    5. End up logged in to reddit.com (you should see the Home feed).');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await ask('  Press Enter when signup is complete and you are logged in...\n');

    // ── 7. Capture cookies ──
    console.log('\n[6/8] Capturing cookies via /user/cookie/get...');
    const rawCookies = await getCookies(profileId);
    const allCookies = rawCookies.map(normalizeCookie);
    const redditCookies = allCookies.filter(c => /(^|\.)reddit\.com$|redd\.it$|redditmedia/.test(c.domain));
    console.log(`      Total cookies:  ${allCookies.length}`);
    console.log(`      Reddit cookies: ${redditCookies.length}`);
    console.log(`      Names: ${redditCookies.map(c => c.name).join(', ') || '(none)'}`);

    const importantCookies = ['reddit_session', 'session_tracker', 'token_v2', 'csv', 'edgebucket', 'loid'];
    const present = importantCookies.filter(name => redditCookies.some(c => c.name === name));
    console.log(`      Recognized auth cookies present: ${present.length ? present.join(', ') : '(none)'}`);

    // ── 8. Save snapshot ──
    console.log('\n[7/8] Saving snapshot...');
    const snapshot = {
      proxyId: proxy.id,
      proxyServer: proxyConn.server,
      profileName,
      profileId,
      fingerprint: serializeFingerprint(fingerprint),
      cookies: redditCookies,
      capturedAt: new Date().toISOString(),
    };
    fs.writeFileSync('/tmp/sbgpt-adspower-smoke.json', JSON.stringify(snapshot, null, 2));
    console.log('      Saved → /tmp/sbgpt-adspower-smoke.json');

    // ── Pass / fail ──
    const PASS = redditCookies.length >= 3 && present.length >= 1;
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Smoke test verdict: ${PASS ? '✓ PASS' : '✗ NEEDS REVIEW'}`);
    if (!PASS) {
      console.log('  Reasons:');
      if (redditCookies.length < 3) console.log(`    - only ${redditCookies.length} reddit cookies (expected ≥3)`);
      if (present.length < 1) console.log(`    - no recognized auth cookies (reddit_session, token_v2, etc.)`);
    } else {
      console.log('  Architecture validated. Proceed to Phase 2 (backend foundations).');
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await cleanup();
    process.exit(PASS ? 0 : 2);
  } catch (err) {
    await cleanup();
    throw err;
  }
})().catch(e => { console.error('\nSMOKE TEST FATAL:', e?.message ?? e); console.error(e); process.exit(1); });
