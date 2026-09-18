SET @grant_version_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='referrerReviewEmailLinks' AND column_name='grantVersion')=0, 'ALTER TABLE `referrerReviewEmailLinks` ADD COLUMN `grantVersion` int NOT NULL DEFAULT 1, ADD COLUMN `rotatedAt` timestamp NULL', 'SELECT 1');
PREPARE grant_version_stmt FROM @grant_version_sql;
EXECUTE grant_version_stmt;
DEALLOCATE PREPARE grant_version_stmt;
CREATE TABLE IF NOT EXISTS `referralReviewGrantRotations` (
 `id` int AUTO_INCREMENT PRIMARY KEY, `referralRequestId` int NOT NULL, `referrerId` int NOT NULL, `actorUserId` int NOT NULL, `fromVersion` int NOT NULL, `toVersion` int NOT NULL, `reason` varchar(255) NOT NULL, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE INDEX `referral_review_grant_rotation_unique` (`referralRequestId`,`referrerId`,`toVersion`),
 CONSTRAINT `referral_review_rotation_request_fk` FOREIGN KEY (`referralRequestId`) REFERENCES `referralRequests` (`id`) ON DELETE CASCADE,
 CONSTRAINT `referral_review_rotation_referrer_fk` FOREIGN KEY (`referrerId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 CONSTRAINT `referral_review_rotation_actor_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS `referralReviewDeliveries` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `referralRequestId` int NOT NULL,
  `referrerId` int NOT NULL,
  `channel` enum('email','slack') NOT NULL,
  `grantVersion` int NOT NULL DEFAULT 1,
  `status` enum('pending','leased','sent','failed','unknown','revoked') NOT NULL DEFAULT 'pending',
  `attemptCount` int NOT NULL DEFAULT 0,
  `leaseOwner` varchar(64) NULL,
  `leaseExpiresAt` timestamp NULL,
  `nextAttemptAt` timestamp NULL,
  `providerMessageId` varchar(255) NULL,
  `lastError` varchar(255) NULL,
  `sentAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `referral_review_delivery_recipient_unique` (`referralRequestId`,`referrerId`,`channel`,`grantVersion`),
  INDEX `referral_review_delivery_claim_idx` (`status`,`nextAttemptAt`,`leaseExpiresAt`),
  CONSTRAINT `referral_review_delivery_request_fk` FOREIGN KEY (`referralRequestId`) REFERENCES `referralRequests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `referral_review_delivery_referrer_fk` FOREIGN KEY (`referrerId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
