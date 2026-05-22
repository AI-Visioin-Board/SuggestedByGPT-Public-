#!/usr/bin/env tsx
/**
 * Debug: open reddit.com/register through the same proxy + fingerprint
 * we'd use for a real signup, capture page HTML + screenshot so we know
 * what selectors to use.
 */
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { eq } from 'drizzle-orm';
import { getDb } from '../server/db';
import { clientRedditAccounts } from '../drizzle/schema';
import { getProxyForAccount, getProxyConnection } from '../server/reddit/proxyManager';
import { parseFingerprint } from '../server/reddit/fingerprintGenerator';
import { launchAccountSession } from '../server/reddit/patchrightDriver';

(async () => {
  const db = await getDb();
  if (!db) throw new Error('no db');

  const [account] = await db.select().from(clientRedditAccounts)
    .where(eq(clientRedditAccounts.id, 99)).limit(1);
  if (!account) throw new Error('no account #99');

  const proxy = await getProxyForAccount(account.id);
  if (!proxy) throw new Error('no proxy');

  const conn = getProxyConnection(proxy);
  const fp = parseFingerprint(account.fingerprint);

  console.log('Launching with proxy', proxy.ipAddress, 'tz', fp.timezoneId);
  const session = await launchAccountSession({
    accountId: account.id,
    fingerprint: fp,
    proxyServer: conn.server,
    proxyUsername: conn.username,
    proxyPassword: conn.password,
    headless: false,
  });

  const outDir = '/tmp/sbgpt-reddit-debug';
  fs.mkdirSync(outDir, { recursive: true });

  console.log('GET /register');
  await session.page.goto('https://www.reddit.com/register', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await session.page.waitForTimeout(8000);  // give React time

  const url = session.page.url();
  const title = await session.page.title();
  console.log('After 8s — URL:', url, '| Title:', title);

  await session.page.screenshot({ path: path.join(outDir, '01-register.png'), fullPage: true });
  fs.writeFileSync(path.join(outDir, '01-register.html'), await session.page.content());

  // Try Patchright's high-level locators that pierce shadow DOM
  const locatorTests = [
    ['getByLabel(/email/i)', () => session.page.getByLabel(/email/i, { exact: false })],
    ['getByPlaceholder(/email/i)', () => session.page.getByPlaceholder(/email/i)],
    ['getByRole textbox name=email', () => session.page.getByRole('textbox', { name: /email/i })],
    ['getByRole textbox', () => session.page.getByRole('textbox')],
    ['locator(input[type=email])', () => session.page.locator('input[type="email"]')],
    ['locator(faceplate-text-input)', () => session.page.locator('faceplate-text-input')],
    ['locator(faceplate-text-input input)', () => session.page.locator('faceplate-text-input input')],
  ] as const;

  console.log('\nPatchright locator tests:');
  for (const [label, make] of locatorTests) {
    try {
      const loc = make();
      const count = await loc.count();
      let visible = false;
      let bbox = null;
      if (count > 0) {
        try { visible = await loc.first().isVisible({ timeout: 1000 }); } catch {}
        try { bbox = await loc.first().boundingBox(); } catch {}
      }
      console.log(`  ${label}: count=${count} visible=${visible} bbox=${bbox ? JSON.stringify(bbox) : 'null'}`);
    } catch (e) {
      console.log(`  ${label}: ERR ${(e as Error).message.slice(0, 80)}`);
    }
  }

  // Dump custom elements (Shreddit web components)
  const shadowDump = await session.page.evaluate(() => {
    const out: any[] = [];
    const all = Array.from(document.querySelectorAll('*'));
    for (const el of all) {
      const tag = el.tagName.toLowerCase();
      if (tag.startsWith('faceplate-') || tag.startsWith('shreddit-') || tag.includes('-input')) {
        const e = el as HTMLElement;
        const r = e.getBoundingClientRect();
        out.push({
          tag,
          attrs: Array.from(el.attributes).map(a => `${a.name}=${a.value}`).join(' ').slice(0, 200),
          shadowOpen: !!(el as any).shadowRoot,
          visible: r.width > 0 && r.height > 0,
          y: Math.round(r.y),
        });
      }
    }
    return out.slice(0, 20);
  });
  console.log('\nShreddit / faceplate elements:');
  for (const e of shadowDump) console.log(JSON.stringify(e));

  console.log('\nScreenshot + HTML in', outDir);
  await session.page.waitForTimeout(20000);  // keep open 20s for visual inspection
  await session.cleanup();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
