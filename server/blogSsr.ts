/**
 * Server-side rendering for blog routes + sitemap + robots integration.
 *
 * Why this exists:
 * The site is a Vite + React SPA. For app surfaces (portal, funnel, admin)
 * SPA rendering is fine — those don't need SEO. But the 57+ blog posts in
 * `blog_posts` table are content-marketing pages that MUST be readable by
 * Googlebot and AI crawlers (Anthropic, OpenAI, Perplexity, Google-Extended)
 * on first crawl. Googlebot can technically render JS but it's slow and
 * unreliable for low-authority sites. AI training crawlers do NOT render JS
 * at all — they just read the raw HTML response.
 *
 * Without this file, every `/blog/*` URL returns `<div id="root"></div>` and
 * the actual article content is invisible to any crawler that doesn't
 * execute JavaScript. With this file, the same URLs return fully-rendered
 * HTML with title, meta tags, JSON-LD schema, and the article body inline.
 *
 * Three routes registered:
 *   GET /blog           → editorial-style index of all published posts
 *   GET /blog/:slug     → single post with full article HTML + schema
 *   GET /sitemap.xml    → real XML sitemap (homepage + offer pages + all blog posts)
 *
 * Must be registered in `server/_core/index.ts` BEFORE `serveStatic(app)`.
 *
 * Reference: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
 */

import type { Express, Request, Response } from "express";
import { marked } from "marked";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

const ORIGIN = "https://suggestedbygpt.com";

// Configure marked once at module load — sync rendering, GFM tables/lists.
marked.setOptions({ gfm: true, breaks: false });

interface BlogIndexRow {
  slug: string;
  kind: string;
  title: string;
  metaDescription: string | null;
  publishedAt: Date | null;
  updatedAt: Date | null;
}

interface BlogPostRow {
  slug: string;
  kind: string;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  bodyMarkdown: string;
  schemaJsonLd: string | null;
  canonicalUrl: string | null;
  publishedAt: Date | null;
  updatedAt: Date | null;
}

/** Escape user-supplied strings for safe embedding in HTML text/attributes. */
function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** ISO date for sitemap + dateline display. */
function iso(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toISOString();
}

function humanDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** Shared <head> meta block — same on index and single-post for consistency. */
function renderHead(opts: {
  title: string;
  description: string;
  canonical: string;
  ogType?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  jsonLd?: string;
}): string {
  const ogType = opts.ogType ?? "website";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(opts.title)}</title>
  <meta name="description" content="${esc(opts.description)}" />
  <link rel="canonical" href="${esc(opts.canonical)}" />
  <meta property="og:type" content="${ogType}" />
  <meta property="og:title" content="${esc(opts.title)}" />
  <meta property="og:description" content="${esc(opts.description)}" />
  <meta property="og:url" content="${esc(opts.canonical)}" />
  <meta property="og:site_name" content="SuggestedByGPT" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(opts.title)}" />
  <meta name="twitter:description" content="${esc(opts.description)}" />
  ${opts.publishedTime ? `<meta property="article:published_time" content="${esc(opts.publishedTime)}" />` : ""}
  ${opts.modifiedTime ? `<meta property="article:modified_time" content="${esc(opts.modifiedTime)}" />` : ""}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>${INLINE_CSS}</style>
  ${opts.jsonLd ? `<script type="application/ld+json">${opts.jsonLd}</script>` : ""}
