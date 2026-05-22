/**
 * Blog content orchestrator — schedules + Patchright mutex.
 *
 * Wires the four workers into the running server:
 *
 *   - runCadenceTick()       → every hour
 *   - runPublishQueue()      → every 10 minutes
 *   - runVerifier()          → every 30 minutes
 *   - runCitationMonitor()   → every 24 hours
 *
 * All are gated by `BLOG_CONTENT_AUTOMATION_ENABLED=true`. When the flag is
 * off, the schedules still register but each tick is a no-op (cheap).
 *
 * Patchright mutex: a MySQL advisory lock (`GET_LOCK`) ensures only ONE
 * Patchright launch happens at a time across the process. This protects the
 * blog publisher (Squarespace UI automation) from colliding with the Reddit
 * warming worker, the GBP editor, or another blog publish.
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md Module 18.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import { runCadenceTick } from "./cadenceTick";
import { runPublishQueue } from "./publishQueue";
import { runVerifier } from "./verifier";
import { runCitationMonitor } from "./citationMonitor";

const CADENCE_INTERVAL_MS = 60 * 60 * 1_000;       // 1 hour
const PUBLISH_INTERVAL_MS = 10 * 60 * 1_000;       // 10 min
const VERIFY_INTERVAL_MS = 30 * 60 * 1_000;        // 30 min
const CITATION_INTERVAL_MS = 24 * 60 * 60 * 1_000; // 24 hours

const PATCHRIGHT_LOCK_KEY = "blog_content_patchright_global";
const PATCHRIGHT_LOCK_TIMEOUT_SEC = 600; // wait up to 10 min for the lock

let started = false;

/**
 * Acquire the global Patchright advisory lock, run `fn`, then release.
 * Used by any code path that launches Patchright (today: Squarespace
 * publisher; future: anywhere else that needs serialised browser access).
 *
 * If the lock can't be acquired within PATCHRIGHT_LOCK_TIMEOUT_SEC, returns
 * `null` and skips the work — caller decides whether to retry next tick.
 */
export async function withPatchrightLock<T>(fn: () => Promise<T>): Promise<T | null> {
  const db = await getDb();
  if (!db) return null;
  let acquired = false;
  try {
    const [row] = await db.execute(
      sql`SELECT GET_LOCK(${PATCHRIGHT_LOCK_KEY}, ${PATCHRIGHT_LOCK_TIMEOUT_SEC}) AS got`,
    );
    const lockOk = Array.isArray(row)
      ? (row as any[])[0]?.got === 1
      : (row as any)?.got === 1;
    if (!lockOk) {
      console.warn("[withPatchrightLock] could not acquire global Patchright lock");
      return null;
    }
    acquired = true;
    try {
      return await fn();
    } catch (innerErr) {
      // Re-throw so the caller can distinguish "fn errored" from "lock
      // unavailable" (null). Mutex finally block still releases the lock.
      throw innerErr;
    }
  } catch (err) {
    // Only catches errors during lock acquisition itself. Errors from `fn`
    // are re-thrown above.
    console.error(
      "[withPatchrightLock] lock-acquisition error:",
      (err as Error).message,
    );
    if (acquired) throw err;
    return null;
  } finally {
    if (acquired) {
      try {
        await db.execute(sql`SELECT RELEASE_LOCK(${PATCHRIGHT_LOCK_KEY})`);
      } catch {
        /* lock auto-releases on connection close */
      }
    }
  }
}

/**
 * Start the periodic schedules. Safe to call multiple times; the second call
 * is a no-op.
 */
export function startBlogContentOrchestrator() {
  if (started) return;
  started = true;

  if (!ENV.blogContentAutomationEnabled) {
    console.log(
      "[blogContentOrchestrator] BLOG_CONTENT_AUTOMATION_ENABLED is OFF — schedules registered but ticks will no-op",
    );
  } else {
    console.log("[blogContentOrchestrator] enabled — scheduling 4 workers");
  }

  // ─── Cadence tick (decides what fires today) ─────────────────────────────
  setInterval(async () => {
    try {
      const result = await runCadenceTick();
      if (result.generated > 0 || result.completed > 0 || result.errors > 0) {
        console.log(
          `[cadenceTick] generated=${result.generated} skipped=${result.skipped} completed=${result.completed} errors=${result.errors}`,
        );
      }
    } catch (err) {
      console.error("[cadenceTick] uncaught:", (err as Error).message);
    }
  }, CADENCE_INTERVAL_MS).unref();

  // ─── Publish queue ────────────────────────────────────────────────────────
  setInterval(async () => {
    try {
      const result = await runPublishQueue(5);
      if (result.picked > 0) {
        console.log(
          `[publishQueue] picked=${result.picked} published=${result.published} showcase=${result.showcase} failed=${result.failed} skipped=${result.skipped}`,
        );
      }
    } catch (err) {
      console.error("[publishQueue] uncaught:", (err as Error).message);
    }
  }, PUBLISH_INTERVAL_MS).unref();

  // ─── Verifier ────────────────────────────────────────────────────────────
  setInterval(async () => {
    try {
      const result = await runVerifier(5);
      if (result.picked > 0) {
        console.log(
          `[verifier] picked=${result.picked} verified=${result.verified} failed=${result.failed} errors=${result.errors}`,
        );
      }
    } catch (err) {
      console.error("[verifier] uncaught:", (err as Error).message);
    }
  }, VERIFY_INTERVAL_MS).unref();

  // ─── Citation monitor (weekly per-config, daily tick) ──────────────────
  setInterval(async () => {
    try {
      const result = await runCitationMonitor();
      if (result.configsChecked > 0) {
        console.log(
          `[citationMonitor] configs=${result.configsChecked} queries=${result.queriesRun} errors=${result.errors}`,
        );
      }
    } catch (err) {
      console.error("[citationMonitor] uncaught:", (err as Error).message);
    }
  }, CITATION_INTERVAL_MS).unref();
}
