CREATE TABLE `adminTokenAdjustments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipientUserId` int NOT NULL,
	`adminUserId` int NOT NULL,
	`role` enum('job_seeker','referrer') NOT NULL,
	`tokenCount` int NOT NULL,
	`caseReference` varchar(120) NOT NULL,
	`reason` varchar(500) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `adminTokenAdjustments_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_token_adjustments_case_unique` UNIQUE(`recipientUserId`,`role`,`caseReference`)
);
--> statement-breakpoint
ALTER TABLE `tokenTransactions` MODIFY COLUMN `kind` enum('purchase','direct_request','admin_adjustment') NOT NULL;--> statement-breakpoint
ALTER TABLE `adminTokenAdjustments` ADD CONSTRAINT `adminTokenAdjustments_recipientUserId_users_id_fk` FOREIGN KEY (`recipientUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `adminTokenAdjustments` ADD CONSTRAINT `adminTokenAdjustments_adminUserId_users_id_fk` FOREIGN KEY (`adminUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `admin_token_adjustments_recipient_idx` ON `adminTokenAdjustments` (`recipientUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `admin_token_adjustments_admin_idx` ON `adminTokenAdjustments` (`adminUserId`,`createdAt`);