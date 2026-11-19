-- Queue task 16 (mark-referred-reference): an optional portal reference ID the
-- referrer records when marking a request as referred. Additive nullable column
-- on the append-only transition log; no data rewritten, no money path.
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referralTransitionEvents' AND COLUMN_NAME = 'referenceId');
SET @ddl = IF(@c = 0, 'ALTER TABLE `referralTransitionEvents` ADD COLUMN `referenceId` VARCHAR(64) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
