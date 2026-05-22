# Phase D Code Review — Unsplash image picker

## Scope
- NEW: `server/blogContent/unsplashFetcher.ts` (fetcher + track-download)
- MODIFIED: `server/_core/env.ts` (added `unsplashAccessKey`, `blogContentAutomationEnabled`, retry interval, Shopify/Wix OAuth client secrets — all default to empty strings / sensible defaults so existing prod startup is unaffected)
- MODIFIED: `server/blogContent/longformWriter.ts` (imported fetchUnsplashImage, added `pickFeaturedImage(config, query)` helper, wired into the `clientBlogPost` insert as `featuredImageUrl` + `featuredImageAttribution`)
- MODIFIED: `server/blogContent/shortWriter.ts` (same as longform)

## Pass — findings

### 1. Custom URL branch loses photoId field (LOW)
`pickFeaturedImage` returns `{ id: "", url, attribution: "" }` for the `custom_url` case. The track-download flow (Module 10 future caller) will need to skip the call when `id === ""`. **Resolution**: `trackUnsplashDownload(photoId)` already early-returns on empty `photoId`. Safe.

### 2. Featured image fetch happens BEFORE the quality gate (LOW)
Currently the writer inserts both content and image regardless of whether L5 gate passes. But L5 result lives in `qualityGateResult` and `status` is always set to `ready_to_publish`. So the image is "wasted" only if a human rejects. Cost impact: $0 (Unsplash is free).
**Resolution**: leaving as-is. The image is cosmetic data; recomputing it on a quality fail isn't worth the extra branching.

### 3. Track-download is never called (MEDIUM, deferred)
Unsplash API terms require `track-download` when the image is actually displayed in a published article. We persist the image at draft time but don't track until publish. **Resolution**: the publisher (Phase F/G/H/I/J) will call `trackUnsplashDownload(post.featuredImageUrl)` after a successful publish. Tracked here for Phase F.

### 4. `pickFeaturedImage` duplicated across two writers (LOW)
Copy-pasted in longform + short. Could lift into `unsplashFetcher.ts` as `pickFeaturedImage(config, query)`. **Resolution**: defer until Phase F (when the publisher also needs it). Two-callsite duplication isn't worth refactoring yet.

### 5. Error handling — Unsplash 401 silently null (LOW)
If the API key is wrong/revoked, we log `HTTP 401` and return null. The writer continues with no image. That's the desired behaviour but operators won't notice the key is dead. **Resolution**: acceptable; the citation monitor's quality dashboard (Phase M) can surface "X% of articles missing featured image" if it ever becomes a problem.

### 6. `featuredImageId` not stored (LOW)
We don't currently persist the Unsplash photo ID anywhere. To track-download at publish time we'd need it. **Resolution**: stash on the image object internally; resolve when Phase F builds the publish flow. Schema has no `featuredImageUnsplashId` column — could add at Phase F if needed, or extract from URL (Unsplash URLs contain the photo ID).

### 7. ENV additions are forward-looking (LOW)
Added Shopify/Wix OAuth secrets even though their publishers haven't been built. They default to "" and aren't read until G/H. **Resolution**: keeping. Pre-declaring keeps env.ts as the single source of truth and avoids a future change to a shared file.

## Verdict
**Ship.** All findings are LOW or deferred. Typecheck clean. Behaviour is graceful — no key/empty result = null featured image, never throws.
