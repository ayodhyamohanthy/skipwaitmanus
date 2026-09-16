CREATE TABLE IF NOT EXISTS `referralRequestPasses` (
 `id` int AUTO_INCREMENT NOT NULL,
 `referralRequestId` int NOT NULL,
 `referrerId` int NOT NULL,
 `reason` ENUM('role_not_a_fit','cannot_support','timing') NOT NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT `referralRequestPasses_id` PRIMARY KEY(`id`),
 UNIQUE INDEX `referral_request_pass_request_referrer_unique` (`referralRequestId`,`referrerId`),
 INDEX `referral_request_pass_referrer_idx` (`referrerId`,`createdAt`)
);
