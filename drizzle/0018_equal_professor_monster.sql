ALTER TABLE `privacyRequests` ADD `activeKey` varchar(80);--> statement-breakpoint
ALTER TABLE `privacyRequests` ADD `activeKey` varchar(80);--> statement-breakpoint
ALTER TABLE `privacyRequests` ADD CONSTRAINT `privacy_request_active_key_unique` UNIQUE(`activeKey`);
