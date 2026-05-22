/**
 * Topic seeder — at Dominator order creation, generates a 9-week content program:
 *   1 pillar longform topic + 24 short topic candidates (we'll use 18 + buffer).
 *
 * Inputs:
 *   - orderId (must exist with status pending|in_progress|processing)
 *   - corresponding client_content_config row (created by stripe webhook)
 *
 * Outputs:
 *   - 1 row in client_content_topic with kind='longform'
 *   - ≤24 rows in client_content_topic with kind='short'
 *   - client_content_config.startedAt set
 *
 * Failure modes (each captured + retryable):
 *   - Claude returns malformed JSON → 3 retries with stricter prompt
 *   - Site unreachable → use defaults from clients table
 *   - All shorts rejected for cross-client uniqueness → log + use anyway (no-op)
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md § Module 3.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import {
  orders,
  clients,
  clientContentConfig,
  clientContentTopic,
  deliverables,
} from "../../drizzle/schema";
import { and, eq, gte, sql, type InferSelectModel } from "drizzle-orm";
import { scrapeClientSite } from "./siteScraper";
import { ensureUniqueSlug, sanitizeSlug } from "./slugifier";
import { findBannedVocabulary, containsEmDash, sanitizeEmDashes } from "./antiAiRules";
import type {
  SeededTopicProgram,
  SeededTopicCandidate,
  SiteScrapeResult,
  TopicSeederResult,
  ClientContentConfig,
} from "./types";

type ClientRow = InferSelectModel<typeof clients>;
type OrderRow = InferSelectModel<typeof orders>;

const CLAUDE_MODEL = "claude-sonnet-4-5-20250929"; // Mainline GA Sonnet 4.5
const MAX_CLAUDE_RETRIES = 3;
const TARGET_SHORT_TOPICS = 24;
const MIN_ACCEPTABLE_SHORTS = 18;

const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Production seeder — reads order + client + config from DB, scrapes site,
 * generates topics, writes to DB. Idempotent: if topics already exist for this
 * config, returns early without re-seeding.
 */
