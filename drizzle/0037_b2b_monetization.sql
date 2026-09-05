-- 0037: B2B monetization — employer accounts, unlock credit economy, sponsored
-- roles, partner modules, and seeker talent-discovery opt-in.
-- Follows the hand-written operational style of 0035/0036 (no drizzle snapshot).
-- MySQL 8.0 syntax — no IF NOT EXISTS; scripts/apply-missing-columns.mjs and
-- the boot-time schemaReconcile apply the ADD COLUMN parts idempotently.
-- NOTE: the accountType enum widening (append 'employer') is MODIFY-only and
-- has no ADD COLUMN equivalent, so it can only come from this migration file.
ALTER TABLE `profiles` MODIFY `accountType` ENUM('job_seeker', 'referrer', 'employer');
--> statement-breakpoint
ALTER TABLE `profiles` ADD COLUMN `anonymityOptIn` BOOLEAN NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `companyOpportunities` ADD COLUMN `sponsoredUntil` timestamp;
--> statement-breakpoint
ALTER TABLE `companyOpportunities` ADD COLUMN `sponsoredTier` ENUM('standard', 'featured', 'spotlight');
--> statement-breakpoint
CREATE TABLE `employerAccounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyName` varchar(160) NOT NULL,
	`billingEmail` varchar(320) NOT NULL,
	`credits` int NOT NULL DEFAULT 0,
	`budgetMonthlyUsdCents` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE NOW,
	CONSTRAINT `employerAccounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `employerAccounts` ADD CONSTRAINT `employer_accounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX `employer_accounts_user_unique` ON `employerAccounts` (`userId`);
--> statement-breakpoint
CREATE TABLE `profileUnlocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employerUserId` int NOT NULL,
	`seekerProfileUserId` int NOT NULL,
	`unlockedAt` timestamp NOT NULL DEFAULT (now()),
	`creditsSpent` int NOT NULL,
	CONSTRAINT `profileUnlocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `profileUnlocks` ADD CONSTRAINT `profile_unlocks_employerUserId_users_id_fk` FOREIGN KEY (`employerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `profileUnlocks` ADD CONSTRAINT `profile_unlocks_seekerProfileUserId_users_id_fk` FOREIGN KEY (`seekerProfileUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_unlocks_employer_seeker_unique` ON `profileUnlocks` (`employerUserId`,`seekerProfileUserId`);
--> statement-breakpoint
CREATE INDEX `profile_unlocks_seeker_idx` ON `profileUnlocks` (`seekerProfileUserId`);
--> statement-breakpoint
CREATE TABLE `partnerModules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`partnerName` varchar(120) NOT NULL,
	`category` ENUM('interview_prep', 'resume_vetting', 'skill_assessment', 'other') NOT NULL,
	`headline` varchar(180) NOT NULL,
	`description` text,
	`targetRoles` text,
	`ctaLabel` varchar(80) NOT NULL,
	`ctaUrl` varchar(2048) NOT NULL,
	`isActive` BOOLEAN NOT NULL DEFAULT true,
	`impressions` int NOT NULL DEFAULT 0,
	`clicks` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE NOW,
	CONSTRAINT `partnerModules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `partner_modules_active_idx` ON `partnerModules` (`isActive`,`createdAt`);
