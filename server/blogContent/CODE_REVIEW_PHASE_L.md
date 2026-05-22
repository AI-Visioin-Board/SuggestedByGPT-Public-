# Phase L Code Review — Post-publish verifier

## Scope
- NEW: `server/blogContent/verifier.ts` — fetches live URL, validates content, sets status='verified' on success

## Findings

### 1. CDN propagation grace window of 15 min (LOW)
We require `publishedAt < now - 15min` before attempting verification. WordPress + Squarespace can serve stale cache; 15 min is the rough industry norm. **Resolution**: ✓

### 2. Schema validation parses every `<script type="application/ld+json">` on the page (LOW)
Many themes (Yoast, RankMath, Google Tag Manager) inject schema blocks. We aggregate all `@type` values from all blocks. The presence test (`schema_present`) is too lax — if the theme has its own schema but ours is missing, we wouldn't catch the regression.
**Resolution**: would need to fingerprint our schema (e.g., search for a unique field like the businessName or schema's `description`) to be precise. For v1, presence + valid-JSON is enough. Tracked as a future improvement.

### 3. H1 match is fuzzy (LOW)
We do a case-insensitive `includes` check both ways. This catches the case where the theme appends " | Site Name" to the H1.
**Resolution**: ✓

### 4. Word count uses 50% floor (LOW)
If live word count is below half the post's bodyWordCount, we flag `word_count_low`. This catches the case where the body didn't render but page chrome did.
**Resolution**: ✓

### 5. Internal links may be rewritten by the CMS (LOW)
WordPress can rewrite `/about` → `https://site.com/about` on render. If our source URLs were already absolute, this won't matter. If they were relative, the check could fail.
**Resolution**: low risk in practice. The Phase B internal link targets are populated as absolute URLs from the site scrape. ✓

### 6. No screenshot capture (LOW)
Plan mentions desktop + mobile screenshots stored to `screenshotDesktopUrl` / `screenshotMobileUrl`. We're skipping screenshots in v1 to avoid Patchright dependency (verifier should run lightweight HTTP fetch only).
**Resolution**: documented. Adding screenshots requires either Patchright (heavy, mutex-controlled) or a third-party screenshot API. Deferred.

### 7. Residential proxy NOT used (MEDIUM, accepted)
Plan calls for residential proxy fetch to bypass Cloudflare bot challenges. Today we use direct Railway-IP fetch with a `SuggestedByGPT verifier` user agent. Cloudflare-protected client sites may return 403.
**Mitigation**: a 403 fetch returns `http_403` in failure_reasons — operator sees it. Re-running the verifier through `ENV.scannerProxyUrl` (the existing IPRoyal residential proxy used by the Reddit scanner) is a 5-line change if we hit issues.
**Resolution**: tracked. Easy to retrofit; not blocking initial launch.

### 8. `internal_links_live === 0` is the failure trigger (LOW)
If we had 5 internal links and 1 survives, we don't flag it. Lenient by design — theme strip-down is real and partial preservation is fine.
**Resolution**: ✓

### 9. Verifier doesn't retry on transient errors (LOW)
A network blip = one verifier failure → status stays 'published'. Next tick will retry (we filter by `verifiedAt IS NULL`). So transient errors heal on next cron.
**Resolution**: ✓

### 10. The 7-day age cap stops infinite retries (LOW)
After 7 days unverified, the post is silently dropped from candidates. Operator must manually mark verified or reset `publishedAt`.
**Resolution**: documented in code comment.

## Verdict
**Ship.** All findings LOW/MEDIUM with documented mitigations. Verifier is lightweight (HTTP fetch only) and reads cleanly.