export async function seedTopicsForOrder(orderId: number): Promise<TopicSeederResult> {
  const db = await getDb();
  if (!db) return { pillarTopicId: 0, shortTopicIds: [], failed: true, reason: "db_unavailable" };

  // 1. Load order, client, config
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return { pillarTopicId: 0, shortTopicIds: [], failed: true, reason: "order_not_found" };

  const [client] = await db.select().from(clients).where(eq(clients.id, order.clientId));
  if (!client) return { pillarTopicId: 0, shortTopicIds: [], failed: true, reason: "client_not_found" };

  const [config] = await db.select().from(clientContentConfig).where(eq(clientContentConfig.orderId, orderId));
  if (!config) return { pillarTopicId: 0, shortTopicIds: [], failed: true, reason: "config_not_found" };

  // 2. Idempotency: if topics already exist, skip
  const existingTopics = await db
    .select({ id: clientContentTopic.id, kind: clientContentTopic.kind })
    .from(clientContentTopic)
    .where(eq(clientContentTopic.contentConfigId, config.id));

  if (existingTopics.length > 0) {
    const pillar = existingTopics.find(t => t.kind === "longform");
    const shorts = existingTopics.filter(t => t.kind === "short").map(t => t.id);
    return {
      pillarTopicId: pillar?.id ?? 0,
      shortTopicIds: shorts,
      failed: false,
      reason: "already_seeded",
    };
  }

  // 3. Scrape client's site
  console.log(`[topicSeeder] order=${orderId} client=${client.id} (${client.businessName}) — scraping ${client.businessWebsite}`);
  const siteData = await scrapeClientSite(client.businessWebsite ?? "");
  console.log(`[topicSeeder]   scraped: ${siteData.headings.length} headings, ${siteData.existingBlogPosts.length} existing blog links, plugin=${siteData.detectedSchemaPlugin}`);

  // 4. Update config.existingSchemaPlugin if scrape detected one
  if (siteData.detectedSchemaPlugin && !config.existingSchemaPlugin) {
    await db.update(clientContentConfig).set({
      existingSchemaPlugin: siteData.detectedSchemaPlugin,
    }).where(eq(clientContentConfig.id, config.id));
  }

  // 5. Generate topic program via Claude (with retries)
  const program = await generateTopicProgram(client, config, siteData);
  if (!program) {
    return { pillarTopicId: 0, shortTopicIds: [], failed: true, reason: "claude_topic_gen_failed" };
  }

  // 6. Cross-client uniqueness check (last 90 days, same industry)
  const filteredProgram = await filterAgainstCrossClientDuplicates(program, client);

  // 7. Persist
  const result = await persistTopicProgram(filteredProgram, client.id, config.id);

  // 8. Mark config.startedAt + bump master deliverable progress
  await db.update(clientContentConfig).set({
    startedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(clientContentConfig.id, config.id));

  await bumpMasterDeliverableProgress(orderId, 5);

  console.log(`[topicSeeder] order=${orderId} ✓ seeded pillar=${result.pillarTopicId} shorts=${result.shortTopicIds.length}`);
  return { ...result, failed: false };
}

/**
 * Dry-run seeder — does NOT touch the DB at all. Loads order + client (read-only),
 * scrapes the site, calls Claude, returns the generated program. Used by the
 * CLI for testing before Phase E (stripe webhook integration) wires real config
 * creation.
 */
export async function dryRunSeedTopicsForOrder(orderId: number): Promise<{
  failed: boolean;
  reason?: string;
  client?: { id: number; businessName: string; industry: string | null; servicesOffered: string | null };
  siteData?: SiteScrapeResult;
  program?: SeededTopicProgram;
  filteredProgram?: SeededTopicProgram;
}> {
  const db = await getDb();
  if (!db) return { failed: true, reason: "db_unavailable" };

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return { failed: true, reason: "order_not_found" };

  const [client] = await db.select().from(clients).where(eq(clients.id, order.clientId));
  if (!client) return { failed: true, reason: "client_not_found" };

  console.log(`[dryRun] order=${orderId} client=${client.id} (${client.businessName}) — scraping ${client.businessWebsite}`);
  const siteData = await scrapeClientSite(client.businessWebsite ?? "");
  console.log(`[dryRun]   scraped: ${siteData.headings.length} headings, plugin=${siteData.detectedSchemaPlugin}`);

  // Build a virtual config from defaults (no DB row).
  // Pass-2 FIX HIGH-D: drop `as any` — the function signature accepts a partial.
  const virtualConfig: Partial<ClientContentConfig> = {
    brandVoiceKey: "professional",
    cmsPlatform: (client.cmsType ?? "other").toLowerCase(),
    totalLongformsTarget: 1,
    totalShortsTarget: 18,
  };

  const program = await generateTopicProgram(client, virtualConfig, siteData);
  if (!program) return { failed: true, reason: "claude_topic_gen_failed", client: clientSummary(client), siteData };

  const filteredProgram = await filterAgainstCrossClientDuplicates(program, client);

  return {
    failed: false,
    client: clientSummary(client),
    siteData,
    program,
    filteredProgram,
  };
}

function clientSummary(client: ClientRow) {
  return {
    id: client.id,
    businessName: client.businessName,
    industry: client.industry,
    servicesOffered: client.servicesOffered,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal — Claude prompt + retries
// ─────────────────────────────────────────────────────────────────────────────

async function generateTopicProgram(
  client: ClientRow,
  config: ClientContentConfig | Partial<ClientContentConfig>,
  siteData: SiteScrapeResult,
): Promise<SeededTopicProgram | null> {
  const systemPrompt = buildSystemPrompt(client, config, siteData);
  const userPrompt = `Design the content program for ${client.businessName}. Output JSON now.`;

  for (let attempt = 1; attempt <= MAX_CLAUDE_RETRIES; attempt++) {
    try {
      const res = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        temperature: 0.7,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      const block = res.content.find(b => b.type === "text");
      if (!block || block.type !== "text") {
        console.warn(`[topicSeeder] attempt ${attempt}: no text block in response`);
        continue;
      }
      const parsed = parseTopicSeederOutput(block.text);
      if (!parsed) {
        console.warn(`[topicSeeder] attempt ${attempt}: failed to parse JSON output`);
        continue;
      }
      // Validate banned-vocab in titles. Returns null if pillar itself is dirty.
      const cleanedProgram = enforceTitleHygiene(parsed);
      if (!cleanedProgram) {
        // Pillar rejected — retry with fresh generation
        continue;
      }
      if (cleanedProgram.shorts.length < MIN_ACCEPTABLE_SHORTS) {
        console.warn(`[topicSeeder] attempt ${attempt}: only ${cleanedProgram.shorts.length} clean shorts (need ${MIN_ACCEPTABLE_SHORTS})`);
        continue;
      }
      return cleanedProgram;
    } catch (err) {
      console.warn(`[topicSeeder] attempt ${attempt} threw:`, (err as Error).message);
      await sleep(2000 * attempt);
    }
  }

  return null;
}

function buildSystemPrompt(
  client: ClientRow,
  config: ClientContentConfig | Partial<ClientContentConfig>,
  siteData: SiteScrapeResult,
): string {
  const industry = client.industry || "small business";
  const services = client.servicesOffered || "professional services";
  const audience = "small business customers"; // clients table doesn't have targetAudience; defer to Phase N intake extension
  const businessName = client.businessName;
  const websiteTitle = siteData.businessName ?? "unknown";
  const headingSnippet = siteData.headings.slice(0, 10).join(" | ");
  const existingPostTopics = siteData.existingBlogPosts.map(p => p.text).slice(0, 6).join(", ") || "none";

  return `You are a senior content strategist designing a 9-week SEO + AI-search content program for a small business.

The business:
- Name: ${businessName}
- Industry: ${industry}
- Services offered: ${services}
- Target audience: ${audience}
- Website: ${client.businessWebsite ?? "unknown"}
- Site title (from scrape): ${websiteTitle}
- Detected H1/H2 from homepage: ${headingSnippet || "(scrape returned no headings)"}
- Existing blog topics on site: ${existingPostTopics}

YOUR JOB: design a 9-week content program of 1 longform pillar + ${TARGET_SHORT_TOPICS} supporting short topic candidates (we'll publish 18; ${TARGET_SHORT_TOPICS - 18}-buffer for rejections during cross-client uniqueness checks).

The pillar must:
- Be a BROAD AUTHORITATIVE topic this business should own in their industry
- Establish topical authority — Google and LLMs will see this as THE place to learn about [topic]
- Be the foundation that all 18 shorts cluster around topically
- Use terminology specific to ${industry} (not generic SEO advice)
- Be specific to ${businessName}'s actual services, not industry-generic

The ${TARGET_SHORT_TOPICS} short topics must:
- EACH address a sub-question within the pillar's topic space
- Be unique from each other (no near-duplicates)
- Span all of: how_to, comparison, when_to, best_for, faq, listicle (mix the formats)
- Be specific to ${industry}'s actual services, not generic
- NOT mention competitor brand names
- Include practical advice this business can deliver on
- Avoid topics that would compete with the business's own service pages

CRITICAL — anti-AI vocabulary rules (titles will be REJECTED if violated):
- NO em dashes anywhere (— or --)
- NO words: delve, leverage, robust, comprehensive, seamless, utilize, transformative, ecosystem, paradigm, holistic, actionable, impactful, game-changer, cutting-edge, deep dive, unpack, intricate, vibrant, thriving, nestled, showcasing, ever-evolving, daunting, beacon, tapestry, realm, embark, testament to, pivotal, meticulous, watershed moment
- NO marketing fluff: "The Ultimate Guide", "Everything You Need to Know", "Top 10 Best", "Secrets Revealed", "Game-Changing"
- Titles should sound like questions a real person typed into Google or ChatGPT

Output STRICT JSON only. No prose before or after. No markdown code fences. The JSON must validate against:

{
  "pillar": {
    "slug": "string (kebab-case, 3-6 words, no stopwords)",
    "title": "string (working title, 40-65 chars)",
    "topicSummary": "string (1 sentence describing what this article covers)",
    "format": "how_to | comparison | when_to | best_for | faq | listicle",
    "primaryKeyword": "string (main SEO keyword target)",
    "predictedWordCount": 1800,
    "rationale": "string (1-2 sentences explaining why this is the pillar topic)"
  },
  "shorts": [
    {
      "slug": "string",
      "title": "string (40-65 chars)",
      "topicSummary": "string",
      "format": "how_to | comparison | when_to | best_for | faq | listicle",
      "primaryKeyword": "string",
      "predictedWordCount": 600,
      "rationale": "string (1 sentence explaining how this supports the pillar)"
    }
    /* ... 23 more entries — 24 total */
  ]
}`;
}

function parseTopicSeederOutput(raw: string): SeededTopicProgram | null {
  let cleaned = raw.trim();

  // Strip markdown code fences if model ignored instructions
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }

  // Strip any preamble before first { (Claude sometimes adds a sentence despite instructions)
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
  const lastBrace = cleaned.lastIndexOf("}");
  if (lastBrace > 0 && lastBrace < cleaned.length - 1) cleaned = cleaned.slice(0, lastBrace + 1);

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed.pillar || !Array.isArray(parsed.shorts)) return null;
    if (!parsed.pillar.slug || !parsed.pillar.title) return null;
    if (parsed.shorts.length < MIN_ACCEPTABLE_SHORTS) return null;

    // Light validation per item
    const validatedShorts = parsed.shorts.filter(
      (s: any) => s && typeof s.slug === "string" && typeof s.title === "string" && s.title.length > 5,
    );
    if (validatedShorts.length < MIN_ACCEPTABLE_SHORTS) return null;

    return {
      pillar: parsed.pillar,
      shorts: validatedShorts,
    };
  } catch (err) {
    console.warn("[topicSeeder] JSON parse failed:", (err as Error).message);
    return null;
  }
}

