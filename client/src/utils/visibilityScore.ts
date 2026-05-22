/**
 * Visibility Score Calculator
 * Two separate 100-point scales:
 *   1. Main visibility bar — all deliverables normalized to 100
 *   2. Directory circle chart — 10 directories × 10 pts = 100
 *
 * Also provides pending-points diffing for the "team completed work" login animation.
 */

// ── Point weights per deliverable type (matches ACTUAL DB types from stripeWebhook.ts) ──
const DELIVERABLE_POINTS: Record<string, number> = {
  // Website Optimization
  ai_assessment: 3,
  schema_markup: 3,              // Schema markup report
  schema_implementation: 8,       // Jumpstart schema install
  schema_website_implementation: 8, // Dominator schema install
  robots_txt_audit: 3,
  llms_txt: 5,
  faq_schema: 4,
  faq_website_implementation: 8,  // FAQ install on website
  content_optimization: 5,        // Website rewrite

  // GBP
  gbp_optimization: 8,

  // Presence (non-directory)
  citation_audit: 3,
  directory_submission_guide: 2,  // Directory listing guide
  bing_places: 2,                 // Bing places guide
  citation_building: 3,

  // Directory submissions (as a single deliverable)
  directory_submissions: 2,

  // Content & Authority
  competitor_analysis: 3,
  review_strategy: 3,
  social_proof_strategy: 3,
  guest_posts_batch_1: 2,
  guest_posts_batch_2: 2,
  guest_posts_batch_3: 2,

  // Reddit / Community (6 batches × 5 posts = 30 total)
  reddit_engagement_batch_1: 1,
  reddit_engagement_batch_2: 1,
  reddit_engagement_batch_3: 1,
  reddit_engagement_batch_4: 1,
  reddit_engagement_batch_5: 1,
  reddit_engagement_batch_6: 1,

  // Check-ins
  monthly_checkin_1: 2,
  monthly_checkin_2: 2,
};

// Directories to skip in scoring
const SKIPPED_DIRS = ["yellow pages"];
function isSkippedDir(name: string): boolean {
  return SKIPPED_DIRS.some((d) => name.toLowerCase().includes(d));
}

// ── Friendly labels for floating point animation ──
const DELIVERABLE_LABELS: Record<string, string> = {
  ai_assessment: "AI Assessment",
  schema_markup: "Schema Markup",
  schema_implementation: "Schema Installation",
  schema_website_implementation: "Schema Installation",
  robots_txt_audit: "Robots Audit",
  llms_txt: "llms.txt",
  faq_schema: "FAQ Schema",
  faq_website_implementation: "FAQ Installation",
  content_optimization: "Website Rewrite",
  gbp_optimization: "GBP Optimization",
  citation_audit: "Citation Audit",
  citation_building: "Citation Building",
  directory_submission_guide: "Directory Guide",
  bing_places: "Bing Places Guide",
  directory_submissions: "Directory Submissions",
  competitor_analysis: "Competitor Analysis",
  review_strategy: "Review Strategy",
  social_proof_strategy: "Social Proof Strategy",
  guest_posts_batch_1: "Guest Article",
  guest_posts_batch_2: "Guest Article",
  guest_posts_batch_3: "Guest Article",
  reddit_engagement_batch_1: "Reddit Engagement",
  reddit_engagement_batch_2: "Reddit Engagement",
  reddit_engagement_batch_3: "Reddit Engagement",
  reddit_engagement_batch_4: "Reddit Engagement",
  reddit_engagement_batch_5: "Reddit Engagement",
  reddit_engagement_batch_6: "Reddit Engagement",
  monthly_checkin_1: "Monthly Check-in",
  monthly_checkin_2: "Monthly Check-in",
};

export interface VisibilityScore {
  /** Normalized 0-100 */
  score: number;
  maxScore: 100;
  /** Raw earned (before normalization) */
  earned: number;
  /** Raw possible — only counts deliverables this client actually HAS */
  possible: number;
}

export interface DirectoryScore {
  /** 0-100 (10 pts per dir) */
  score: number;
  completed: number;
  inProgress: number;
  total: number;
}

export interface PendingPoint {
  label: string;
  amount: number;
}

export interface NextObjective {
  /** Short description of what to do */
  label: string;
  /** Which section to scroll to (id) */
  scrollTarget: string;
  /** Type: 'directory' | 'credential' | 'approval' | 'action' */
  type: string;
}

// ── Main visibility bar score ──
// IMPORTANT: Only counts deliverables the client ACTUALLY has, not all possible types
export function calculateVisibilityScore(
  deliverables: any[],
  directorySubmissions: any[]
): VisibilityScore {
  let earned = 0;
  let possible = 0;

  // Score based on THIS client's actual deliverables
  for (const d of deliverables) {
    const type = d.deliverableType || d.type || "";
    const weight = DELIVERABLE_POINTS[type];
    if (weight !== undefined) {
      possible += weight;
      if (d.status === "completed") {
        earned += weight;
      }
    } else {
      // Unknown type — still count it (3 pts default) so the score isn't inflated
      possible += 3;
      if (d.status === "completed") {
        earned += 3;
      }
    }
  }

  // Add directory points (1pt per completed dir, possible = total active dirs)
  const activeDirs = directorySubmissions.filter((s: any) => !isSkippedDir(s.directoryName));
  const completedDirs = activeDirs.filter(
    (s: any) => s.status === "completed" || s.vaStatus === "verified"
  ).length;
  earned += completedDirs;
  possible += activeDirs.length;

  const score = possible > 0 ? Math.round((earned / possible) * 100) : 0;

  return { score: Math.min(score, 100), maxScore: 100, earned, possible };
}

