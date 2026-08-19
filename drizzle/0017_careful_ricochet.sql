ALTER TABLE `privacyRequests` DROP INDEX `privacy_request_user_kind_active_unique`;--> statement-breakpoint
DROP INDEX `privacy_request_user_kind_active_unique` ON `privacyRequests`;--> statement-breakpoint
CREATE INDEX `privacy_request_user_kind_status_idx` ON `privacyRequests` (`userId`,`kind`,`status`);
