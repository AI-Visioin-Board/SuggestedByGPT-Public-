CREATE TABLE `chatbot_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`voiceUsed` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chatbot_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `guest_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`clientId` int NOT NULL,
	`batchNumber` int NOT NULL,
	`collaboratorOrderId` varchar(100),
	`collaboratorSiteId` varchar(100),
	`siteName` varchar(255),
	`siteUrl` varchar(500),
	`siteDR` int,
	`articleTitle` varchar(500),
	`articleContent` text,
	`anchorText` varchar(255),
	`targetUrl` varchar(500),
	`publishedUrl` varchar(500),
	`status` enum('draft','submitted','published','rejected','failed') NOT NULL DEFAULT 'draft',
	`cost` decimal(10,2),
	`submittedAt` timestamp,
	`publishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `guest_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scanId` varchar(100) NOT NULL,
	`leadId` varchar(50) NOT NULL,
	`businessName` varchar(255) NOT NULL,
	`websiteUrl` varchar(500) NOT NULL,
	`city` varchar(100) NOT NULL,
	`state` varchar(2) NOT NULL,
	`industry` varchar(50) NOT NULL,
	`contactName` varchar(255),
	`contactEmail` varchar(255),
	`schemaScore` int DEFAULT 0,
	`aiCrawlerScore` int DEFAULT 0,
	`technicalSeoScore` int DEFAULT 0,
	`contentSignalsScore` int DEFAULT 0,
	`directoryPresenceScore` int DEFAULT 0,
	`reviewSignalsScore` int DEFAULT 0,
	`overallScore` int DEFAULT 0,
	`grade` varchar(1),
	`topRecommendations` json,
	`fullResponse` json,
	`source` enum('public_form','api','internal') DEFAULT 'public_form',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scans_id` PRIMARY KEY(`id`),
	CONSTRAINT `scans_scanId_unique` UNIQUE(`scanId`),
	CONSTRAINT `scans_leadId_unique` UNIQUE(`leadId`)
);
--> statement-breakpoint
CREATE TABLE `va_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assignmentId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `va_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `va_submission_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assignmentId` int NOT NULL,
	`fileName` varchar(500) NOT NULL,
	`originalName` varchar(500) NOT NULL,
	`mimeType` varchar(255) NOT NULL,
	`fileSize` int NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`url` varchar(1000) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `va_submission_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `deliverables` MODIFY COLUMN `status` enum('pending','in_progress','completed','blocked','pending_approval','approved','change_requested') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `packageType` enum('jumpstart','dominator','assessment') NOT NULL;