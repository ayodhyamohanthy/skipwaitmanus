CREATE TABLE `workEmailOtpCodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`codeHash` varchar(64) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`expiresAt` timestamp NOT NULL,
	`consumedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workEmailOtpCodes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `work_email_otp_email_hash_idx` ON `workEmailOtpCodes` (`email`,`codeHash`);
