CREATE TABLE `companyOpportunities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`companyDomain` varchar(255) NOT NULL,
	`kind` enum('hiring_now','walk_in') NOT NULL,
	`roleTitle` varchar(180) NOT NULL,
	`targetRoleUrl` varchar(2048),
	`location` varchar(180),
	`walkInAt` timestamp,
	`walkInEndsAt` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companyOpportunities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `companyOpportunities` ADD CONSTRAINT `companyOpportunities_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `company_opportunities_public_idx` ON `companyOpportunities` (`isActive`,`createdAt`);--> statement-breakpoint
CREATE INDEX `company_opportunities_domain_idx` ON `companyOpportunities` (`companyDomain`);--> statement-breakpoint
CREATE INDEX `company_opportunities_owner_idx` ON `companyOpportunities` (`ownerId`);