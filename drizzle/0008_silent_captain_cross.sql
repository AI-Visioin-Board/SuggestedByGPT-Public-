CREATE TABLE `processed_webhook_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stripeEventId` varchar(255) NOT NULL,
	`eventType` varchar(100) NOT NULL,
	`processedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `processed_webhook_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `processed_webhook_events_stripeEventId_unique` UNIQUE(`stripeEventId`)
);
--> statement-breakpoint
ALTER TABLE `clients` MODIFY COLUMN `userId` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `action_items` ADD `priority` varchar(20) DEFAULT 'medium';--> statement-breakpoint
ALTER TABLE `action_items` ADD `relatedDeliverableId` int;--> statement-breakpoint
ALTER TABLE `action_items` ADD `bundledInMeeting` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `clients` ADD `meetingRequestedAt` timestamp;--> statement-breakpoint
ALTER TABLE `clients` ADD `meetingScheduledAt` timestamp;--> statement-breakpoint
ALTER TABLE `clients` ADD `onboardingCompleted` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `deliverables` ADD `progressPercent` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `deliverables` ADD `stepIndex` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `deliverables` ADD `blockerReason` text;--> statement-breakpoint
ALTER TABLE `deliverables` ADD `blockerCreatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `deliverables` ADD `retryCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `stripeSubscriptionId` varchar(255);--> statement-breakpoint
ALTER TABLE `orders` ADD `subscriptionStatus` varchar(50);--> statement-breakpoint
ALTER TABLE `orders` ADD `subscriptionEndDate` timestamp;--> statement-breakpoint
ALTER TABLE `progress_log` ADD `sessionData` json;--> statement-breakpoint
ALTER TABLE `progress_log` ADD `sessionType` varchar(50) DEFAULT 'execution';