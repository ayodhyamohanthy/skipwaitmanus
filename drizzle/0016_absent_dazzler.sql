CREATE TABLE `privacyRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('erasure') NOT NULL,
	`status` enum('requested','in_review','completed','declined') NOT NULL DEFAULT 'requested',
	`source` varchar(32) NOT NULL DEFAULT 'account_settings',
	`resolution` varchar(500),
	`reviewedByUserId` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `privacyRequests_id` PRIMARY KEY(`id`),
	CONSTRAINT `privacy_request_user_kind_active_unique` UNIQUE(`userId`,`kind`,`status`)
);
--> statement-breakpoint
ALTER TABLE `privacyRequests` ADD CONSTRAINT `privacyRequests_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `privacyRequests` ADD CONSTRAINT `privacyRequests_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `privacy_request_status_created_idx` ON `privacyRequests` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `privacy_request_user_idx` ON `privacyRequests` (`userId`,`createdAt`);