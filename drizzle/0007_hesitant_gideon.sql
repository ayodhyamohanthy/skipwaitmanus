CREATE TABLE `paymentFulfillments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(32) NOT NULL,
	`providerEventId` varchar(255) NOT NULL,
	`providerInvoiceId` varchar(255),
	`providerHostedPageId` varchar(255),
	`userId` int NOT NULL,
	`role` enum('job_seeker','referrer') NOT NULL,
	`tokenCount` int NOT NULL,
	`amount` int NOT NULL,
	`currency` varchar(3) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paymentFulfillments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_fulfillments_provider_event_unique` UNIQUE(`provider`,`providerEventId`)
);
--> statement-breakpoint
CREATE INDEX `token_balances_user_idx` ON `tokenBalances` (`userId`);--> statement-breakpoint
ALTER TABLE `tokenBalances` DROP INDEX `token_balances_user_unique`;--> statement-breakpoint
ALTER TABLE `tokenBalances` ADD `role` enum('job_seeker','referrer') DEFAULT 'job_seeker' NOT NULL;--> statement-breakpoint
ALTER TABLE `tokenTransactions` ADD `role` enum('job_seeker','referrer') DEFAULT 'job_seeker' NOT NULL;--> statement-breakpoint
ALTER TABLE `tokenBalances` ADD CONSTRAINT `token_balances_user_role_unique` UNIQUE(`userId`,`role`);--> statement-breakpoint
ALTER TABLE `paymentFulfillments` ADD CONSTRAINT `paymentFulfillments_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `payment_fulfillments_user_idx` ON `paymentFulfillments` (`userId`);
