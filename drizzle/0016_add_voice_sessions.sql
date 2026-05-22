CREATE TABLE `voice_sessions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `clientId` int NOT NULL,
  `orderId` int,
  `status` enum('scheduled','reminder_sent','waiting','active','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
  `scheduledAt` timestamp NOT NULL,
  `startedAt` timestamp NULL,
  `endedAt` timestamp NULL,
  `durationSeconds` int,
  `transcriptSummary` text,
  `transcriptMessages` json,
  `cancelledAt` timestamp NULL,
  `cancelReason` varchar(255),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `voice_sessions_id` PRIMARY KEY(`id`)
);

CREATE INDEX `voice_sessions_clientId_idx` ON `voice_sessions` (`clientId`);
CREATE INDEX `voice_sessions_status_idx` ON `voice_sessions` (`status`);
