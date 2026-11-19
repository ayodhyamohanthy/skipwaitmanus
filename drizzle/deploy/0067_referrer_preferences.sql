-- Referrer preferences (kit: /referrer-setup, pause, capacity, visibility).
-- Additive columns only. The deploy pipeline applies this file
-- (see server/schemaDeployGuard.test.ts). Guarded for safe re-runs.
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'preferAreas');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `profiles` ADD COLUMN `preferAreas` TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'referrerVisibility');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `profiles` ADD COLUMN `referrerVisibility` ENUM(''anon'',''named'') NOT NULL DEFAULT ''anon''', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'notifyNewAsk');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `profiles` ADD COLUMN `notifyNewAsk` boolean NOT NULL DEFAULT true', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'notifyDigest');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `profiles` ADD COLUMN `notifyDigest` boolean NOT NULL DEFAULT false', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'paused');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `profiles` ADD COLUMN `paused` boolean NOT NULL DEFAULT false', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
