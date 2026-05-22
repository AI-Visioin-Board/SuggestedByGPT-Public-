/**
 * Check directory submission status for YourSTRManagement
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, desc } from "drizzle-orm";
import { directorySubmissions, vaAssignments } from "../drizzle/schema.js";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error("DATABASE_URL not set"); process.exit(1); }
  const url = dbUrl.includes("charset=") ? dbUrl : dbUrl + (dbUrl.includes("?") ? "&" : "?") + "charset=utf8mb4";
  const db = drizzle(url);

  // Order #1 = YourSTRManagement dominator
  const subs = await db.select().from(directorySubmissions).where(eq(directorySubmissions.orderId, 1)).orderBy(directorySubmissions.directoryName);

  console.log(`\nDIRECTORY SUBMISSIONS for Order #1 (${subs.length} total):\n`);
  for (const s of subs) {
    console.log(`  [${s.id}] ${s.directoryName}`);
    console.log(`    status=${s.status}  attempts=${s.attemptCount}  priority=${s.priority}`);
    console.log(`    submissionUrl=${s.submissionUrl || '(none)'}`);
    console.log(`    requiresManualVerification=${s.requiresManualVerification}`);
    console.log(`    verificationInstructions=${(s.verificationInstructions || '(none)').slice(0, 150)}`);
    console.log(`    errorMessage=${(s.errorMessage || '(none)').slice(0, 150)}`);
    console.log(`    completedAt=${s.completedAt || '(none)'}`);
    console.log(`    lastAttemptAt=${s.lastAttemptAt || '(none)'}`);
    console.log('');
  }

  // Check VA assignments for order #1
  const vas = await db.select().from(vaAssignments).where(eq(vaAssignments.orderId, 1));
  console.log(`VA ASSIGNMENTS for Order #1 (${vas.length} total):\n`);
  for (const v of vas) {
    console.log(`  [${v.id}] ${v.directoryName}  status=${v.status}`);
    console.log(`    submissionUrl=${v.submissionUrl || '(none)'}`);
    console.log(`    notes=${(v.notes || '(none)').slice(0, 150)}`);
    console.log('');
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
