-- Seeker setup answers move from this device's localStorage to the account
-- (queue task 8: seeker-search-profile + profile-resume). Additive columns
-- only, each guarded so re-runs and already-correct databases are a no-op.
-- Roles reuse profiles.openTo. defaultResumeAttachmentId points at the
-- caller's own referralAttachments row (ownership is checked in code).
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'experienceLevel');
SET @ddl = IF(@c = 0, 'ALTER TABLE `profiles` ADD COLUMN `experienceLevel` VARCHAR(40) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'seekerGoal');
SET @ddl = IF(@c = 0, 'ALTER TABLE `profiles` ADD COLUMN `seekerGoal` VARCHAR(60) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'searchCity');
SET @ddl = IF(@c = 0, 'ALTER TABLE `profiles` ADD COLUMN `searchCity` VARCHAR(120) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'searchCountries');
SET @ddl = IF(@c = 0, 'ALTER TABLE `profiles` ADD COLUMN `searchCountries` VARCHAR(240) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'searchRemote');
SET @ddl = IF(@c = 0, 'ALTER TABLE `profiles` ADD COLUMN `searchRemote` BOOLEAN NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'workAuthorization');
SET @ddl = IF(@c = 0, 'ALTER TABLE `profiles` ADD COLUMN `workAuthorization` VARCHAR(80) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'workLinkKinds');
SET @ddl = IF(@c = 0, 'ALTER TABLE `profiles` ADD COLUMN `workLinkKinds` TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'defaultResumeAttachmentId');
SET @ddl = IF(@c = 0, 'ALTER TABLE `profiles` ADD COLUMN `defaultResumeAttachmentId` INT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
