CREATE TABLE `resumeUploadChunks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`chunkIndex` int NOT NULL,
	`storageKey` varchar(1024) NOT NULL,
	`byteSize` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resumeUploadChunks_id` PRIMARY KEY(`id`),
	CONSTRAINT `resume_upload_chunks_session_index_unique` UNIQUE(`sessionId`,`chunkIndex`)
);
--> statement-breakpoint
CREATE TABLE `resumeUploadSessions` (
	`id` varchar(64) NOT NULL,
	`ownerId` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`expectedSize` int NOT NULL,
	`receivedSize` int NOT NULL DEFAULT 0,
	`nextChunkIndex` int NOT NULL DEFAULT 0,
	`status` enum('active','completed','failed') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `resumeUploadSessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `resumeUploadChunks` ADD CONSTRAINT `resumeUploadChunks_sessionId_resumeUploadSessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `resumeUploadSessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resumeUploadSessions` ADD CONSTRAINT `resumeUploadSessions_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `resume_upload_chunks_session_idx` ON `resumeUploadChunks` (`sessionId`,`chunkIndex`);--> statement-breakpoint
CREATE INDEX `resume_upload_sessions_owner_status_idx` ON `resumeUploadSessions` (`ownerId`,`status`,`createdAt`);