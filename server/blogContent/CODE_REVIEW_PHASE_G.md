# Phase G Code Review — Shopify OAuth + publisher

## Scope
- NEW: `server/blogContent/publishers/shopifyOAuth.ts` — Admin API publisher
- NEW: `server/blogContent/oauthRouter.ts` — Shopify start + callback (Wix stubbed for Phase H)
- MODIFIED: `server/_core/index.ts` — register OAuth routes

## Findings

### 1. State map is in-memory, single-instance only (MEDIUM, accepted)
If Railway ever scales horizontally, two instances won't share the state map and the OAuth callback will land on the wrong instance with "state mismatch". Same Railway architecture caveat as the Patchright mutex (Phase Q).
**Resolution**: documented; OK for current single-instance deployment. Move to DB-backed state if/when we scale.

### 2. State TTL is 10 minutes (LOW)
A Shopify install flow can sit on the install page longer than 10 min. **Resolution**: 10 min is generous; if user abandons, they retry. No security implication.

### 3. Shopify HMAC verification — sorted-key encoding (LOW, important)
Shopify's HMAC over the callback params requires alphabetical key sorting (per their docs). The implementation does that explicitly. ✓ Important detail — incorrect sorting would silently fail-open or fail-closed.

### 4. `expiresAt: null` for Shopify (LOW)
Shopify access tokens don't expire (per the API docs, but they CAN be revoked by the merchant). The token-refresh path doesn't exist for Shopify (only Wix needs it). ✓ Correct.

### 5. The publisher creates a "Blog" if none exists (LOW)
Most Shopify stores have a default "News" blog. If not, we create one named "Blog" with handle "news". If the merchant later deletes that blog the next publish fails — they'd need to create another. Edge case.
**Resolution**: acceptable.

### 6. Custom domain URL construction is best-effort (LOW)
We use `client.businessWebsite + "/blogs/news/" + handle`. If the merchant has a non-standard blog URL pattern (rare), the URL stored in `publishedUrl` will 404 even though the article exists on Shopify.
**Resolution**: Phase L (verifier) will catch this — if `publishedUrl` 404s, we fall back to `myshopifyUrl`. Tracked.

### 7. No featured image alt text from generation (LOW)
We use the article title as alt text. Better than nothing; SEO acceptable.
**Resolution**: keep.

### 8. Per-article metafields use deprecated `metafields_global_*` (MEDIUM)
Shopify is phasing these out in favour of the new metaobjects system. They still work in API version 2024-07 (current) but may be removed in 2025+. **Resolution**: monitor; if Shopify deprecates them, we'll need to switch to the SEO metaobject. Tracked as a future upgrade.

### 9. Wix routes registered as stubs (LOW)
`/api/oauth/wix/start` returns the Wix install URL; `/callback` returns 501. The portal UI in Phase O will only show Wix as a connection option once Phase H is shipped, so end-users won't hit these. **Resolution**: intentional. Avoids breaking Express startup if Phase H lands later.

### 10. portalUrl parsing assumes `/portal` suffix (LOW)
`getPortalBaseUrl()` strips `/portal` from `ENV.portalUrl`. If `PORTAL_URL` is set to a bare origin (no `/portal`), the strip is a no-op and the URL works. ✓ Defensive enough.

## Verdict
**Ship.** Typecheck clean. All findings LOW/MEDIUM with acceptable mitigations. The publisher returns `null` when no Shopify connection exists, allowing the queue to route to Patchright (Phase J) for unconnected Shopify stores.
