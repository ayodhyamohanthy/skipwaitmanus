-- 0101: widen profiles.accountType to include 'employer' where a database lacks it
-- (the widening only lived in legacy drizzle/0037). Additive, existing values unchanged.
-- The information_schema guard makes re-runs no-ops.

SET @needs_widen = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'accountType' AND COLUMN_TYPE NOT LIKE '%''employer''%');
SET @ddl = IF(@needs_widen > 0, 'ALTER TABLE `profiles` MODIFY COLUMN `accountType` ENUM(''job_seeker'',''referrer'',''employer'') NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
