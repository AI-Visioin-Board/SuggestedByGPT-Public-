/**
 * BlogPost — single-post editorial template.
 *
 * Loaded via /blog/:slug. Fetches by slug, renders markdown via marked,
 * sanitizes the resulting HTML with DOMPurify, injects per-post JSON-LD
 * schema, builds a sticky table of contents from H2/H3 headings, and
 * ends with a branded CTA.
 *
 * Sanitization: blog content originates from the internal-agent service
 * (Claude-generated markdown, with web_search-grounded sources). Even
 * though we trust the writer, we sanitize the rendered HTML before
 * dangerouslySetInnerHTML — defense in depth against the (rare but
 * possible) case where an adversarial web page injects HTML into a
 * Claude grounded response that gets rolled into our content.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { Marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import { trpc } from "@/lib/trpc";
import { useSeoHead } from "@/hooks/useSeoHead";

const ORIGIN = "https://suggestedbygpt.com";

const C = {
  bg: "#09090B",
  surface: "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.08)",
  accent: "#D97B6A",
  indigo: "#A5B4FC",
  headline: "#FAFAF5",
  body: "#D4D4D4",
  muted: "#737373",
} as const;

interface Heading {
  id: string;
  text: string;
  level: number;
}

export default function BlogPost() {
  const [, params] = useRoute("/blog/:slug");
  const slug = params?.slug || "";
  const { data: post, isLoading } = trpc.blog.getBySlug.useQuery(
    { slug },
    { enabled: !!slug },
  );

  const jsonLd = useMemo(() => {
    if (!post?.schemaJsonLd) return undefined;
    try {
      return JSON.parse(post.schemaJsonLd) as any;
    } catch {
      return undefined;
    }
  }, [post?.schemaJsonLd]);

  useSeoHead({
    title: post?.metaTitle || post?.title || "SuggestedByGPT",
    canonical: post?.canonicalUrl || `${ORIGIN}/blog/${slug}`,
    meta: post
      ? [
          { name: "description", content: post.metaDescription || "" },
          { property: "og:type", content: "article" },
          { property: "og:title", content: post.title },
          { property: "og:description", content: post.metaDescription || "" },
          { property: "og:url", content: post.canonicalUrl || `${ORIGIN}/blog/${slug}` },
          { property: "og:image", content: `${ORIGIN}/og-default.png` },
          { property: "article:published_time", content: post.publishedAt ? new Date(post.publishedAt).toISOString() : "" },
          { name: "twitter:card", content: "summary_large_image" },
          { name: "twitter:title", content: post.title },
          { name: "twitter:description", content: post.metaDescription || "" },
        ]
      : undefined,
    jsonLd,
    jsonLdId: `blog-${slug}`,
  });

  // Render markdown → HTML → sanitize. Collect headings for ToC.
  //
  // Uses `new marked.Marked({...})` for SCOPED config — `marked.use(...)` is a
  // module-global mutation we deliberately avoid here so other future consumers
  // of marked aren't affected by this page's settings.
  //
  // Custom heading renderer adds `id` attributes for in-page anchors AND
  // collects headings for the sticky ToC. Heading text is extracted via
  // `parseInline` so inline marks (bold, italic, code) render correctly.
  const { html, headings } = useMemo(() => {
    if (!post?.bodyMarkdown) return { html: "", headings: [] as Heading[] };

    const collected: Heading[] = [];

    const m = new Marked({
      gfm: true,
      breaks: false,
      renderer: {
        heading({ tokens, depth }: any) {
          // `this.parser.parseInline(tokens)` keeps marks (bold/em/code)
          // in heading HTML; for ToC display we use the plain text.
          const inlineHtml = (this as any).parser.parseInline(tokens) as string;
          const plain = stripHtml(inlineHtml);
          const id = slugify(plain);
          if (depth === 2 || depth === 3) collected.push({ id, text: plain, level: depth });
          const sizeClass = depth === 1 ? "post-h1" : depth === 2 ? "post-h2" : "post-h3";
          return `<h${depth} id="${id}" class="${sizeClass}">${inlineHtml}</h${depth}>`;
        },
      },
    });

    const rendered = m.parse(post.bodyMarkdown) as string;

    // Sanitize — allow safe tags + the `data-speakable` attribute used by our
    // anti-AI-rules prompt for voice-search highlighting. Hook below forces
    // `rel="noopener noreferrer"` on every external link, defending against
    // tab-nabbing without us having to trust upstream Claude output.
    const purify = DOMPurify;
    purify.removeAllHooks();
    purify.addHook("afterSanitizeAttributes", (node: any) => {
      if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
        node.setAttribute("rel", "noopener noreferrer");
      }
    });

    const safe = purify.sanitize(rendered, {
      ALLOWED_TAGS: [
        "h1", "h2", "h3", "h4", "h5", "h6",
        "p", "a", "strong", "em", "b", "i", "u",
        "ul", "ol", "li",
        "blockquote", "code", "pre", "br", "hr",
        "img", "figure", "figcaption",
        "table", "thead", "tbody", "tr", "th", "td",
        "span", "div",
      ],
      ALLOWED_ATTR: [
        "href", "target", "rel", "title",
        "src", "alt", "width", "height", "loading",
        "class", "id",
        "data-speakable",
      ],
    });

    return { html: safe, headings: collected };
  }, [post?.bodyMarkdown]);

  const [activeHeading, setActiveHeading] = useState<string>("");
  const articleRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveHeading((entry.target as HTMLElement).id);
            break;
          }
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [headings]);

  if (isLoading) return <PageShell><LoadingState /></PageShell>;
  if (!post) return <PageShell><NotFoundState /></PageShell>;

  const formattedDate = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";

  return (
    <PageShell>
      <article ref={articleRef} style={{ maxWidth: 1200, margin: "0 auto", padding: "60px 24px 0" }}>
        {/* Breadcrumb / kicker */}
        <div style={{ marginBottom: 24, fontFamily: "JetBrains Mono, ui-monospace, monospace", fontSize: 12, color: C.muted, letterSpacing: "0.08em" }}>
          <Link href="/blog"><a style={{ color: C.muted, textDecoration: "none" }}>BLOG</a></Link>
          <span style={{ margin: "0 12px" }}>/</span>
          <span style={{ color: C.accent, textTransform: "uppercase" }}>
            {post.kind === "industry_landing" ? "Industry guide" : "Research"}
          </span>
        </div>

        {/* Headline */}
        <h1 className="post-h1-main" style={{
          fontFamily: "Fraunces, Georgia, serif",
          fontSize: "clamp(2.25rem, 5vw, 4rem)",
          fontWeight: 500,
          lineHeight: 1.05,
          letterSpacing: "-0.025em",
          color: C.headline,
          marginBottom: 24,
          maxWidth: 900,
        }}>
          {post.title}
        </h1>

        {/* Byline + date */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 48, paddingBottom: 32, borderBottom: `1px solid ${C.border}` }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: `linear-gradient(135deg, ${C.accent}, ${C.indigo})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "Fraunces, serif", fontWeight: 700, color: "#0B0B0B", fontSize: 14,
          }}>S</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.headline }}>
              SuggestedByGPT Research
            </div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
              {formattedDate} {post.kind === "longform_research" ? "· Original research" : ""}
            </div>
          </div>
        </div>

        {/* Two-column: ToC sticky + content */}
        <div className="post-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 48, position: "relative" }}>
          {headings.length > 2 && (
            <aside className="post-toc-aside" style={{
              position: "sticky",
              top: 80,
              alignSelf: "start",
              fontSize: 13,
              maxHeight: "calc(100vh - 100px)",
              overflowY: "auto",
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
                Contents
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {headings.map((h) => (
                  <li key={h.id} style={{ marginBottom: 10, paddingLeft: h.level === 3 ? 14 : 0 }}>
                    <a
                      href={`#${h.id}`}
                      style={{
                        color: activeHeading === h.id ? C.accent : C.muted,
                        textDecoration: "none",
                        fontSize: h.level === 3 ? 12 : 13,
                        fontWeight: activeHeading === h.id ? 600 : 400,
                        lineHeight: 1.4,
                        display: "block",
                        borderLeft: activeHeading === h.id ? `2px solid ${C.accent}` : "2px solid transparent",
                        paddingLeft: 12,
                      }}
                    >
                      {h.text}
                    </a>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          <main style={{ maxWidth: 720 }}>
            <PostStyles />
            {/* Sanitized via DOMPurify — see useMemo above */}
            <div className="post-body" dangerouslySetInnerHTML={{ __html: html }} />

            {/* CTA */}
            <div style={{
              marginTop: 80,
              padding: 40,
              borderRadius: 20,
              background: "linear-gradient(135deg, rgba(217,123,106,0.10) 0%, rgba(99,102,241,0.06) 100%)",
              border: `1px solid ${C.border}`,
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.accent, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 12, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
                Run the scan
              </p>
              <h3 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 28, fontWeight: 500, color: C.headline, marginBottom: 12, lineHeight: 1.15 }}>
                See where you actually stand.
              </h3>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: C.body, marginBottom: 24 }}>
                Every recommendation in this article is something we test against real businesses every day. Run the same scan we use, free, in 60 seconds.
              </p>
              <Link href="/start">
                <a style={{
                  display: "inline-block",
                  background: C.accent,
                  color: "#0B0B0B",
                  padding: "14px 28px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: "none",
                }}>
                  Free AI visibility scan →
                </a>
              </Link>
            </div>

            {/* Related — back to blog */}
            <div style={{ marginTop: 60, paddingTop: 40, borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
              <Link href="/blog">
                <a style={{ color: C.muted, fontSize: 13, textDecoration: "none", fontFamily: "JetBrains Mono, ui-monospace, monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  ← All research
                </a>
              </Link>
            </div>
          </main>
        </div>
      </article>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: C.bg, color: C.body, minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,700;9..144,900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <header style={{ borderBottom: `1px solid ${C.border}`, padding: "20px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/">
            <a style={{ color: C.headline, textDecoration: "none", fontFamily: "Fraunces, Georgia, serif", fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>
              SuggestedByGPT
            </a>
          </Link>
          <nav style={{ display: "flex", gap: 24, fontSize: 14 }}>
            <Link href="/blog"><a style={{ color: C.body, textDecoration: "none" }}>Blog</a></Link>
            <Link href="/start"><a style={{ color: C.accent, textDecoration: "none", fontWeight: 600 }}>Free Scan</a></Link>
          </nav>
        </div>
      </header>

      {children}

      <footer style={{ borderTop: `1px solid ${C.border}`, marginTop: 80, padding: "32px 24px", textAlign: "center", color: C.muted, fontSize: 13 }}>
        <p>© 2026 SuggestedByGPT. <Link href="/terms"><a style={{ color: C.muted }}>Terms</a></Link> · <Link href="/privacy"><a style={{ color: C.muted }}>Privacy</a></Link></p>
      </footer>
    </div>
  );
}

function PostStyles() {
  return (
    <style>{`
      .post-body {
        font-family: Inter, system-ui, sans-serif;
        font-size: 18px;
        line-height: 1.75;
        color: ${C.body};
      }
      .post-body p {
        margin: 0 0 28px;
      }
      .post-body p[data-speakable="true"] {
        font-family: Fraunces, Georgia, serif;
        font-style: italic;
        font-size: 22px;
        line-height: 1.5;
        color: ${C.headline};
        padding: 8px 0 8px 24px;
        border-left: 2px solid ${C.accent};
        margin: 40px 0;
      }
      .post-body .post-h2 {
        font-family: Fraunces, Georgia, serif;
        font-size: 32px;
        font-weight: 500;
        line-height: 1.15;
        letter-spacing: -0.015em;
        color: ${C.headline};
        margin: 64px 0 20px;
        scroll-margin-top: 100px;
      }
      .post-body .post-h3 {
        font-family: Inter, system-ui, sans-serif;
        font-size: 18px;
        font-weight: 700;
        color: ${C.headline};
        margin: 40px 0 12px;
        scroll-margin-top: 100px;
      }
      .post-body a {
        color: ${C.accent};
        text-decoration: underline;
        text-underline-offset: 3px;
        text-decoration-thickness: 1px;
      }
      .post-body a:hover {
        text-decoration-thickness: 2px;
      }
      .post-body strong {
        color: ${C.headline};
        font-weight: 600;
      }
      .post-body em {
        color: ${C.headline};
      }
      .post-body ul, .post-body ol {
        margin: 0 0 28px;
        padding-left: 24px;
      }
      .post-body li {
        margin-bottom: 10px;
      }
      .post-body code {
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        font-size: 0.9em;
        background: rgba(255,255,255,0.06);
        padding: 2px 6px;
        border-radius: 4px;
        color: ${C.headline};
      }
      .post-body pre {
        background: rgba(255,255,255,0.04);
        border: 1px solid ${C.border};
        border-radius: 8px;
        padding: 16px;
        overflow-x: auto;
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        font-size: 14px;
        line-height: 1.6;
        margin: 0 0 28px;
      }
      .post-body blockquote {
        border-left: 2px solid ${C.accent};
        padding-left: 24px;
        font-family: Fraunces, Georgia, serif;
        font-style: italic;
        font-size: 22px;
        line-height: 1.5;
        color: ${C.headline};
        margin: 40px 0;
      }

      @media (min-width: 1024px) {
        .post-grid {
          grid-template-columns: 220px minmax(0, 1fr) !important;
        }
      }
      @media (max-width: 1023px) {
        .post-toc-aside {
          display: none;
        }
      }
    `}</style>
  );
}

function LoadingState() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "120px 24px", textAlign: "center", color: C.muted }}>
      <p>Loading…</p>
    </div>
  );
}

function NotFoundState() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "120px 24px", textAlign: "center" }}>
      <h1 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 36, color: C.headline, marginBottom: 16 }}>
        Not found
      </h1>
      <p style={{ color: C.muted, marginBottom: 32 }}>
        That post doesn't exist or hasn't been published yet.
      </p>
      <Link href="/blog">
        <a style={{ color: C.accent, textDecoration: "none", fontSize: 14, fontFamily: "JetBrains Mono, ui-monospace, monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          ← Back to blog
        </a>
      </Link>
    </div>
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

/** Strip HTML tags to plain text — used to derive ToC link labels from
 *  rendered inline markdown (which may contain `<strong>`, `<em>`, etc.). */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}
