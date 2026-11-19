-- Withdraw fix. referralRequests.status needs the 'withdrawn' value that
-- drizzle/0032 added, but drizzle/*.sql never runs in production (only this
-- folder does), so a withdraw UPDATE failed with a raw "Failed query".
-- Additive enum value only, guarded so re-runs and already-correct
-- databases are a no-op.
SET @status_has_withdrawn = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referralRequests' AND COLUMN_NAME = 'status' AND COLUMN_TYPE LIKE '%withdrawn%');
SET @ddl = IF(@status_has_withdrawn = 0, 'ALTER TABLE `referralRequests` MODIFY `status` ENUM(''pending'',''approved'',''declined'',''intro_made'',''interview'',''offer'',''closed'',''withdrawn'') NOT NULL DEFAULT ''pending''', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
