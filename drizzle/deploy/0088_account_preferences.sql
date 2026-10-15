-- Queue task 25: per-account display preferences (time zone, date format). Additive only: one new table.
-- NULL columns mean "use this device", so behaviour is unchanged until a person chooses.
CREATE TABLE IF NOT EXISTS `accountPreferences` (
 `id` int AUTO_INCREMENT,
 `userId` int NOT NULL,
 `timeZone` varchar(64) NULL,
 `dateFormat` varchar(8) NULL,
 `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT `accountPreferences_id` PRIMARY KEY(`id`),
 CONSTRAINT `account_preferences_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 UNIQUE INDEX `account_preferences_user_unique`(`userId`)
);
