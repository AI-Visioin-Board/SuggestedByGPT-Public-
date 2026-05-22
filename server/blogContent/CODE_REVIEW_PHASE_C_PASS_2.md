# Code Review — Phase C Pass #2
*2026-05-12. After Pass #1 fixes. Fresh eyes.*

## Findings

### HIGH-A: Layer 2 → Layer 3 connection is brittle on JSON parse

In Layer 2 (extract claims), we parse Claude/Haiku's output as JSON. If the parse fails, we return `{ claims: [], costUsd: 0 }`. Then Layer 3 has nothing to research. Then Layer 4 has nothing to rewrite. The article ships without verification. That's actually FINE — the article is still quality-gated in Layer 5. But it's a silent skip we should log louder.

**Fix**: change `console.warn` to also log the article length so we know the verification was skipped on a real article (not just on a stub).

### HIGH-B: shortWriter exports `dryRunShortArticle` but the truncated read shows the import for `isCurrentEventsTopic` may still exist

Checking via grep — the helper itself was replaced with a comment but if any other code imports it from shortWriter, we'd break. Let me verify.

Verified: `isCurrentEventsTopic` was not exported, was a local function only. Removal is clean. ✓

### MEDIUM-A: longformWriter persists `generatedCostUsd` via `String(drafted.stats.totalCostUsd) as any`

This is a defensive cast for the decimal column. Drizzle's decimal columns want string, not number. Using `String(0.0123) as any` works but the `as any` is sloppy. Better: ensure drizzle's column type accepts string natively (it should for decimal types).

**Fix**: drop `as any` — drizzle accepts the string representation for decimal columns natively.

### MEDIUM-B: schemaBuilder's mainEntityOfPage is conditional

We set `mainEntityOfPage` only when `publishedUrl` is non-null. But at insert time, publishedUrl is always null (publishing happens later). So mainEntityOfPage is missing from the JSON-LD blob stored in DB. Then when we publish, we don't update the JSON-LD with the actual URL.

**Issue**: The Article JSON-LD on the published page won't have mainEntityOfPage = published URL. Google uses this to disambiguate the canonical page for the article. Missing it isn't a hard failure but reduces SEO signal.

**Fix**: Either
- (a) generate schemaJsonLd at PUBLISH time, not at WRITE time (re-build with the now-known publishedUrl)
- (b) store the schemaJsonLd template with a placeholder and substitute at publish time

(a) is cleaner; defer the schema generation to publish time. Add a TODO comment for Phase K (publish queue worker) — it'll need to call buildSchemaJsonLd with the live URL.

For Phase C: leave the current implementation but note the followup in the publish queue worker spec.

### MEDIUM-C: Long-form Layer 3 cost overrun is now controlled (top 10 + Haiku) — but the prompt itself could be tighter

Each Layer 3 call sends the FULL claim string + system prompt + web_search results to Claude. Long claim strings (some claims in our test were 200+ chars) inflate input tokens. Could truncate claims to ~120 chars for the verification step (the LLM doesn't need the full claim, just the assertion).

Defer — incremental optimization, not a correctness issue.

### LOW-A: No unit tests for qualityGates / markdownRenderer / schemaBuilder yet

Per the plan §22.1, these come in Phase J-T (after all modules built). Defer.

### LOW-B: The plan referenced `Module 6` for schemaBuilder; I named the file the same. ✓

### LOW-C: `dryRunLongformArticle` doesn't pass an `internalLinkTargets` to the prompt unless the config has one

The dry-run virtual config has `internalLinkTargets: null`. Falls back to "homepage". For testing of Order #5, I set up real link targets in the DB. For new orders, Phase E (stripe webhook integration) needs to provide initial link targets (homepage + key pages from site scrape).

**Note**: Add to Phase E TODO — when stripe webhook fires, run a quick site discovery to extract 3-5 candidate internal-link URLs into client_content_config.internalLinkTargets. This work is owned by Phase N/E.

## Fixes to apply

1. HIGH-A: louder warning when Layer 2 parse fails
2. MEDIUM-A: drop `as any` on generatedCostUsd
3. MEDIUM-B: TODO comment for schema-at-publish-time

Applying now.
