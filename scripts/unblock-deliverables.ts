/**
 * One-time fix: unblock YourSTRManagement deliverables that were
 * stuck due to missing https:// in businessWebsite URL.
 *
 * Run with: railway run npx tsx scripts/unblock-deliverables.ts
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, inArray } from "drizzle-orm";
import { deliverables, clients } from "../drizzle/schema.js";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const url = dbUrl.includes("charset=") ? dbUrl : dbUrl + (dbUrl.includes("?") ? "&" : "?") + "charset=utf8mb4";
  const db = drizzle(url);

  // Fix businessWebsite — add https:// if missing
  const [client] = await db.select().from(clients).where(eq(clients.id, 1)).limit(1);
  if (client && client.businessWebsite && !client.businessWebsite.startsWith('http')) {
    console.log(`Fixing businessWebsite: "${client.businessWebsite}" → "https://${client.businessWebsite}"`);
    await db.update(clients).set({ businessWebsite: `https://${client.businessWebsite}` }).where(eq(clients.id, 1));
  } else {
    console.log(`businessWebsite already OK: "${client?.businessWebsite}"`);
  }

  // Unblock deliverables #5, #13, #25 — reset status to pending, clear blocker, reset retries
  const deliverableIds = [5, 13, 25];

  for (const id of deliverableIds) {
    const [d] = await db.select({ id: deliverables.id, status: deliverables.status, retryCount: deliverables.retryCount, blockerReason: deliverables.blockerReason })
      .from(deliverables).where(eq(deliverables.id, id)).limit(1);

    if (!d) {
      console.log(`Deliverable #${id}: not found`);
      continue;
    }

    if (d.status !== 'blocked') {
      console.log(`Deliverable #${id}: status is "${d.status}" — skipping`);
      continue;
    }

    console.log(`Deliverable #${id}: unblocking (was ${d.status}, retries=${d.retryCount})`);
    await db.update(deliverables).set({
      status: 'pending',
      blockerReason: null,
      retryCount: 0,
    }).where(eq(deliverables.id, id));
    console.log(`  → reset to pending, retryCount=0`);
  }

  console.log("\nDone. Next worker cycle will retry these deliverables.");
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
