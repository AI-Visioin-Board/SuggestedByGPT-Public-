# Code Review — Phase C Pass #1
*2026-05-12. Reviewing longformWriter + shortWriter + qualityGates + schemaBuilder + markdownRenderer.*

## Findings

### CRITICAL-1: shortWriter's `researchResult: "skipped"` mapping happens BEFORE we know if claim is currentEvents

In shortWriter.ts:
```typescript
const finalClaims = claims.map(c => ({
  ...c,
  researchResult: isCurrentEvents && c.needsResearch ? undefined : "skipped",
}));
```

Setting `researchResult: undefined` is wrong — we should leave the field absent or set "skipped". `undefined` won't serialize properly to JSON. Also, even when `isCurrentEvents` is true, we DON'T actually call layer3 for shorts, so all claims should be "skipped".

**Fix**: just mark all short-writer claims as "skipped" since we never run Layer 3 for shorts. The currentEvents flag is dead code in the short path — remove it or implement layer3 for current-events shorts.

### CRITICAL-2: longformWriter passes `existingSchemaPlugin: config.existingSchemaPlugin as any` to schemaBuilder

The `as any` hides a real type issue. `existingSchemaPlugin` from the DB is a string like 'yoast'/null, but the schemaBuilder type signature is the narrow union. Should be a proper cast or runtime guard.

**Fix**: type the access as `ExistingSchemaPlugin` directly (drizzle returns varchar(32) | null which we type-cast safely):
```typescript
existingSchemaPlugin: config.existingSchemaPlugin as ExistingSchemaPlugin,
```

### HIGH-1: Quality gates word-count overflow buffer is now 800 for longform — but max_tokens for Layer 1 is 8000

Each token is ~0.75 words on average. 8000 tokens = 6000 words max. With 1500-2200 target + 800 buffer = max 3000 words = 4000 tokens. So max_tokens=8000 is wasteful but not broken. We're paying for output tokens we don't use. Minor cost optimization.

**Fix**: drop max_tokens to 5000 for longform Layer 1 (still gives 3750-word headroom).

### HIGH-2: shortWriter uses max_tokens=3500 — but 800 words target × ~1.3 tokens/word = ~1000-1500 tokens

Same issue, smaller. Drop to 2000.

### HIGH-3: `WEB_SEARCH_COST_PER_CALL = 0.01` is wrong

Actual Anthropic pricing for web_search is **$10 per 1,000 searches** = $0.01/search. So per-call cost is right. BUT the input-token cost of search results getting fed back into the model is what drove costs up. Real cost per Layer 3 call:
- Haiku input: ~5000 tokens × $1/1M = $0.005
- Haiku output: ~200 tokens × $5/1M = $0.001  
- web_search: $0.01
- **Total per Haiku call**: ~$0.016 — much better than Sonnet's ~$0.10

Top-10 claims × $0.016 = **$0.16 for Layer 3** (down from $3.88). Plus Layer 1 ($0.06) + Layer 2 ($0.02) + Layer 4 if needed ($0.06) = **~$0.30 per longform** ✓

**No code fix needed** — the cost-control changes already address this. Just documenting the math.

### MEDIUM-1: schemaBuilder uses `Record<string, unknown>` for schema objects — could be stricter typed

Not a bug. Minor. Defer.

### MEDIUM-2: `extractFAQs` heuristic relies on H2 named exactly "FAQ" or "Frequently Asked Questions" or "Common Questions"

If Claude writes "## FAQs" (plural with s) or "## Questions & Answers", we won't extract them. Plan section about quality gates: longform_missing_faq_section.

The quality gate looks for the section heading using `/^##\s+(FAQ|Frequently|Common Questions)/im` — which DOES match "FAQs" via the "FAQ" alternation (substring match — wait no, `(FAQ|...)` matches "FAQ" as a whole word in `FAQs`? Let me check: `^##\s+FAQ` matches "## FAQ" but also "## FAQs" because there's no word-boundary after FAQ. OK so the section header is fine.

But the extractor uses `(?:FAQ|Frequently Asked Questions|Common Questions)`. Same logic — substring matching on FAQs. OK.

What's missing: "Q&A", "Q & A", "Questions Answered", "Common Inquiries". Could be more lenient.

**Fix**: relax the regex to include more variants.

### MEDIUM-3: Cost telemetry isn't persisted to `generationLayers` for L2/L3 individually

We aggregate into `totalCostUsd` but lose per-layer breakdown. For debugging cost overruns later (the exact issue I just hit), per-layer cost would help.

**Fix**: extend GenerationLayerStats to track each layer's cost individually.

### LOW-1: shortWriter's "currentEvents" detection logic is dead code

We never actually use it to enable Layer 3. Remove for clarity.

### LOW-2: longformWriter doesn't pass `topic.format` into the prompt for "comparison" / "best_for" structuring guidance

The prompt says "Format: how_to" but doesn't tell Claude HOW each format should be structured. Could add format-specific scaffolding.

Defer — Claude handles this reasonably well from the format word alone.

## Fixes to apply now (CRITICAL + HIGH-3 already done):

1. CRITICAL-1: shortWriter — all claims marked "skipped", remove dead currentEvents path
2. CRITICAL-2: longformWriter + shortWriter — proper ExistingSchemaPlugin cast
3. HIGH-1: longformWriter L1 max_tokens 8000 → 5000
4. HIGH-2: shortWriter L1 max_tokens 3500 → 2000
5. MEDIUM-2: relax FAQ regex to include Q&A, Q & A
6. MEDIUM-3: per-layer cost tracking in GenerationLayerStats

Applying now.
