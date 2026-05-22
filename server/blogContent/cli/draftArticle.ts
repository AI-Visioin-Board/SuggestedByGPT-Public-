#!/usr/bin/env tsx
/**
 * CLI runner for drafting a single article (longform OR short).
 *
 * Modes:
 *   --dryRun   — runs all generation layers, returns the draft, NO DB writes
 *   --confirm  — full production flow: requires order + config + topic exist
 *
 * Usage:
 *   pnpm tsx server/blogContent/cli/draftArticle.ts --topicId 1 --orderId 5 --clientId 4 --kind longform --dryRun
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md Modules 4 + 5.
 */

import { dryRunLongformArticle, writeLongformArticle } from "../longformWriter";
import { dryRunShortArticle, writeShortArticle } from "../shortWriter";

function arg(name: string, fallback: string | null = null): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const topicId = parseInt(arg("topicId") ?? "0", 10);
  const orderId = parseInt(arg("orderId") ?? "0", 10);
  const clientId = parseInt(arg("clientId") ?? "0", 10);
  const configId = parseInt(arg("configId") ?? "0", 10);
  const kind = (arg("kind") ?? "").toLowerCase();
  const dryRun = hasFlag("dryRun");
  const confirm = hasFlag("confirm");

  if (!topicId || !orderId || !clientId) {
    console.error("ERROR: --topicId, --orderId, --clientId are required");
    process.exit(1);
  }
  if (kind !== "longform" && kind !== "short") {
    console.error("ERROR: --kind must be 'longform' or 'short'");
    process.exit(1);
  }
  if (!dryRun && !confirm) {
    console.error("ERROR: must pass --dryRun or --confirm");
    process.exit(1);
  }
  if (dryRun && confirm) {
    console.error("ERROR: pass --dryRun OR --confirm, not both");
    process.exit(1);
  }

  const start = Date.now();

  if (dryRun) {
    console.log(`\n[CLI] DRY RUN — kind=${kind} topicId=${topicId} clientId=${clientId}\n`);
    const fn = kind === "longform" ? dryRunLongformArticle : dryRunShortArticle;
    const result = await fn({ topicId, orderId, clientId, configId, kind: kind as "longform" | "short" });

    if (result.failed) {
      console.error(`\n❌ FAILED: ${result.reason}\n`);
      process.exit(2);
    }

    console.log("─".repeat(80));
    console.log("DRAFT OUTPUT");
    console.log("─".repeat(80));
    console.log(`Title:             ${result.title}`);
    console.log(`Meta title:        ${result.metaTitle}`);
    console.log(`Meta description:  ${result.metaDescription}`);
    console.log(`Word count:        ${result.wordCount}`);
    console.log(`Schema JSON-LD:    ${(result.schemaJsonLd ?? "").length} chars`);

    console.log("\n" + "─".repeat(80));
    console.log("GENERATION STATS");
    console.log("─".repeat(80));
    if (result.stats) {
      console.log(`Layer 1 (generate)             : ${result.stats.layer1_words} words written`);
      console.log(`Layer 2 (extract claims)       : ${result.stats.layer2_claims_found} claims identified`);
      console.log(`Layer 3 (research)             : ${result.stats.layer3_research_calls} web_search calls, ${result.stats.layer3_contradicted} contradicted`);
      console.log(`Layer 4 (rewrite)              : ${result.stats.layer4_rewrites} rewrites applied`);
      console.log(`Layer 5 (quality gates)        : ${result.stats.layer5_quality_pass ? "PASS" : "FAIL"}`);
      console.log(`Total cost                     : $${result.stats.totalCostUsd.toFixed(4)}`);
      console.log(`Total latency                  : ${result.stats.totalLatencyMs}ms`);
    }

    if (result.qualityGate && !result.qualityGate.passed) {
      console.log("\n" + "─".repeat(80));
      console.log("❌ QUALITY GATE FAILURES");
      console.log("─".repeat(80));
      result.qualityGate.failureReasons.forEach(r => console.log(`  - ${r}`));
    }

    console.log("\n" + "─".repeat(80));
    console.log("ARTICLE BODY (first 1500 chars)");
    console.log("─".repeat(80));
    console.log(result.draftedMarkdown?.slice(0, 1500) ?? "(empty)");
    if ((result.draftedMarkdown?.length ?? 0) > 1500) {
      console.log(`\n... [${(result.draftedMarkdown?.length ?? 0) - 1500} more chars in full article]`);
    }

    console.log(`\n[CLI] Dry run complete in ${Math.round((Date.now() - start) / 1000)}s. Nothing written to DB.`);
    process.exit(0);
  }

  // --confirm path
  if (!configId) {
    console.error("ERROR: --configId required in --confirm mode");
    process.exit(1);
  }
  console.log(`\n[CLI] PRODUCTION RUN — kind=${kind} topicId=${topicId}\n`);
  const fn = kind === "longform" ? writeLongformArticle : writeShortArticle;
  const post = await fn({ topicId, orderId, clientId, configId, kind: kind as "longform" | "short" });
  if (!post) {
    console.error("\n❌ Generation failed (quality gate or layer failure). See logs.");
    process.exit(2);
  }
  console.log(`\n✓ Article generated:`);
  console.log(`  ID:            ${post.id}`);
  console.log(`  Title:         ${post.title}`);
  console.log(`  Slug:          ${post.slug}`);
  console.log(`  Word count:    ${post.wordCount}`);
  console.log(`  Status:        ${post.status}`);
  console.log(`\n[CLI] Run complete in ${Math.round((Date.now() - start) / 1000)}s.`);
  process.exit(0);
}

main().catch(err => {
  console.error("[CLI] Unhandled error:", err);
  process.exit(99);
});
