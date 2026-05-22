CREATE TABLE `client_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`orderId` int,
	`fileName` varchar(500) NOT NULL,
	`originalName` varchar(500) NOT NULL,
	`mimeType` varchar(255) NOT NULL,
	`fileSize` int NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`url` varchar(1000) NOT NULL,
	`category` enum('logo','content','credentials','reference','other') NOT NULL DEFAULT 'other',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `client_files_id` PRIMARY KEY(`id`)
);