// ── Directory circle chart score (own 100-point scale) ──
export function calculateDirectoryScore(directorySubmissions: any[]): DirectoryScore {
  const active = directorySubmissions.filter((s: any) => !isSkippedDir(s.directoryName));
  const total = active.length;
  const completed = active.filter(
    (s: any) => s.status === "completed" || s.vaStatus === "verified"
  ).length;
  const inProgress = active.filter(
    (s: any) =>
      s.status !== "completed" &&
      s.vaStatus !== "verified" &&
      (s.status === "in_progress" || s.vaStatus === "in_progress" || s.vaStatus === "submitted")
  ).length;

  // Each directory = equal share of 100
  const ptsPerDir = total > 0 ? Math.round(100 / total) : 10;
  const score = Math.min(completed * ptsPerDir, 100);

  return { score, completed, inProgress, total };
}

// ── Find the next thing the client should do ──
export function getNextObjective(
  deliverables: any[],
  directorySubmissions: any[],
  actionItems: any[]
): NextObjective | null {
  // Priority 1: Pending action items
  const pendingActions = (actionItems || []).filter((a: any) => a.status === "pending");
  if (pendingActions.length > 0) {
    const item = pendingActions[0];
    const actionType = item.actionType || item.type || "";

    if (actionType.includes("credential") || actionType.includes("cms")) {
      return { label: "Upload your website credentials to unlock next steps", scrollTarget: "action-items-section", type: "credential" };
    }
    if (actionType.includes("gbp") || actionType.includes("google")) {
      return { label: "Verify your Google Business Profile", scrollTarget: "action-items-section", type: "action" };
    }
    return { label: item.title || "Complete a pending action item", scrollTarget: "action-items-section", type: "action" };
  }

  // Priority 1.5: All action items done but deliverables still at 0 → worker is processing
  const completedDeliverables = deliverables.filter((d: any) =>
    d.status === "completed" || d.status === "approved" || d.status === "pending_approval"
  );
  if (pendingActions.length === 0 && deliverables.length > 0 && completedDeliverables.length === 0) {
    const hasPendingDeliverables = deliverables.some((d: any) => d.status === "pending" || d.status === "in_progress");
    if (hasPendingDeliverables) {
      return { label: "Credentials saved! Your deliverables are being processed...", scrollTarget: "work-details-section", type: "processing" };
    }
  }

  // Priority 2: Deliverables needing approval
  const needsApproval = deliverables.filter((d: any) => d.status === "pending_approval");
  if (needsApproval.length > 0) {
    return { label: `Review and approve: ${needsApproval[0].title}`, scrollTarget: "work-details-section", type: "approval" };
  }

  // Priority 3: Client-required directories
  const clientDirs = directorySubmissions.filter((s: any) =>
    !isSkippedDir(s.directoryName) &&
    s.status !== "completed" && s.vaStatus !== "verified" &&
    (s.directoryName.toLowerCase().includes("yelp") ||
     s.directoryName.toLowerCase().includes("bing") ||
     s.directoryName.toLowerCase().includes("apple"))
  );
  if (clientDirs.length > 0) {
    return { label: `Claim your ${clientDirs[0].directoryName} listing (+10 pts)`, scrollTarget: "directory-section", type: "directory" };
  }

  // Priority 4: Any manual-required directory
  const manualDirs = directorySubmissions.filter((s: any) =>
    !isSkippedDir(s.directoryName) &&
    s.status === "manual_required" && s.requiresManualVerification
  );
  if (manualDirs.length > 0) {
    return { label: `Complete verification for ${manualDirs[0].directoryName}`, scrollTarget: "directory-section", type: "directory" };
  }

  // All done!
  return null;
}

// ── Pending team points (diff for login animation) ──
export function getPendingTeamPoints(
  deliverables: any[],
  directorySubmissions: any[],
  lastSeenScore: number | null
): PendingPoint[] {
  // First login — no animation
  if (lastSeenScore === null) return [];

  const current = calculateVisibilityScore(deliverables, directorySubmissions);
  if (current.score <= lastSeenScore) return [];

  // Build list of completed deliverables that likely contributed
  const points: PendingPoint[] = [];
  const completedTypes = deliverables
    .filter((d: any) => d.status === "completed")
    .map((d: any) => d.deliverableType || d.type || "");

  for (const type of completedTypes) {
    const label = DELIVERABLE_LABELS[type] || type.replace(/_/g, " ");
    const weight = DELIVERABLE_POINTS[type] || 3;
    const normalizedPts = current.possible > 0 ? Math.round((weight / current.possible) * 100) : weight;
    if (normalizedPts > 0) {
      points.push({ label, amount: normalizedPts });
    }
  }

  const delta = current.score - lastSeenScore;
  if (points.length === 0 && delta > 0) {
    points.push({ label: "Team Progress", amount: delta });
  }

  return points;
}

export { DELIVERABLE_POINTS, DELIVERABLE_LABELS };
