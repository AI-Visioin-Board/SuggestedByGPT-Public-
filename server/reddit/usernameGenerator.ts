/**
 * Reddit Username Generator
 *
 * Reddit username rules: 3-20 chars, [a-zA-Z0-9_], cannot start with underscore.
 * Case-insensitive at login but display preserves casing.
 *
 * Strategy:
 *   1. Slug the business name (lowercase, alphanumeric only)
 *   2. Try slug as-is
 *   3. Fall back to slug + 2-digit suffix (slug_42)
 *   4. Caller iterates `attempt` 0..N to get variations when Reddit says "taken"
 */

const REDDIT_USERNAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_]{2,19}$/;
const RESERVED_PREFIXES = ['admin', 'mod', 'reddit', 'official']; // avoid impersonation flags

function slugify(businessName: string): string {
  return businessName
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/'/g, '')           // strip apostrophes
    .replace(/[^a-z0-9 ]/g, '')  // strip everything else non-alphanumeric
    .replace(/\s+/g, '');        // collapse spaces
}

function startsWithReserved(slug: string): boolean {
  return RESERVED_PREFIXES.some(p => slug.startsWith(p));
}

/**
 * Generate one username candidate. attempt=0 returns the cleanest form,
 * higher attempts add disambiguating suffixes.
 *
 * Throws if no valid candidate can be produced (very rare — pathological input).
 */
export function generateUsername(businessName: string, attempt: number = 0): string {
  const slug = slugify(businessName);
  if (!slug || slug.length < 3) {
    throw new Error(`Cannot generate Reddit username from "${businessName}" — slug too short`);
  }

  // Reserve names starting with admin/mod/reddit/official → force prefix variation
  const safe = startsWithReserved(slug) ? `the${slug}` : slug;

  // attempt 0: brand-only (max 20 chars)
  if (attempt === 0 && safe.length >= 3 && safe.length <= 20) {
    return safe.slice(0, 20);
  }

  // attempt 1+: add 2-digit numeric suffix
  // Use deterministic suffix per attempt for reproducibility in logs
  const suffix = String(((attempt * 17) % 100)).padStart(2, '0');
  const truncatedSafe = safe.slice(0, 17); // 17 + '_' + 2 = 20
  const candidate = `${truncatedSafe}_${suffix}`;

  if (REDDIT_USERNAME_REGEX.test(candidate)) {
    return candidate;
  }

  // Final fallback: brand + last attempt's 2-digit + random char
  const fallbackSuffix = `${suffix}${'abcdefghjkmnpqrstuvwxyz'[attempt % 23]}`;
  return `${safe.slice(0, 16)}_${fallbackSuffix}`.slice(0, 20);
}

/** Validate a username string against Reddit's rules. */
export function isValidRedditUsername(username: string): boolean {
  return REDDIT_USERNAME_REGEX.test(username);
}

/**
 * Generate up to N candidates for a single business. Used when we want to
 * try multiple in sequence on Reddit (signup says "taken" → try next).
 */
export function generateUsernameCandidates(businessName: string, count: number = 5): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < count && i < count * 3; i++) {
    try {
      const candidate = generateUsername(businessName, i);
      if (!seen.has(candidate.toLowerCase())) {
        out.push(candidate);
        seen.add(candidate.toLowerCase());
      }
    } catch {
      break; // pathological input
    }
  }
  return out;
}
