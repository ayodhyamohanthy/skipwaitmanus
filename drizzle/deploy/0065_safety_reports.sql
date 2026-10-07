-- Kit v4 safety slice: user reports + blocks (SCREENS.md `/report`,
-- FOR_AI_BUILDERS.md §3 "Safety"). These two tables are new, so the whole
-- table including its indexes and foreign keys is created by one idempotent
-- statement. Production only ever applies drizzle/deploy/*.sql — see
-- scripts/apply-deploy-migrations.sh and server/schemaDeployGuard.test.ts (#90).
CREATE TABLE IF NOT EXISTS `safetyReports` (
 `id` int AUTO_INCREMENT PRIMARY KEY,
 `reporterUserId` int NOT NULL,
 `subjectUserId` int NULL,
 `reason` ENUM('money_request','harassment','fake_job','impersonation','spam','other') NOT NULL,
 `details` text NULL,
 `urgent` boolean NOT NULL DEFAULT false,
 `blockRequested` boolean NOT NULL DEFAULT false,
 `status` ENUM('received','in_review','resolved','declined') NOT NULL DEFAULT 'received',
 `outcome` ENUM('warning','restricted','removed','no_action') NULL,
 `reviewerNote` text NULL,
 `reviewedByUserId` int NULL,
 `reviewedAt` timestamp NULL,
 `dueAt` timestamp NOT NULL,
 `appealUntil` timestamp NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX `safety_report_status_created_idx` (`status`,`createdAt`),
 INDEX `safety_report_reporter_idx` (`reporterUserId`,`createdAt`),
 INDEX `safety_report_subject_idx` (`subjectUserId`,`createdAt`),
 CONSTRAINT `safety_report_reporter_fk` FOREIGN KEY (`reporterUserId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 CONSTRAINT `safety_report_subject_fk` FOREIGN KEY (`subjectUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL,
 CONSTRAINT `safety_report_reviewer_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `userBlocks` (
 `id` int AUTO_INCREMENT PRIMARY KEY,
 `blockerUserId` int NOT NULL,
 `blockedUserId` int NOT NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE INDEX `user_blocks_pair_unique` (`blockerUserId`,`blockedUserId`),
 INDEX `user_blocks_blocked_idx` (`blockedUserId`),
 CONSTRAINT `user_blocks_blocker_fk` FOREIGN KEY (`blockerUserId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 CONSTRAINT `user_blocks_blocked_fk` FOREIGN KEY (`blockedUserId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
