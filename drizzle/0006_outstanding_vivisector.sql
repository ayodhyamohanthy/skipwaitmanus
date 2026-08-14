CREATE TABLE `operationalActivityLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorUserId` int,
	`action` varchar(100) NOT NULL,
	`outcome` enum('success','failure','denied') NOT NULL,
	`resourceType` varchar(80),
	`resourceId` varchar(120),
	`companyDomain` varchar(255),
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operationalActivityLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `operationalActivityLogs` ADD CONSTRAINT `operationalActivityLogs_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `operational_activity_created_idx` ON `operationalActivityLogs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `operational_activity_actor_idx` ON `operationalActivityLogs` (`actorUserId`);--> statement-breakpoint
CREATE INDEX `operational_activity_action_idx` ON `operationalActivityLogs` (`action`);