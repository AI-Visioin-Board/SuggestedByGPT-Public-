/**
 * Long-form writer — 5-layer verification chain for ~1500-2200 word articles.
 *
 * Layers:
 *   1. Generate article (Sonnet 4.5)
 *   2. Extract verifiable claims (Haiku 4.5)
 *   3. Research claims via web_search (Sonnet 4.5 + tool use)
 *   4. Rewrite if any claims contradicted (Sonnet 4.5)
 *   5. Quality gates (pure regex/length validation)
 *
 * Returns a fully-prepared ClientBlogPost row inserted with status='ready_to_publish'
 * OR null if generation fails after retries.
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md Module 4.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import { ANTI_AI_RULES } from "./antiAiRules";
import {
  clients,
  clientBlogPost,
  clientContentTopic,
  clientContentConfig,
} from "../../drizzle/schema";
import { and, eq, type InferSelectModel } from "drizzle-orm";
import { runQualityGates, countWords } from "./qualityGates";
import { buildSchemaJsonLd } from "./schemaBuilder";
import {
  extractH1Title,
  extractLinks,
  generateMetaDescription,
  generateMetaTitle,
  renderMarkdownToHtml,
} from "./markdownRenderer";
import { generateUniqueArticleSlug } from "./slugifier";
import { fetchUnsplashImage, type UnsplashImage } from "./unsplashFetcher";
import type {
  ArticleDraftInput,
  ClientBlogPost,
  GenerationLayerStats,
  VerifiableClaim,
} from "./types";

type ClientRow = InferSelectModel<typeof clients>;
type TopicRow = InferSelectModel<typeof clientContentTopic>;
type ConfigRow = InferSelectModel<typeof clientContentConfig>;

const SONNET_MODEL = "claude-sonnet-4-5-20250929";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });

// Cost estimates (per 1M tokens)
const SONNET_INPUT_COST = 3 / 1_000_000;
const SONNET_OUTPUT_COST = 15 / 1_000_000;
const HAIKU_INPUT_COST = 1 / 1_000_000;
const HAIKU_OUTPUT_COST = 5 / 1_000_000;
const WEB_SEARCH_COST_PER_CALL = 0.01;

/**
 * Pick the featured image for an article based on the client's content config.
 * Respects `featuredImagePreference`: 'unsplash' | 'none' | 'custom_url'.
 * Returns null if the preference is 'none' or the lookup fails.
 */
