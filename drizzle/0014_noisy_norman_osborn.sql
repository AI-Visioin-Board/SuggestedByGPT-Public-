CREATE TABLE `delegated_access` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`delegateEmail` varchar(320) NOT NULL,
	`addedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `delegated_access_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_drip_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scanId` varchar(100) NOT NULL,
	`email` varchar(255) NOT NULL,
	`businessName` varchar(255) NOT NULL,
	`score` int NOT NULL DEFAULT 0,
	`grade` varchar(1),
	`sequenceStep` int NOT NULL,
	`scheduledAt` timestamp NOT NULL,
	`sentAt` timestamp,
	`cancelledAt` timestamp,
	`status` enum('pending','sent','cancelled','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_drip_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reddit_drafts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` int NOT NULL,
	`clientId` int NOT NULL,
	`orderId` int NOT NULL,
	`draftText` text NOT NULL,
	`includesLink` boolean NOT NULL DEFAULT false,
	`toneCategory` varchar(50),
	`assignedToUserId` int,
	`status` enum('pending','claimed','posted','rejected','expired') NOT NULL DEFAULT 'pending',
	`rejectionReason` text,
	`batchNumber` int NOT NULL DEFAULT 1,
	`postedAt` timestamp,
	`postedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reddit_drafts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reddit_subreddits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`subredditName` varchar(100) NOT NULL,
	`subscriberCount` int,
	`allowsBusinessMentions` boolean NOT NULL DEFAULT true,
	`industryRelevanceScore` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`notes` text,
	`discoveredAt` timestamp NOT NULL DEFAULT (now()),
	`lastScannedAt` timestamp,
	CONSTRAINT `reddit_subreddits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reddit_threads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`orderId` int NOT NULL,
	`subredditName` varchar(100) NOT NULL,
	`redditPostId` varchar(20) NOT NULL,
	`threadTitle` varchar(500) NOT NULL,
	`threadUrl` varchar(1000) NOT NULL,
	`threadBody` text,
	`threadAuthor` varchar(100),
	`threadScore` int NOT NULL DEFAULT 0,
	`commentCount` int NOT NULL DEFAULT 0,
	`threadCreatedAt` timestamp,
	`relevanceScore` int NOT NULL DEFAULT 0,
	`qualificationReason` text,
	`status` enum('discovered','draft_generated','queued','posted','skipped','expired') NOT NULL DEFAULT 'discovered',
	`discoveredAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	CONSTRAINT `reddit_threads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `voice_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`orderId` int,
	`status` enum('scheduled','reminder_sent','waiting','active','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
	`scheduledAt` timestamp NOT NULL,
	`startedAt` timestamp,
	`endedAt` timestamp,
	`durationSeconds` int,
	`transcriptSummary` text,
	`transcriptMessages` json,
	`cancelledAt` timestamp,
	`cancelReason` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `voice_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `noCmsBackend` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `deliverables` ADD `generatedContent` text;