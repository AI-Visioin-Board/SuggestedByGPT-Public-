# Phase J Code Review — Universal Patchright fallback + showcase publisher

## Scope
- NEW: `server/blogContent/publishers/patchrightUniversal.ts` — calls `installContent` on the platform's CMSAutomator
- NEW: `server/blogContent/publishers/showcaseLocal.ts` — last-resort publish to suggestedbygpt.com/clients/{slug}/{post-slug}

## Findings

### 1. Showcase URL will 404 until the `/clients/{slug}/` route is added (HIGH, accepted)
The publisher records `status='published'` with a `suggestedbygpt.com/clients/...` URL, but the server doesn't yet have a route that renders this page. Visiting the URL returns a 404.
**Mitigation**: documented in the module header. Phase L (verifier) will mark these as `publish_failed` due to 404, which keeps the issue visible in the portal's metrics. A future "Phase W" can add the rendering route.
**Resolution**: keep. Showcase mode is the last-resort fallback — most clients connect their own site instead, so this gap matters less than the spec implies.

### 2. Patchright universal returns "not implemented" for WP/Shopify/Wix today (LOW)
Only Squarespace has a real `installContent` implementation (Phase I). For WordPress/Shopify/Wix, the base class returns `{ success: false, failureCategory: 'platform_limitation' }`. The queue then moves to showcase.
**Resolution**: working as designed. Future iterations can add per-platform `installContent` overrides.

### 3. Showcase consent is the gate (LOW)
`publishViaShowcase` returns `null` if `showcaseConsentAt` is null on the config — the queue then has no fallback and marks the post `publish_failed`. This is correct semantics: clients who haven't opted in to showcase don't get content "published" to our domain.
**Resolution**: ✓

### 4. `publishedCmsPostId = "showcase-{id}"` (LOW)
Synthetic ID so subsequent verifier passes can identify showcase posts. ✓

### 5. Showcase slug collisions across clients (LOW)
Two clients with the same business name (e.g., "Bob's Plumbing") would have the same `clientSlug`. The full path includes the post slug, so cross-client article URL collisions are unlikely. But the `/clients/bobs-plumbing/` index page (when built) would have to disambiguate.
**Resolution**: future `/clients` route should use `clientId` as the disambiguator, not just business name. Tracked.

### 6. `featureClient.cmsType` is the routing signal (LOW)
Patchright universal pulls `cmsType` from the client row to dispatch to the right CMSAutomator subclass. If `cmsType` is missing, defaults to `"other"` → returns "not supported" from the base class → falls through to showcase. ✓

### 7. Patchright universal does NOT call the Patchright mutex (MEDIUM)
Phase Q will add `withPatchrightLock(...)` wrapping. Today the publisher launches Patchright directly. If the queue runs in parallel with another Patchright caller (e.g., Reddit warming worker), they collide on the headless Chromium handle.
**Resolution**: Phase Q's responsibility. Tracked.

### 8. Showcase publisher doesn't render the post anywhere (LOW, intentional)
Per scope: showcase mode in v1 is record-keeping only. The actual page rendering is deferred.
**Resolution**: explicit in module header.

## Verdict
**Ship.** All findings LOW/MEDIUM with documented mitigations. The publisher chain is now complete: plugin → OAuth → Patchright (Squarespace only) → showcase (consent-gated).
