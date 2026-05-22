/**
 * Quality gates — pure validation for generated articles.
 *
 * Pre-publish check. Runs on the FINAL markdown produced by the writer (after
 * all verification layers). Pass = article is allowed to enter the publish
 * queue. Fail = writer caller decides to retry or reject the topic.
 *
 * No I/O, no async, no external deps. Easy to unit test.
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md § Module 9.
 */

import type { ArticleKind, QualityGateResult } from "./types";
import { findBannedVocabulary, containsEmDash } from "./antiAiRules";

interface QualityGateOpts {
  /** Optional: max word-count delta the article can go over the kind's max */
  maxWordOverflow?: number;
  /** Optional: ignore internal-links requirement (testing only) */
  skipInternalLinksCheck?: boolean;
}

/**
 * Run all quality gates on a generated article. Returns pass/fail + reasons.
 */
export function runQualityGates(
  markdown: string,
  kind: ArticleKind,
  opts: QualityGateOpts = {},
): QualityGateResult {
  const failures: string[] = [];

  if (!markdown || typeof markdown !== "string") {
    return { passed: false, failureReasons: ["empty_markdown"], attempts: 1 };
  }

  // ─── 1. Word count ───
  // Allow generous overflow buffer — Claude often goes 600-900 over because it
  // tries to be thorough. The 800-word overflow accommodates this without
  // forcing retries that don't materially improve quality.
  const wordCount = countWords(markdown);
  const [minWords, maxWords] = kind === "longform" ? [1500, 2200] : [400, 800];
  const overflow = opts.maxWordOverflow ?? (kind === "longform" ? 800 : 400);
  if (wordCount < minWords) failures.push(`word_count_below_min (${wordCount} < ${minWords})`);
  if (wordCount > maxWords + overflow) failures.push(`word_count_far_over_max (${wordCount} > ${maxWords + overflow})`);

  // ─── 2. Structure ───
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  if (!h1Match) failures.push("missing_h1");
  const h2Count = (markdown.match(/^##\s+/gm) || []).length;
  const minH2 = kind === "longform" ? 5 : 2;
  if (h2Count < minH2) failures.push(`insufficient_h2_sections (${h2Count} < ${minH2})`);

  // ─── 3. Anti-AI vocabulary ───
  const banned = findBannedVocabulary(markdown);
  if (banned) failures.push(`banned_vocabulary: "${banned}"`);

  // ─── 4. Em dashes ───
  if (containsEmDash(markdown)) failures.push("contains_em_dashes");

  // ─── 5. Confidence-calibration filler (top offenders) ───
  const FILLER_PATTERNS = [
    /\bIt's worth noting\b/i,
    /\bNotably,/i,
    /\bInterestingly,/i,
    /\bImportantly,/i,
    /\bSignificantly,/i,
    /\bIn an era where\b/i,
    /\bIn today's [a-z]+\b/i,
  ];
  for (const pattern of FILLER_PATTERNS) {
    const m = markdown.match(pattern);
    if (m) {
      failures.push(`filler_phrase: "${m[0]}"`);
      break;
    }
  }

  // ─── 6. Transition crutches ───
  const CRUTCHES = /\b(Moreover|Furthermore|Additionally|That said)\b/i;
  const crutchMatch = markdown.match(CRUTCHES);
  if (crutchMatch) failures.push(`transition_crutch: "${crutchMatch[0]}"`);

  // ─── 7. Chatbot artifacts ───
  const CHATBOT_PATTERNS = [
    /Let's explore/i,
    /Let's dive/i,
    /In this article we will/i,
    /Here's the kicker/i,
    /But here's the thing/i,
    /I hope this helps/i,
    /Great question/i,
  ];
  for (const pattern of CHATBOT_PATTERNS) {
    const m = markdown.match(pattern);
    if (m) {
      failures.push(`chatbot_artifact: "${m[0]}"`);
      break;
    }
  }

  // ─── 8. Title length (extracted from H1) ───
  if (h1Match && h1Match[1].length > 70) {
    failures.push(`h1_too_long (${h1Match[1].length} > 70)`);
  }

  // ─── 9. FAQ section required for longform ───
  if (kind === "longform") {
    const hasFAQ = /^##\s+(FAQ|Frequently Asked Questions|Common Questions)/im.test(markdown);
    if (!hasFAQ) failures.push("longform_missing_faq_section");
  }

  // ─── 10. Internal links (longform requires 2+, short requires 1+) ───
  // Internal link = markdown link pointing to a relative path OR to the same domain.
  // We can't know the client's domain here; defer to the writer's internal-link tracking.
  // This check is a coarse markdown pattern: any [text](/...) or [text](https://...)
  if (!opts.skipInternalLinksCheck) {
    // Count markdown links — we'll trust the writer to have produced internal links;
    // the actual internal-vs-external distinction happens at link-tracking time.
    const totalLinks = (markdown.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
    const minLinksForKind = kind === "longform" ? 3 : 1; // 2 internal + ≥1 external for longform
    if (totalLinks < minLinksForKind) {
      failures.push(`insufficient_links (${totalLinks} < ${minLinksForKind})`);
    }
  }

  return {
    passed: failures.length === 0,
    failureReasons: failures,
    attempts: 1,
  };
}

/**
 * Strip markdown formatting characters before counting.
 * Approximates "what a human would count if they read the article aloud."
 */
export function countWords(s: string): number {
  if (!s) return 0;
  const cleaned = s
    .replace(/```[\s\S]*?```/g, " ")  // strip code blocks
    .replace(/`[^`]+`/g, " ")          // strip inline code
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ") // strip image alt + src
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // keep link text, strip URL
    .replace(/[#*_>|]/g, " ")          // strip formatting chars
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(w => w.length > 0).length;
}
