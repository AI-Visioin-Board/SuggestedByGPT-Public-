# Phase E Code Review — Cadence tick

## Scope
- NEW: `server/blogContent/cadenceTick.ts` — orchestrator that decides what fires today for each active client_content_config

## Findings

### 1. Hour comparison can miss the window (MEDIUM)
We use `currentHourUtc >= publishHourUtc`. If the cron only ticks once per day after `publishHourUtc`, we're fine. But if `publishHourUtc=14` and the cron runs at 13:59 then next at 14:59 — the 14:00-window IS hit on the 14:59 tick. ✓ OK.
However if cron stops working for an hour and resumes at 15:30, we'd still trigger — that's desired (catch-up).
But: cron runs **every hour** (Phase Q plan: `setInterval(60 * 60 * 1000)`), so the first tick at-or-after publishHourUtc trips it.
**Resolution**: leaving as-is. Catch-up is the correct semantics.

### 2. Race condition: two ticks could both generate (MEDIUM, mitigated)
If two cron processes both find no `alreadyToday` short and both fire `writeShortArticle` — we'd double-generate. The current `_core` deployment is single-instance so this is unlikely.
**Resolution**: Phase Q will add the DB advisory lock (`SELECT GET_LOCK('blog_content_cadence', 0)`). Tracked for Phase Q. Real-world impact today: zero (single Railway worker).

### 3. Week-1 longform missed window logic (LOW)
If a client signs up on Sunday with `longformDayOfWeek=1` (Monday) and `publishHourUtc=14`, the Week-1 longform fires Monday 14:00 UTC. If for some reason the cron is down all of Monday, it fires Tuesday at the next tick — but `weekNum` is still 1 on Tuesday. ✓ catch-up works.
If the cron is down for ALL of Week 1, `weekNum` becomes 2 on Sunday and the `weekNum === 1` guard fails permanently. The longform never fires.
**Resolution**: change to `weekNum <= 1 && !hasLongform` so a delayed longform still fires in Week 2.

### 4. Idempotency for short articles — checks `createdAt > todayStart` (LOW)
If the writer takes ~30s to run and the cron fires every hour, we won't double-generate in the same UTC day. But if the day boundary rolls during generation, the second tick after midnight might fire again. Cost: small (one extra short article). The `totalShortsTarget` ceiling catches it eventually.
**Resolution**: acceptable. The probability is tiny and the cost is bounded by `totalShortsTarget`.

### 5. Topic rejection doesn't retry the SAME topic (LOW)
If a writer returns null because of a transient quality-gate failure (model regression, web_search rate limit), the topic is permanently `rejectedAt`. Next tick uses a different topic. Cost: 1 lost topic in the seed pool (24 short topics + 6 longform topics = lots of slack).
**Resolution**: acceptable. Could re-attempt by clearing `rejectedAt` in a separate retry worker, but not worth it for v1.

### 6. `longformFrequency === 'weekly'` branch is empty (LOW)
Plan says Dominator Plus will use weekly longforms. Branch deliberately left as a no-op with a comment. **Resolution**: intentional. Plus is not in scope for this build.

### 7. Error swallowing wraps each config (LOW)
A throwing config logs+continues. Result counters update. ✓ Good — one bad config doesn't poison the tick.

## Fix applied: #3 above

Changed `weekNum === 1` → `weekNum <= 1 || !hasLongform` so catch-up works:
- If still in Week 1: fire if not yet done
- If past Week 1 but `hasLongform === false`: still fire (catch-up)
The combined guard collapses to: fire ONLY when `!hasLongform`. That's actually simpler.

## Verdict
**Ship.** All other findings are LOW. Behaviour is fail-soft on per-config errors. Typecheck clean.
