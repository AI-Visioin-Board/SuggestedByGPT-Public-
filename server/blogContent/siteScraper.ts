/**
 * Site scraper — fetches the client's website to extract context for topic
 * seeding + detect existing schema plugins (Yoast, RankMath, AIOSEO).
 *
 * Uses Patchright (already a project dep via cmsAutomation.ts). Falls back
 * gracefully on any failure — we return best-effort data rather than throwing.
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md § Module 3.
 *
 * Failure modes:
 *   - Site unreachable → returns SiteScrapeResult with all fields null/empty
 *   - Robots.txt blocks us → returns partial result (whatever loaded)
 *   - Patchright launch fails (no Chromium installed) → returns empty
 */

import { chromium } from "patchright";
import type { ExistingSchemaPlugin, SiteScrapeResult } from "./types";

const REASONABLE_TIMEOUT_MS = 45_000;

/**
 * Scrape the client's homepage. Best-effort: never throws, always returns
 * a partial result on failure.
 */
export async function scrapeClientSite(siteUrl: string): Promise<SiteScrapeResult> {
  const empty: SiteScrapeResult = {
    businessName: null,
    headings: [],
    existingBlogPosts: [],
    detectedSchemaPlugin: null,
  };

  if (!siteUrl) return empty;

  // Normalize URL: ensure protocol
  let url = siteUrl.trim();
  if (!url.match(/^https?:\/\//i)) url = `https://${url}`;

  let browser: any = null;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: "chromium",
      args: process.env.PATCHRIGHT_REQUIRE_NO_SANDBOX === "true" ? ["--no-sandbox"] : [],
    });
    const ctx = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: REASONABLE_TIMEOUT_MS });

    // Wait a moment for client-side rendering (e.g. React hydration on SPAs)
    await page.waitForTimeout(2000);

    const businessName = await page.title().catch(() => null);
    const headingsRaw: string[] = await page
      .locator("h1, h2")
      .allTextContents()
      .catch(() => [] as string[]);
    const headings = headingsRaw
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 2 && t.length < 200);

    const existingBlogPosts: Array<{ url: string; text: string }> = await page
      .locator('a[href*="/blog/"], a[href*="/articles/"], a[href*="/news/"], a[href*="/posts/"]')
      .evaluateAll((els: Element[]) =>
        els.slice(0, 12).map((el: Element) => ({
          url: (el as HTMLAnchorElement).href || "",
          text: (el.textContent || "").trim(),
        }))
      )
      .catch(() => [] as Array<{ url: string; text: string }>);

    const filteredBlogPosts = existingBlogPosts.filter(
      (l: { url: string; text: string }) => l.url && l.text.length > 5 && l.text.length < 200
    );

    const html = await page.content().catch(() => "");
    const detectedSchemaPlugin = detectSchemaPluginFromHtml(html);

    await ctx.close().catch(() => {});

    return {
      businessName: businessName ? businessName.slice(0, 200) : null,
      headings: headings.slice(0, 30),
      existingBlogPosts: filteredBlogPosts,
      detectedSchemaPlugin,
    };
  } catch (err) {
    console.warn(`[siteScraper] Failed to scrape ${url}:`, (err as Error).message);
    return empty;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Detect Yoast / RankMath / AIOSEO from page HTML.
 *
 * Why this matters: if any of these plugins is installed, they auto-generate
 * Article schema. Our writers should skip injecting their own Article schema
 * to avoid Yoast vs ours conflict (Google flags duplicate Article schemas).
 * FAQPage schema is still safe to inject (these plugins don't usually emit it).
 *
 * Plan reference: scrutiny pass MEDIUM-1 / HIGH-1.
 */
export function detectSchemaPluginFromHtml(html: string): ExistingSchemaPlugin {
  if (!html) return null;

  // Yoast SEO leaves multiple identifiable fingerprints
  if (
    /\byoast[_-]?(seo|wpseo)\b/i.test(html) ||
    /<!--\s*This site is optimized with the Yoast SEO/i.test(html) ||
    /yoast-schema-graph/i.test(html)
  ) {
    return "yoast";
  }

  // RankMath emits clear meta tags + JSON-LD comments
  if (
    /rank[_-]?math/i.test(html) ||
    /<!--\s*Rank Math/i.test(html)
  ) {
    return "rankmath";
  }

  // All in One SEO Pack
  if (
    /\baioseo\b/i.test(html) ||
    /All in One SEO/i.test(html)
  ) {
    return "aioseo";
  }

  return null;
}
