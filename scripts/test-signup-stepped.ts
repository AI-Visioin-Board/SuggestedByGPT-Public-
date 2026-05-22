#!/usr/bin/env tsx
/**
 * Step-paused Reddit signup debug — watches each phase with explicit pauses
 * so the operator can see what Reddit is serving at each step.
 *
 * Uses ALL the same modules as the production accountCreator, just with
 * explicit pauses + extra logging.
 */
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { eq } from 'drizzle-orm';
import { getDb } from '../server/db';
import { clientRedditAccounts, redditProxyPool, redditVerificationQueue, type InsertClientRedditAccount } from '../drizzle/schema';
import { encrypt } from '../server/encryption';
import { generateUsernameCandidates } from '../server/reddit/usernameGenerator';
import { generateFingerprint, serializeFingerprint } from '../server/reddit/fingerprintGenerator';
import { assignProxyToAccount, getProxyConnection } from '../server/reddit/proxyManager';
import { checkAndUpdateProxy } from '../server/reddit/proxyHealthChecker';
import { launchAccountSession, humanDwell, humanMouseMove, humanGaussianType, jitter, rand, checkLoginState } from '../server/reddit/patchrightDriver';
import { detectCaptcha, solveCaptchaOnPage } from '../server/reddit/captchaSolver';
import { ENV } from '../server/_core/env';
import crypto from 'crypto';

const PAUSE_LONG = 30_000;   // pause after major navigation
const PAUSE_SHORT = 8_000;    // pause after small actions
const SCREENSHOT_DIR = '/tmp/sbgpt-stepped';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let stepCounter = 0;
async function step(name: string, page: any, pauseMs = PAUSE_LONG) {
  stepCounter++;
  const tag = String(stepCounter).padStart(2, '0');
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`STEP ${tag}: ${name}`);
  console.log(`URL: ${page.url()}`);
  console.log(`Title: ${await page.title()}`);
  const path = `${SCREENSHOT_DIR}/${tag}-${name.replace(/[^a-z0-9]/gi, '_')}.png`;
  try { await page.screenshot({ path, fullPage: false }); console.log(`Screenshot: ${path}`); } catch {}
  console.log(`Pausing ${pauseMs/1000}s — you can watch the browser`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  await page.waitForTimeout(pauseMs);
}

