ALTER TABLE `referralRequests` DROP FOREIGN KEY `referralRequests_referrerId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `referralRequests` MODIFY COLUMN `referrerId` int;--> statement-breakpoint
ALTER TABLE `jobs` ADD `targetRoleUrl` varchar(2048);--> statement-breakpoint
ALTER TABLE `profiles` ADD `workEmailDomain` varchar(255);--> statement-breakpoint
ALTER TABLE `profiles` ADD `workEmailVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `referralRequests` ADD CONSTRAINT `referralRequests_referrerId_users_id_fk` FOREIGN KEY (`referrerId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;