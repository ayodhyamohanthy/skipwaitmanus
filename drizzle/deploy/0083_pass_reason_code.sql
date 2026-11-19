-- Queue task 15 (pass-reasons): store the kit reason code next to the existing legacy
-- enum. Additive nullable column; the legacy `reason` enum and all routing are unchanged.
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referralRequestPasses' AND COLUMN_NAME = 'reasonCode');
SET @ddl = IF(@c = 0, 'ALTER TABLE `referralRequestPasses` ADD COLUMN `reasonCode` VARCHAR(32) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