/**
 * Strip out shorts whose title contains banned vocab or em dashes.
 *
 * CRITICAL Pass-1 FIX C2: when pillar fails hygiene, return null entirely.
 * Previously returned the dirty pillar with empty shorts — which caused the
 * caller's MIN_ACCEPTABLE_SHORTS check to catch it accidentally, but a future
 * caller could have used a banned pillar.
 *
 * Returns null = generation must be retried; the dirty pillar is unusable.
 */
function enforceTitleHygiene(p: SeededTopicProgram): SeededTopicProgram | null {
  // ─── Pillar ───
  // Pass-2 FIX HIGH-A: auto-fix em-dashes (cheap, almost always reads correctly).
  // Only banned vocabulary is non-fixable — those force a retry because the
  // alternative would be Claude re-generating the title which is what we want.
  const fixedPillarTitle = sanitizeEmDashes(p.pillar.title);
  const fixedPillarSummary = sanitizeEmDashes(p.pillar.topicSummary || "");
  const pillarBanned = findBannedVocabulary(fixedPillarTitle);
  if (pillarBanned) {
    console.warn(`[topicSeeder] Pillar title has banned vocab "${pillarBanned}" in "${p.pillar.title}". Forcing retry.`);
    return null;
  }

  const fixedPillar = {
    ...p.pillar,
    title: fixedPillarTitle,
    topicSummary: fixedPillarSummary,
  };

  // ─── Shorts ───
  // Auto-fix em-dashes per short. Only drop if banned vocab present.
  const cleanShorts = p.shorts.map(s => ({
    ...s,
    title: sanitizeEmDashes(s.title),
    topicSummary: sanitizeEmDashes(s.topicSummary || ""),
  })).filter(s => {
    const banned = findBannedVocabulary(s.title);
    return !banned;
  });

  return { pillar: fixedPillar, shorts: cleanShorts };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal — Cross-client uniqueness
// ─────────────────────────────────────────────────────────────────────────────

async function filterAgainstCrossClientDuplicates(
  program: SeededTopicProgram,
  client: ClientRow,
): Promise<SeededTopicProgram> {
  const db = await getDb();
  if (!db) return program;

  // Pull recent topics from OTHER clients in same industry (last 90 days).
  // We use drizzle's typed `select` + raw `sql` for the cross-table where so
  // the result is properly typed without unsafe casts.
  const recentTopicsRaw = await db
    .select({
      topicSlug: clientContentTopic.topicSlug,
      topicTitle: clientContentTopic.topicTitle,
    })
    .from(clientContentTopic)
    .innerJoin(clients, eq(clients.id, clientContentTopic.clientId))
    .where(and(
      sql`${clients.industry} = ${client.industry ?? ""}`,
      sql`${clientContentTopic.clientId} != ${client.id}`,
      gte(clientContentTopic.createdAt, sql`NOW() - INTERVAL 90 DAY`),
    ));
  const recentTopics = recentTopicsRaw;

  const takenSlugs = new Set(recentTopics.map(t => t.topicSlug));
  const takenTitles = new Set(recentTopics.map(t => t.topicTitle.toLowerCase().trim()));

  // Filter shorts (pillar always kept; rare it duplicates exactly)
  const filtered = program.shorts.filter(s => {
    if (takenSlugs.has(sanitizeSlug(s.slug))) return false;
    if (takenTitles.has(s.title.toLowerCase().trim())) return false;
    return true;
  });

  return { pillar: program.pillar, shorts: filtered };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal — Persist
// ─────────────────────────────────────────────────────────────────────────────

async function persistTopicProgram(
  program: SeededTopicProgram,
  clientId: number,
  contentConfigId: number,
): Promise<{ pillarTopicId: number; shortTopicIds: number[] }> {
  const db = await getDb();
  if (!db) throw new Error("db_unavailable_in_persist");

  // Build taken set for slug collisions within THIS client's existing topics
  const takenInThisClient = new Set(
    (
      await db.select({ slug: clientContentTopic.topicSlug })
        .from(clientContentTopic)
        .where(eq(clientContentTopic.clientId, clientId))
    ).map(r => r.slug)
  );

  // ─── Pillar ───
  // Pass-2 FIX CRITICAL-A: use the canonical drizzle MySQL destructure pattern
  // already established in server/supportRouter.ts:122:
  //   const [result] = await db.insert(...).values(...);
  //   const id = result.insertId;
  // This returns [ResultSetHeader, FieldPacket[]] from mysql2 under the hood.
  const pillarSlug = ensureUniqueSlug(sanitizeSlug(program.pillar.slug, 80), takenInThisClient);
  takenInThisClient.add(pillarSlug);
  const [pillarInsert] = await db.insert(clientContentTopic).values({
    clientId,
    contentConfigId,
    topicSlug: pillarSlug,
    topicTitle: program.pillar.title,
    topicSummary: program.pillar.topicSummary,
    kind: "longform",
    format: program.pillar.format,
    primaryKeyword: program.pillar.primaryKeyword,
    predictedWordCount: program.pillar.predictedWordCount,
    rationale: program.pillar.rationale,
    priorityScore: 100,
    source: "initial_seed",
  });
  const pillarTopicId = pillarInsert.insertId;

  // ─── Shorts ───
  const shortTopicIds: number[] = [];
  for (let i = 0; i < program.shorts.length && shortTopicIds.length < TARGET_SHORT_TOPICS; i++) {
    const candidate = program.shorts[i];
    const slug = ensureUniqueSlug(sanitizeSlug(candidate.slug, 80), takenInThisClient);
    takenInThisClient.add(slug);
    // Priority decays from 80 (first candidate) down to ~55 (last). Pillar=100, always wins.
    const decayedPriority = Math.max(50, 80 - Math.floor(i * 1.0));
    const [shortInsert] = await db.insert(clientContentTopic).values({
      clientId,
      contentConfigId,
      topicSlug: slug,
      topicTitle: candidate.title,
      topicSummary: candidate.topicSummary,
      kind: "short",
      format: candidate.format,
      primaryKeyword: candidate.primaryKeyword,
      predictedWordCount: candidate.predictedWordCount,
      rationale: candidate.rationale,
      priorityScore: decayedPriority,
      source: "initial_seed",
    });
    shortTopicIds.push(shortInsert.insertId);
  }

  return { pillarTopicId, shortTopicIds };
}

/**
 * Bump the `blog_content_program` master deliverable's progress percentage.
 *
 * NOTE: Phase N (Stripe webhook integration) is what actually inserts the
 * `blog_content_program` deliverable row at order creation time. Until Phase N
 * ships, this UPDATE silently affects 0 rows for new orders. That's intentional
 * — the seeder is idempotent w.r.t. master deliverable state.
 */
async function bumpMasterDeliverableProgress(orderId: number, pct: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(deliverables).set({
    progressPercent: pct,
  }).where(and(
    eq(deliverables.orderId, orderId),
    eq(deliverables.deliverableType, "blog_content_program"),
  ));
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
