/**
 * Page-specific JSON-LD schema builders for GEO/SEO.
 *
 * Site-wide Organization, WebSite, Service, and FAQPage already live in
 * `client/index.html`. This file produces ADDITIONAL page-specific graphs
 * — e.g. the WebPage / BreadcrumbList / HowTo / SoftwareApplication
 * package for `/start`, the AI-visibility scan funnel.
 *
 * Why per-page graphs matter for GEO: AI crawlers and search engines weight
 * the most specific schema match for the URL they're indexing. A site-wide
 * Service schema is great for "what does SuggestedByGPT do" answers, but a
 * page-specific HowTo + SoftwareApplication on /start is what lets ChatGPT
 * answer "how do I get my business in ChatGPT" with our actual flow as the
 * cited source.
 */

const ORIGIN = "https://suggestedbygpt.com";

interface BuildStartPageGraphArgs {
  /** Override datePublished / dateModified if needed (defaults to today). */
  dateModified?: string;
}

/**
 * Build the JSON-LD @graph for the /start funnel page.
 *
 * Includes:
 *   - WebPage (with Speakable + AssessAction potentialAction)
 *   - BreadcrumbList
 *   - HowTo: "How to Get Your Business Recommended by ChatGPT"
 *   - SoftwareApplication: the free AI visibility scanner itself
 *
 * The returned object is JSON-serializable and meant to be stringified into
 * a `<script type="application/ld+json">` tag.
 */
export function buildStartPageGraph({ dateModified }: BuildStartPageGraphArgs = {}) {
  const now = (dateModified || new Date().toISOString().split("T")[0]);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${ORIGIN}/start#webpage`,
        url: `${ORIGIN}/start`,
        name: "Free AI Visibility Scan — Is Your Business Invisible to AI?",
        description:
          "Free 60-second AI visibility scan. See exactly how ChatGPT, Gemini, Claude, and Perplexity see your business — and what to fix. No credit card required.",
        isPartOf: { "@id": `${ORIGIN}/#website` },
        about: { "@id": `${ORIGIN}/#service` },
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: `${ORIGIN}/og-start.png`,
          width: 1200,
          height: 630,
        },
        speakable: {
          "@type": "SpeakableSpecification",
          // Selectors that voice assistants should read aloud when answering
          // "is my business showing up in ChatGPT" style queries.
          cssSelector: ["h1", "[data-speakable]", "[data-faq-question]", "[data-faq-answer]"],
        },
        datePublished: "2026-02-01",
        dateModified: now,
        inLanguage: "en-US",
        potentialAction: {
          "@type": "AssessAction",
          name: "Run AI Visibility Scan",
          description: "Free 60-second scan that grades your business on AI search visibility.",
          target: `${ORIGIN}/start#scan-section`,
          result: {
            "@type": "Report",
            name: "AI Visibility Score Report",
          },
        },
        breadcrumb: { "@id": `${ORIGIN}/start#breadcrumbs` },
        mainEntity: { "@id": `${ORIGIN}/start#howto` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${ORIGIN}/start#breadcrumbs`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: ORIGIN },
          { "@type": "ListItem", position: 2, name: "AI Visibility Scan" },
        ],
      },
      {
        "@type": "HowTo",
        "@id": `${ORIGIN}/start#howto`,
        name: "How to Get Your Business Recommended by ChatGPT and Other AI Assistants",
        description:
          "Free, repeatable steps to make your local business appear in AI-generated recommendations from ChatGPT, Google Gemini, Claude, and Perplexity.",
        totalTime: "PT60S",
        estimatedCost: {
          "@type": "MonetaryAmount",
          currency: "USD",
          value: "0",
        },
        supply: [
          { "@type": "HowToSupply", name: "Your business website URL" },
          { "@type": "HowToSupply", name: "Your business name and industry" },
        ],
        tool: [
          { "@type": "HowToTool", name: "SuggestedByGPT AI Visibility Scanner" },
        ],
        step: [
          {
            "@type": "HowToStep",
            position: 1,
            name: "Run the free AI visibility scan",
            text: "Enter your website and business name. We check ChatGPT, Gemini, Claude, and Perplexity to see if and how your business surfaces in AI answers. Takes about 60 seconds.",
            url: `${ORIGIN}/start#scan-section`,
          },
          {
            "@type": "HowToStep",
            position: 2,
            name: "Review your AI visibility score",
            text: "You receive a personalized PDF with a 0–100 score, what's working, what's missing, and the specific signals AI models look for when deciding which businesses to recommend.",
            url: `${ORIGIN}/start#results`,
          },
          {
            "@type": "HowToStep",
            position: 3,
            name: "Pick a fix path",
            text: "Self-serve with the free report, or pick AI Jumpstart ($99 one-time) for the technical fixes, or AI Dominator ($299 + $89/mo × 2) for full done-for-you AI visibility including directory submissions, GBP optimization, and guest articles.",
            url: `${ORIGIN}/start#offer`,
          },
          {
            "@type": "HowToStep",
            position: 4,
            name: "Get recommended by AI",
            text: "Once schema markup, llms.txt, directory listings, Google Business Profile, and content signals are aligned, AI assistants begin including your business in their answers — typically within 1–3 weeks.",
          },
        ],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${ORIGIN}/#software`,
        name: "SuggestedByGPT AI Visibility Scanner",
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "SEO Software",
        operatingSystem: "Web",
        url: `${ORIGIN}/start`,
        provider: { "@id": `${ORIGIN}/#organization` },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          eligibleRegion: { "@type": "Country", name: "United States" },
        },
        featureList: [
          "AI visibility scoring across ChatGPT, Gemini, Claude, and Perplexity",
          "Schema markup audit",
          "AI crawler access audit (robots.txt, llms.txt)",
          "Citation and brand mention check",
          "Competitor AI visibility comparison",
          "Personalized PDF visibility report",
        ],
      },
    ],
  };
}
