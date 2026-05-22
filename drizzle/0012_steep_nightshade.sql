CREATE TABLE `va_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`clientId` int NOT NULL,
	`directoryName` varchar(255) NOT NULL,
	`assignedToUserId` int,
	`status` enum('pending','in_progress','submitted','verified','failed') NOT NULL DEFAULT 'pending',
	`sopPdfUrl` varchar(1000),
	`submissionUrl` varchar(1000),
	`submissionAccount` varchar(320),
	`notes` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `va_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `deliverables` MODIFY COLUMN `status` enum('pending','in_progress','completed','blocked','pending_approval','approved') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','assistant') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `deliverables` ADD `approvalPreviewUrl` varchar(500);--> statement-breakpoint
ALTER TABLE `deliverables` ADD `approvalFeedback` text;