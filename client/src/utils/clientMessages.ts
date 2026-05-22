/**
 * Maps raw internal deliverable data to client-friendly messages.
 * Raw notes/blockerReason contain engineer-speak (Playwright, retry counts, etc.)
 * that clients should never see.
 */

interface ClientMessage {
  statusText: string;
  detail: string;
  chipLabel: string;
  chipColor: string;
}

const RETRY_KEYWORDS = /attempt|retry|retries|failed.*\d|playwright|automation|manta/i;

export function getClientMessage(deliverable: {
  status: string;
  notes?: string;
  blockerReason?: string;
  type?: string;
}): ClientMessage {
  const { status, notes, blockerReason } = deliverable;
  const reason = blockerReason?.toLowerCase() ?? "";

  if (status === "blocked") {
    // ── GBP / Google Business Profile access states ──
    // These come from server/serviceExecution.ts:executeGBPOptimization
    // (blockerReason values like "Waiting for client to grant GBP Manager access"
    // and "Client needs to create a Google Business Profile first"). Without
    // these specific branches, those reasons fall through to the generic
    // "technical issue" copy below — which is misleading when the actual
    // problem is the client hasn't done their part yet.
    if (
      reason.includes("manager access") ||
      reason.includes("manager invite") ||
      reason.includes("gbp manager") ||
      reason.includes("grant gbp")
    ) {
      return {
        statusText: "Needs your action",
        detail:
          "We need you to add info@suggestedbygpt.com as a Manager at " +
          "business.google.com (Settings → Managers → Add). Once you do, " +
          "we'll detect the invite and continue the optimization.",
        chipLabel: "Action Needed",
        chipColor: "#FB923C", // orange — matches "Action Needed" sections
      };
    }
    if (
      reason.includes("needs to create") ||
      reason.includes("no google business profile") ||
      reason.includes("no gbp") ||
      (reason.includes("create") && reason.includes("google business"))
    ) {
      return {
        statusText: "Needs your action",
        detail:
          "You don't have a Google Business Profile yet. Setting one up takes " +
          "about 5 minutes — check your action items for a step-by-step guide.",
        chipLabel: "Action Needed",
        chipColor: "#FB923C",
      };
    }

    if (reason.includes("credential") || reason.includes("login") || reason.includes("password")) {
      return {
        statusText: "Needs your login info",
        detail: "We need updated login credentials to continue. Check your action items.",
        chipLabel: "Needs Attention",
        chipColor: "#FBBF24",
      };
    }
    if (reason.includes("two_factor") || reason.includes("2fa") || reason.includes("mfa")) {
      return {
        statusText: "Needs 2FA access",
        detail: "This requires two-factor authentication. We'll reach out to complete it together.",
        chipLabel: "Needs Attention",
        chipColor: "#FBBF24",
      };
    }
    if (reason.includes("sso") || reason.includes("single sign")) {
      return {
        statusText: "Needs SSO access",
        detail: "This requires single sign-on authentication. We'll reach out to complete it together.",
        chipLabel: "Needs Attention",
        chipColor: "#FBBF24",
      };
    }
    // Generic block — internal/technical issue
    return {
      statusText: "Being handled by our team",
      detail: "We ran into a technical issue and our team is working on it.",
      chipLabel: "With Our Team",
      chipColor: "#60A5FA",
    };
  }

  if (status === "pending" && notes && RETRY_KEYWORDS.test(notes)) {
    return {
      statusText: "In progress",
      detail: "Working on it — we'll update you when it's done.",
      chipLabel: "",
      chipColor: "",
    };
  }

  if (status === "in_progress") {
    return {
      statusText: "In progress",
      detail: "We're working on this now.",
      chipLabel: "",
      chipColor: "",
    };
  }

  if (status === "pending_approval") {
    return {
      statusText: "Ready for your review",
      detail: "Please approve before we make changes.",
      chipLabel: "Ready for Review",
      chipColor: "#A78BFA",
    };
  }

  if (status === "completed") {
    return {
      statusText: "Done",
      detail: "",
      chipLabel: "",
      chipColor: "",
    };
  }

  if (status === "approved") {
    return {
      statusText: "Approved — changes being applied",
      detail: "We're implementing the approved changes on your website.",
      chipLabel: "",
      chipColor: "",
    };
  }

  if (status === "change_requested") {
    return {
      statusText: "Revising based on your feedback",
      detail: "We're working on the changes you requested.",
      chipLabel: "",
      chipColor: "",
    };
  }

  // Default
  return {
    statusText: "Pending",
    detail: "",
    chipLabel: "",
    chipColor: "",
  };
}

/**
 * Translates technical deliverable titles to plain English.
 * Titles not in the map pass through unchanged.
 */
const TITLE_MAP: Record<string, string> = {
  "Schema Markup Implementation": "AI-Readability Upgrade",
  "AI Crawler Access Audit": "Enabling AI Search Bots",
  "Citation Audit & Directory Sync": "Matching Your Info Across the Web",
  "Citation Audit & Directory Submission Guide": "Directory Listing Guide",
  "CSQ Framework Optimization": "Boosting Your Professional Authority",
  "AI Visibility Assessment Report": "Your AI Visibility Score",
  "AI Visibility Competitor Analysis": "Competitor Analysis",
  "Social Proof & Review Generation": "Building Your Online Reputation",
  "Advanced Website Optimizations": "Website Enhancements",
  "Schema Markup Implementation Guide": "AI-Readability Guide",
  "Directory Submission Guide": "Directory Listing Guide",
};

export function getClientTitle(title: string): string {
  // Fix common UTF-8 encoding artifacts from DB
  const cleaned = title
    .replace(/â€"/g, "—")   // em dash
    .replace(/â€"/g, "–")   // en dash
    .replace(/â€™/g, "'")   // right single quote
    .replace(/â€œ/g, '"')   // left double quote
    .replace(/â€\u009D/g, '"') // right double quote
    .replace(/Ã©/g, "é")
    .replace(/Ã¨/g, "è");
  return TITLE_MAP[cleaned] ?? cleaned;
}
