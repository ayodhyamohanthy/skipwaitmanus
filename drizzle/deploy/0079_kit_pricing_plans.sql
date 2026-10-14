-- 0079: Kit v4 subscription plan enum values (Keep warm, Start, Momentum,
-- Land Focus/Sprint/Concierge). Additive enum expansion only; preserves
-- existing 'free', 'pro', and 'max' rows. Guarded by information_schema +
-- PREPARE so re-runs are safe no-ops. ENUM widening is applied here only
-- (never via schemaReconcile ADD COLUMN, which cannot widen an ENUM).
SET @col_lacks_kit = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenBalances' AND COLUMN_NAME = 'plan'
    AND COLUMN_TYPE NOT LIKE '%land_500%'
);
SET @ddl = IF(
  @col_lacks_kit > 0,
  'ALTER TABLE `tokenBalances` MODIFY COLUMN `plan` ENUM(''free'',''pro'',''max'',''keep_warm'',''start'',''momentum'',''land_100'',''land_200'',''land_500'') NOT NULL DEFAULT ''free''',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_lacks_kit = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptionCheckoutIntents' AND COLUMN_NAME = 'plan'
    AND COLUMN_TYPE NOT LIKE '%land_500%'
);
SET @ddl = IF(
  @col_lacks_kit > 0,
  'ALTER TABLE `subscriptionCheckoutIntents` MODIFY COLUMN `plan` ENUM(''pro'',''max'',''keep_warm'',''start'',''momentum'',''land_100'',''land_200'',''land_500'') NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_lacks_kit = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'giftSubscriptionFulfillments' AND COLUMN_NAME = 'plan'
    AND COLUMN_TYPE NOT LIKE '%land_500%'
);
SET @ddl = IF(
  @col_lacks_kit > 0,
  'ALTER TABLE `giftSubscriptionFulfillments` MODIFY COLUMN `plan` ENUM(''pro'',''max'',''keep_warm'',''start'',''momentum'',''land_100'',''land_200'',''land_500'') NULL',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

