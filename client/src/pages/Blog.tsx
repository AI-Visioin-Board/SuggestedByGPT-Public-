/**
 * Blog index — editorial-style list of all published posts.
 *
 * Powered by `blog.listPublished` tRPC procedure, which reads from the
 * shared `blog_posts` table. The internal-agent service writes that table;
 * the main app only reads. Strict read-only on this side.
 *
 * Design: dark editorial theme with Fraunces serif headlines + Inter body,
 * generous whitespace, two-column responsive grid, kind-based color
 * accents (industry vs longform).
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useSeoHead } from "@/hooks/useSeoHead";

const ORIGIN = "https://suggestedbygpt.com";

const C = {
  bg: "#09090B",
  surface: "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.08)",
  borderHover: "rgba(255,255,255,0.18)",
  accent: "#D97B6A",
  indigo: "#A5B4FC",
  emerald: "#6EE7B7",
  headline: "#FAFAF5",
  body: "#D4D4D4",
  muted: "#737373",
} as const;

export default function Blog() {
  const { data: posts, isLoading } = trpc.blog.listPublished.useQuery({ limit: 100 });

  useSeoHead({
    title: "Blog — Generative Engine Optimization for Local Business | SuggestedByGPT",
    canonical: `${ORIGIN}/blog`,
    meta: [
      { name: "description", content: "Research and guides on getting your local business recommended by ChatGPT, Gemini, Claude, and Perplexity. Original GEO data and tactical playbooks from SuggestedByGPT." },
      { property: "og:title", content: "GEO Research & Guides — SuggestedByGPT Blog" },
      { property: "og:description", content: "Original research and tactical guides for AI search visibility." },
      { property: "og:url", content: `${ORIGIN}/blog` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Blog",
      "@id": `${ORIGIN}/blog#blog`,
      name: "SuggestedByGPT Research & Guides",
      url: `${ORIGIN}/blog`,
      publisher: { "@type": "Organization", "@id": `${ORIGIN}/#organization`, name: "SuggestedByGPT" },
      description: "Research and guides on Generative Engine Optimization for local businesses.",
    },
  });

  const { industries, longform } = useMemo(() => {
    const all = posts || [];
    return {
      industries: all.filter((p: any) => p.kind === "industry_landing"),
      longform: all.filter((p: any) => p.kind === "longform_research"),
    };
  }, [posts]);

  return (
    <div style={{ background: C.bg, color: C.body, minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,700;9..144,900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Top bar */}
      <header style={{ borderBottom: `1px solid ${C.border}`, padding: "20px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/">
            <a style={{ color: C.headline, textDecoration: "none", fontFamily: "Fraunces, Georgia, serif", fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>
              SuggestedByGPT
            </a>
          </Link>
          <nav style={{ display: "flex", gap: 24, fontSize: 14 }}>
            <Link href="/start"><a style={{ color: C.body, textDecoration: "none" }}>Free Scan</a></Link>
            <Link href="/about"><a style={{ color: C.muted, textDecoration: "none" }}>About</a></Link>
            <Link href="/get-started"><a style={{ color: C.accent, textDecoration: "none", fontWeight: 600 }}>Get Started</a></Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "80px 24px 40px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.accent, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 16, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
          GEO Research & Guides
        </p>
        <h1 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "clamp(2.5rem, 5vw, 4rem)", fontWeight: 500, lineHeight: 1.05, letterSpacing: "-0.025em", color: C.headline, marginBottom: 24 }}>
          What we know about <em style={{ fontStyle: "italic", color: C.accent }}>AI search</em>, and what we publish about it.
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.65, color: C.body, maxWidth: 680 }}>
          Original research, tactical playbooks, and industry-specific guides for getting your business recommended by ChatGPT, Google Gemini, Claude, and Perplexity. Updated weekly.
        </p>
      </section>

      {/* Long-form research section */}
      {longform.length > 0 && (
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>
          <SectionHeader label="Research & guides" count={longform.length} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 24, marginTop: 32 }}>
            {longform.map((p: any) => (
              <PostCard key={p.id} post={p} accent={C.indigo} />
            ))}
          </div>
        </section>
      )}

      {/* Industry section */}
      {industries.length > 0 && (
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 80px" }}>
          <SectionHeader label="AI SEO by industry" count={industries.length} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16, marginTop: 32 }}>
            {industries.map((p: any) => (
              <IndustryCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!isLoading && posts && posts.length === 0 && (
        <section style={{ maxWidth: 700, margin: "0 auto", padding: "80px 24px", textAlign: "center" }}>
          <p style={{ color: C.muted, fontSize: 16 }}>
            New research is being prepared. Check back shortly.
          </p>
        </section>
      )}

      {/* CTA strip */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 80px" }}>
        <div style={{
          background: "linear-gradient(135deg, rgba(217,123,106,0.08) 0%, rgba(99,102,241,0.06) 100%)",
          border: `1px solid ${C.border}`,
          borderRadius: 24,
          padding: "60px 40px",
          textAlign: "center",
        }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.accent, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 16 }}>
            Free, 60 seconds
          </p>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)", fontWeight: 500, color: C.headline, marginBottom: 16, lineHeight: 1.1 }}>
            See if AI assistants know your business exists.
          </h2>
          <p style={{ fontSize: 16, color: C.body, maxWidth: 560, margin: "0 auto 32px" }}>
            We scan ChatGPT, Gemini, Claude, and Perplexity in real time and send you a personalized PDF visibility report.
          </p>
          <Link href="/start">
            <a style={{
              display: "inline-block",
              background: C.accent,
              color: "#0B0B0B",
              padding: "16px 32px",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              textDecoration: "none",
            }}>
              Run free AI visibility scan →
            </a>
          </Link>
        </div>
      </section>

      <footer style={{ borderTop: `1px solid ${C.border}`, padding: "32px 24px", textAlign: "center", color: C.muted, fontSize: 13 }}>
        <p>© 2026 SuggestedByGPT. <Link href="/terms"><a style={{ color: C.muted }}>Terms</a></Link> · <Link href="/privacy"><a style={{ color: C.muted }}>Privacy</a></Link></p>
      </footer>
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: `1px solid ${C.border}`, paddingBottom: 16 }}>
      <h2 style={{
        fontSize: 13,
        fontWeight: 700,
        color: C.headline,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
      }}>
        {label}
      </h2>
      <span style={{ fontSize: 12, color: C.muted, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
        {count} {count === 1 ? "piece" : "pieces"}
      </span>
    </div>
  );
}

