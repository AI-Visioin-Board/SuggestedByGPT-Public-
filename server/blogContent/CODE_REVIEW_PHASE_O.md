# Phase O Code Review — Onboarding UI (ConnectWebsiteTask)

## Scope
- MODIFIED: `server/stripeWebhook.ts` — route Shopify/Wix to `connect_website` action item (not provide_credentials), with CMS-specific copy
- MODIFIED: `client/src/pages/PortalV2.tsx` — CMS-aware rendering inside the `connect_website` branch: Shopify/Wix get OAuth buttons; WP stays on the plugin flow

## Findings

### 1. Shopify shop input uses `window.prompt()` (MEDIUM, accepted for v1)
Browser `prompt()` is unstyled and inconsistent across browsers (Safari shows it differently than Chrome). It's also unable to validate beyond what we do in JS.
**Mitigation**: we validate the input client-side (`^[a-z0-9][a-z0-9-]*\.myshopify\.com$`) before redirecting. Server-side `oauthRouter` validates again.
**Resolution**: tracked. A proper Dialog component would be cleaner; deferring as it doesn't block functionality.

### 2. Wix doesn't ask for site identifier (LOW)
Wix's OAuth flow lets the user pick which site to grant access to from their account dashboard. No upfront input needed.
**Resolution**: ✓ Correct flow.

### 3. WordPress fallback is the default for unknown CMS (LOW)
If `clientData.cmsType` is null/undefined, we render the WordPress plugin flow. This is OK because the webhook only creates a `connect_website` action item for WP/Shopify/Wix today — other CMS types get `provide_credentials` instead.
**Resolution**: ✓ Safe default.

### 4. After successful OAuth, the action item auto-completes (LOW)
The OAuth callback in `oauthRouter.ts` already does `UPDATE action_items SET status='completed'` for `connect_website` action items. The portal will re-render and the action item disappears from the pending list.
**Resolution**: ✓ End-to-end flow closed.

### 5. Squarespace stays on the legacy `provide_credentials` flow (LOW, intentional)
Squarespace has no OAuth; we use Patchright UI automation with the user's login. Therefore Squarespace clients still go through the existing `Provide Website Access` action item that collects CMS credentials.
**Resolution**: ✓ Correct. Phase I's Patchright publisher consumes these credentials.

### 6. `item.orderId` is the action item's orderId (LOW)
Confirmed correct — the schema has `actionItems.orderId NOT NULL`. ✓

### 7. No visible "Connecting..." spinner on click (LOW)
Clicking the OAuth button immediately navigates away from the SPA. Browser shows its own navigation loading state. Not ideal UX but functional.
**Resolution**: acceptable; can be polished later.

### 8. After OAuth callback returns redirect, the order page re-renders (LOW)
The callback redirects to `/portal/orders/{orderId}?connected=shopify`. The portal sees the query param and could show a success toast. Not implemented but would be a nice UX touch — deferred.

### 9. ESLint warnings (LOW)
Used inline IIFE `(() => { ... })()` to keep the branch readable. ESLint may flag this but it's correct React.
**Resolution**: typecheck passes; no functional issue.

## Verdict
**Ship.** Typecheck clean. The OAuth flow is end-to-end functional for Shopify and Wix, and the existing WP plugin flow is unchanged.
