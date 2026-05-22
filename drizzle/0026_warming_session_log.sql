-- Migration 0026 — warming_session_log
--
-- Per-session diagnostic log for the Build #2 warming worker. One row per
-- attempted session. Captures outcome, what was tried, what failed, and a
-- screenshot path on failure for debugging.
--
-- Used by:
--   - runWarmingSession() to write every attempt
--   - Reddit Accounts admin UI to render last 5 sessions per account
--   - Operator triage when an account flips to 'failed' or 'captcha_blocked'

CREATE TABLE `warming_session_log` (
  `id` int AUTO_INCREMENT NOT NULL,
  `accountId` int NOT NULL,                          -- FK warmed_reddit_accounts(id)
  `sessionNumber` int NOT NULL,                      -- monotonically increasing per account
  `dayNumber` int NOT NULL,                          -- the dayNumber this session belongs to
  `proxyId` int,                                     -- which proxy was used
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` timestamp NULL,                      -- null = still running or crashed
  -- Outcome: success or one of the documented failure modes
  `outcome` enum(
    'success',
    'login_via_cookies',                             -- cookies still valid, no re-login needed
    'login_via_password',                            -- did fresh password login (cookies missing or expired)
    'captcha_at_login',                              -- captcha appeared during login; account flagged as 'captcha_blocked'
    'device_verification_required',                  -- Reddit demanded email-link verification; pending in inbox
    'wrong_password',                                -- password doesn't work (typo? change?)
    'rate_limited',                                  -- Reddit "too many requests" mid-session
    'proxy_failed',                                  -- proxy didn't respond / wrong IP
    'account_suspended',                             -- redirected to /suspended
    'crashed',                                       -- our code threw before completing
    'other_error'
  ) NOT NULL,
  `loginSucceeded` boolean NOT NULL DEFAULT FALSE,
  `actionsAttempted` json,                           -- {browse: 5, upvote: 3, comment: 1}
  `actionsCompleted` json,                           -- subset of attempted that succeeded
  `errorDetail` text,                                -- exact error message + abbreviated stack
  `screenshotPath` varchar(500),                     -- /tmp/sbgpt-warming/<accountId>/<sessionN>.png on failure
  CONSTRAINT `warming_session_log_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_warming_log_account` ON `warming_session_log` (`accountId`, `sessionNumber`);
CREATE INDEX `idx_warming_log_outcome` ON `warming_session_log` (`outcome`, `startedAt`);