</head>`;
}

/**
 * Inline CSS — keeps the SSR output self-contained (no Vite build dependency).
 * Matches the dark editorial theme used by client/src/pages/Blog.tsx so users
 * who hit a server-rendered page don't see a visual jolt vs. the React app.
 */
const INLINE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:#09090B;color:#D4D4D4;font-family:Inter,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;line-height:1.65;font-size:17px;-webkit-font-smoothing:antialiased}
a{color:#A5B4FC;text-decoration:none;border-bottom:1px solid rgba(165,180,252,0.25)}
a:hover{border-bottom-color:rgba(165,180,252,0.7)}
nav.top{padding:24px 32px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;background:#09090B;position:sticky;top:0;z-index:10}
nav.top .brand{color:#FAFAF5;font-family:Fraunces,Georgia,serif;font-weight:600;font-size:22px;letter-spacing:-0.01em;border:none}
nav.top .links{display:flex;gap:24px;font-size:14px;color:#A3A3A3}
nav.top .links a{color:#A3A3A3;border:none}
nav.top .links a:hover{color:#FAFAF5}
main{max-width:780px;margin:0 auto;padding:64px 32px 96px}
.hero{margin-bottom:64px}
.kicker{color:#D97B6A;font-size:13px;letter-spacing:0.1em;text-transform:uppercase;font-weight:600;margin-bottom:16px}
h1{font-family:Fraunces,Georgia,serif;color:#FAFAF5;font-size:48px;line-height:1.1;font-weight:600;letter-spacing:-0.02em;margin-bottom:24px}
h1.index{font-size:56px}
.lede{color:#D4D4D4;font-size:20px;line-height:1.55;margin-bottom:16px}
.dateline{color:#737373;font-size:14px;margin-top:8px}
article h2{font-family:Fraunces,Georgia,serif;color:#FAFAF5;font-size:32px;font-weight:600;letter-spacing:-0.01em;margin:56px 0 20px;line-height:1.2}
article h3{font-family:Fraunces,Georgia,serif;color:#FAFAF5;font-size:22px;font-weight:600;margin:36px 0 14px;line-height:1.3}
article p{margin:0 0 20px;font-size:17px;line-height:1.7}
article ul,article ol{margin:0 0 24px;padding-left:24px}
article li{margin-bottom:8px;line-height:1.65}
article strong{color:#FAFAF5;font-weight:600}
article em{color:#FAFAF5;font-style:italic}
article blockquote{border-left:3px solid #D97B6A;padding-left:20px;margin:32px 0;color:#A3A3A3;font-style:italic}
article code{background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;font-size:0.92em;font-family:'SF Mono',ui-monospace,Menlo,monospace}
article pre{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:20px;border-radius:8px;overflow-x:auto;margin:24px 0}
article pre code{background:none;padding:0}
article table{width:100%;border-collapse:collapse;margin:24px 0}
article th,article td{padding:12px;border:1px solid rgba(255,255,255,0.1);text-align:left}
article th{background:rgba(255,255,255,0.04);color:#FAFAF5;font-weight:600}
article hr{border:none;border-top:1px solid rgba(255,255,255,0.1);margin:48px 0}
.post-card{display:block;padding:32px 0;border-bottom:1px solid rgba(255,255,255,0.08);border-top:none;border-left:none;border-right:none;transition:padding 0.15s}
.post-card:hover{padding-left:12px}
.post-card .card-kicker{font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px}
.post-card .card-kicker.industry{color:#6EE7B7}
.post-card .card-kicker.longform{color:#A5B4FC}
.post-card h2{font-family:Fraunces,Georgia,serif;color:#FAFAF5;font-size:26px;font-weight:600;margin:0 0 8px;letter-spacing:-0.01em;line-height:1.25}
.post-card p{color:#A3A3A3;font-size:15px;margin:0;line-height:1.55}
.footer{border-top:1px solid rgba(255,255,255,0.08);margin-top:96px;padding:48px 32px;text-align:center;color:#737373;font-size:14px}
.footer a{color:#A3A3A3;border:none}
.cta-box{margin:64px 0;padding:32px;background:rgba(217,123,106,0.06);border:1px solid rgba(217,123,106,0.18);border-radius:12px;text-align:center}
.cta-box h3{font-family:Fraunces,Georgia,serif;color:#FAFAF5;margin:0 0 12px;font-size:24px}
.cta-box p{color:#D4D4D4;margin:0 0 20px}
.cta-box a.btn{display:inline-block;padding:12px 24px;background:#D97B6A;color:#FFF;border-radius:8px;font-weight:600;border:none}
.cta-box a.btn:hover{background:#C56858}
@media(max-width:640px){
  main{padding:48px 20px 64px}
  h1{font-size:36px}
  h1.index{font-size:42px}
  article h2{font-size:26px;margin:40px 0 16px}
  .lede{font-size:18px}
}
`;

const NAV_HTML = `
<nav class="top">
  <a href="/" class="brand">SuggestedByGPT</a>
  <div class="links">
    <a href="/blog">Blog</a>
    <a href="/about">About</a>
    <a href="/start">Free AI Scan</a>
  </div>
</nav>
`;

const FOOTER_HTML = `
<footer class="footer">
  <p>SuggestedByGPT — Done-for-you AI search optimization for small businesses.</p>
  <p style="margin-top:12px"><a href="/start">Free AI Scan</a> · <a href="/blog">Blog</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></p>
</footer>
`;

const CTA_HTML = `
<div class="cta-box">
  <h3>See how AI describes your business</h3>
  <p>Run a free 60-second scan against ChatGPT, Gemini, Claude, and Perplexity. Get your visibility score in a personalized PDF.</p>
  <a href="/start" class="btn">Run the free scan</a>
</div>
`;