function PostCard({ post, accent }: { post: any; accent: string }) {
  const fm = post.frontmatter || {};
  const date = post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  return (
    <Link href={`/blog/${post.slug}`}>
      <a style={{
        display: "block",
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: "32px 28px",
        textDecoration: "none",
        transition: "border-color 0.2s, transform 0.2s",
        cursor: "pointer",
      }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = C.borderHover; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = C.border; }}
      >
        <p style={{ fontSize: 11, fontWeight: 600, color: accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
          {fm.primaryKeyword || "Research"}
        </p>
        <h3 style={{
          fontFamily: "Fraunces, Georgia, serif",
          fontSize: 24,
          fontWeight: 500,
          lineHeight: 1.2,
          color: C.headline,
          marginBottom: 16,
          letterSpacing: "-0.015em",
        }}>
          {post.title}
        </h3>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: C.body, marginBottom: 24 }}>
          {post.metaDescription}
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
          <span>{date}</span>
          <span>Read →</span>
        </div>
      </a>
    </Link>
  );
}

function IndustryCard({ post }: { post: any }) {
  const fm = post.frontmatter || {};
  return (
    <Link href={`/blog/${post.slug}`}>
      <a style={{
        display: "block",
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "20px 22px",
        textDecoration: "none",
        transition: "all 0.2s",
      }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = C.accent;
          (e.currentTarget as HTMLElement).style.background = "rgba(217,123,106,0.04)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = C.border;
          (e.currentTarget as HTMLElement).style.background = C.surface;
        }}
      >
        <p style={{ fontSize: 10, fontWeight: 600, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
          {fm.vertical?.replace(/_/g, " ") || "Industry"}
        </p>
        <h4 style={{
          fontFamily: "Fraunces, Georgia, serif",
          fontSize: 18,
          fontWeight: 500,
          lineHeight: 1.25,
          color: C.headline,
          letterSpacing: "-0.01em",
        }}>
          {post.title}
        </h4>
      </a>
    </Link>
  );
}
