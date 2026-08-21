CREATE TABLE `referralShareCards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referralRequestId` int NOT NULL,
	`createdByUserId` int NOT NULL,
	`shareToken` varchar(64) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `referralShareCards_id` PRIMARY KEY(`id`),
	CONSTRAINT `referral_share_card_token_unique` UNIQUE(`shareToken`),
	CONSTRAINT `referral_share_card_owner_request_unique` UNIQUE(`referralRequestId`,`createdByUserId`)
);
--> statement-breakpoint
ALTER TABLE `referralShareCards` ADD CONSTRAINT `referralShareCards_referralRequestId_referralRequests_id_fk` FOREIGN KEY (`referralRequestId`) REFERENCES `referralRequests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `referralShareCards` ADD CONSTRAINT `referralShareCards_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `referral_share_card_public_idx` ON `referralShareCards` (`shareToken`,`isActive`);--> statement-breakpoint
CREATE INDEX `referral_share_card_request_idx` ON `referralShareCards` (`referralRequestId`);