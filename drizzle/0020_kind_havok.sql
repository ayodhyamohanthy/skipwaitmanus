ALTER TABLE `resumeUploadSessions` ADD COLUMN `attachmentId` int;
--> statement-breakpoint
ALTER TABLE `resumeUploadSessions` ADD CONSTRAINT `resumeUploadSessions_attachmentId_referralAttachments_id_fk` FOREIGN KEY (`attachmentId`) REFERENCES `referralAttachments`(`id`) ON DELETE set null ON UPDATE no action;
