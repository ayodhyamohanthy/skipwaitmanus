ALTER TABLE `notifications` ADD `eventKey` varchar(120);--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_event_key_unique` ON `notifications` (`eventKey`);
