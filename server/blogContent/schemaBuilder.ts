/**
 * Schema builder — generates JSON-LD <script> blocks for blog posts.
 *
 * Schema strategy (per Phase A planning + scrutiny pass MEDIUM-1):
 *   - If client has Yoast / RankMath / AIOSEO installed: SKIP Article schema
 *     (those plugins emit it; ours would conflict). Only emit FAQPage schema.
 *   - Otherwise: emit BOTH Article + FAQPage (the plugins-free path).
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md § Module 6.
 */

import type { ArticleKind, ExistingSchemaPlugin } from "./types";
import { extractFAQs, extractH1Title } from "./markdownRenderer";

export interface SchemaBuilderInput {
  title: string;
  bodyMarkdown: string;
  publishedUrl: string | null; // updated at publish time; null at draft time
  businessName: string;
  businessWebsite: string | null;
  logoUrl?: string;
  existingSchemaPlugin: ExistingSchemaPlugin;
  kind: ArticleKind;
}

/**
 * Build the JSON-LD payload (one or two <script> blocks combined into a single string)
 * that gets injected into the post body or page <head> by the publisher.
 *
 * Returns empty string if nothing to emit (e.g., short article on Yoast site).
 */
export function buildSchemaJsonLd(input: SchemaBuilderInput): string {
  const blocks: string[] = [];

  const hasConflictingPlugin =
    input.existingSchemaPlugin === "yoast" ||
    input.existingSchemaPlugin === "rankmath" ||
    input.existingSchemaPlugin === "aioseo";

  // ─── Article schema (skip if plugin auto-generates it) ───
  if (!hasConflictingPlugin) {
    const article = buildArticleSchema(input);
    blocks.push(`<script type="application/ld+json">${JSON.stringify(article)}</script>`);
  }

  // ─── FAQPage schema (always safe; plugins don't typically auto-generate FAQPage) ───
  if (input.kind === "longform") {
    const faqs = extractFAQs(input.bodyMarkdown);
    if (faqs.length > 0) {
      const faqPage = buildFAQPageSchema(faqs);
      blocks.push(`<script type="application/ld+json">${JSON.stringify(faqPage)}</script>`);
    }
  }

  return blocks.join("\n");
}

function buildArticleSchema(input: SchemaBuilderInput): Record<string, unknown> {
  // Per Google's Article docs, headline must be ≤110 chars
  const headline = input.title.slice(0, 110);
  const publishedAt = new Date().toISOString();

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    datePublished: publishedAt,
    dateModified: publishedAt,
    author: {
      "@type": "Organization",
      name: input.businessName,
      ...(input.businessWebsite ? { url: input.businessWebsite } : {}),
    },
    publisher: {
      "@type": "Organization",
      name: input.businessName,
      ...(input.businessWebsite ? { url: input.businessWebsite } : {}),
      ...(input.logoUrl ? { logo: { "@type": "ImageObject", url: input.logoUrl } } : {}),
    },
  };

  // mainEntityOfPage is only meaningful once we know the published URL.
  // Publisher fills this in post-publish if needed; for now, we set it conditionally.
  if (input.publishedUrl) {
    schema.mainEntityOfPage = {
      "@type": "WebPage",
      "@id": input.publishedUrl,
    };
  }

  return schema;
}

function buildFAQPageSchema(faqs: Array<{ q: string; a: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(faq => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  };
}

/**
 * Quick validation: does the JSON-LD parse and have an @type?
 * Used in post-publish verification.
 */
export function isValidJsonLd(scriptContent: string): { valid: boolean; types: string[]; error?: string } {
  if (!scriptContent || !scriptContent.trim()) return { valid: false, types: [], error: "empty" };
  try {
    const parsed = JSON.parse(scriptContent);
    const t = parsed["@type"];
    const types = t ? (Array.isArray(t) ? t : [t]) : [];
    if (types.length === 0) return { valid: false, types, error: "missing_@type" };
    return { valid: true, types };
  } catch (err) {
    return { valid: false, types: [], error: (err as Error).message };
  }
}
