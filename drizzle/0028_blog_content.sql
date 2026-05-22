-- 0028_blog_content.sql
--
-- Phase A of the Dominator Blog Content Delivery feature.
-- Adds:
--   - client_content_config: per-Dominator-order content program config
--   - client_blog_post: per-article tracking (mirrors guest_posts pattern)
--   - client_content_topic: per-client topic queue (consumed by writers)
--   - client_citation_check: per-client weekly citation monitor results
--   - oauth_token: Shopify + Wix OAuth tokens (lifecycle includes refresh)
--   - blog_posts ADD COLUMN clientShowcaseId: enables Showcase fallback mode
--
-- All other changes are PURELY ADDITIVE. No existing rows touched, no existing
-- columns altered. Migration runner already in main app handles this file.
--
-- Reversible: DROP TABLE for each new table, DROP COLUMN for the ALTER.

-- ─────────────────────────────────────────────────────────────
-- Table 1: client_content_config
-- One row per Dominator order with content delivery enabled.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `client_content_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`clientId` int NOT NULL,
	`cmsPlatform` varchar(64) NOT NULL,
	`cmsAuthMethod` varchar(32),
	`brandVoiceKey` varchar(32) DEFAULT 'professional',
	`brandVoiceCustom` text,
	`internalLinkTargets` json,
	`existingSchemaPlugin` varchar(32),
	`featuredImagePreference` varchar(32) DEFAULT 'unsplash',
	`featuredImageCustomUrl` varchar(500),
	`showcaseConsentAt` datetime,
	`citationQueryBattery` json NOT NULL,
	`publishCadenceKey` varchar(32) DEFAULT 'dominator_default',
	`longformDayOfWeek` int DEFAULT 1,
	`longformFrequency` varchar(32) DEFAULT 'once_at_start',
	`shortDaysOfWeek` json DEFAULT (JSON_ARRAY(2, 4)),
	`publishHourUtc` int DEFAULT 14,
	`totalLongformsTarget` int DEFAULT 1,
	`totalShortsTarget` int DEFAULT 18,
	`startedAt` datetime,
	`pausedAt` datetime,
	`pauseReason` text,
	`completedAt` datetime,
	`createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_content_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `client_content_config_orderId_unique` UNIQUE KEY(`orderId`)
);

CREATE INDEX `idx_ccc_client` ON `client_content_config` (`clientId`);
CREATE INDEX `idx_ccc_started` ON `client_content_config` (`startedAt`);
CREATE INDEX `idx_ccc_cms_platform` ON `client_content_config` (`cmsPlatform`);

-- ─────────────────────────────────────────────────────────────
-- Table 2: client_blog_post
-- One row per article (longform or short).
-- Mirrors the guest_posts table pattern (see drizzle/schema.ts:288).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `client_blog_post` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`clientId` int NOT NULL,
	`contentConfigId` int NOT NULL,
	`topicId` int,
	`kind` varchar(16) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`title` varchar(500) NOT NULL,
	`metaTitle` varchar(200),
	`metaDescription` varchar(320),
	`bodyMarkdown` longtext NOT NULL,
	`bodyHtml` longtext NOT NULL,
	`schemaJsonLd` longtext,
	`wordCount` int NOT NULL DEFAULT 0,
	`featuredImageUrl` varchar(500),
	`featuredImageAttribution` varchar(500),
	`internalLinksUsed` json,
	`externalCitations` json,
	`verifiableClaimsAudit` json,
	`generationLayers` json,
	`qualityGateResult` json,
	`status` varchar(32) NOT NULL DEFAULT 'draft',
	`publishedUrl` varchar(500),
	`publishedCmsPostId` varchar(120),
	`publishedAt` datetime,
	`verifiedAt` datetime,
	`verificationResult` json,
	`screenshotDesktopUrl` varchar(500),
	`screenshotMobileUrl` varchar(500),
	`publishAttempts` int NOT NULL DEFAULT 0,
	`lastPublishError` text,
	`lastPublishMethod` varchar(32),
	`rejectedReason` text,
	`generatedCostUsd` decimal(8,4) NOT NULL DEFAULT '0',
	`createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_blog_post_id` PRIMARY KEY(`id`),
	CONSTRAINT `client_blog_post_client_slug_unique` UNIQUE KEY(`clientId`, `slug`)
);

