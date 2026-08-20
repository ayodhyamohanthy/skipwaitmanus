CREATE TABLE `referralAvailabilitySlots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referrerId` int NOT NULL,
	`companyDomain` varchar(255) NOT NULL,
	`referralRequestId` int NOT NULL,
	`status` enum('allocated','released') NOT NULL DEFAULT 'allocated',
	`activeRequestKey` varchar(80),
	`openedAt` timestamp NOT NULL DEFAULT (now()),
	`releasedAt` timestamp,
	CONSTRAINT `referralAvailabilitySlots_id` PRIMARY KEY(`id`),
	CONSTRAINT `referral_availability_active_request_unique` UNIQUE(`activeRequestKey`)
);
--> statement-breakpoint
ALTER TABLE `referralRequests` ADD `waitingForCoverage` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `referralRequests` ADD `coverageQueuedAt` timestamp;--> statement-breakpoint
ALTER TABLE `referralAvailabilitySlots` ADD CONSTRAINT `referralAvailabilitySlots_referrerId_users_id_fk` FOREIGN KEY (`referrerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `referralAvailabilitySlots` ADD CONSTRAINT `referral_avail_request_fk` FOREIGN KEY (`referralRequestId`) REFERENCES `referralRequests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `referral_availability_referrer_idx` ON `referralAvailabilitySlots` (`referrerId`,`status`);--> statement-breakpoint
CREATE INDEX `referral_availability_company_idx` ON `referralAvailabilitySlots` (`companyDomain`,`status`);--> statement-breakpoint
CREATE INDEX `referral_availability_request_idx` ON `referralAvailabilitySlots` (`referralRequestId`);--> statement-breakpoint
CREATE INDEX `referral_requests_coverage_queue_idx` ON `referralRequests` (`waitingForCoverage`,`coverageQueuedAt`);
