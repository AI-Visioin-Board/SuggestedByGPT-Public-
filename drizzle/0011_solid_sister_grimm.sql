ALTER TABLE `action_items` ADD `reminderCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `action_items` ADD `lastReminderSentAt` timestamp;