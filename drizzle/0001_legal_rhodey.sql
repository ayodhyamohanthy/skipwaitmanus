CREATE TABLE `jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(180) NOT NULL,
	`company` varchar(160) NOT NULL,
	`location` varchar(120) NOT NULL,
	`seniority` varchar(80) NOT NULL,
	`employmentType` varchar(80) NOT NULL,
	`workMode` varchar(80) NOT NULL,
	`description` text NOT NULL,
	`compatibilityHint` varchar(255),
	`publishedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referralRequestId` int,
	`senderId` int NOT NULL,
	`recipientId` int NOT NULL,
	`body` text NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`category` enum('referral','message','status','system') NOT NULL,
	`title` varchar(180) NOT NULL,
	`body` text NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountType` enum('job_seeker','referrer'),
	`headline` varchar(180),
	`location` varchar(120),
	`bio` text,
	`company` varchar(160),
	`currentTitle` varchar(160),
	`resumeUrl` varchar(1024),
	`skills` text,
	`experience` text,
	`expertise` text,
	`referralCapacity` int DEFAULT 3,
	`isOnboarded` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `profiles_user_id_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `referralRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`jobSeekerId` int NOT NULL,
	`referrerId` int NOT NULL,
	`personalPitch` text NOT NULL,
	`status` enum('pending','approved','declined','intro_made','interview','offer','closed') NOT NULL DEFAULT 'pending',
	`referrerMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `referralRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `savedRoles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobSeekerId` int NOT NULL,
	`jobId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `savedRoles_id` PRIMARY KEY(`id`),
	CONSTRAINT `saved_roles_unique` UNIQUE(`jobSeekerId`,`jobId`)
);
--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_referralRequestId_referralRequests_id_fk` FOREIGN KEY (`referralRequestId`) REFERENCES `referralRequests`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_senderId_users_id_fk` FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_recipientId_users_id_fk` FOREIGN KEY (`recipientId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `profiles` ADD CONSTRAINT `profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `referralRequests` ADD CONSTRAINT `referralRequests_jobId_jobs_id_fk` FOREIGN KEY (`jobId`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `referralRequests` ADD CONSTRAINT `referralRequests_jobSeekerId_users_id_fk` FOREIGN KEY (`jobSeekerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `referralRequests` ADD CONSTRAINT `referralRequests_referrerId_users_id_fk` FOREIGN KEY (`referrerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `savedRoles` ADD CONSTRAINT `savedRoles_jobSeekerId_users_id_fk` FOREIGN KEY (`jobSeekerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `savedRoles` ADD CONSTRAINT `savedRoles_jobId_jobs_id_fk` FOREIGN KEY (`jobId`) REFERENCES `jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `jobs_company_idx` ON `jobs` (`company`);--> statement-breakpoint
CREATE INDEX `jobs_location_idx` ON `jobs` (`location`);--> statement-breakpoint
CREATE INDEX `messages_recipient_idx` ON `messages` (`recipientId`);--> statement-breakpoint
CREATE INDEX `messages_request_idx` ON `messages` (`referralRequestId`);--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`userId`);--> statement-breakpoint
CREATE INDEX `referral_requests_referrer_idx` ON `referralRequests` (`referrerId`);--> statement-breakpoint
CREATE INDEX `referral_requests_seeker_idx` ON `referralRequests` (`jobSeekerId`);--> statement-breakpoint
CREATE INDEX `referral_requests_status_idx` ON `referralRequests` (`status`);