// ─────────────────────────────────────────────────────────────────────────────
// GET /blog — server-rendered index of all published posts
// ─────────────────────────────────────────────────────────────────────────────
async function renderBlogIndex(req: Request, res: Response): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      res.status(503).type("text/html").send("Database unavailable");
      return;
    }

    const result = await db.execute(
      sql`SELECT slug, kind, title, metaDescription, publishedAt, updatedAt
          FROM blog_posts
          WHERE status = 'published'
          ORDER BY publishedAt DESC
          LIMIT 200`,
    );
    const rows = (Array.isArray(result) ? result[0] : (result as any).rows) as BlogIndexRow[];

    const itemsHtml = rows
      .map((r) => {
        const kindLabel = r.kind === "industry_landing" ? "Industry Guide" : "Research";
        const kindClass = r.kind === "industry_landing" ? "industry" : "longform";
        return `<a href="/blog/${esc(r.slug)}" class="post-card">
          <div class="card-kicker ${kindClass}">${kindLabel} · ${humanDate(r.publishedAt)}</div>
          <h2>${esc(r.title)}</h2>
          ${r.metaDescription ? `<p>${esc(r.metaDescription)}</p>` : ""}
        </a>`;
      })
      .join("\n");

    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Blog",
      "@id": `${ORIGIN}/blog`,
      "name": "SuggestedByGPT Blog",
      "description": "Research and tactical guides on getting your business recommended by ChatGPT, Gemini, Claude, and Perplexity.",
      "url": `${ORIGIN}/blog`,
      "publisher": { "@id": `${ORIGIN}/#organization` },
      "blogPost": rows.slice(0, 20).map((r) => ({
        "@type": "BlogPosting",
        "headline": r.title,
        "url": `${ORIGIN}/blog/${r.slug}`,
        "datePublished": iso(r.publishedAt),
      })),
    });

    const head = renderHead({
      title: "Blog — Generative Engine Optimization for Local Business | SuggestedByGPT",
      description:
        "Research and guides on getting your local business recommended by ChatGPT, Gemini, Claude, and Perplexity. Original GEO data and tactical playbooks from SuggestedByGPT.",
      canonical: `${ORIGIN}/blog`,
      ogType: "website",
      jsonLd,
    });

    const html = `${head}
<body>
${NAV_HTML}
<main>
  <div class="hero">
    <div class="kicker">SuggestedByGPT Research</div>
    <h1 class="index">GEO research &amp; tactical guides</h1>
    <p class="lede">How small businesses are showing up — or staying invisible — when customers ask AI for recommendations. Original data, tactical playbooks, and per-industry breakdowns.</p>
  </div>
  ${itemsHtml || "<p>No posts yet.</p>"}
  ${CTA_HTML}
</main>
${FOOTER_HTML}
</body>
</html>`;

    res.status(200).type("text/html; charset=utf-8").send(html);
  } catch (err) {
    console.error("[blogSsr] /blog index render failed:", (err as Error).message);
    res.status(500).type("text/html").send("<h1>500 — Error rendering blog index</h1>");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /blog/:slug — server-rendered single post with article body + schema
// ─────────────────────────────────────────────────────────────────────────────
async function renderBlogPost(req: Request, res: Response): Promise<void> {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug || !/^[a-z0-9-]{1,180}$/i.test(slug)) {
      res.status(400).type("text/html").send("<h1>Invalid slug</h1>");
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(503).type("text/html").send("Database unavailable");
      return;
    }

    const result = await db.execute(
      sql`SELECT slug, kind, title, metaTitle, metaDescription, bodyMarkdown,
                 schemaJsonLd, canonicalUrl, publishedAt, updatedAt
          FROM blog_posts
          WHERE slug = ${slug} AND status = 'published'
          LIMIT 1`,
    );
    const rows = (Array.isArray(result) ? result[0] : (result as any).rows) as BlogPostRow[];

    if (rows.length === 0) {
      res.status(404).type("text/html").send(`${renderHead({
        title: "Not Found — SuggestedByGPT",
        description: "Page not found.",
        canonical: `${ORIGIN}/blog`,
      })}<body>${NAV_HTML}<main><h1>404 — post not found</h1><p>The article you're looking for doesn't exist or was unpublished.</p><p><a href="/blog">← Back to blog index</a></p></main>${FOOTER_HTML}</body></html>`);
      return;
    }

    const post = rows[0]!;
    const canonical = post.canonicalUrl || `${ORIGIN}/blog/${post.slug}`;
    const title = post.metaTitle || post.title;
    const description = post.metaDescription || `${post.title} — SuggestedByGPT research.`;

    // Render markdown → HTML synchronously. `marked` returns string when called sync.
    const bodyHtml = marked.parse(post.bodyMarkdown, { async: false }) as string;

    const kindLabel = post.kind === "industry_landing" ? "Industry Guide" : "GEO Research";

    const head = renderHead({
      title: `${title} | SuggestedByGPT`,
      description,
      canonical,
      ogType: "article",
      publishedTime: iso(post.publishedAt),
      modifiedTime: iso(post.updatedAt),
      jsonLd: post.schemaJsonLd || undefined,
    });

    const html = `${head}
<body>
${NAV_HTML}
<main>
  <div class="hero">
    <div class="kicker">${esc(kindLabel)} · ${humanDate(post.publishedAt)}</div>
    <h1>${esc(post.title)}</h1>
    ${post.metaDescription ? `<p class="lede">${esc(post.metaDescription)}</p>` : ""}
  </div>
  <article>
    ${bodyHtml}
  </article>
  ${CTA_HTML}
  <p style="margin-top:32px"><a href="/blog">← Back to all research</a></p>
</main>
${FOOTER_HTML}
</body>
</html>`;

    // Cache hints: tells Google + CDN that content can be cached briefly.
    // Articles update rarely; updatedAt changes flush via header.
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=86400");
    res.status(200).type("text/html; charset=utf-8").send(html);
  } catch (err) {
    console.error("[blogSsr] /blog/:slug render failed:", (err as Error).message);
    res.status(500).type("text/html").send("<h1>500 — Error rendering post</h1>");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /sitemap.xml — real XML sitemap, lists every published blog post + main pages
// ─────────────────────────────────────────────────────────────────────────────
async function renderSitemap(_req: Request, res: Response): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      res.status(503).type("application/xml").send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
      return;
    }

    const result = await db.execute(
      sql`SELECT slug, updatedAt FROM blog_posts WHERE status = 'published' ORDER BY updatedAt DESC`,
    );
    const rows = (Array.isArray(result) ? result[0] : (result as any).rows) as Array<{ slug: string; updatedAt: Date }>;
    const now = new Date().toISOString();

    // Priority: homepage 1.0, key pages 0.8, blog index 0.8, blog posts 0.6
    const staticUrls = [
      { loc: `${ORIGIN}/`, priority: "1.0", changefreq: "weekly", lastmod: now },
      { loc: `${ORIGIN}/start`, priority: "0.9", changefreq: "weekly", lastmod: now },
      { loc: `${ORIGIN}/blog`, priority: "0.8", changefreq: "daily", lastmod: now },
      { loc: `${ORIGIN}/get-started`, priority: "0.8", changefreq: "monthly", lastmod: now },
      { loc: `${ORIGIN}/about`, priority: "0.5", changefreq: "monthly", lastmod: now },
      { loc: `${ORIGIN}/terms`, priority: "0.3", changefreq: "yearly", lastmod: now },
      { loc: `${ORIGIN}/privacy`, priority: "0.3", changefreq: "yearly", lastmod: now },
    ];

    const blogUrls = rows.map((r) => ({
      loc: `${ORIGIN}/blog/${r.slug}`,
      priority: "0.6",
      changefreq: "monthly",
      lastmod: iso(r.updatedAt) || now,
    }));

    const allUrls = [...staticUrls, ...blogUrls];

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      allUrls
        .map(
          (u) =>
            `  <url>\n    <loc>${esc(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
        )
        .join("\n") +
      "\n</urlset>\n";

    res.setHeader("Cache-Control", "public, max-age=600, s-maxage=3600");
    res.status(200).type("application/xml").send(xml);
  } catch (err) {
    console.error("[blogSsr] /sitemap.xml render failed:", (err as Error).message);
    res
      .status(500)
      .type("application/xml")
      .send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
}

/**
 * Register the SSR routes on the Express app. MUST be called BEFORE
 * `serveStatic(app)` in server/_core/index.ts — otherwise the SPA fallback
 * catches /blog/* first and returns the empty React shell.
 */
export function registerBlogSsrRoutes(app: Express): void {
  app.get("/blog", renderBlogIndex);
  app.get("/blog/:slug", renderBlogPost);
  app.get("/sitemap.xml", renderSitemap);
  console.log("[blogSsr] Registered: GET /blog, GET /blog/:slug, GET /sitemap.xml (SSR, before SPA fallback)");
}
