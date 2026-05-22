/**
 * GBP Manager-Access Email Verifier (Option C from the 2026-05-04 portal review).
 *
 * When a client adds info@suggestedbygpt.com as a Manager on their Google Business
 * Profile, Google sends an email to info@ with subject like:
 *   - "[Business Name] has added you as a manager"
 *   - "[Business Name] has invited you to manage their Google Business Profile"
 *   - "You've been added as a manager of [Business Name]"
 *
 * We poll info@'s inbox via Composio Gmail (server/composioClient.ts) for that
 * email and fuzzy-match the business name against our client record. A match
 * means the client really did invite us — gate passes, we write a credential
 * row, and the GBP optimization deliverable progresses to Phase 2.
 *
 * This is the cheapest, most reliable verification we can do until either:
 *   (a) Google approves our GBP API access (60-day wait once we apply)
 *   (b) We stand up the AdsPower-driven google-ops browser profile for active
 *       login verification (planned, see memory file portal_progress_overhaul_plan)
 *
 * Why we trust the email:
 *   - Google sends it directly to info@ via no-reply@google.com (DKIM-signed)
 *   - The business name in the subject is what the client typed into Google's
 *     Business Profile setup — strong proof the invite actually went through
 *   - If a client revokes access later, the credential we wrote becomes stale
 *     but Phase 2 (PDF generation) doesn't actually use credentials, and Phase
 *     3 (active login) will use AdsPower verification anyway. Worst-case we
 *     generate a useless content package — not catastrophic.
 */

import { searchInfoGmail, isComposioConfigured, type GmailMessage } from './composioClient';

export interface GBPVerificationResult {
  verified: boolean;
  /** Subject line of the matched email, if any. Useful for logging + audit. */
  matchedSubject?: string;
  /** Date of the invite email (Gmail's internalDate). */
  matchedAt?: string;
  /** Why we returned what we did — surfaced in sessionNotes. */
  reason: string;
  /** True when verification couldn't run (Composio not configured, network error, etc.). */
  unavailable?: boolean;
}

/**
 * Normalize a business name for fuzzy matching. Strips common LLC/Inc/Co
 * suffixes, punctuation, multiple spaces, and lowercases. We use this on
 * BOTH the client's stored businessName AND the email subject before
 * comparing — neither side is canonical.
 */
