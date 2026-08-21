ALTER TABLE `referrerFastTrackLinks` ADD `vanityAlias` varchar(30);--> statement-breakpoint
ALTER TABLE `referrerFastTrackLinks` ADD CONSTRAINT `referrer_fast_track_alias_unique` UNIQUE(`vanityAlias`);--> statement-breakpoint
CREATE INDEX `referrer_fast_track_alias_public_idx` ON `referrerFastTrackLinks` (`vanityAlias`,`isActive`);