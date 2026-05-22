#!/usr/bin/env tsx
/**
 * CLI runner for the topic seeder.
 *
 * Usage:
 *   pnpm tsx server/blogContent/cli/seedTopicsForOrder.ts --orderId 5 --dryRun
 *   pnpm tsx server/blogContent/cli/seedTopicsForOrder.ts --orderId 5 --confirm
 *
 * --dryRun mode:
 *   Calls dryRunSeedTopicsForOrder() — no DB writes. Prints the generated
 *   program for inspection. Use this during Phase B testing before Phase E
 *   (stripe webhook integration) creates real client_content_config rows.
 *
 * --confirm mode:
 *   Calls seedTopicsForOrder() — full production flow. Requires the order
 *   to have a corresponding client_content_config row.
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md § Module 3.
 */

import { seedTopicsForOrder, dryRunSeedTopicsForOrder } from "../topicSeeder";

function arg(name: string, fallback: string | null = null): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const orderIdRaw = arg("orderId");
  if (!orderIdRaw) {
    console.error("ERROR: --orderId <N> required");
    console.error("Usage: pnpm tsx server/blogContent/cli/seedTopicsForOrder.ts --orderId 5 [--dryRun | --confirm]");
    process.exit(1);
  }
  const orderId = parseInt(orderIdRaw, 10);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    console.error(`ERROR: --orderId must be a positive integer, got: ${orderIdRaw}`);
    process.exit(1);
  }

  const dryRun = hasFlag("dryRun");
  const confirm = hasFlag("confirm");
  if (!dryRun && !confirm) {
    console.error("ERROR: must pass either --dryRun or --confirm");
    console.error("  --dryRun  — generate + print, no DB writes");
    console.error("  --confirm — full production flow, writes to DB");
    process.exit(1);
  }
  if (dryRun && confirm) {
    console.error("ERROR: pass --dryRun OR --confirm, not both");
    process.exit(1);
  }

  const start = Date.now();

  if (dryRun) {
    console.log(`\n[CLI] DRY RUN — orderId=${orderId}\n`);
    const result = await dryRunSeedTopicsForOrder(orderId);

    if (result.failed) {
      console.error(`\n❌ FAILED: ${result.reason}\n`);
      if (result.client) console.log("Client:", result.client);
      if (result.siteData) console.log("Site data:", result.siteData);
      process.exit(2);
    }

    console.log("─".repeat(80));
    console.log("CLIENT");
    console.log("─".repeat(80));
    console.log(JSON.stringify(result.client, null, 2));

    console.log("\n" + "─".repeat(80));
    console.log("SITE SCRAPE");
    console.log("─".repeat(80));
    console.log(`Business name (from <title>):   ${result.siteData?.businessName ?? "(none)"}`);
    console.log(`Schema plugin detected:         ${result.siteData?.detectedSchemaPlugin ?? "(none)"}`);
    console.log(`Headings found:                 ${result.siteData?.headings.length ?? 0}`);
    if (result.siteData?.headings.length) {
      console.log("  Sample H1/H2:", result.siteData.headings.slice(0, 5).join(" | "));
    }
    console.log(`Existing blog posts found:      ${result.siteData?.existingBlogPosts.length ?? 0}`);
    if (result.siteData?.existingBlogPosts.length) {
      result.siteData.existingBlogPosts.slice(0, 3).forEach(p => console.log(`  - ${p.text.slice(0, 80)}`));
    }

    console.log("\n" + "─".repeat(80));
    console.log("GENERATED PROGRAM (raw, before uniqueness filter)");
    console.log("─".repeat(80));
    if (result.program) {
      console.log(`PILLAR (longform):`);
      console.log(`  Title:    ${result.program.pillar.title}`);
      console.log(`  Slug:     ${result.program.pillar.slug}`);
      console.log(`  Summary:  ${result.program.pillar.topicSummary}`);
      console.log(`  Format:   ${result.program.pillar.format}`);
      console.log(`  Keyword:  ${result.program.pillar.primaryKeyword}`);
      console.log(`  Rationale: ${result.program.pillar.rationale}`);
      console.log(`\nSHORTS (${result.program.shorts.length} candidates):`);
      result.program.shorts.forEach((s, i) => {
        console.log(`  ${i + 1}. [${s.format}] ${s.title}  (kw: ${s.primaryKeyword})`);
      });
    }

    console.log("\n" + "─".repeat(80));
    console.log("AFTER CROSS-CLIENT UNIQUENESS FILTER");
    console.log("─".repeat(80));
    if (result.filteredProgram) {
      const rejected = (result.program?.shorts.length ?? 0) - result.filteredProgram.shorts.length;
      console.log(`Filtered shorts: ${result.filteredProgram.shorts.length} (${rejected} rejected as cross-client duplicates)`);
    }

    console.log(`\n[CLI] Dry run complete in ${Math.round((Date.now() - start) / 1000)}s. Nothing written to DB.`);
    process.exit(0);
  }

  // --confirm
  console.log(`\n[CLI] PRODUCTION RUN — orderId=${orderId}\n`);
  const result = await seedTopicsForOrder(orderId);

  if (result.failed) {
    console.error(`\n❌ FAILED: ${result.reason}\n`);
    process.exit(2);
  }

  console.log(`\n✓ Seeded successfully:`);
  console.log(`  Pillar topic ID:     ${result.pillarTopicId}`);
  console.log(`  Short topic IDs:     ${result.shortTopicIds.join(", ")} (${result.shortTopicIds.length} total)`);
  console.log(`  Reason flag:         ${result.reason ?? "(none)"}`);
  console.log(`\n[CLI] Run complete in ${Math.round((Date.now() - start) / 1000)}s.`);
  process.exit(0);
}

main().catch(err => {
  console.error("[CLI] Unhandled error:", err);
  process.exit(99);
});
