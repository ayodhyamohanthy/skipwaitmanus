ALTER TABLE `resumeUploadSessions` ADD COLUMN `clientUploadId` varchar(64);
--> statement-breakpoint
CREATE UNIQUE INDEX `resume_upload_sessions_owner_client_unique` ON `resumeUploadSessions` (`ownerId`,`clientUploadId`);
