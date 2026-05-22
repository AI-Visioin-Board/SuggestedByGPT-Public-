CREATE TABLE `support_ticket_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`senderType` enum('client','agent','admin') NOT NULL,
	`message` text NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`isProcessed` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `support_ticket_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int,
	`email` varchar(320) NOT NULL,
	`name` varchar(255),
	`subject` varchar(500) NOT NULL,
	`status` enum('open','awaiting_client','escalated','closed') NOT NULL DEFAULT 'open',
	`priority` enum('low','normal','high') NOT NULL DEFAULT 'normal',
	`category` enum('general','billing','technical','deliverable','other') NOT NULL DEFAULT 'general',
	`accessToken` varchar(64) NOT NULL,
	`escalatedAt` timestamp,
	`closedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `support_tickets_id` PRIMARY KEY(`id`)
);
