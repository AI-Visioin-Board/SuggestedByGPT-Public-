/**
 * Short writer — 3-layer verification chain for ~400-800 word articles.
 *
 * Lighter than longform:
 *   - No FAQ section (no FAQPage schema)
 *   - 1 internal link (vs 2-3)
 *   - 1-2 external citations (vs 3-5)
 *   - Skips Layer 3 (web_search) UNLESS topic indicates current-events
 *     (title or summary contains "2026", "latest", "new", "this year", etc.)
 *   - Layer 2 still extracts claims; Layer 4 only fires for contradicted
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md Module 5.
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

const SONNET_INPUT_COST = 3 / 1_000_000;
const SONNET_OUTPUT_COST = 15 / 1_000_000;
const HAIKU_INPUT_COST = 1 / 1_000_000;
const HAIKU_OUTPUT_COST = 5 / 1_000_000;

const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });

/**
 * Pick the featured image for a short article based on the client's config.
 * Mirrors the longform pickFeaturedImage helper.
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
  return fetchUnsplashImage(query);
}

const VOICE_TEMPLATES = {
  professional: "Direct, knowledgeable, no fluff. The voice of an experienced practitioner explaining their craft to a peer. First-person when natural. Occasional contractions. No corporate buzzwords.",
  friendly: "Warm and conversational, like a friend who happens to be an expert. Contractions everywhere.",
  expert: "Authoritative and precise. Uses technical terminology accurately. Voice of a thought leader.",
  conversational: "Casual, almost spoken. Short sentences. Sentence fragments allowed.",
  custom: "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function writeShortArticle(input: ArticleDraftInput): Promise<ClientBlogPost | null> {
  const db = await getDb();
  if (!db) return null;

  const [topic] = await db.select().from(clientContentTopic).where(eq(clientContentTopic.id, input.topicId));
  if (!topic || topic.kind !== "short") {
    console.warn(`[shortWriter] topic ${input.topicId} not found or wrong kind`);
    return null;
  }

  const [config] = await db.select().from(clientContentConfig).where(eq(clientContentConfig.id, input.configId));
  if (!config) return null;

  const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId));
  if (!client) return null;

  const drafted = await draftShortContent(topic, config, client);
  if (!drafted) return null;

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
    existingSchemaPlugin: (config.existingSchemaPlugin as "yoast" | "rankmath" | "aioseo" | null) ?? null,
    kind: "short",
  });

  const featuredImage = await pickFeaturedImage(config, topic.primaryKeyword ?? drafted.title);

  const [insertResult] = await db.insert(clientBlogPost).values({
    orderId: input.orderId,
    clientId: input.clientId,
    contentConfigId: input.configId,
    topicId: input.topicId,
    kind: "short",
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

  await db.update(clientContentTopic).set({
    consumedAt: new Date(),
    blogPostId,
  }).where(eq(clientContentTopic.id, input.topicId));

  const [post] = await db.select().from(clientBlogPost).where(eq(clientBlogPost.id, blogPostId));
  return post as unknown as ClientBlogPost;
}

export async function dryRunShortArticle(input: ArticleDraftInput): Promise<{
  failed: boolean;
  reason?: string;
  draftedMarkdown?: string;
  title?: string;
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

  const drafted = await draftShortContent(topic, effectiveConfig, client);
  if (!drafted) return { failed: true, reason: "draft_failed" };

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
    kind: "short",
  });

  return {
    failed: false,
    draftedMarkdown: drafted.markdown,
    title: drafted.title,
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
// 3-layer chain
// ─────────────────────────────────────────────────────────────────────────────

interface DraftResult {
  markdown: string;
  title: string;
  claims: VerifiableClaim[];
  stats: GenerationLayerStats;
  qualityGate: { passed: boolean; failureReasons: string[] };
}

async function draftShortContent(
  topic: TopicRow,
  config: ConfigRow,
  client: ClientRow,
): Promise<DraftResult | null> {
  const t0 = Date.now();
  const stats: GenerationLayerStats = {
    layer1_words: 0,
    layer2_claims_found: 0,
    layer3_research_calls: 0,
    layer3_contradicted: 0,
    layer4_rewrites: 0,
    layer5_quality_pass: false,
    totalCostUsd: 0,
    totalLatencyMs: 0,
  };

  // Layer 1
  const layer1 = await layer1ShortGenerate(topic, config, client);
  if (!layer1) return null;
  stats.layer1_words = countWords(layer1.markdown);
  stats.totalCostUsd += layer1.costUsd;

  // Layer 2: extract claims
  const layer2 = await layer2ExtractClaimsShort(layer1.markdown);
  const claims = layer2?.claims ?? [];
  stats.layer2_claims_found = claims.length;
  stats.totalCostUsd += layer2?.costUsd ?? 0;

  // For shorts: we don't run Layer 3 (web_search). All claims marked "skipped".
  // If we later want to research current-events short topics, add Layer 3 here
  // gated on `isCurrentEventsTopic(topic)`.
  const finalClaims: VerifiableClaim[] = claims.map(c => ({
    ...c,
    researchResult: "skipped",
  }));

  // For shorts, we don't run Layer 3 (skipping web_search to save cost).
  // We DO run Layer 4 (a soft pass) if there are claims tagged "uncertain"
  // — Layer 4 just softens those claims without web research.
  let finalMarkdown = layer1.markdown;
  const uncertainClaims = claims.filter(c => c.verifiability === "uncertain");
  if (uncertainClaims.length > 0) {
    const layer4 = await layer4SoftenUncertainClaims(layer1.markdown, uncertainClaims);
    if (layer4) {
      finalMarkdown = layer4.markdown;
      stats.layer4_rewrites = uncertainClaims.length;
      stats.totalCostUsd += layer4.costUsd;
    }
  }

  // Layer 5: quality gates
  const quality = runQualityGates(finalMarkdown, "short");
  stats.layer5_quality_pass = quality.passed;
  stats.totalLatencyMs = Date.now() - t0;

  if (!quality.passed) {
    console.warn(`[shortWriter] quality gate FAILED:`, quality.failureReasons.join("; "));
    return null;
  }

  console.log(`[shortWriter] ✓ ${stats.layer1_words} words, ${claims.length} claims, ${stats.layer4_rewrites} softened, cost=$${stats.totalCostUsd.toFixed(4)}, ${stats.totalLatencyMs}ms`);

  return {
    markdown: finalMarkdown,
    title: extractH1Title(finalMarkdown) || topic.topicTitle,
    claims: finalClaims,
    stats,
    qualityGate: { passed: quality.passed, failureReasons: quality.failureReasons },
  };
}

// `isCurrentEventsTopic` was removed — short writer doesn't currently call Layer 3.
// If we add web_search verification for shorts later, restore this helper.

// ─── Layer 1: Generate ───

async function layer1ShortGenerate(
  topic: TopicRow,
  config: ConfigRow,
  client: ClientRow,
): Promise<{ markdown: string; costUsd: number } | null> {
  const links = (config.internalLinkTargets as Array<{ url: string; pageTopic: string }> | null) ?? [];
  const linkLine = links.length > 0 ? `${links[0].url}  (${links[0].pageTopic})` : `${client.businessWebsite ?? "/"} (homepage)`;
  const voicePrompt = config.brandVoiceCustom ?? VOICE_TEMPLATES[(config.brandVoiceKey ?? "professional") as keyof typeof VOICE_TEMPLATES];

  const systemPrompt = `You are an expert content writer for ${client.businessName}, a ${client.industry ?? "small business"} that offers ${client.servicesOffered ?? "professional services"}.

Brand voice: ${voicePrompt}

Article requirements (SHORT-FORM):
- Topic: "${topic.topicTitle}"
- Topic summary: ${topic.topicSummary ?? "(no summary)"}
- Format: ${topic.format ?? "how_to"}
- Primary keyword: "${topic.primaryKeyword ?? topic.topicTitle}"
- Target word count: 400 to 800 words
- 2-3 H2 sections (no H3 needed)
- NO FAQ section (this is short-form)
- 1 internal link to: ${linkLine}
- 1-2 external citations to authoritative sources (name them specifically)
- Single H1 at the top matching the article title

${ANTI_AI_RULES}

Make factual claims sparingly. When you do, be specific. If you're not sure of a fact, write it conservatively.

Write the article as Markdown. H1 first, then sections. No preamble. Just the article.`;

  try {
    const res = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 2000,  // Pass-1 FIX HIGH-2: ~800 words target = ~1000 tokens; 2000 gives 2x headroom
      temperature: 0.65,
      system: systemPrompt,
      messages: [{ role: "user", content: `Write the article. Topic: "${topic.topicTitle}". Output Markdown only.` }],
    });
    const block = res.content.find(b => b.type === "text");
    if (!block || block.type !== "text") return null;
    const usage = res.usage;
    const cost = usage.input_tokens * SONNET_INPUT_COST + usage.output_tokens * SONNET_OUTPUT_COST;
    return { markdown: block.text, costUsd: cost };
  } catch (err) {
    console.warn("[shortWriter] L1 threw:", (err as Error).message);
    return null;
  }
}

// ─── Layer 2: Extract claims (same as longform's L2) ───

async function layer2ExtractClaimsShort(markdown: string): Promise<{ claims: VerifiableClaim[]; costUsd: number } | null> {
  const systemPrompt = `You audit short articles for verifiable factual claims. For each claim:
- "common-knowledge": widely known, no verification needed
- "verifiable": needs verification (statistics, dates, named studies, specific events)
- "uncertain": vague claims that should be softened or removed

Set needsResearch=true only for "verifiable".

Output STRICT JSON array. No prose.`;

  try {
    const res = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 2000,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: "user", content: `Audit this article:\n\n${markdown}\n\nOutput JSON array.` }],
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
    console.warn(`[shortWriter] L2 PARSE FAILED on ${markdown.length}-char article — claims=[] for verification. Error:`, (err as Error).message);
    return { claims: [], costUsd: 0 };
  }
}

// ─── Layer 4 (short version): Soften uncertain claims without web research ───

async function layer4SoftenUncertainClaims(
  markdown: string,
  uncertainClaims: VerifiableClaim[],
): Promise<{ markdown: string; costUsd: number } | null> {
  if (uncertainClaims.length === 0) return null;

  const systemPrompt = `You revise short articles to soften vague factual claims that aren't verifiable. For each claim listed:
(a) Soften the language (e.g., "Some practitioners suggest" instead of "Studies show")
(b) Remove the claim if it cannot be made conservative

Preserve everything else exactly. Same length, same structure, same voice.

Output the FULL revised article as Markdown.`;

  const claimList = uncertainClaims.map(c => `- "${c.claim}"`).join("\n");

  try {
    const res = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 3500,
      temperature: 0.4,
      system: systemPrompt,
      messages: [
        { role: "user", content: `Original article:\n\n${markdown}\n\nUncertain claims to soften:\n${claimList}\n\nOutput revised article.` },
      ],
    });
    const block = res.content.find(b => b.type === "text");
    if (!block || block.type !== "text") return null;
    const usage = res.usage;
    const cost = usage.input_tokens * SONNET_INPUT_COST + usage.output_tokens * SONNET_OUTPUT_COST;
    return { markdown: block.text, costUsd: cost };
  } catch (err) {
    console.warn("[shortWriter] L4 soften failed:", (err as Error).message);
    return null;
  }
}
