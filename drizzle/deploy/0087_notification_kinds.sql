-- Queue task 21 part A: event-aware in-app notifications. Additive only: two nullable columns.
-- Old rows stay NULL and render by category exactly as before. No sends, no copy change.
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'kind');
SET @ddl = IF(@c = 0, 'ALTER TABLE `notifications` ADD COLUMN `kind` VARCHAR(32) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'refId');
SET @ddl = IF(@c = 0, 'ALTER TABLE `notifications` ADD COLUMN `refId` INT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