async function pickFeaturedImage(
  config: ConfigRow,
  query: string,
): Promise<UnsplashImage | { url: string; attribution: string; id: string } | null> {
  const pref = (config.featuredImagePreference ?? "unsplash") as
    | "unsplash"
    | "none"
    | "custom_url";
  if (pref === "none") return null;
  if (pref === "custom_url") {
    const url = (config.featuredImageCustomUrl ?? "").trim();
    if (!url) return null;
    return { id: "", url, attribution: "" };
  }
  // Default: Unsplash
  return fetchUnsplashImage(query);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Production writer. Loads inputs from DB, runs the 5-layer chain, persists
 * the result with status='ready_to_publish' (or fails cleanly).
 */
export async function writeLongformArticle(input: ArticleDraftInput): Promise<ClientBlogPost | null> {
  const db = await getDb();
  if (!db) return null;

  const [topic] = await db.select().from(clientContentTopic).where(eq(clientContentTopic.id, input.topicId));
  if (!topic || topic.kind !== "longform") {
    console.warn(`[longformWriter] topic ${input.topicId} not found or wrong kind`);
    return null;
  }

  const [config] = await db.select().from(clientContentConfig).where(eq(clientContentConfig.id, input.configId));
  if (!config) {
    console.warn(`[longformWriter] config ${input.configId} not found`);
    return null;
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId));
  if (!client) {
    console.warn(`[longformWriter] client ${input.clientId} not found`);
    return null;
  }

  // Run the 5-layer chain
  const drafted = await draftLongformContent(topic, config, client);
  if (!drafted) return null;

  // Persist
  const slug = await generateUniqueArticleSlug(drafted.title, client.id);
  const bodyHtml = renderMarkdownToHtml(drafted.markdown);
  const wordCount = countWords(drafted.markdown);
  const metaTitle = generateMetaTitle(drafted.title, client.businessName);
  const metaDescription = generateMetaDescription(drafted.markdown);
  const { internal: internalLinks, external: externalCitations } = extractLinks(
    drafted.markdown,
    client.businessWebsite ?? undefined,
  );

  const schemaJsonLd = buildSchemaJsonLd({
    title: drafted.title,
    bodyMarkdown: drafted.markdown,
    publishedUrl: null,
    businessName: client.businessName,
    businessWebsite: client.businessWebsite,
    // CRITICAL Pass-1 FIX C2: proper cast to the narrow union (DB stores varchar(32))
    existingSchemaPlugin: (config.existingSchemaPlugin as "yoast" | "rankmath" | "aioseo" | null) ?? null,
    kind: "longform",
  });

  // ─── Featured image (Unsplash) ───
  // Honour the client's preference. Empty/missing key falls back to null —
  // publishers downstream cope with no image.
  const featuredImage = await pickFeaturedImage(config, topic.primaryKeyword ?? drafted.title);

  const [insertResult] = await db.insert(clientBlogPost).values({
    orderId: input.orderId,
    clientId: input.clientId,
    contentConfigId: input.configId,
    topicId: input.topicId,
    kind: "longform",
    slug,
    title: drafted.title,
    metaTitle,
    metaDescription,
    bodyMarkdown: drafted.markdown,
    bodyHtml,
    schemaJsonLd,
    wordCount,
    featuredImageUrl: featuredImage?.url ?? null,
    featuredImageAttribution: featuredImage?.attribution ?? null,
    internalLinksUsed: internalLinks,
    externalCitations,
    verifiableClaimsAudit: drafted.claims,
    generationLayers: drafted.stats,
    qualityGateResult: drafted.qualityGate,
    status: "ready_to_publish",
    generatedCostUsd: drafted.stats.totalCostUsd.toFixed(4),
  });
  const blogPostId = insertResult.insertId;

  // Mark topic as consumed
  await db.update(clientContentTopic).set({
    consumedAt: new Date(),
    blogPostId,
  }).where(eq(clientContentTopic.id, input.topicId));

  const [post] = await db.select().from(clientBlogPost).where(eq(clientBlogPost.id, blogPostId));
  return post as unknown as ClientBlogPost;
}

/**
 * Dry-run variant: produces the draft but does NOT touch the DB.
 * Used by CLI for Phase C testing.
 */
