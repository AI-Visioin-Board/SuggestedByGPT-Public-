/**
 * Markdown to HTML renderer + structural extractors.
 *
 * Uses `marked` (already a project dep). Settings:
 *  - gfm: true (tables, strikethrough, task lists)
 *  - breaks: false (no <br> on single newline; preserves paragraph breaks)
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md
 * Module 6 (referenced by longformWriter + shortWriter).
 */

import { marked } from "marked";

/**
 * Render markdown body to HTML. Synchronous.
 */
export function renderMarkdownToHtml(markdown: string): string {
  if (!markdown) return "";
  try {
    const html = marked.parse(markdown, {
      gfm: true,
      breaks: false,
      async: false,
    }) as string;
    return html;
  } catch (err) {
    console.warn("[markdownRenderer] marked threw:", (err as Error).message);
    return `<p>${markdown.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n{2,}/g, "</p><p>")}</p>`;
  }
}

/**
 * Extract the article title from H1.
 */
export function extractH1Title(markdown: string): string {
  const m = markdown.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "";
}

/**
 * Generate a meta-title for SEO: prefer the article title, cap at 60 chars
 * on word boundary, append the brand only if there's room.
 */
export function generateMetaTitle(title: string, brand?: string): string {
  if (!title) return "";
  if (title.length <= 60) {
    if (brand && title.length + brand.length + 3 <= 60) return `${title} | ${brand}`;
    return title;
  }
  let trimmed = title.slice(0, 60);
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace > 40) trimmed = trimmed.slice(0, lastSpace);
  return trimmed;
}

/**
 * Generate a meta description from the article body.
 */
export function generateMetaDescription(markdown: string): string {
  if (!markdown) return "";

  const afterH1 = markdown.replace(/^#\s+.+$/m, "").trim();
  const paragraphs = afterH1
    .split(/\n{2,}/)
    .map(p => stripMarkdown(p).trim())
    .filter(p => p.length > 20 && !p.startsWith("#"));

  for (const p of paragraphs) {
    if (p.length >= 80 && p.length <= 160) return p;
  }

  if (paragraphs.length === 0) return "";
  const first = paragraphs[0];
  if (first.length <= 160) return first;
  let clipped = first.slice(0, 155);
  const lastSpace = clipped.lastIndexOf(" ");
  if (lastSpace > 100) clipped = clipped.slice(0, lastSpace);
  return clipped + "…";
}

function stripMarkdown(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract internal and external links from markdown body.
 *
 * Internal = path starts with `/` OR href contains the client's domain.
 * External = everything else.
 */
export function extractLinks(
  markdown: string,
  clientDomain?: string,
): {
  internal: Array<{ anchor: string; url: string }>;
  external: Array<{ anchor: string; url: string }>;
} {
  const internal: Array<{ anchor: string; url: string }> = [];
  const external: Array<{ anchor: string; url: string }> = [];

  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(markdown)) !== null) {
    const anchor = match[1].trim();
    const url = match[2].trim();
    if (!anchor || !url) continue;
    if (url.startsWith("/") || (clientDomain && url.includes(clientDomain))) {
      internal.push({ anchor, url });
    } else if (/^https?:\/\//i.test(url)) {
      external.push({ anchor, url });
    }
  }

  return { internal, external };
}

/**
 * Extract FAQ Q&A pairs from a markdown FAQ section.
 *
 * Returns at most 10 FAQs (schema.org practical cap).
 */
export function extractFAQs(markdown: string): Array<{ q: string; a: string }> {
  const faqs: Array<{ q: string; a: string }> = [];

  // Match common FAQ section headings: "FAQ", "FAQs", "Frequently Asked Questions",
  // "Common Questions", "Q&A", "Questions and Answers", "Questions & Answers".
  const sectionMatch = markdown.match(
    /^##\s+(?:FAQs?|Frequently Asked Questions|Common Questions|Q\s*&\s*A|Questions and Answers|Questions & Answers)\s*$[\s\S]*?\n([\s\S]+?)(?=^##\s+|$)/im,
  );
  if (!sectionMatch) return faqs;

  const section = sectionMatch[1];

  const aPattern = /^###\s+(.+?)\??\s*$\n([\s\S]+?)(?=^###\s+|^##\s+|$)/gim;
  let matchA: RegExpExecArray | null;
  while ((matchA = aPattern.exec(section)) !== null) {
    const q = matchA[1].trim().replace(/\?+$/, "") + "?";
    const a = stripMarkdown(matchA[2]).trim();
    if (q.length > 5 && a.length > 10) faqs.push({ q, a });
  }

  if (faqs.length === 0) {
    const bPattern = /\*\*(.+?)\?\*\*\s*\n([\s\S]+?)(?=\n\*\*|\n##\s+|$)/g;
    let matchB: RegExpExecArray | null;
    while ((matchB = bPattern.exec(section)) !== null) {
      const q = matchB[1].trim() + "?";
      const a = stripMarkdown(matchB[2]).trim();
      if (q.length > 5 && a.length > 10) faqs.push({ q, a });
    }
  }

  return faqs.slice(0, 10);
}
