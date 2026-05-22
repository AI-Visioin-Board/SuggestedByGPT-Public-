CREATE TABLE `chatbot_conversations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessionId` varchar(64) NOT NULL,
  `role` enum('user','assistant') NOT NULL,
  `content` text NOT NULL,
  `voiceUsed` tinyint NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY(`id`),
  INDEX `idx_chatbot_session` (`sessionId`)
);
