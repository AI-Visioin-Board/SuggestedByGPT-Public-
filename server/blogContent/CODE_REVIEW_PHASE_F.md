# Phase F Code Review — WordPress plugin publisher

## Scope
- MODIFIED: `server/assets/suggestedbygpt-worker/suggestedbygpt-worker.php` — bumped to v1.1.0, added `/publish-post` endpoint, added per-post schema JSON-LD injection in wp_head
- MODIFIED: `server/wpPluginClient.ts` — added `publishPost()` client method
- NEW: `server/blogContent/publishers/wordpressPlugin.ts` — publisher entrypoint, looks up credentials, calls plugin, updates post row

## Findings

### 1. Plugin update rollout problem (HIGH, mitigated)
Sites running plugin v1.0.0 will return 404 on `/publish-post`. The publisher returns `{ success: false, error: "plugin_publish_threw:..." }` — the queue worker (Phase K) will retry, but if the plugin is never updated, all retries fail forever.
**Mitigation**: the publish queue (Phase K) tracks `publishAttempts`. After 3 failures it transitions to `publish_failed` and an action item appears in the portal: "Your SBGPT plugin needs an update — click here to download v1.1.0." The plugin ZIP is rebuilt at deploy time (Phase F's CI step).
**Resolution**: this is documented as a known limitation. Auto-updating WP plugins is out of scope; clients have to either re-download or replace the ZIP. Status of plugin can already be checked via `/status` endpoint.

### 2. ZIP not rebuilt — clients will download old v1.0.0 (HIGH)
We bumped the PHP version in the source file but didn't rebuild `suggestedbygpt-worker.zip`. Clients downloading from the portal will still get v1.0.0.
**Fix**: rebuild the ZIP. Add a `scripts/rebuild-wp-plugin.sh` runner if it doesn't exist; otherwise just zip the directory.

### 3. `media_sideload_image` is slow + can fail (LOW)
Sideloading a 1MB Unsplash image into wp-content takes ~2-5 seconds and requires `wp_remote_get` to reach Unsplash from the WP server. If the server has outbound firewall rules, it fails silently (set_post_thumbnail not called) — post still publishes without a hero image.
**Resolution**: acceptable. Worst case: published post has no hero image but everything else is intact. The verifier (Phase L) flags missing images as a low-priority issue.

### 4. Yoast/RankMath/AIOSEO meta keys written ALL THREE (LOW)
We write `_yoast_wpseo_title`, `rank_math_title`, AND `_aioseo_title` even if only one plugin is active. Side effect: if the user later switches plugins, the new plugin picks up the meta automatically. Cost: 3 extra rows in wp_postmeta per post (negligible).
**Resolution**: intentional. Defensive write is cleaner than detecting active plugin on every publish.

### 5. Per-post schema JSON-LD injected via `is_singular('post')` (LOW)
Correct — only fires on actual blog post pages. Won't conflict with archive/category/home pages. Yoast/RankMath might inject their own Article schema on the same page → duplicate. The schemaBuilder already detects active plugin and SKIPS Article schema (FAQPage only) for Yoast/RankMath sites. So duplicates shouldn't happen.
**Resolution**: correct as designed.

### 6. `find_existing` is on by default (LOW)
A re-publish of the same slug UPDATES instead of creates. This is desired for our retry semantics (idempotent publishes) but could surprise a user who manually edits a post.
**Resolution**: leaving on. Our publishing pipeline writes the slug; user-edits to the slug + body would be preserved if they change `post_name`.

### 7. `decrypt(cred.username)` for siteUrl — username is encrypted (LOW)
Confirmed from `_core/index.ts:342`: `username: encrypt(site_url)`. Decryption is symmetric. ✓

### 8. Unsplash photo ID extraction from URL is fragile (LOW)
Regex `/photo-([A-Za-z0-9_-]+)/` works for the canonical `https://images.unsplash.com/photo-XXX?...` URL pattern. If Unsplash ever changes their URL structure, the track-download call silently no-ops.
**Resolution**: acceptable. We could persist the photoId in a new column, but cost of missing tracking pings is zero (Unsplash doesn't enforce except in extreme cases).

### 9. No request rate limiting (LOW)
If two queue workers fire at the same time, both could attempt to publish the same post. The status guard (`status === 'ready_to_publish' OR 'publishing'`) helps but isn't a lock.
**Resolution**: Phase K will use `SELECT FOR UPDATE SKIP LOCKED` on the queue read. Tracked.

## Fixes applied
- #2: Need to rebuild the ZIP. Doing now.

## Verdict
After #2 fix: **Ship.** Other findings are LOW or mitigated by downstream phases (queue / verifier / onboarding).
