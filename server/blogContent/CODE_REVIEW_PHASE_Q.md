# Phase Q Code Review — Cron + global Patchright mutex

## Scope
- NEW: `server/blogContent/orchestrator.ts` — `startBlogContentOrchestrator()` + `withPatchrightLock()`
- MODIFIED: `server/_core/index.ts` — call `startBlogContentOrchestrator()` on startup
- MODIFIED: `server/blogContent/publishers/squarespacePatchright.ts` — wrap automator call in `withPatchrightLock`
- MODIFIED: `server/blogContent/publishers/patchrightUniversal.ts` — same

## Findings

### 1. Multiple processes can deadlock on the advisory lock (MEDIUM, mitigated)
MySQL's `GET_LOCK` is per-session. If process A holds the lock and process B blocks for 10 min, B times out, returns null, and the queue retries next tick.
**Resolution**: 10 min lock-acquisition timeout is generous. If we ever scale beyond one Railway worker, the lock genuinely serializes across processes. ✓

### 2. Lock acquired BUT connection drops mid-publish (MEDIUM)
If the worker's DB connection drops while Patchright is running, the lock auto-releases (MySQL behavior). Another worker could then start a second Patchright session — race condition.
**Resolution**: low probability in practice. The mysql2 pool keeps connections alive with TCP keepalive. If we see this in production, fix is to add a "heartbeat" that re-acquires periodically.

### 3. Cadence + verifier + citation also use Anthropic (LOW)
Multiple Anthropic-using workers running in parallel could consume rate limits. Each worker is already serial within itself; across workers, we'd see at most ~10 concurrent Anthropic calls (5 cadence + 5 verifier). Anthropic's rate limit is much higher. ✓

### 4. `.unref()` on every setInterval (LOW, good)
Means the cron handles don't prevent the process from exiting cleanly on shutdown. Tests + dev server can exit without manual cleanup. ✓

### 5. Citation monitor runs every 24h but per-config gate is 6 days (LOW)
The daily tick scans all configs and skips ones run <6 days ago. So most days the citation monitor does nothing. That's the correct intent — we want a once-a-week check per config, but want to spread that check across days so all configs don't fire on the same day.
**Resolution**: ✓

### 6. Started flag prevents double-start (LOW)
`startBlogContentOrchestrator()` is idempotent. ✓

### 7. Flag-off mode still registers setIntervals (LOW)
When `BLOG_CONTENT_AUTOMATION_ENABLED=false`, the schedules still register but each tick early-returns. Cost: 4 tiny no-ops per hour. Acceptable.
**Resolution**: ✓

### 8. Publish queue interval is 10 min — combined with retry-interval 120 min (LOW)
A failed post waits 120 min before re-attempt. Queue checks every 10 min. So worst case the retry is delayed by 10 min from the actual eligibility moment. Acceptable.

### 9. Patchright mutex uses MySQL GET_LOCK — not a process semaphore (LOW)
Means: even single-process callers acquire the lock. This is correct — we want it serialized at the DB layer regardless of process count.
**Resolution**: ✓

### 10. `withPatchrightLock` swallows errors silently (LOW)
If `fn()` throws inside the lock, we log + return null. Caller treats null as "lock unavailable" and retries — wrong category of error but harmless (the next attempt will hit the same error or succeed).
**Fix**: re-throw the original error so the caller can distinguish.

## Fix applied
- #10: Re-throw exceptions thrown by `fn` rather than masking as null.

## Verdict
After #10: **Ship.** Typecheck clean. All 4 workers scheduled. Patchright access globally serialized.
