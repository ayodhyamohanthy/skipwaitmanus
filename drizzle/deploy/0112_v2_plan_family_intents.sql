-- 0112: v2 plan-family checkouts (D-132) record their intent plan as
-- fast_track / insider. Idempotent: skip when the enum already carries them.
SET @intent_has_v2 = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptionCheckoutIntents' AND COLUMN_NAME = 'plan' AND COLUMN_TYPE LIKE '%fast_track%');
SET @ddl = IF(@intent_has_v2 = 0, 'ALTER TABLE `subscriptionCheckoutIntents` MODIFY `plan` ENUM(''pro'',''max'',''start'',''momentum'',''land_100'',''land_200'',''land_500'',''keep_warm'',''land_focus'',''land_sprint'',''land_concierge'',''fast_track'',''insider'') NOT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
