/**
 * Maps deliverable types to journey node categories for the V2 portal.
 * Client-side mapping since deliverables don't have a category field in the DB.
 */

export interface JourneyCategory {
  id: string;
  title: string;
  icon: string; // emoji or 'google' | 'reddit'
  whyItMatters: string;
}

export const CATEGORIES: JourneyCategory[] = [
  {
    id: "website",
    title: "Website Optimization",
    icon: "🌐",
    whyItMatters: "AI engines like ChatGPT, Perplexity, and Google SGE pull answers directly from your website's structured data. Schema markup, FAQ schema, and llms.txt tell AI exactly what your business does — so you get cited instead of competitors.",
  },
  {
    id: "presence",
    title: "Online Presence",
    icon: "📍",
    whyItMatters: "AI models cross-reference directory listings to verify your business is real and trustworthy. Consistent NAP (Name, Address, Phone) across high-authority directories boosts your credibility score in AI-generated answers.",
  },
  {
    id: "content",
    title: "Content & Authority",
    icon: "✍️",
    whyItMatters: "AI engines rank businesses higher when they find authoritative content and social proof across multiple platforms. Guest articles, reviews, and social proof signals tell AI you're the go-to expert in your space.",
  },
  {
    id: "gbp",
    title: "GBP Optimization",
    icon: "google",
    whyItMatters: "Google Business Profile is the #1 source AI uses for local business information. A fully optimized GBP with services, Q&A, and regular updates dramatically increases your chances of appearing in AI-powered local recommendations.",
  },
  {
    id: "reddit",
    title: "Community Visibility",
    icon: "reddit",
    whyItMatters: "ChatGPT and other AI models heavily weight Reddit discussions when recommending businesses. Genuine community engagement creates organic mentions that AI treats as trusted, unbiased endorsements.",
  },
  {
    id: "competitor",
    title: "Competitor Analysis",
    icon: "🔍",
    whyItMatters: "Understanding what your competitors are doing right (and wrong) in AI search lets us reverse-engineer their strategy and find gaps. This gives you a roadmap to outrank them in AI-generated results.",
  },
  {
    id: "checkins",
    title: "Strategy Check-Ins",
    icon: "📞",
    whyItMatters: "AI search rankings shift constantly as models update. Regular check-ins let us track what's working, adjust strategy based on new AI visibility data, and keep your optimization ahead of the curve.",
  },
];

const TYPE_TO_CATEGORY: Record<string, string> = {
  // Website
  schema_markup: "website",
  robots_audit: "website",
  llms_txt: "website",
  faq_schema: "website",
  faq_install: "website",
  schema_installation: "website",
  website_rewrite: "website",

  // Presence
  directory_submissions: "presence",
  directory_guide: "presence",
  bing_places_guide: "presence",
  citation_audit: "presence",

  // Content
  review_strategy: "content",
  guest_articles_batch_1: "content",
  guest_articles_batch_2: "content",
  guest_articles_batch_3: "content",
  social_proof_strategy: "content",
  ai_assessment: "content",
  blog_content_program: "content",  // Dominator blog content (1 pillar + 18 shorts over 9 wks)

  // GBP
  gbp_optimization: "gbp",

  // Reddit
  reddit_engagement_batch_1: "reddit",
  reddit_engagement_batch_2: "reddit",
  reddit_engagement_batch_3: "reddit",
  reddit_engagement_batch_4: "reddit",
  reddit_engagement_batch_5: "reddit",
  reddit_engagement_batch_6: "reddit",

  // Check-ins
  monthly_checkin_1: "checkins",
  monthly_checkin_2: "checkins",

  // Competitor
  competitor_analysis: "competitor",
};

/** Get the category ID for a deliverable type. Falls back to "content". */
export function getCategoryForType(deliverableType: string): string {
  return TYPE_TO_CATEGORY[deliverableType] || "content";
}

/** Group deliverables by category. Returns only categories that have deliverables. */
export function groupDeliverablesByCategory(deliverables: any[]): {
  category: JourneyCategory;
  items: any[];
}[] {
  const groups = new Map<string, any[]>();

  for (const d of deliverables) {
    const catId = getCategoryForType(d.deliverableType || d.type || "");
    if (!groups.has(catId)) groups.set(catId, []);
    groups.get(catId)!.push(d);
  }

  // Return in the order defined by CATEGORIES, skip empty ones
  return CATEGORIES
    .filter((cat) => groups.has(cat.id))
    .map((cat) => ({ category: cat, items: groups.get(cat.id)! }));
}

/** Calculate node-level status from its deliverables.
 *
 * Progress accounting:
 *   - Each completed deliverable = 100% credit
 *   - Each in-progress deliverable contributes its `progressPercent` (0-100)
 *     proportionally. Without this, the warming Reddit deliverables (which
 *     spend 30 real days at progressPercent=30 before any post lands) showed
 *     the journey ring at 0% the entire time, making it look like nothing
 *     was happening. Now the ring reflects the warming itself, then climbs
 *     as drafts post during days 30-75.
 *   - pending / blocked / needs_action contribute 0
 */
export function getNodeStatus(items: any[]): {
  status: string;
  progress: number;
  completedCount: number;
  totalCount: number;
  actionCount: number;
} {
  const total = items.length;
  const completed = items.filter((d) => d.status === "completed").length;
  const blocked = items.filter((d) => d.status === "blocked").length;
  const needsAction = items.filter((d) => d.status === "needs_action" || d.status === "pending_approval").length;

  // Progress: completed = 100, in_progress = progressPercent (0-100), else 0.
  // Sum of weighted percentages, divided by (total * 100), gives node %.
  const weightedSum = items.reduce((acc: number, d: any) => {
    if (d.status === "completed" || d.status === "approved") return acc + 100;
    if (d.status === "in_progress") {
      const pct = typeof d.progressPercent === "number" ? Math.max(0, Math.min(100, d.progressPercent)) : 0;
      return acc + pct;
    }
    if (d.status === "pending_approval") return acc + 90; // almost done, just needs sign-off
    return acc; // pending/blocked/needs_action = 0
  }, 0);
  const progress = total > 0 ? Math.round(weightedSum / total) : 0;

  let status = "pending";
  if (completed === total && total > 0) status = "complete";
  else if (blocked > 0 || needsAction > 0) status = blocked > 0 ? "blocked" : "needs_action";
  else if (completed > 0 || items.some((d) => d.status === "in_progress")) status = "in_progress";

  return { status, progress, completedCount: completed, totalCount: total, actionCount: needsAction + blocked };
}
