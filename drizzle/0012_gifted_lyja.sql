CREATE TABLE `subscriptionCheckoutIntents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`hostedPageId` varchar(80) NOT NULL,
	`checkoutIntentId` varchar(96) NOT NULL,
	`userId` int NOT NULL,
	`role` enum('job_seeker','referrer') NOT NULL,
	`plan` enum('pro','max') NOT NULL,
	`itemPriceId` varchar(100) NOT NULL,
	`amount` int NOT NULL,
	`currency` varchar(3) NOT NULL,
	`status` enum('pending','activated','cancelled') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscriptionCheckoutIntents_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscription_checkout_hosted_page_unique` UNIQUE(`hostedPageId`),
	CONSTRAINT `subscription_checkout_intent_unique` UNIQUE(`checkoutIntentId`)
);
--> statement-breakpoint
CREATE TABLE `subscriptionEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(32) NOT NULL,
	`providerEventId` varchar(80) NOT NULL,
	`subscriptionId` varchar(80),
	`resourceVersion` bigint,
	`eventType` varchar(80) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscriptionEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscription_events_provider_event_unique` UNIQUE(`provider`,`providerEventId`)
);
--> statement-breakpoint
ALTER TABLE `tokenBalances` ADD `monthlyCreditsRemaining` int DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `tokenBalances` ADD `monthlyAllowance` int DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `tokenBalances` ADD `monthlyCycleKey` varchar(16) DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `tokenBalances` ADD `plan` enum('free','pro','max') DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `tokenBalances` ADD `subscriptionId` varchar(80);--> statement-breakpoint
ALTER TABLE `tokenBalances` ADD `subscriptionStatus` varchar(32);--> statement-breakpoint
ALTER TABLE `tokenBalances` ADD `subscriptionCurrency` varchar(3);--> statement-breakpoint
ALTER TABLE `tokenBalances` ADD `subscriptionCurrentTermStart` timestamp;--> statement-breakpoint
ALTER TABLE `tokenBalances` ADD `subscriptionCurrentTermEnd` timestamp;--> statement-breakpoint
ALTER TABLE `tokenBalances` ADD `subscriptionResourceVersion` bigint;--> statement-breakpoint
ALTER TABLE `tokenBalances` ADD CONSTRAINT `token_balances_subscription_unique` UNIQUE(`subscriptionId`);--> statement-breakpoint
ALTER TABLE `subscriptionCheckoutIntents` ADD CONSTRAINT `subscriptionCheckoutIntents_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `subscription_checkout_user_idx` ON `subscriptionCheckoutIntents` (`userId`);--> statement-breakpoint
CREATE INDEX `subscription_events_subscription_idx` ON `subscriptionEvents` (`subscriptionId`);