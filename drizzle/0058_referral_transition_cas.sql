SET @referral_revision_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='referralRequests' AND column_name='revision')=0, 'ALTER TABLE `referralRequests` ADD COLUMN `revision` int NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE referral_revision_stmt FROM @referral_revision_sql;
EXECUTE referral_revision_stmt;
DEALLOCATE PREPARE referral_revision_stmt;
CREATE TABLE IF NOT EXISTS `referralTransitionEvents` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `referralRequestId` int NOT NULL,
  `operationKey` varchar(120) NOT NULL,
  `actorUserId` int NOT NULL,
  `action` varchar(40) NOT NULL,
  `fromStatus` varchar(32) NOT NULL,
  `resultingStatus` varchar(32) NOT NULL,
  `resultingRevision` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX `referral_transition_operation_unique` (`referralRequestId`,`operationKey`),
  UNIQUE INDEX `referral_transition_revision_unique` (`referralRequestId`,`resultingRevision`),
  CONSTRAINT `referral_transition_request_fk` FOREIGN KEY (`referralRequestId`) REFERENCES `referralRequests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `referral_transition_actor_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
