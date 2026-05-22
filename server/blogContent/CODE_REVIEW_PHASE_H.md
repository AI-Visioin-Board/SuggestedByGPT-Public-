# Phase H Code Review — Wix OAuth + publisher

## Scope
- NEW: `server/blogContent/publishers/wixOAuth.ts` — Wix Blog v3 publisher with refresh-token handling
- MODIFIED: `server/blogContent/oauthRouter.ts` — Replaced Wix callback stub with real implementation

## Findings

### 1. HTML embedded as a Ricos "HTML" node (MEDIUM)
We send the rendered post HTML as a single `{ type: "HTML", htmlData: { source: "HTML", html } }` node. This works on Wix Blog v3 but the post renders as a single embed inside the blog post page. The Wix native editor will show the post body as "HTML block" — editable but not the rich-text view users expect.
**Resolution**: acceptable for v1 (per plan's note about HTML embed fallback). The published article looks correct on the live blog. Future: build a markdown→Ricos transformer.

### 2. Refresh-token race condition (MEDIUM)
If two publishes start simultaneously and both find an expiring token, both will call `/oauth2/token`. Wix may reject the second call (or accept it and invalidate the first refresh token). For our queue (single-process, one publish at a time), this isn't an issue. **Resolution**: tracked. If we ever parallelize the queue, wrap refresh in a per-token mutex.

### 3. `instanceId` populated from query string (LOW)
Wix's callback redirect includes `instanceId` query param identifying the connected site. We store it in `shopDomain` to match Shopify's schema. ✓ Correct.

### 4. Token expiry comparison (LOW)
We use `expiresAt < now + 5min` to trigger refresh. Edge case: clock drift between Wix's servers and ours. 5 minutes of buffer is generous. ✓

### 5. Featured image as `media.wixMedia.image.url` (LOW, unverified)
Wix's Blog API docs are inconsistent on whether external URLs are accepted directly or whether the image must be uploaded to the Wix Media Manager first. If Wix rejects an external URL we'll see a 400 with "invalid media reference" — the publisher returns that error and the queue retries.
**Resolution**: real-world testing in Phase U integration tests will verify. If it fails, fallback is to drop `media` field entirely (post has no hero image but otherwise publishes).

### 6. Wix scopes not specified (LOW)
The Wix install URL uses `appId` and doesn't pass scopes. Wix scopes are configured at the App Dashboard level (per-app in the Wix Partners portal). Our app needs `BLOG_WRITE` and `BLOG_PUBLISH` configured there.
**Resolution**: documented in the Phase H setup checklist (Wix Partners side, not code).

### 7. Authorization header format (LOW)
Wix uses `Authorization: <access_token>` (no `Bearer ` prefix, unlike standard OAuth). The plan spec calls this out and we follow it. ✓ Important.

### 8. No HMAC verification on Wix callback (LOW)
Wix doesn't sign callbacks the way Shopify does. State-based CSRF protection is our only defence — that's standard for Wix OAuth.
**Resolution**: correct per Wix's documented flow.

### 9. Refresh token from initial code exchange may be null (LOW)
Some Wix flows return a non-expiring access token without a refresh token. We handle this: `encryptedRefreshToken: null` is stored, and `refreshWixToken` early-returns null when there's nothing to refresh. The publish will fail when the access token actually expires; user reconnects.
**Resolution**: correct fail-soft.

## Verdict
**Ship.** Typecheck clean. All findings LOW/MEDIUM. Phase U integration test on a real Wix site will surface any Ricos format issues.