CREATE INDEX `idx_cbp_status_created` ON `client_blog_post` (`status`, `createdAt`);
CREATE INDEX `idx_cbp_order_kind_status` ON `client_blog_post` (`orderId`, `kind`, `status`);
CREATE INDEX `idx_cbp_verifier_queue` ON `client_blog_post` (`status`, `verifiedAt`);

-- ─────────────────────────────────────────────────────────────
-- Table 3: client_content_topic
-- Topic queue per client; consumed in priority order by writers.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `client_content_topic` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`contentConfigId` int NOT NULL,
	`topicSlug` varchar(180) NOT NULL,
	`topicTitle` text NOT NULL,
	`topicSummary` text,
	`kind` varchar(16) NOT NULL,
	`format` varchar(32),
	`primaryKeyword` varchar(255),
	`predictedWordCount` int,
	`rationale` text,
	`priorityScore` int NOT NULL DEFAULT 50,
	`priorityReason` text,
	`consumedAt` datetime,
	`blogPostId` int,
	`rejectedAt` datetime,
	`rejectedReason` text,
	`source` varchar(32) NOT NULL DEFAULT 'initial_seed',
	`createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `client_content_topic_id` PRIMARY KEY(`id`),
	CONSTRAINT `client_content_topic_client_slug_unique` UNIQUE KEY(`clientId`, `topicSlug`)
);

CREATE INDEX `idx_cct_consume_queue` ON `client_content_topic` (`clientId`, `consumedAt`, `priorityScore`);
CREATE INDEX `idx_cct_kind_consume` ON `client_content_topic` (`clientId`, `kind`, `consumedAt`);

-- ─────────────────────────────────────────────────────────────
-- Table 4: client_citation_check
-- Per-client weekly citation monitor results.
-- Mirrors internal_citation_checks (internal-agent's table) for consistency.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `client_citation_check` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`contentConfigId` int NOT NULL,
	`runId` varchar(64) NOT NULL,
	`queryId` varchar(64) NOT NULL,
	`queryText` text NOT NULL,
	`llmProvider` varchar(32) NOT NULL DEFAULT 'anthropic',
	`llmModel` varchar(64) NOT NULL,
	`groundedSearch` tinyint(1) NOT NULL DEFAULT 1,
	`mentionedClient` tinyint(1) NOT NULL DEFAULT 0,
	`mentionPosition` int,
	`mentionContext` text,
	`competitorsMentioned` json,
	`sourcesCited` json,
	`fullAnswer` longtext,
	`costUsd` decimal(8,4) NOT NULL DEFAULT '0',
	`latencyMs` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `client_citation_check_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_ccchk_run` ON `client_citation_check` (`runId`);
CREATE INDEX `idx_ccchk_client_created` ON `client_citation_check` (`clientId`, `createdAt`);
CREATE INDEX `idx_ccchk_mention` ON `client_citation_check` (`clientId`, `mentionedClient`, `createdAt`);

-- ─────────────────────────────────────────────────────────────
-- Table 5: oauth_token
-- Shopify + Wix OAuth tokens with full lifecycle (refresh, revoke, expiry).
-- Separate from client_credentials because OAuth tokens have different semantics
-- (auto-refreshable, revocable per-app, time-limited).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `oauth_token` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`shopDomain` varchar(255),
	`encryptedAccessToken` text NOT NULL,
	`encryptedRefreshToken` text,
	`scope` text,
	`tokenType` varchar(32) DEFAULT 'Bearer',
	`expiresAt` datetime,
	`revokedAt` datetime,
	`lastUsedAt` datetime,
	`lastRefreshedAt` datetime,
	`createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `oauth_token_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_oauth_client_provider` ON `oauth_token` (`clientId`, `provider`, `revokedAt`);

-- ─────────────────────────────────────────────────────────────
-- ALTER: blog_posts (shared DB table owned by sbgpt-internal-agent)
-- Adds clientShowcaseId column for the Showcase fallback mode.
-- This column is NULL for all internal SBGPT blog posts (the existing rows).
-- Only set when a Dominator client opts for showcase mode instead of CMS publish.
--
-- Note: MySQL 8.x does NOT support "ADD COLUMN IF NOT EXISTS" syntax
-- (that's MariaDB / PostgreSQL). The apply-migration-0028.mjs script does the
-- IF-NOT-EXISTS check at the JS layer before running this statement.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE `blog_posts` ADD COLUMN `clientShowcaseId` int NULL;
CREATE INDEX `idx_blog_posts_showcase` ON `blog_posts` (`clientShowcaseId`);
