-- 0095: D-034/D-047/D-061 coverage delivery (docs/KIT_V4_BUILD_PLAN.md row
-- D-034-money-tier, docs/DECISIONS.md D-034/D-047/D-061/D-062). Additive only:
--   referralRequests.coverageVisibleAt  when an available referrer could first
--                                       see the ask; starts the 7-day clock
--   referralRequests.coverageHeldAt     when coverage opened but the seeker had
--                                       no credit, so the ask is held until
--                                       the hourly coverage-delivery sweep can
--                                       deliver it (server/coverageDelivery.ts)
-- Both are nullable, and every read treats a null coverageVisibleAt as "visible
-- since createdAt", so pre-0095 rows keep their exact current lifecycle: an
-- unclaimed ask still expires 7 days after creation. Nothing is backfilled and
-- no existing write path changes; the reconcile guard in server/schemaReconcile.ts
-- applies the same two columns at boot if this file has not run yet.
-- Every statement is information_schema-guarded, so re-runs are no-ops; the
-- deploy pipeline applies the file once (scripts/apply-deploy-migrations.sh).

-- referralRequests: the two clocks (one atomic ALTER).
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referralRequests' AND COLUMN_NAME = 'coverageVisibleAt');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `referralRequests` ADD COLUMN `coverageVisibleAt` TIMESTAMP NULL, ADD COLUMN `coverageHeldAt` TIMESTAMP NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- The coverage-delivery sweep scans held asks by this clock.
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referralRequests' AND INDEX_NAME = 'referral_requests_coverage_held_idx');
SET @ddl = IF(@idx_exists = 0, 'CREATE INDEX `referral_requests_coverage_held_idx` ON `referralRequests` (`coverageHeldAt`)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
