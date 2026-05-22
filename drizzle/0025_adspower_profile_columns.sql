-- Migration 0025 — Swap browserbase columns for AdsPower equivalents.
--
-- Architectural shift documented in CLAUDE.md Section 16 (next session-end run):
-- VA creates accounts via AdsPower on her Windows PC instead of Browserbase iframe.
-- Browserbase was blocked by tier-locked OS choice (Linux only on plans we can afford).
-- AdsPower runs locally, gives full Win/Mac/Linux fingerprint choice, $5.40/mo.

ALTER TABLE `warmed_reddit_accounts`
  DROP COLUMN `browserbaseSessionId`,
  DROP COLUMN `liveViewUrl`,
  ADD COLUMN `adspowerProfileId` varchar(100) NULL AFTER `encryptedCookies`,
  ADD COLUMN `adspowerWsEndpoint` text NULL AFTER `adspowerProfileId`,
  ADD COLUMN `emailReissueCount` int NOT NULL DEFAULT 0 AFTER `consecutiveFailures`;

CREATE INDEX `idx_warmed_adspower` ON `warmed_reddit_accounts` (`adspowerProfileId`);
