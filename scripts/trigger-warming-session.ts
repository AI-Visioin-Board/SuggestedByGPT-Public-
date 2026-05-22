/**
 * Manually triggers a warming session for a single account.
 * Run with:  railway run --service suggestedbygpt npx tsx scripts/trigger-warming-session.ts <accountId>
 *
 * This runs inside Railway's container so Patchright can find its binary at
 * /root/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome.
 */
import { runWarmingSession } from '../server/reddit/warming/runWarmingSession.js';

async function main() {
  const id = Number(process.argv[2]);
  if (!Number.isFinite(id)) {
    console.error('Usage: trigger-warming-session.ts <accountId>');
    process.exit(2);
  }
  console.log(`[trigger] starting warming session for account #${id}`);
  const t0 = Date.now();
  try {
    const r = await runWarmingSession(id);
    const dt = Math.round((Date.now() - t0) / 1000);
    console.log(`[trigger] DONE in ${dt}s — outcome=${r.outcome} loginSucceeded=${r.loginSucceeded}`);
    console.log(`  attempted: ${JSON.stringify(r.actionsAttempted)}`);
    console.log(`  completed: ${JSON.stringify(r.actionsCompleted)}`);
    if (r.errorDetail) console.log(`  errorDetail: ${r.errorDetail.slice(0, 600)}`);
    if (r.screenshotPath) console.log(`  screenshot: ${r.screenshotPath}`);
  } catch (e: any) {
    const dt = Math.round((Date.now() - t0) / 1000);
    console.error(`[trigger] CRASHED after ${dt}s: ${e?.message || e}`);
    if (e?.stack) console.error(e.stack);
  }
  process.exit(0);
}
main();
