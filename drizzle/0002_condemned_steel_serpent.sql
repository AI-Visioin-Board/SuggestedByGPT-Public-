ALTER TABLE `client_credentials` ADD `encryptedData` text;--> statement-breakpoint
ALTER TABLE `client_credentials` ADD `updatedAt` timestamp DEFAULT (now()) NOT NULL;