(async () => {
  const db = await getDb();
  if (!db) throw new Error('no db');

  const businessName = 'Your Str Management';
  const clientId = 4;

  // ── Allocate username + proxy + insert account row ──
  // Add a random suffix per run so Reddit doesn't see "same email retrying"
  // (it silently rejects repeated submissions on the same email/IP combo).
  // Reddit + our DB cap usernames at 20 chars, so trim base to 16 + 4 hex.
  const rawBase = generateUsernameCandidates(businessName)[0]!;
  const suffix = crypto.randomBytes(2).toString('hex'); // 4 hex chars
  const username = `${rawBase.slice(0, 16)}${suffix}`;
  const password = generatePassword();
  const emailAlias = `${username.toLowerCase()}@${ENV.accountsEmailDomain}`;

  console.log(`\n[setup] username=u/${username} alias=${emailAlias}`);

  const tempInsert: InsertClientRedditAccount = {
    clientId,
    redditUsername: username,
    encryptedPassword: encrypt(password),
    fingerprint: '{}',
    emailAlias,
    proxyId: null,
    proxyTimezone: null,
    status: 'pending_creation',
    dayNumber: 0,
  };
  const insertResult = await db.insert(clientRedditAccounts).values(tempInsert);
  const accountId =
    (insertResult as any)?.insertId ??
    (Array.isArray(insertResult) ? (insertResult[0] as any)?.insertId : undefined);
  console.log(`[setup] account #${accountId} inserted`);

  const proxy = await assignProxyToAccount(accountId);
  console.log(`[setup] proxy ${proxy.ipAddress}:${proxy.port} assigned`);

  const rep = await checkAndUpdateProxy(proxy);
  console.log(`[setup] reputation: clean=${rep.clean}, tz=${rep.timezone}, lat=${rep.lat}, lng=${rep.lng}`);

  const fingerprint = generateFingerprint({
    seed: `${clientId}:${username}`,
    proxyTimezone: rep.timezone || proxy.geoTimezone || undefined,
    proxyLocale: 'en-US',
    proxyLat: rep.lat,
    proxyLng: rep.lng,
  });
  console.log(`[setup] fingerprint: ua=${fingerprint.uaFamily} ${fingerprint.uaVersion}, tz=${fingerprint.timezoneId}, viewport=${fingerprint.viewport.width}x${fingerprint.viewport.height}`);

  await db.update(clientRedditAccounts)
    .set({ fingerprint: serializeFingerprint(fingerprint), proxyId: proxy.id, proxyTimezone: fingerprint.timezoneId, status: 'creating' })
    .where(eq(clientRedditAccounts.id, accountId));

  // ── Launch Patchright (visible) ──
  const proxyConn = getProxyConnection(proxy);
  const session = await launchAccountSession({
    accountId,
    fingerprint,
    proxyServer: proxyConn.server,
    proxyUsername: proxyConn.username,
    proxyPassword: proxyConn.password,
    headless: false,
  });

  try {
    // ── STEP 1: Google ──
    await session.page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await humanDwell(session.page, 4000);
    await step('google', session.page, PAUSE_SHORT);

    // ── STEP 2: reddit.com ──
    await session.page.goto('https://www.reddit.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await humanDwell(session.page, 7000);
    await step('reddit_homepage', session.page, PAUSE_LONG);

    // ── STEP 3: r/popular ──
    await session.page.goto('https://www.reddit.com/r/popular/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await humanDwell(session.page, 6000);
    await step('r_popular', session.page, PAUSE_LONG);

    // ── STEP 4: /register ──
    await session.page.goto('https://www.reddit.com/register', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await session.page.waitForTimeout(jitter(5000));
    await humanDwell(session.page, 4000);
    await step('register_page', session.page, PAUSE_LONG);

    // ── STEP 5: type email ──
    const emailLoc = session.page.locator('faceplate-text-input[name="email"] input').first();
    await emailLoc.waitFor({ state: 'visible', timeout: 15000 });
    const box = await emailLoc.boundingBox();
    if (box) await humanMouseMove(session.page, box.x + box.width / 2, box.y + box.height / 2, 20);
    await emailLoc.click();
    await session.page.waitForTimeout(jitter(400));
    await emailLoc.fill('');
    await humanGaussianType(session.page, emailAlias, 90, 30);
    try {
      await session.page.locator('faceplate-text-input[name="email"]').first().evaluate((el: any) => {
        if (typeof el.blur === 'function') el.blur();
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      });
    } catch {}
    await session.page.waitForTimeout(jitter(800));
    await step('email_typed', session.page, PAUSE_SHORT);

    // ── STEP 6: detect captcha + solve if present ──
    const captchaBefore = await detectCaptcha(session.page);
    console.log(`[step] captcha BEFORE click? ${captchaBefore ? 'YES' : 'no'}`);

    // ── STEP 7: click Continue ──
    try {
      await session.page.getByRole('button', { name: /^continue$/i }).first().click({ timeout: 5000 });
      console.log('[step] clicked Continue');
    } catch (e) {
      console.log('[step] Continue click via getByRole failed, pressing Enter:', (e as Error).message);
      await session.page.keyboard.press('Enter');
    }
    await session.page.waitForTimeout(jitter(4000));
    await step('after_continue', session.page, PAUSE_LONG);

    // ── STEP 8: handle captcha if appeared ──
    const captchaAfter = await detectCaptcha(session.page);
    if (captchaAfter) {
      console.log(`[step] captcha appeared (type=${captchaAfter.type}). Solving...`);
      await solveCaptchaOnPage(session.page, {
        proxy: { server: proxyConn.server, username: proxyConn.username, password: proxyConn.password },
        userAgent: fingerprint.userAgent,
      });
      await step('after_captcha_solve', session.page, PAUSE_SHORT);

      // Click Continue again after captcha
      try {
        await session.page.getByRole('button', { name: /^continue$/i }).first().click({ timeout: 5000 });
        console.log('[step] clicked Continue again post-captcha');
      } catch {
        await session.page.keyboard.press('Enter');
      }
      await session.page.waitForTimeout(jitter(4000));
      await step('after_post_captcha_continue', session.page, PAUSE_LONG);
    }

    // ── STEP 9: poll verification queue (extended 10 min) ──
    console.log('\n[step] Polling verification queue for OTP — 10 min window');
    console.log('[step] Email expected: ' + emailAlias);
    console.log('[step] Watch the visible browser. If Reddit shows "Check your email" → OTP is coming.');
    console.log('[step] If Reddit shows an error or stays on email step → it didn\'t accept the submission.\n');

    const start = Date.now();
    const TIMEOUT = 10 * 60 * 1000;
    let verification: any = null;
    while (Date.now() - start < TIMEOUT) {
      const [row] = await db.select().from(redditVerificationQueue)
        .where(eq(redditVerificationQueue.emailAlias, emailAlias.toLowerCase())).limit(1);
      if (row) {
        verification = row;
        console.log(`[step] OTP RECEIVED after ${Math.round((Date.now() - start)/1000)}s: code=${row.code} link=${row.magicLink}`);
        break;
      }
      const elapsed = Math.round((Date.now() - start) / 1000);
      if (elapsed % 30 === 0) console.log(`[step] still waiting... ${elapsed}s elapsed (${Math.round(TIMEOUT/1000) - elapsed}s remaining)`);
      await session.page.waitForTimeout(5000);
    }

    if (!verification) {
      console.log('\n[step] OTP TIMEOUT — Reddit did not send the verification email');
      await step('timeout_no_otp', session.page, PAUSE_LONG);
      console.log(`[step] Account #${accountId} flagged. Browser stays open 60s for inspection.`);
      await session.page.waitForTimeout(60000);
      await session.cleanup();
      process.exit(1);
    }

    // ── STEP 10: type OTP ──
    if (verification.code) {
      const otpLoc = session.page.locator('faceplate-otp-input input, faceplate-text-input[name="code"] input').first();
      await otpLoc.waitFor({ state: 'visible', timeout: 15000 });
      const obox = await otpLoc.boundingBox();
      if (obox) await humanMouseMove(session.page, obox.x + obox.width / 2, obox.y + obox.height / 2, 18);
      await otpLoc.click();
      await session.page.waitForTimeout(jitter(400));
      await humanGaussianType(session.page, verification.code, 110, 35);
      await step('otp_typed', session.page, PAUSE_SHORT);
    }

    console.log('[step] If we got here, the foundational pipeline is working. Username + password steps would follow.');
    console.log('[step] Browser stays open 2 minutes for visual inspection.');
    await session.page.waitForTimeout(120_000);

  } catch (err) {
    console.error('STEP FATAL:', err);
    await step('fatal_error', session.page, 30000);
  } finally {
    await session.cleanup();
  }

  process.exit(0);
})().catch(e => { console.error('OUTER FATAL', e); process.exit(1); });

function generatePassword(): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(24);
  let out = '';
  for (let i = 0; i < 24; i++) out += charset[bytes[i]! % charset.length];
  return out;
}
