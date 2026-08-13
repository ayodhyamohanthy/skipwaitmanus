CREATE TABLE `referralAttachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referralRequestId` int,
	`ownerId` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileKey` varchar(1024) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`fileSize` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `referralAttachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tokenBalances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`balance` int NOT NULL DEFAULT 0,
	`stripeCustomerId` varchar(255),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tokenBalances_id` PRIMARY KEY(`id`),
	CONSTRAINT `token_balances_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `tokenTransactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenCount` int NOT NULL,
	`kind` enum('purchase','direct_request') NOT NULL,
	`stripeCheckoutSessionId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tokenTransactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `referralAttachments` ADD CONSTRAINT `referralAttachments_referralRequestId_referralRequests_id_fk` FOREIGN KEY (`referralRequestId`) REFERENCES `referralRequests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `referralAttachments` ADD CONSTRAINT `referralAttachments_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tokenBalances` ADD CONSTRAINT `tokenBalances_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tokenTransactions` ADD CONSTRAINT `tokenTransactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `referral_attachments_request_idx` ON `referralAttachments` (`referralRequestId`);--> statement-breakpoint
CREATE INDEX `referral_attachments_owner_idx` ON `referralAttachments` (`ownerId`);--> statement-breakpoint
CREATE INDEX `token_transactions_user_idx` ON `tokenTransactions` (`userId`);