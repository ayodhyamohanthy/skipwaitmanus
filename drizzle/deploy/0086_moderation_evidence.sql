-- Queue task 5 phase 1b: filing-time evidence snapshot. Additive only: one new table.
-- Rows are copied once when a report is filed, from the reporter's own request thread (messages the
-- reporter sent or received). Never updated afterwards. No sanctions, no notifications.
CREATE TABLE IF NOT EXISTS `moderationEvidence` (
 `id` int AUTO_INCREMENT,
 `reportId` int NOT NULL,
 `seq` int NOT NULL,
 `sender` varchar(10) NOT NULL,
 `body` text NOT NULL,
 `sentAt` timestamp NOT NULL,
 `capturedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT `moderationEvidence_id` PRIMARY KEY(`id`),
 CONSTRAINT `moderation_evidence_report_fk` FOREIGN KEY (`reportId`) REFERENCES `safetyReports` (`id`) ON DELETE CASCADE,
 INDEX `moderation_evidence_report_idx`(`reportId`, `seq`)
);
