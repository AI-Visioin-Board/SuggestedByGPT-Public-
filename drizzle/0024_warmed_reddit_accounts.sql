-- Migration 0024 — Warmed Reddit Accounts pool (Build #1: Account Creation Flow)
--
-- Pivots Reddit engagement from "autonomous signup per client" to "VA-created warmed pool."
-- VA creates accounts via Browserbase iframe in the admin panel; system manages email
-- generation, proxy assignment, fingerprint, cookie capture. Accounts age in a warming
-- worker (Build #2) before being assigned to clients.
--
-- This migration ADDS new tables. It does NOT drop the legacy `client_reddit_accounts`
-- or `reddit_verification_queue` tables — those stay until Build #2 fully replaces
-- their consumers, then get dropped in a follow-up cleanup migration.

-- ── 1. Pool of warmed accounts (replaces per-client clientRedditAccounts model) ──
CREATE TABLE `warmed_reddit_accounts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `emailAlias` varchar(255) NOT NULL,
  `emailDomain` varchar(100) NOT NULL,
  `encryptedPassword` text NOT NULL,
  `redditUsername` varchar(20),
  `proxyId` int,
  `fingerprint` text NOT NULL,
  `encryptedCookies` text,
  `status` enum(
    'pending',                  -- creds minted, VA actively in iframe
    'awaiting_verification',    -- VA done; needs first warming login from our infra
    'warming',                  -- in N-day warming cycle
    'warmed',                   -- ready to assign to a client
    'active',                   -- assigned + posting for a client
    'captcha_blocked',          -- warming login hit captcha; needs operator
    'verification_required',    -- Reddit demanded device verification email
    'phone_blocked',            -- Reddit demanded phone verification at signup
    'email_blocked',            -- Reddit refused the email/domain at signup
    'failed',                   -- terminal failure (suspended, wrong password, etc.)
    'cancelled'                 -- VA cancelled or session timed out
  ) NOT NULL DEFAULT 'pending',
  `browserbaseSessionId` varchar(100),
  `liveViewUrl` text,
  `expiresAt` timestamp NULL,                                 -- pending row TTL
  `heartbeatAt` timestamp NULL,                               -- iframe pings; cleanup uses this
  `dayNumber` int NOT NULL DEFAULT 0,
  `warmingTargetDays` int NOT NULL DEFAULT 2,                 -- 2 for first batch, 30 after validation
  `warmedAt` timestamp NULL,
  `assignedClientId` int,                                     -- FK clients(id), set when assigned
  `assignedAt` timestamp NULL,
  `lastSessionAt` timestamp NULL,                             -- last successful warming/posting session
  `failureReason` text,
  `consecutiveFailures` int NOT NULL DEFAULT 0,
  `createdByVaId` int,                                        -- FK users(id) — audit
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `warmed_reddit_accounts_id` PRIMARY KEY(`id`),
  CONSTRAINT `warmed_reddit_accounts_emailAlias_unique` UNIQUE(`emailAlias`),
  CONSTRAINT `warmed_reddit_accounts_redditUsername_unique` UNIQUE(`redditUsername`)
);

CREATE INDEX `idx_warmed_status` ON `warmed_reddit_accounts` (`status`);
CREATE INDEX `idx_warmed_assigned_client` ON `warmed_reddit_accounts` (`assignedClientId`);
CREATE INDEX `idx_warmed_warmedAt` ON `warmed_reddit_accounts` (`warmedAt`);
CREATE INDEX `idx_warmed_expires` ON `warmed_reddit_accounts` (`expiresAt`);

-- ── 2. Generalized inbound email queue (replaces redditVerificationQueue) ──
-- Captures ALL inbound emails to our domains, not just Reddit OTPs. Used by:
--   - VA dashboard inbox panel (SSE-streamed during signup)
--   - Warming worker (catches device-verification emails)
--   - Future: any other inbox-driven workflow
CREATE TABLE `inbound_emails` (
  `id` int AUTO_INCREMENT NOT NULL,
  `emailAlias` varchar(255) NOT NULL,
  `fromAddress` varchar(320) NOT NULL,
  `subject` text NOT NULL,
  `plainBody` longtext NOT NULL,
  `htmlBody` longtext,
  `extractedCode` varchar(20),                                -- 6-digit OTP if matched
  `extractedLink` text,                                       -- magic link if matched
  `receivedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `consumedAt` timestamp NULL,                                -- when UI/worker picked it up
  CONSTRAINT `inbound_emails_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_inbound_alias_received` ON `inbound_emails` (`emailAlias`, `receivedAt`);

-- ── 3. Email domain pool ──
CREATE TABLE `email_domain_pool` (
  `id` int AUTO_INCREMENT NOT NULL,
  `domain` varchar(100) NOT NULL,
  `status` enum('active','retired') NOT NULL DEFAULT 'active',
  `spfConfigured` boolean NOT NULL DEFAULT false,
  `dkimConfigured` boolean NOT NULL DEFAULT false,
  `dmarcConfigured` boolean NOT NULL DEFAULT false,
  `isWarmed` boolean NOT NULL DEFAULT false,                  -- true for established marketing domains
  `accountCount` int NOT NULL DEFAULT 0,                      -- accounts using this domain
  `recentRejections` int NOT NULL DEFAULT 0,                  -- Reddit rejected this email at signup
  `lastRejectionAt` timestamp NULL,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `email_domain_pool_id` PRIMARY KEY(`id`),
  CONSTRAINT `email_domain_pool_domain_unique` UNIQUE(`domain`)
);

-- Seed with our existing domain. The 2 warmed marketing domains will be added by
-- a follow-up SQL once Francis provides them.
INSERT INTO `email_domain_pool` (`domain`, `status`, `isWarmed`, `notes`) VALUES
  ('inboxsbgpt.com', 'active', false, 'Fresh domain registered 2026-04-18; SPF/DKIM/DMARC need configuration');

-- ── 4. Audit log for VA actions ──
CREATE TABLE `reddit_account_audit_log` (
  `id` int AUTO_INCREMENT NOT NULL,
  `accountId` int,                                            -- FK warmed_reddit_accounts(id), nullable
  `vaId` int,                                                 -- FK users(id) — who did this
  `action` enum(
    'generate',
    'mark_created',
    'cancel',
    'reissue_email',
    'extend_session',
    'cookie_access',
    'password_view',
    'mark_phone_blocked',
    'mark_email_blocked',
    'manual_status_change'
  ) NOT NULL,
  `detail` json,
  `occurredAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `reddit_account_audit_log_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_audit_account` ON `reddit_account_audit_log` (`accountId`);
CREATE INDEX `idx_audit_va_time` ON `reddit_account_audit_log` (`vaId`, `occurredAt`);

-- ── 5. Add 'reserved' status + reservation tracking to proxy pool ──
-- For atomic concurrent allocation (two VAs hit Generate simultaneously):
--   SELECT FOR UPDATE SKIP LOCKED + flip to 'reserved' before Browserbase call.
-- Reservation flips to 'assigned' on Mark Created, or back to 'available' on cancel/TTL.
ALTER TABLE `reddit_proxy_pool`
  MODIFY COLUMN `status` enum('available','reserved','assigned','flagged','retired') NOT NULL DEFAULT 'available',
  ADD COLUMN `reservedAt` timestamp NULL AFTER `flaggedAt`,
  ADD COLUMN `reservedByVaId` int NULL AFTER `reservedAt`;
