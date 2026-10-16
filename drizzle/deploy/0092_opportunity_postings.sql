-- 0092: D-022 referrer-posted roles (docs/KIT_V4_BUILD_PLAN.md section 3c,
-- docs/DECISIONS.md D-022). Additive only:
--   companyOpportunities.expiresAt            the 30-day post window (backfilled from createdAt)
--   companyOpportunities.showPosterFirstName  the poster's chosen public face (default off)
--   referralRequests.opportunityId            the post an ask was written from
--   referralRequests.firstLookReferrerId      the poster's 48-hour first look
--   referralRequests.firstLookUntil
-- Existing posts get createdAt + 30 days and the column is then held NOT NULL.
-- Every statement is information_schema-guarded, so re-runs are no-ops; the
-- deploy pipeline applies the file once (scripts/apply-deploy-migrations.sh).

-- companyOpportunities.expiresAt: add (nullable for the backfill), fill, enforce.
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companyOpportunities' AND COLUMN_NAME = 'expiresAt');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `companyOpportunities` ADD COLUMN `expiresAt` TIMESTAMP NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `companyOpportunities` SET `expiresAt` = DATE_ADD(`createdAt`, INTERVAL 30 DAY) WHERE `expiresAt` IS NULL;

SET @col_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companyOpportunities' AND COLUMN_NAME = 'expiresAt' AND IS_NULLABLE = 'YES');
SET @ddl = IF(@col_nullable = 1, 'ALTER TABLE `companyOpportunities` MODIFY `expiresAt` TIMESTAMP NOT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- companyOpportunities.showPosterFirstName: false unless the poster opts in.
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companyOpportunities' AND COLUMN_NAME = 'showPosterFirstName');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `companyOpportunities` ADD COLUMN `showPosterFirstName` BOOLEAN NOT NULL DEFAULT false', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- referralRequests: the post link and the poster's first look (one atomic ALTER).
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referralRequests' AND COLUMN_NAME = 'opportunityId');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `referralRequests` ADD COLUMN `opportunityId` INT NULL, ADD COLUMN `firstLookReferrerId` INT NULL, ADD COLUMN `firstLookUntil` TIMESTAMP NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Deleting a post or a person never pins ask history: the link nulls instead.
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'referralRequests' AND CONSTRAINT_NAME = 'referral_requests_opportunity_fk');
SET @ddl = IF(@fk_exists = 0, 'ALTER TABLE `referralRequests` ADD CONSTRAINT `referral_requests_opportunity_fk` FOREIGN KEY (`opportunityId`) REFERENCES `companyOpportunities` (`id`) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'referralRequests' AND CONSTRAINT_NAME = 'referral_requests_first_look_referrer_fk');
SET @ddl = IF(@fk_exists = 0, 'ALTER TABLE `referralRequests` ADD CONSTRAINT `referral_requests_first_look_referrer_fk` FOREIGN KEY (`firstLookReferrerId`) REFERENCES `users` (`id`) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- The first-look-release sweep scans by this clock.
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referralRequests' AND INDEX_NAME = 'referral_requests_first_look_idx');
SET @ddl = IF(@idx_exists = 0, 'CREATE INDEX `referral_requests_first_look_idx` ON `referralRequests` (`firstLookUntil`)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
