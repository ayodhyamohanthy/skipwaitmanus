CREATE TABLE IF NOT EXISTS `promoCreditGrants` (
 `id` int AUTO_INCREMENT PRIMARY KEY, `userId` int NOT NULL, `role` ENUM('job_seeker','referrer') NOT NULL DEFAULT 'job_seeker',
 `tokenCount` int NOT NULL, `creditsRemaining` int NOT NULL, `status` ENUM('active','exhausted','expired','revoked') NOT NULL DEFAULT 'active',
 `source` varchar(40) NOT NULL DEFAULT 'first_paid_invoice', `providerRef` varchar(255) NULL,
 `grantedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `expiresAt` timestamp NOT NULL,
 `consumedAt` timestamp NULL, `revokedAt` timestamp NULL, `revokedReason` varchar(255) NULL, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE INDEX `promo_grant_user_role_unique` (`userId`,`role`),
 INDEX `promo_grant_user_status_idx` (`userId`,`role`,`status`),
 CONSTRAINT `promo_grant_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `tokenTransactions` MODIFY COLUMN `kind` enum('purchase','direct_request','admin_adjustment','company_coverage_reward','personal_referral_reward','invite_reward_pending','invite_reward_granted','withdrawal_refund','promo_grant','promo_spend') NOT NULL;
