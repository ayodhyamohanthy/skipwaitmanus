-- 0077: job function taxonomy (kit v4 thread and queue eyebrow: function, then company).
-- Additive only: two nullable columns on `jobs` and one index. No data is
-- written here. `jobFunction` holds a value from shared/jobFunctions.ts
-- JOB_FUNCTIONS (VARCHAR so the list can grow without an ALTER; every read
-- parses it). `jobFunctionSource` records how it was decided: seeker choice,
-- creation-time classifier, or the reviewed backfill script
-- (scripts/backfill-job-function.ts, dry-run by default, touches only rows
-- whose source is NULL). Existing rows stay NULL until that script runs.
-- Each statement is guarded by information_schema so re-runs are no-ops.
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs' AND COLUMN_NAME = 'jobFunction');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `jobs` ADD COLUMN `jobFunction` VARCHAR(32) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs' AND COLUMN_NAME = 'jobFunctionSource');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `jobs` ADD COLUMN `jobFunctionSource` ENUM(''seeker'',''inferred'',''backfill'') NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs' AND INDEX_NAME = 'jobs_company_function_idx');
SET @ddl = IF(@idx_exists = 0, 'CREATE INDEX `jobs_company_function_idx` ON `jobs` (`company`, `jobFunction`)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
