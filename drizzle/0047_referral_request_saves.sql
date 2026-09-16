CREATE TABLE IF NOT EXISTS `referralRequestSaves` (
 `id` int AUTO_INCREMENT NOT NULL,
 `referralRequestId` int NOT NULL,
 `referrerId` int NOT NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT `referralRequestSaves_id` PRIMARY KEY(`id`),
 UNIQUE INDEX `referral_request_save_request_referrer_unique` (`referralRequestId`,`referrerId`),
 INDEX `referral_request_save_referrer_idx` (`referrerId`,`createdAt`),
 INDEX `referral_request_save_request_idx` (`referralRequestId`)
);
