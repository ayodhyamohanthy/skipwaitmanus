CREATE TABLE `personalReferralInvites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inviteCode` varchar(64) NOT NULL,
	`inviterUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `personalReferralInvites_id` PRIMARY KEY(`id`),
	CONSTRAINT `personal_referral_invite_code_unique` UNIQUE(`inviteCode`),
	CONSTRAINT `personal_referral_inviter_unique` UNIQUE(`inviterUserId`)
);
--> statement-breakpoint
CREATE TABLE `personalReferralRewards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invitationId` int NOT NULL,
	`inviterUserId` int NOT NULL,
	`joinerUserId` int NOT NULL,
	`joinerEmailHash` varchar(64) NOT NULL,
	`tokenCount` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `personalReferralRewards_id` PRIMARY KEY(`id`),
	CONSTRAINT `personal_referral_reward_invitation_joiner_unique` UNIQUE(`invitationId`,`joinerUserId`),
	CONSTRAINT `personal_referral_reward_joiner_unique` UNIQUE(`joinerUserId`),
	CONSTRAINT `personal_referral_reward_email_unique` UNIQUE(`joinerEmailHash`)
);
--> statement-breakpoint
ALTER TABLE `tokenTransactions` MODIFY COLUMN `kind` enum('purchase','direct_request','admin_adjustment','company_coverage_reward','personal_referral_reward') NOT NULL;--> statement-breakpoint
ALTER TABLE `personalReferralInvites` ADD CONSTRAINT `pri_inviter_fk` FOREIGN KEY (`inviterUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `personalReferralRewards` ADD CONSTRAINT `prr_invite_fk` FOREIGN KEY (`invitationId`) REFERENCES `personalReferralInvites`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `personalReferralRewards` ADD CONSTRAINT `prr_inviter_fk` FOREIGN KEY (`inviterUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `personalReferralRewards` ADD CONSTRAINT `prr_joiner_fk` FOREIGN KEY (`joinerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `personal_referral_reward_inviter_idx` ON `personalReferralRewards` (`inviterUserId`);
