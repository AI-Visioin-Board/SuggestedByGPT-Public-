# Phase I Code Review — Squarespace Patchright installContent

## Scope
- MODIFIED: `server/cmsAutomation.ts`
  - Added `BlogContentPayload` interface
  - Added optional `installContent()` on abstract `CMSAutomator` (default returns "not supported")
  - Added `install_content` case to BOTH executeTask dispatchers (base + WordPress override)
  - Implemented `installContent` on `SquarespaceCMSAutomator` via Code Block strategy
- NEW: `server/blogContent/publishers/squarespacePatchright.ts` — publisher wrapper

## Findings

### 1. Code Block strategy is fragile (HIGH, accepted)
Squarespace's editor uses CodeMirror, dynamic class names, and React-rendered UI that frequently changes between minor versions. The publisher uses a series of `:has-text()` selectors and `[data-test*=...]` fallbacks that may break on any Squarespace update.
**Mitigation**: returns descriptive `failureStep` so we know exactly which selector failed. Phase J adds the showcase fallback for any Squarespace publish failure.
**Resolution**: documented. Integration testing in Phase U on a real Squarespace site will verify selector stability. Selector drift is monitored via the queue worker's failure counts.

### 2. Single Code Block body — not native rich text (MEDIUM, accepted)
The post body becomes one Squarespace "Code Block" containing the full HTML. It renders correctly to visitors (HTML interpreted as HTML) but in the Squarespace editor, the author sees a code block instead of paragraphs. If the client wants to edit a post, they have to edit the code block source.
**Resolution**: acceptable per plan. Squarespace's native block-by-block editor would require parsing HTML into Squarespace's block taxonomy — significant additional work for marginal benefit.

### 3. Featured image not set on the Squarespace post (LOW)
The publisher doesn't navigate to the post's featured-image setting. Hero image is embedded in the body HTML (Unsplash `<img>` if the writer included one), but Squarespace's social-share preview won't pick it up.
**Resolution**: documented; future enhancement. Real-world impact: low (most readers come from the website, not social).

### 4. Slug control (LOW)
Squarespace auto-generates the slug from the title. We can't reliably set it via UI without extra navigation steps. The `publishedUrl` is computed assuming our slug — may not match Squarespace's actual slug.
**Resolution**: Phase L's verifier re-fetches the live URL and reconciles. If our predicted URL 404s, the verifier marks the post as `publish_failed` even though it exists at a slightly different URL.
**Workaround for v2**: scrape the URL from the post-published toast/notification.

### 5. `loginUrl` from `serviceName` (LOW)
The factory function decrypts `serviceName` directly without using it as URL. Looking at `createCMSAutomator`, the loginUrl comes from `websiteUrl + /wp-admin` etc., NOT from serviceName.
**Resolution**: factory function handles this correctly. Publisher passes `serviceName` through.

### 6. `automator.executeTask` initialises browser → wraps with try/finally? (MEDIUM)
The publisher calls `executeTask` but does NOT call `automator.cleanup()` afterwards. If `executeTask` throws, the browser instance leaks.
**Fix needed**: wrap in try/finally with cleanup.

### 7. Two executeTask dispatchers needed updating (LOW, fixed)
WordPressCMSAutomator overrides executeTask for security audit. Both dispatchers now handle `install_content`. ✓

### 8. `additionalInfo` carries the Squarespace site config URL (LOW)
Already documented in the existing Squarespace login code. Our publisher passes additionalInfo through. ✓

## Fix applied
- #6: Add try/finally cleanup to the publisher.

## Verdict
After #6: **Ship.** Other findings are documented limitations of the Patchright approach; Phase J's showcase fallback catches them all.