function normalizeBusinessName(name: string): string {
  return name
    .toLowerCase()
    // Remove common business-entity suffixes
    .replace(/\b(llc|l\.l\.c\.|inc|inc\.|incorporated|corp|corporation|co|co\.|ltd|limited|llp|pllc|pc)\b/g, '')
    // Strip punctuation
    .replace(/[^\w\s]/g, ' ')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns true if the haystack contains the needle, treating both as
 * normalized business names. We use substring containment rather than
 * Levenshtein because business names in Google's emails should be
 * verbatim — fuzziness is mostly about LLC/Inc suffix differences.
 *
 * Compares THREE variants of each side:
 *   1. Whitespace-preserving normalized form ("your str management")
 *   2. Whitespace-stripped form ("yourstrmanagement")
 *   3. First 60% truncation of variant 1 (for long names that may get
 *      truncated in email subject lines)
 *
 * Match if ANY variant of the needle is contained in ANY variant of the
 * haystack. This handles the common case where a client types
 * "YourSTRManagement, Inc." in our intake form but Google's email subject
 * shows "Your STR Management has added you" (or vice versa).
 */
/**
 * Exposed for cross-client disambiguation in serviceExecution.ts
 * (review I3): when a verified match is found, the caller checks whether
 * the SAME haystack also matches OTHER clients' business names. If yes,
 * the match is ambiguous and we skip the credential write.
 */
export function fuzzyMatchAgainstHaystack(haystack: string, needle: string): boolean {
  return fuzzyContains(haystack, needle);
}

function fuzzyContains(haystack: string, needle: string): boolean {
  const hSpaced = normalizeBusinessName(haystack);
  const nSpaced = normalizeBusinessName(needle);
  if (!nSpaced) return false;

  const hStripped = hSpaced.replace(/\s+/g, '');
  const nStripped = nSpaced.replace(/\s+/g, '');

  // Variant 1: spaced-vs-spaced
  if (hSpaced.includes(nSpaced)) return true;
  // Variant 2: stripped-vs-stripped (handles "YourSTRManagement" vs "Your STR Management")
  if (hStripped.includes(nStripped)) return true;
  // Variant 3: 60% truncation (handles long names truncated in subject lines)
  if (nSpaced.length >= 8) {
    const truncSpaced = nSpaced.slice(0, Math.max(8, Math.floor(nSpaced.length * 0.6)));
    const truncStripped = nStripped.slice(0, Math.max(8, Math.floor(nStripped.length * 0.6)));
    if (hSpaced.includes(truncSpaced)) return true;
    if (hStripped.includes(truncStripped)) return true;
  }
  return false;
}

/**
 * Search info@'s inbox for a Google Business Profile manager-invite email
 * matching this client's business name.
 *
 * Returns:
 *   { verified: true,  matchedSubject, matchedAt }  on match
 *   { verified: false, reason }                     on no-match (retry-able)
 *   { verified: false, unavailable: true, reason }  when Composio can't run
 */
export async function verifyGBPManagerInviteEmail(args: {
  businessName: string;
  /** Look back this many days. Default 30 — Google invites don't expire that fast. */
  lookbackDays?: number;
}): Promise<GBPVerificationResult> {
  const { businessName, lookbackDays = 30 } = args;

  if (!isComposioConfigured()) {
    return {
      verified: false,
      unavailable: true,
      reason: 'Composio not configured — set COMPOSIO_API_KEY and COMPOSIO_INFO_GMAIL_ACCOUNT_ID on Railway',
    };
  }

  if (!businessName || businessName.trim().length === 0) {
    return {
      verified: false,
      reason: 'Client has no businessName on record — cannot match invite email',
    };
  }

  // Query Gmail for likely manager-invite emails. We cast a wide net then
  // filter in code — Google's email format varies and over-tight queries
  // miss invites we'd otherwise catch.
  //
  // Search operators:
  //   - from:google.com         catches both noreply@google.com and business@google.com
  //   - subject:(manager OR manage)  matches the common subject patterns
  //   - newer_than:30d         lookback (overrideable)
  const query = [
    'from:google.com',
    '(subject:manager OR subject:manage OR subject:invited OR subject:added)',
    `newer_than:${lookbackDays}d`,
  ].join(' ');

  let messages: GmailMessage[];
  try {
    messages = await searchInfoGmail(query, { maxResults: 25, includePayload: false });
  } catch (err) {
    return {
      verified: false,
      unavailable: true,
      reason: `Composio Gmail search failed: ${(err as Error).message}`,
    };
  }

  if (messages.length === 0) {
    return {
      verified: false,
      reason: `No manager-invite emails found in info@ inbox (last ${lookbackDays} days). Client may not have sent the invite yet, or it landed in a different account.`,
    };
  }

  // Find the first message whose subject (or sender body) contains the business name
  for (const msg of messages) {
    const haystack = `${msg.subject} ${msg.snippet}`;
    if (fuzzyContains(haystack, businessName)) {
      return {
        verified: true,
        matchedSubject: msg.subject,
        matchedAt: msg.date,
        reason: `Matched manager-invite email "${msg.subject}" (received ${msg.date})`,
      };
    }
  }

  // We have invite-shaped emails but none match this client's business name
  return {
    verified: false,
    reason: `Found ${messages.length} manager-invite emails in info@ inbox, but none mention "${businessName}". Most recent subject: "${messages[0]?.subject || '(empty)'}". Client may have used a different business name on Google than we have on file, or the invite went to a different account.`,
  };
}
