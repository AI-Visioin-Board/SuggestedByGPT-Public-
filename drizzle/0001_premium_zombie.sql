CREATE TABLE `action_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`actionType` enum('verify_gbp','provide_credentials','review_content','other') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`status` enum('pending','completed') NOT NULL DEFAULT 'pending',
	`completedAt` timestamp,
	CONSTRAINT `action_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `client_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`credentialType` enum('website_cms','google_account','domain_registrar','other') NOT NULL,
	`serviceName` varchar(255),
	`username` text,
	`password` text,
	`additionalInfo` text,
	`isVerified` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `client_credentials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`fullName` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(50),
	`businessName` varchar(255) NOT NULL,
	`businessWebsite` varchar(500),
	`industry` varchar(255),
	`businessAddress` text,
	`targetLocation` text,
	`servicesOffered` text,
	`cmsType` varchar(100),
	`hasGoogleProfile` boolean DEFAULT false,
	`googleProfileUrl` varchar(500),
	`competitors` text,
	`additionalGoals` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deliverables` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`deliverableType` varchar(100) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`status` enum('pending','in_progress','completed','blocked') NOT NULL DEFAULT 'pending',
	`fileUrl` varchar(500),
	`completedAt` timestamp,
	`notes` text,
	CONSTRAINT `deliverables_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`packageType` enum('jumpstart','dominator') NOT NULL,
	`price` decimal(10,2) NOT NULL,
	`status` enum('pending','processing','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
	`stripePaymentId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `progress_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`deliverableId` int,
	`message` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `progress_log_id` PRIMARY KEY(`id`)
);
