ALTER TABLE `referralAttachments` ADD COLUMN `uploadSessionId` varchar(64);
--> statement-breakpoint
CREATE UNIQUE INDEX `referral_attachments_upload_session_unique` ON `referralAttachments` (`uploadSessionId`);
--> statement-breakpoint
ALTER TABLE `resumeUploadSessions` MODIFY COLUMN `status` enum('active','finalizing','completed','failed') NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE `resumeUploadSessions` ADD COLUMN `finalizationOwner` varchar(64);
--> statement-breakpoint
ALTER TABLE `resumeUploadSessions` ADD COLUMN `finalizationLeaseUntil` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `resumeUploadSessions` ADD COLUMN `permanentStorageKey` varchar(1024);
