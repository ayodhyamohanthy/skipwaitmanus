-- Queue task 5 phase 1 (moderation case file). Additive only: one new table plus two columns on
-- safetyReports. Stores the reviewer note and an audit trail per report. No sanctions, no notifications.
CREATE TABLE IF NOT EXISTS `moderationEvents` (
 `id` int AUTO_INCREMENT,
 `reportId` int NOT NULL,
 `actorKind` varchar(12) NOT NULL,
 `actorUserId` int NULL,
 `kind` varchar(32) NOT NULL,
 `note` varchar(600) NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT `moderationEvents_id` PRIMARY KEY(`id`),
 CONSTRAINT `moderation_events_report_fk` FOREIGN KEY (`reportId`) REFERENCES `safetyReports` (`id`) ON DELETE CASCADE,
 INDEX `moderation_events_report_idx`(`reportId`, `createdAt`)
);
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'safetyReports' AND COLUMN_NAME = 'severity');
SET @ddl = IF(@c = 0, 'ALTER TABLE `safetyReports` ADD COLUMN `severity` VARCHAR(8) NOT NULL DEFAULT ''normal''', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'safetyReports' AND COLUMN_NAME = 'dueAt');
SET @ddl = IF(@c = 0, 'ALTER TABLE `safetyReports` ADD COLUMN `dueAt` TIMESTAMP NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
