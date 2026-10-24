-- 0113: v2 plan-family subscriptions (D-132) land on the wallet as
-- fast_track / insider. Idempotent: skip when the enum already carries them.
SET @wallet_has_v2 = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenBalances' AND COLUMN_NAME = 'plan' AND COLUMN_TYPE LIKE '%fast_track%');
SET @ddl = IF(@wallet_has_v2 = 0, 'ALTER TABLE `tokenBalances` MODIFY `plan` ENUM(''free'',''pro'',''max'',''start'',''momentum'',''land_100'',''land_200'',''land_500'',''keep_warm'',''land_focus'',''land_sprint'',''land_concierge'',''fast_track'',''insider'') NOT NULL DEFAULT ''free''', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
