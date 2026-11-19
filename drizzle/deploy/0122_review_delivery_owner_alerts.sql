-- 0122: REL-review-email-retry owner-alert outbox on the existing delivery row.
-- Additive only, no historical alert backfill. The fifth failed/unknown completion
-- creates its obligation atomically after this migration is verified.

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referralReviewDeliveries' AND COLUMN_NAME = 'ownerAlertStatus');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `referralReviewDeliveries` ADD COLUMN `ownerAlertStatus` ENUM(''pending'',''leased'',''sent'') NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referralReviewDeliveries' AND COLUMN_NAME = 'ownerAlertLeaseOwner');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `referralReviewDeliveries` ADD COLUMN `ownerAlertLeaseOwner` VARCHAR(64) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referralReviewDeliveries' AND COLUMN_NAME = 'ownerAlertLeaseExpiresAt');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `referralReviewDeliveries` ADD COLUMN `ownerAlertLeaseExpiresAt` TIMESTAMP NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referralReviewDeliveries' AND COLUMN_NAME = 'ownerAlertSentAt');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `referralReviewDeliveries` ADD COLUMN `ownerAlertSentAt` TIMESTAMP NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referralReviewDeliveries' AND INDEX_NAME = 'referral_review_owner_alert_idx');
SET @ddl = IF(@idx_exists = 0, 'CREATE INDEX `referral_review_owner_alert_idx` ON `referralReviewDeliveries` (`ownerAlertStatus`, `ownerAlertLeaseExpiresAt`, `id`)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
