-- Sprint 1D: Add columns for automated service delivery system
-- Deliverables: progress tracking + blocker handling
ALTER TABLE `deliverables` ADD COLUMN `progressPercent` int DEFAULT 0;
ALTER TABLE `deliverables` ADD COLUMN `stepIndex` int DEFAULT 0;
ALTER TABLE `deliverables` ADD COLUMN `blockerReason` text;
ALTER TABLE `deliverables` ADD COLUMN `blockerCreatedAt` timestamp;

-- Progress log: persistent session memory
ALTER TABLE `progress_log` ADD COLUMN `sessionData` json;
ALTER TABLE `progress_log` ADD COLUMN `sessionType` varchar(50) DEFAULT 'execution';

-- Orders: subscription billing for Dominator
ALTER TABLE `orders` ADD COLUMN `stripeSubscriptionId` varchar(255);
ALTER TABLE `orders` ADD COLUMN `subscriptionStatus` varchar(50);
ALTER TABLE `orders` ADD COLUMN `subscriptionEndDate` timestamp;

-- Action items: blocker bundling for meetings
ALTER TABLE `action_items` ADD COLUMN `priority` varchar(20) DEFAULT 'medium';
ALTER TABLE `action_items` ADD COLUMN `relatedDeliverableId` int;
ALTER TABLE `action_items` ADD COLUMN `bundledInMeeting` boolean DEFAULT false;

-- Clients: meeting scheduling + onboarding
ALTER TABLE `clients` ADD COLUMN `meetingRequestedAt` timestamp;
ALTER TABLE `clients` ADD COLUMN `meetingScheduledAt` timestamp;
ALTER TABLE `clients` ADD COLUMN `onboardingCompleted` boolean DEFAULT false;
