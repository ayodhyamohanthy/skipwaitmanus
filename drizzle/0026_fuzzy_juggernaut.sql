CREATE TABLE `referrerReviewEmailLinks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referralRequestId` int NOT NULL,
	`referrerId` int NOT NULL,
	`linkToken` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`consumedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `referrerReviewEmailLinks_id` PRIMARY KEY(`id`),
	CONSTRAINT `referrer_review_email_token_unique` UNIQUE(`linkToken`),
	CONSTRAINT `referrer_review_email_request_referrer_unique` UNIQUE(`referralRequestId`,`referrerId`)
);
--> statement-breakpoint
ALTER TABLE `referrerReviewEmailLinks` ADD CONSTRAINT `rr_email_request_fk` FOREIGN KEY (`referralRequestId`) REFERENCES `referralRequests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `referrerReviewEmailLinks` ADD CONSTRAINT `rr_email_referrer_fk` FOREIGN KEY (`referrerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `referrer_review_email_lookup_idx` ON `referrerReviewEmailLinks` (`linkToken`,`referrerId`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `referrer_review_email_request_idx` ON `referrerReviewEmailLinks` (`referralRequestId`);
