CREATE TABLE `referrerFastTrackLinks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referrerId` int NOT NULL,
	`companyDomain` varchar(255) NOT NULL,
	`linkCode` varchar(64) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deactivatedAt` timestamp,
	CONSTRAINT `referrerFastTrackLinks_id` PRIMARY KEY(`id`),
	CONSTRAINT `referrer_fast_track_referrer_unique` UNIQUE(`referrerId`),
	CONSTRAINT `referrer_fast_track_code_unique` UNIQUE(`linkCode`)
);
--> statement-breakpoint
ALTER TABLE `referrerFastTrackLinks` ADD CONSTRAINT `referrerFastTrackLinks_referrerId_users_id_fk` FOREIGN KEY (`referrerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `referrer_fast_track_public_idx` ON `referrerFastTrackLinks` (`linkCode`,`isActive`);--> statement-breakpoint
CREATE INDEX `referrer_fast_track_company_idx` ON `referrerFastTrackLinks` (`companyDomain`,`isActive`);