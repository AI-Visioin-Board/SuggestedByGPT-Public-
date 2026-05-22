/**
 * Shared TypeScript types for the Dominator Blog Content Delivery feature.
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md § Module 2.
 *
 * Mostly re-exports + narrowed unions on top of the drizzle-generated row types.
 * Drizzle types live in drizzle/schema.ts; we layer domain-specific enums + DTOs
 * here so other modules (writers, publishers, queue worker, UI tRPC) import from
 * a single place.
 *
 * Purely additive: importing this file does not affect any existing module.
 */

import type {
  ClientContentConfig,
  ClientBlogPost,
  ClientContentTopic,
  ClientCitationCheck,
  OauthToken,
} from "../../drizzle/schema";

// ─── Enum-style unions (varchar columns in DB; narrowed types in TS) ─────

export type CmsPlatform =
  | "wordpress"
  | "shopify"
  | "wix"
  | "squarespace"
  | "showcase"
  | "other";

export type CmsAuthMethod =
  | "plugin"        // WordPress: our custom SBGPT plugin handles publish
  | "app_password"  // WordPress: Application Password (deprioritized per Francis)
  | "oauth"         // Shopify, Wix: OAuth token in oauth_token table
  | "editor_user"   // Squarespace: client invited us as Editor; Patchright drives the UI
  | "none";         // Showcase mode: no CMS access needed

export type BrandVoiceKey =
  | "professional"
  | "friendly"
  | "expert"
  | "conversational"
  | "custom";

export type ArticleKind = "longform" | "short";

export type ArticleStatus =
  | "draft"             // Mid-generation
  | "ready_to_publish"  // Quality gates passed; awaiting publish queue
  | "publishing"        // Publish worker has claimed it (atomic lock state)
  | "published"         // CMS returned success; awaiting verification
  | "publish_failed"    // 3 publish attempts failed; escalated
  | "verified"          // Live URL fetched, schema valid, screenshots stored
  | "rejected";         // Generation failed 3x; topic discarded

export type PublishMethod =
  | "plugin"           // WordPress plugin
  | "oauth_api"        // Shopify/Wix REST
  | "patchright"       // UI automation fallback
  | "showcase_local";  // Published on suggestedbygpt.com/clients/...

export type TopicFormat =
  | "how_to"
  | "comparison"
  | "when_to"
  | "best_for"
  | "faq"
  | "listicle";

export type TopicSource =
  | "initial_seed"        // Topic seeder at onboarding
  | "manual"              // Support added manually
  | "citation_feedback"   // Citation monitor flagged a losing query → bumped priority on related topics
  | "cluster_refresh";    // Mid-program topic queue refresh

export type ExistingSchemaPlugin = "yoast" | "rankmath" | "aioseo" | null;

// ─── JSON-column shapes (DB columns are `json`; we type the payload) ─────

export interface InternalLinkTarget {
  url: string;
  pageTopic: string;
}

export interface VerifiableClaim {
  claim: string;
  verifiability: "common-knowledge" | "verifiable" | "uncertain";
  needsResearch: boolean;
  researchResult?: "confirmed" | "contradicted" | "inconclusive" | "skipped";
  source?: string;
}

export interface GenerationLayerStats {
  layer1_words: number;
  layer2_claims_found: number;
  layer3_research_calls: number;
  layer3_contradicted: number;
  layer4_rewrites: number;
  layer5_quality_pass: boolean;
  totalCostUsd: number;
  totalLatencyMs: number;
}

export interface QualityGateResult {
  passed: boolean;
  failureReasons: string[];
  attempts: number;
}

export interface VerificationResult {
  h1_match: boolean;
  schema_present: boolean;
  schema_valid: boolean;
  schema_types: string[];
  word_count_live: number;
  internal_links_live: number;
}

export interface InternalLinkUsed {
  anchor: string;
  url: string;
}

export interface ExternalCitation {
  text: string;
  url: string;
}

// ─── Re-exported row types from drizzle/schema.ts (single import surface) ─

export type {
  ClientContentConfig,
  ClientBlogPost,
  ClientContentTopic,
  ClientCitationCheck,
  OauthToken,
};

// ─── Strongly-typed input/output DTOs used by writers + publishers ────────

export interface ArticleDraftInput {
  topicId: number;
  configId: number;
  orderId: number;
  clientId: number;
  kind: ArticleKind;
}

export interface ContentInstallPayload {
  blogPostId: number;
  title: string;
  slug: string;
  bodyHtml: string;
  metaTitle: string;
  metaDescription: string;
  schemaJsonLd: string;
  featuredImageUrl?: string;
  featuredImageAttribution?: string;
  excerpt?: string;
  internalLinks: InternalLinkUsed[];
  publishImmediately: boolean;
}

export type PublishFailureCategory =
  | "auth_failed"
  | "rate_limited"
  | "platform_error"
  | "network"
  | "validation"
  | "unknown";

export interface PublishResult {
  success: boolean;
  publishedUrl?: string;
  publishedCmsPostId?: string;
  reason?: string;
  failureCategory?: PublishFailureCategory;
  method: PublishMethod;
  durationMs: number;
}

// ─── Topic seeder outputs (parsed from Claude's JSON response) ────────────

export interface SeededTopicCandidate {
  slug: string;
  title: string;
  topicSummary: string;
  format: TopicFormat;
  primaryKeyword: string;
  predictedWordCount: number;
  rationale: string;
}

export interface SeededTopicProgram {
  pillar: SeededTopicCandidate;
  shorts: SeededTopicCandidate[];
}

export interface TopicSeederResult {
  pillarTopicId: number;
  shortTopicIds: number[];
  failed: boolean;
  reason?: string;
}

// ─── Site scrape output (consumed by topic seeder) ───────────────────────

export interface SiteScrapeResult {
  businessName: string | null;
  headings: string[];
  existingBlogPosts: Array<{ url: string; text: string }>;
  detectedSchemaPlugin: ExistingSchemaPlugin;
}

// ─── Unsplash fetcher output ─────────────────────────────────────────────

export interface UnsplashImage {
  url: string;            // 1080px-wide URL
  thumbUrl: string;       // ~400px URL for previews
  attribution: string;    // "Photo by [Name] on Unsplash"
  attributionUrl: string;
}

// ─── Onboarding action types (referenced by ConnectWebsiteTask UI) ───────

export type OnboardingPlatformChoice =
  | "wordpress"
  | "shopify"
  | "wix"
  | "squarespace"
  | "showcase";

// ─── Per-client citation monitor types ───────────────────────────────────

export interface CitationTrendPoint {
  runDate: Date;
  rate: number;  // 0-100, mention rate
}

export interface BlogContentMetrics {
  totalWords: number;
  schemaValidPct: number;
  citationRatePct: number | null;
  articlesPublished: number;
  totalTarget: number;
}
