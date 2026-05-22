# Phase M Code Review — Per-client citation monitor

## Scope
- NEW: `server/blogContent/citationMonitor.ts` — weekly per-config web-search query battery, records `client_citation_check` rows

## Findings

### 1. 6-day cadence check is "at most one run per 6 days" (LOW)
We skip a config if its most recent row is within 6 days. Combined with the weekly cron (Phase Q), this prevents double-runs while allowing the run window to drift by a day. ✓

### 2. Query cap of 12 per run (LOW)
Plan budgets 10-12 queries per config per week. Hard cap of 12 keeps cost predictable: 12 × $0.20 = $2.40 per config per week.
**Resolution**: ✓

### 3. Mention detection via case-insensitive substring (MEDIUM)
We match `businessName.toLowerCase()` as a substring of the answer. False positives are possible if the business name contains a common word (e.g., "Apple Plumbing" matching any mention of "apple"). False negatives if the LLM uses an abbreviation.
**Resolution**: acceptable for v1 — most business names are 2-3 words and reasonably unique. Could improve later with NER on the answer.

### 4. Position is approximated by counting list-item markers before mention (LOW)
Works for numbered lists (`1.`, `2.`); fails for bulleted lists or prose. Returns 1 if no list markers found — slightly optimistic, but `mentionPosition=1` correctly indicates "first mention" position even when not literally a numbered list.
**Resolution**: documented; reasonable approximation.

### 5. Competitor extraction is a heuristic (LOW)
We pick lines starting with `N. Capitalised Name` as competitor candidates. Misses competitors mentioned in prose ("Acme Co also offers..."). Limits to 10 results to avoid noise.
**Resolution**: acceptable. Real-world value is the TREND of who appears — exact extraction is less important than consistency.

### 6. Cost estimation uses web_search count from API response (LOW)
We extract `server_tool_use.web_search_requests` from the usage object. If Anthropic changes that field name in a future API version, we fall back to assuming 1 call → undercounting.
**Resolution**: tracked. Per-run cost is logged so we can detect drift.

### 7. Errors recorded as rows (LOW, good)
Even when a query fails (Anthropic 5xx, network), we insert a row with `errorMessage`. The portal sees the run happened, just with partial results.
**Resolution**: ✓ Good for telemetry.

### 8. Anthropic credit exhaustion = full run failure (MEDIUM, mitigated)
If credits run out mid-run, all subsequent queries fail with 402. The error row captures it. Next week's run retries.
**Resolution**: same risk as the writers; mitigated by Francis's credit-balance monitoring.

### 9. URL extraction grabs trailing punctuation (LOW)
We strip `.,;:!?)]` from URL ends. Misses cases like `https://example.com/?utm_source=a` followed by a closing paren — but that's parsed by the main pattern correctly.
**Resolution**: ✓

### 10. No `runCitationMonitorForConfig()` helper for ad-hoc runs (LOW)
For testing/manual runs, an operator can't easily trigger one config. Could refactor to expose a per-config function.
**Resolution**: add later; not blocking initial launch.

## Verdict
**Ship.** All findings LOW/MEDIUM. The citation monitor is the eventual answer to "did the content delivery actually move the needle?" — but the data takes 4+ weeks to stabilize, so v1 just needs to start collecting.