export async function dryRunLongformArticle(input: ArticleDraftInput): Promise<{
  failed: boolean;
  reason?: string;
  draftedMarkdown?: string;
  title?: string;
  slug?: string;
  metaTitle?: string;
  metaDescription?: string;
  wordCount?: number;
  schemaJsonLd?: string;
  stats?: GenerationLayerStats;
  claims?: VerifiableClaim[];
  qualityGate?: { passed: boolean; failureReasons: string[] };
}> {
  const db = await getDb();
  if (!db) return { failed: true, reason: "db_unavailable" };

  const [topic] = await db.select().from(clientContentTopic).where(eq(clientContentTopic.id, input.topicId));
  if (!topic) return { failed: true, reason: "topic_not_found" };

  const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId));
  if (!client) return { failed: true, reason: "client_not_found" };

  const config = input.configId
    ? (await db.select().from(clientContentConfig).where(eq(clientContentConfig.id, input.configId)))[0]
    : undefined;

  // Build virtual config for dry-run when no real config exists
  const effectiveConfig: ConfigRow = (config ?? {
    id: 0,
    orderId: input.orderId,
    clientId: input.clientId,
    cmsPlatform: (client.cmsType ?? "other").toLowerCase(),
    cmsAuthMethod: null,
    brandVoiceKey: "professional",
    brandVoiceCustom: null,
    internalLinkTargets: null,
    existingSchemaPlugin: null,
    featuredImagePreference: "unsplash",
    featuredImageCustomUrl: null,
    showcaseConsentAt: null,
    citationQueryBattery: [],
    publishCadenceKey: "dominator_default",
    longformDayOfWeek: 1,
    longformFrequency: "once_at_start",
    shortDaysOfWeek: [2, 4],
    publishHourUtc: 14,
    totalLongformsTarget: 1,
    totalShortsTarget: 18,
    startedAt: null,
    pausedAt: null,
    pauseReason: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as ConfigRow;

  const drafted = await draftLongformContent(topic, effectiveConfig, client);
  if (!drafted) return { failed: true, reason: "draft_failed" };

  const slug = "(dry-run: would slugify)";
  const metaTitle = generateMetaTitle(drafted.title, client.businessName);
  const metaDescription = generateMetaDescription(drafted.markdown);
  const wordCount = countWords(drafted.markdown);
  const schemaJsonLd = buildSchemaJsonLd({
    title: drafted.title,
    bodyMarkdown: drafted.markdown,
    publishedUrl: null,
    businessName: client.businessName,
    businessWebsite: client.businessWebsite,
    existingSchemaPlugin: (effectiveConfig.existingSchemaPlugin as "yoast" | "rankmath" | "aioseo" | null) ?? null,
    kind: "longform",
  });

  return {
    failed: false,
    draftedMarkdown: drafted.markdown,
    title: drafted.title,
    slug,
    metaTitle,
    metaDescription,
    wordCount,
    schemaJsonLd,
    stats: drafted.stats,
    claims: drafted.claims,
    qualityGate: drafted.qualityGate,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5-layer chain
// ─────────────────────────────────────────────────────────────────────────────

interface DraftResult {
  markdown: string;
  title: string;
  claims: VerifiableClaim[];
  stats: GenerationLayerStats;
  qualityGate: { passed: boolean; failureReasons: string[] };
}

async function draftLongformContent(
  topic: TopicRow,
  config: ConfigRow,
  client: ClientRow,
): Promise<DraftResult | null> {
  let stats: GenerationLayerStats = {
    layer1_words: 0,
    layer2_claims_found: 0,
    layer3_research_calls: 0,
    layer3_contradicted: 0,
    layer4_rewrites: 0,
    layer5_quality_pass: false,
    totalCostUsd: 0,
    totalLatencyMs: 0,
  };

  const t0 = Date.now();

  // ─── Layer 1: Generate ───
  const layer1 = await layer1Generate(topic, config, client);
  if (!layer1) return null;
  stats.layer1_words = countWords(layer1.markdown);
  stats.totalCostUsd += layer1.costUsd;
  console.log(`[longformWriter] L1 generated ${stats.layer1_words} words (cost=$${layer1.costUsd.toFixed(4)})`);

  // ─── Layer 2: Extract claims ───
  const layer2 = await layer2ExtractClaims(layer1.markdown);
  const claims = layer2?.claims ?? [];
  stats.layer2_claims_found = claims.length;
  stats.totalCostUsd += layer2?.costUsd ?? 0;
  console.log(`[longformWriter] L2 extracted ${claims.length} claims (cost=$${(layer2?.costUsd ?? 0).toFixed(4)})`);

  // ─── Layer 3: Research ───
  // Cost control: only research the TOP 10 most important verifiable claims.
  // Claude's web_search consumes 5-10k input tokens per call (search results
  // get fed back as context), so researching 47 claims (real measured count
  // from a 2781-word article) costs ~$4 instead of the planned $0.40.
  // Limit to 10 highest-priority verifiable claims — those most likely to be
  // specific, fact-checkable statistics or named studies.
  const MAX_CLAIMS_TO_RESEARCH = 10;
  const claimsToResearch = pickTopClaimsForResearch(claims, MAX_CLAIMS_TO_RESEARCH);
  const layer3 = await layer3ResearchClaims(claims, claimsToResearch);
  stats.layer3_research_calls = layer3.callsMade;
  stats.layer3_contradicted = layer3.contradictedCount;
  stats.totalCostUsd += layer3.costUsd;
  console.log(`[longformWriter] L3 researched ${layer3.callsMade}/${claimsToResearch.length} top claims (skipped ${claims.filter(c => c.needsResearch).length - claimsToResearch.length} other verifiable), ${layer3.contradictedCount} contradicted (cost=$${layer3.costUsd.toFixed(4)})`);

  // ─── Layer 4: Rewrite if needed ───
  let finalMarkdown = layer1.markdown;
  const layer4 = await layer4RewriteIfNeeded(layer1.markdown, layer3.researched);
  if (layer4) {
    finalMarkdown = layer4.markdown;
    stats.layer4_rewrites = layer4.rewriteCount;
    stats.totalCostUsd += layer4.costUsd;
    console.log(`[longformWriter] L4 rewrote ${layer4.rewriteCount} claims (cost=$${layer4.costUsd.toFixed(4)})`);
  }

  // ─── Layer 5: Quality gates ───
  const quality = runQualityGates(finalMarkdown, "longform");
  stats.layer5_quality_pass = quality.passed;
  stats.totalLatencyMs = Date.now() - t0;

  if (!quality.passed) {
    console.warn(`[longformWriter] L5 quality gate FAILED:`, quality.failureReasons.join("; "));
    return null;
  }

  console.log(`[longformWriter] L5 quality gate passed (total cost=$${stats.totalCostUsd.toFixed(4)}, latency=${stats.totalLatencyMs}ms)`);

  return {
    markdown: finalMarkdown,
    title: extractH1Title(finalMarkdown) || topic.topicTitle,
    claims: layer3.researched,
    stats,
    qualityGate: { passed: quality.passed, failureReasons: quality.failureReasons },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer implementations
// ─────────────────────────────────────────────────────────────────────────────

async function layer1Generate(
  topic: TopicRow,
  config: ConfigRow,
  client: ClientRow,
): Promise<{ markdown: string; costUsd: number } | null> {
  const systemPrompt = buildLongformSystemPrompt(topic, config, client);
  const userPrompt = `Write the article now. Topic: "${topic.topicTitle}". Output Markdown only, no preamble.`;

  try {
    const res = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 5000,  // Pass-1 FIX HIGH-1: ~2200 words target = ~3000 tokens; 5000 gives ~67% headroom
      temperature: 0.6,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = res.content.find(b => b.type === "text");
    if (!block || block.type !== "text") return null;
    const usage = res.usage;
    const cost = usage.input_tokens * SONNET_INPUT_COST + usage.output_tokens * SONNET_OUTPUT_COST;
    return { markdown: block.text, costUsd: cost };
  } catch (err) {
    console.warn("[longformWriter] L1 threw:", (err as Error).message);
    return null;
  }
}

function buildLongformSystemPrompt(topic: TopicRow, config: ConfigRow, client: ClientRow): string {
  const links = (config.internalLinkTargets as Array<{ url: string; pageTopic: string }> | null) ?? [];
  const linksList = links.length > 0
    ? links.map(l => `- ${l.url}  (${l.pageTopic})`).join("\n")
    : `- ${client.businessWebsite ?? "/"}  (homepage)`;

  const voicePrompt = config.brandVoiceCustom ?? VOICE_TEMPLATES[(config.brandVoiceKey ?? "professional") as keyof typeof VOICE_TEMPLATES];

  return `You are an expert content writer for ${client.businessName}, a ${client.industry ?? "small business"} that offers ${client.servicesOffered ?? "professional services"}.

Brand voice: ${voicePrompt}

Article requirements:
- Topic: "${topic.topicTitle}"
- Topic summary: ${topic.topicSummary ?? "(no summary; derive from topic title)"}
- Format: ${topic.format ?? "how_to"}
- Primary keyword: "${topic.primaryKeyword ?? topic.topicTitle}"
- TARGET WORD COUNT: 1500-2200 words. HARD CAP at 2200. Going over wastes the reader's time.
- 5-6 H2 sections, 2-3 H3 subsections under most H2s
- FAQ section at the end (use H2 "FAQ" with 5-7 ### Q-style sub-headings, will become FAQPage schema)
- LINKS — MANDATORY MARKDOWN FORMAT [anchor text](URL). Plain URLs or "(see: example.com)" do NOT count.
  - 2 to 3 internal links from this list (vary anchor text naturally):
${linksList}
  - 3 to 5 external citations to authoritative sources as [anchor](URL).
    Example: According to [Search Engine Land](https://searchengineland.com/article-slug)...
- Single H1 at the top matching the article title

${ANTI_AI_RULES}

When making factual claims:
- Be specific. "Studies show 47% improvement" beats "studies show improvement".
- Name the source when you can. "According to Search Engine Journal" beats "according to industry reports".
- If you're not sure of a fact, write it conservatively. "Some practitioners report..." beats "studies prove...".

Write the article as Markdown. H1 first, then sections. No preamble, no "Here's your article". Just the article.`;
}

const VOICE_TEMPLATES = {
  professional: "Direct, knowledgeable, no fluff. The voice of an experienced practitioner explaining their craft to a peer. First-person when natural. Occasional contractions. No corporate buzzwords.",
  friendly: "Warm and conversational, like a friend who happens to be an expert. Contractions everywhere. Personal anecdotes welcome. Still respects the reader's intelligence.",
  expert: "Authoritative and precise. Uses technical terminology accurately. Backs claims with specifics and sources. Voice of a thought leader publishing in their domain.",
  conversational: "Casual, almost spoken. Short sentences. Sentence fragments allowed. Real Reddit-but-cleaner energy.",
  custom: "",
};

// ─── Layer 2: Extract verifiable claims ───

async function layer2ExtractClaims(markdown: string): Promise<{ claims: VerifiableClaim[]; costUsd: number } | null> {
  const systemPrompt = `You audit articles for verifiable factual claims. Identify every claim that could be fact-checked.

For each claim, categorize:
- "common-knowledge": widely known facts that don't need verification (e.g., "Google uses backlinks as a ranking signal")
- "verifiable": specific claims that need verification (statistics, dates, named studies, expert quotes, specific events, "X% of Y", "the [year] study by Z")
- "uncertain": vague claims that should probably be softened or removed ("studies show", "many experts agree" without specifics)

Set needsResearch=true for "verifiable" claims only. Set needsResearch=false otherwise.

Output STRICT JSON array. No prose.`;

  const userPrompt = `Audit this article for verifiable claims:

${markdown}

Output JSON array now.`;

  try {
    const res = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 4000,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = res.content.find(b => b.type === "text");
    if (!block || block.type !== "text") return null;
    let txt = block.text.trim();
    if (txt.startsWith("```")) txt = txt.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const firstBracket = txt.indexOf("[");
    if (firstBracket > 0) txt = txt.slice(firstBracket);
    const lastBracket = txt.lastIndexOf("]");
    if (lastBracket > 0 && lastBracket < txt.length - 1) txt = txt.slice(0, lastBracket + 1);

    const claims = JSON.parse(txt) as VerifiableClaim[];
    if (!Array.isArray(claims)) return null;

    const usage = res.usage;
    const cost = usage.input_tokens * HAIKU_INPUT_COST + usage.output_tokens * HAIKU_OUTPUT_COST;
    return { claims, costUsd: cost };
  } catch (err) {
    console.warn(`[longformWriter] L2 PARSE FAILED on ${markdown.length}-char article — claims=[] for verification; downstream Layer 3 will skip. Error:`, (err as Error).message);
    return { claims: [], costUsd: 0 };
  }
}

// ─── Layer 3 helper: pick top claims by importance ───
//
// Prioritize claims most worth web-researching:
//   1. Specific statistics ("47% of...", percentages, dollar amounts)
//   2. Named studies / publications ("according to X")
//   3. Specific dates (post-2020)
//
// Caps at maxToResearch. Other verifiable claims get researchResult='skipped'.
function pickTopClaimsForResearch(claims: VerifiableClaim[], maxToResearch: number): VerifiableClaim[] {
  const verifiable = claims.filter(c => c.needsResearch);
  if (verifiable.length <= maxToResearch) return verifiable;

  const scored = verifiable.map(c => {
    let score = 0;
    if (/\d+\s*%/.test(c.claim)) score += 3;
    if (/\$\s*[\d,]+/.test(c.claim)) score += 3;
    if (/\b(20[12]\d|19\d\d)\b/.test(c.claim)) score += 2;
    if (/\baccording to\b/i.test(c.claim)) score += 2;
    if (/\bstudy|research|report|survey\b/i.test(c.claim)) score += 2;
    if (/\bX percent\b|\bsignificant\b/i.test(c.claim)) score -= 1;
    return { claim: c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxToResearch).map(s => s.claim);
}

// ─── Layer 3: Research claims via web_search ───
//
// Uses HAIKU 4.5 (4-5x cheaper than Sonnet) for verification calls.
// Verification doesn't need Sonnet's full reasoning — it just needs to read
// search results and classify the claim. Haiku handles this well.
async function layer3ResearchClaims(
  allClaims: VerifiableClaim[],
  claimsToResearch: VerifiableClaim[],
): Promise<{
  researched: VerifiableClaim[];
  callsMade: number;
  contradictedCount: number;
  costUsd: number;
}> {
  const researched: VerifiableClaim[] = [];
  let callsMade = 0;
  let contradicted = 0;
  let totalCost = 0;
  const toResearchSet = new Set(claimsToResearch.map(c => c.claim));

  for (const claim of allClaims) {
    if (!claim.needsResearch || !toResearchSet.has(claim.claim)) {
      researched.push({ ...claim, researchResult: "skipped" });
      continue;
    }

    try {
      const res = await anthropic.messages.create({
        model: HAIKU_MODEL,
        max_tokens: 800,
        temperature: 0.1,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }],
        system: `You verify factual claims by web search. Given a claim, search the web ONCE and determine if it is:
- "confirmed": supported by at least one authoritative source
- "contradicted": authoritative sources clearly contradict the claim
- "inconclusive": searches returned irrelevant or conflicting results

Output STRICT JSON on the final turn: { "result": "confirmed|contradicted|inconclusive", "source": "URL or null", "evidence": "1-sentence quote" }`,
        messages: [{ role: "user", content: `Verify this claim: "${claim.claim}"` }],
      });
      callsMade++;

      const usage = res.usage;
      totalCost += usage.input_tokens * HAIKU_INPUT_COST + usage.output_tokens * HAIKU_OUTPUT_COST + WEB_SEARCH_COST_PER_CALL;

      const textBlocks = res.content.filter(b => b.type === "text");
      const finalText = textBlocks.length > 0 ? (textBlocks[textBlocks.length - 1] as { text: string }).text.trim() : "";

      let parsed: { result?: string; source?: string } = {};
      if (finalText) {
        let txt = finalText;
        if (txt.startsWith("```")) txt = txt.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
        const firstBrace = txt.indexOf("{");
        if (firstBrace > 0) txt = txt.slice(firstBrace);
        try {
          parsed = JSON.parse(txt);
        } catch {
          // Inconclusive: model didn't return JSON
        }
      }

      const result = (parsed.result === "confirmed" || parsed.result === "contradicted")
        ? parsed.result
        : "inconclusive";

      if (result === "contradicted") contradicted++;
      researched.push({
        ...claim,
        researchResult: result,
        source: parsed.source ?? undefined,
      });
    } catch (err) {
      console.warn(`[longformWriter] L3 research failed for "${claim.claim.slice(0, 50)}":`, (err as Error).message);
      researched.push({ ...claim, researchResult: "inconclusive" });
    }
  }

  return { researched, callsMade, contradictedCount: contradicted, costUsd: totalCost };
}

// ─── Layer 4: Rewrite contradicted claims ───

async function layer4RewriteIfNeeded(
  markdown: string,
  claims: VerifiableClaim[],
): Promise<{ markdown: string; rewriteCount: number; costUsd: number } | null> {
  const problematic = claims.filter(c => c.researchResult === "contradicted" || c.researchResult === "inconclusive");
  if (problematic.length === 0) return null;

  const systemPrompt = `You revise articles to fix problematic claims. For each claim listed below, either:
(a) Replace with a verified alternative if you can identify one safely
(b) Soften the language (e.g., "Some practitioners suggest..." instead of "Studies prove...")
(c) Remove the claim entirely if it cannot be saved

Preserve everything else about the article. Same length, same structure, same voice. Only change the listed claims.

Output the FULL revised article as Markdown. No preamble.`;

  const claimList = problematic.map(c => `- "${c.claim}" (result: ${c.researchResult}${c.source ? `, source: ${c.source}` : ""})`).join("\n");

  try {
    const res = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 8000,
      temperature: 0.4,
      system: systemPrompt,
      messages: [
        { role: "user", content: `Original article:\n\n${markdown}\n\nProblematic claims to fix:\n${claimList}\n\nOutput the revised article in full.` },
      ],
    });
    const block = res.content.find(b => b.type === "text");
    if (!block || block.type !== "text") return null;
    const usage = res.usage;
    const cost = usage.input_tokens * SONNET_INPUT_COST + usage.output_tokens * SONNET_OUTPUT_COST;
    return { markdown: block.text, rewriteCount: problematic.length, costUsd: cost };
  } catch (err) {
    console.warn("[longformWriter] L4 failed:", (err as Error).message);
    return null;
  }
}
