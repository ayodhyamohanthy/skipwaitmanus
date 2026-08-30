CREATE TABLE `referrerSlackWebhooks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referrerId` int NOT NULL,
	`webhookUrl` varchar(512) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `referrerSlackWebhooks_id` PRIMARY KEY(`id`),
	CONSTRAINT `referrerSlackWebhooks_referrerId_users_id_fk` FOREIGN KEY (`referrerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `referrer_slack_webhook_user_unique` ON `referrerSlackWebhooks` (`referrerId`);
