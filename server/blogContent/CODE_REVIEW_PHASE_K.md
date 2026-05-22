# Phase K Code Review — Publish queue worker

## Scope
- NEW: `server/blogContent/publishQueue.ts` — orchestrator that picks ready posts, runs the per-platform publisher chain, manages retries

## Findings

### 1. Per-row MySQL `GET_LOCK` for concurrency control (MEDIUM)
We use `GET_LOCK('blog_publish_post_{id}', 0)` to prevent two workers from picking the same post. Lock is held until `RELEASE_LOCK` (or connection close). MySQL advisory locks are scoped to the session, so the lock is automatically released if the connection drops.
**Concern**: if the publisher hangs for >>30s and another worker comes along, the second worker correctly skips. But if the first worker is `await`ing a network call and the DB connection drops independently, the lock releases prematurely. Risk: tiny — Drizzle's pool keeps connections alive.
**Resolution**: acceptable for v1. Phase Q's global Patchright mutex will further serialize Patchright-based publishers.

### 2. `publish_failed` final state used twice (LOW)
The "finalState = attemptCount >= MAX ? 'publish_failed' : 'publish_failed'" is a tautology — both branches resolve to the same string. The intent in the original spec was `publish_failed_final` vs `publish_failed_retryable` distinction. We collapsed them: a post is `publish_failed` regardless, and the `publishAttempts` count + retry interval determines whether the next tick re-picks it.
**Resolution**: intentional. The status name doesn't change but the retry-eligibility logic is fully encoded in `attempts < MAX && updated_at < retryCutoff`. Simpler.

### 3. Status check inside lock — but we already filtered (LOW)
We re-read post status inside the lock to detect concurrent updates. Even though the candidates filter already screened for valid states, a Phase L verifier or manual UI action could have changed the status between candidates query and lock acquisition. ✓ Correct defensive read.

### 4. `publishing` status while attempt is in flight (LOW)
If the worker process crashes mid-publish, the post is stuck in 'publishing' forever. Next tick won't pick it up because the candidates filter only matches 'ready_to_publish' or 'publish_failed'.
**Resolution**: add a separate sweeper that resets stale 'publishing' rows older than 10 min back to 'ready_to_publish'. Adding now as a small helper.

### 5. retryCutoff uses `updatedAt` (LOW)
After a failed attempt we update the row → `updatedAt` is now. Next tick won't re-attempt until `updatedAt < now - 120min`. ✓ Correct.

### 6. `MAX_ATTEMPTS = 3` is per-post lifetime, not per-window (LOW)
After 3 lifetime attempts the post is parked in `publish_failed` permanently. Operator intervention required to reset `publishAttempts=0` for another try.
**Resolution**: correct. After 3 failures the post needs human eyes — escalate via action item in portal (Phase O).

### 7. Patchright launches still un-serialized at the queue level (MEDIUM)
The queue loop processes posts sequentially within one tick, so within a single tick there's only one Patchright launch at a time. But if the queue cron runs every 5 min and one post takes 8 min, the next tick could fire while the previous is still running.
**Resolution**: Phase Q's `withPatchrightLock` mutex addresses this. Tracked.

### 8. `dispatchPublishers` order is correct per plan (LOW)
WordPress → plugin → Patchright universal → showcase
Shopify → OAuth → Patchright universal → showcase  
Wix → OAuth → Patchright universal → showcase
Squarespace → Patchright (which IS the primary) → showcase
showcase/other → showcase only
✓ matches plan.

### 9. `lastError` carries the wrong method on cascade failure (LOW)
If the API publisher returns `{ success: false, method: 'plugin' }` and the Patchright universal also fails with `{ success: false, method: 'patchright' }`, lastError holds the patchright method — but `lastPublishMethod` in DB is set from `outcome.method ?? null`. We store the last method tried, which is what we want for debugging. ✓

## Fix applied
- #4: Add `resetStalePublishingPosts()` helper that resets 'publishing' rows older than 10 min to 'ready_to_publish'.

## Verdict
After #4: **Ship.** All findings LOW/MEDIUM with acceptable mitigations. Queue worker correctly cascades through publisher chain per platform.
