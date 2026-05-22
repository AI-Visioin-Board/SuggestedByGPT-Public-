# Phase N Code Review — Stripe webhook integration

## Scope
- MODIFIED: `server/stripeWebhook.ts`
  - Added `blog_content_program` deliverable to `dominatorDeliverables` (stepIndex 27)
  - Added `client_content_config` insert block for AI_DOMINATOR orders
  - Idempotent (skips if config already exists for orderId)

## Findings

### 1. `client_content_config` created BEFORE topics are seeded (MEDIUM, intentional)
The webhook creates a minimal config with empty `citationQueryBattery` and null `startedAt`. The cadence tick filters by `startedAt IS NOT NULL`, so this config is dormant until the topic seeder fills it in (during onboarding when CMS is confirmed).
**Resolution**: correct sequencing. The webhook gets the order set up; onboarding triggers the actual content program.

### 2. CMS platform inferred from `websiteCms` (LOW)
If known at webhook time (GetStarted flow), we set `cmsPlatform` to one of wordpress/shopify/wix/squarespace/other. If unknown (funnel buyer without intake), defaults to `'other'`. Onboarding updates the platform when CMS is confirmed.
**Resolution**: ✓

### 3. publishHourUtc spread by orderId mod 6 (LOW)
14-19 UTC = 9 AM - 2 PM Central time. Articles will publish during business hours from the client's perspective. Distribution across 6 hours prevents 50 clients firing at exactly 14:00 UTC simultaneously.
**Resolution**: ✓ Sensible.

### 4. blog_content_program deliverable visible at stepIndex 27 (LOW)
Lands at the END of the deliverable list, after the Reddit batches. Portal will render it in the Content & Authority journey node (per Phase P).
**Resolution**: ✓

### 5. Failure to create config is non-fatal (LOW)
Wrapped in try/catch; logs and continues. Order is still valid; cadence tick simply skips.
**Resolution**: ✓ Right call. The Stripe webhook MUST NOT fail because of a downstream issue.

### 6. Idempotency check uses `eq(clientContentConfig.orderId, orderId)` (LOW)
The schema has `UNIQUE KEY(orderId)`. So even if our check races with another webhook delivery, the insert will fail uniquely and the catch handles it.
**Resolution**: ✓ Double-protected.

### 7. No topic seeding triggered here (LOW)
Topic seeding requires the client's CMS auth (Patchright scrape of their site). At webhook time we may not have that — done by the onboarding flow. Tracked.

### 8. Upgrade path (jumpstart → dominator) NOT handled here (MEDIUM)
The upgrade webhook at line 793+ doesn't insert client_content_config. Means: clients who upgrade from Jumpstart to Dominator AFTER the fact won't get the content program.
**Fix**: would need to add the same insert block to the upgrade handler. Adding now.

## Fix applied
- #8: Mirror the content_config insert into the AI_DOMINATOR_UPGRADE branch.

## Verdict
After #8: **Ship.** Typecheck clean. Order flow correctly sets up the blog program for both new Dominator buys and upgrades.
