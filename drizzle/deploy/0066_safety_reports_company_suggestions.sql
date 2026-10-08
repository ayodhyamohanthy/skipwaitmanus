-- Safety reports + company suggestions intake (kit: /report, /suggest-company).
-- Additive only. The deploy pipeline applies this file
-- (see server/schemaDeployGuard.test.ts).
CREATE TABLE IF NOT EXISTS `safetyReports` (
 `id` int AUTO_INCREMENT,
 `reporterUserId` int NOT NULL,
 `reason` varchar(80) NOT NULL,
 `details` text NULL,
 `referralRequestId` int NULL,
 `reportedUserId` int NULL,
 `urgent` boolean NOT NULL DEFAULT false,
 `status` ENUM('open','under_review','resolved','dismissed') NOT NULL DEFAULT 'open',
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT `safetyReports_id` PRIMARY KEY(`id`),
 CONSTRAINT `safety_reports_reporter_fk` FOREIGN KEY (`reporterUserId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 CONSTRAINT `safety_reports_request_fk` FOREIGN KEY (`referralRequestId`) REFERENCES `referralRequests` (`id`) ON DELETE SET NULL,
 CONSTRAINT `safety_reports_reported_fk` FOREIGN KEY (`reportedUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL,
 INDEX `safety_reports_reporter_idx`(`reporterUserId`),
 INDEX `safety_reports_status_idx`(`status`)
);
CREATE TABLE IF NOT EXISTS `companySuggestions` (
 `id` int AUTO_INCREMENT,
 `submitterUserId` int NOT NULL,
 `companyName` varchar(160) NOT NULL,
 `website` varchar(512) NULL,
 `role` ENUM('seeker','employee') NOT NULL DEFAULT 'seeker',
 `status` ENUM('open','under_review','approved','dismissed') NOT NULL DEFAULT 'open',
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT `companySuggestions_id` PRIMARY KEY(`id`),
 CONSTRAINT `company_suggestions_submitter_fk` FOREIGN KEY (`submitterUserId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 INDEX `company_suggestions_submitter_idx`(`submitterUserId`),
 INDEX `company_suggestions_status_idx`(`status`)
);
