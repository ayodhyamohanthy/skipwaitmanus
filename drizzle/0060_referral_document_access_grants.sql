CREATE TABLE IF NOT EXISTS `referralDocumentAccessGrants` (
 `id` int AUTO_INCREMENT PRIMARY KEY, `referralRequestId` int NOT NULL, `referrerId` int NOT NULL,
 `requestRevision` int NOT NULL, `grantVersion` int NOT NULL DEFAULT 1, `grantedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `expiresAt` timestamp NOT NULL, `revokedAt` timestamp NULL, `revokeReason` varchar(255) NULL, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE INDEX `referral_document_grant_request_referrer_unique` (`referralRequestId`,`referrerId`),
 INDEX `referral_document_grant_active_idx` (`referrerId`,`revokedAt`,`expiresAt`),
 CONSTRAINT `referral_document_grant_request_fk` FOREIGN KEY (`referralRequestId`) REFERENCES `referralRequests` (`id`) ON DELETE CASCADE,
 CONSTRAINT `referral_document_grant_referrer_fk` FOREIGN KEY (`referrerId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
