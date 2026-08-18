CREATE TABLE `companyCoverageInvitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inviteCode` varchar(64) NOT NULL,
	`inviterUserId` int NOT NULL,
	`companyDomain` varchar(255) NOT NULL,
	`status` enum('active','completed','ineligible') NOT NULL DEFAULT 'active',
	`joinerUserId` int,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `companyCoverageInvitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `coverage_invite_code_unique` UNIQUE(`inviteCode`)
);
--> statement-breakpoint
CREATE TABLE `companyCoverageRewards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invitationId` int NOT NULL,
	`inviterUserId` int NOT NULL,
	`joinerUserId` int NOT NULL,
	`tokenCount` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `companyCoverageRewards_id` PRIMARY KEY(`id`),
	CONSTRAINT `coverage_reward_invitation_unique` UNIQUE(`invitationId`),
	CONSTRAINT `coverage_reward_joiner_unique` UNIQUE(`joinerUserId`)
);
--> statement-breakpoint
ALTER TABLE `tokenTransactions` MODIFY COLUMN `kind` enum('purchase','direct_request','admin_adjustment','company_coverage_reward') NOT NULL;--> statement-breakpoint
ALTER TABLE `companyCoverageInvitations` ADD CONSTRAINT `cc_inviter_fk` FOREIGN KEY (`inviterUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `companyCoverageInvitations` ADD CONSTRAINT `cc_joiner_fk` FOREIGN KEY (`joinerUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `companyCoverageRewards` ADD CONSTRAINT `cc_reward_invite_fk` FOREIGN KEY (`invitationId`) REFERENCES `companyCoverageInvitations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `companyCoverageRewards` ADD CONSTRAINT `cc_reward_inviter_fk` FOREIGN KEY (`inviterUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `companyCoverageRewards` ADD CONSTRAINT `cc_reward_joiner_fk` FOREIGN KEY (`joinerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `coverage_invite_inviter_idx` ON `companyCoverageInvitations` (`inviterUserId`);--> statement-breakpoint
CREATE INDEX `coverage_invite_company_status_idx` ON `companyCoverageInvitations` (`companyDomain`,`status`);--> statement-breakpoint
CREATE INDEX `coverage_reward_inviter_idx` ON `companyCoverageRewards` (`inviterUserId`);
