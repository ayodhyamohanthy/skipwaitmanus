-- 0096: queue row 20 slice B, seeker company demand (docs/KIT_V4_BUILD_PLAN.md
-- section 3b row 20, docs/KIT_V4_AUDIT.md 15_invite__default). Additive only:
--   companySuggestions.jobFunction  the optional work function on a demand vote
-- Same shape as jobs.jobFunction (0077): a VARCHAR holding a JOB_FUNCTIONS value
-- from shared/jobFunctions.ts, read back through parseJobFunction, NULL meaning
-- the seeker chose nothing. No existing row is rewritten; historic suggestions
-- simply carry no function.
-- Every statement is information_schema-guarded, so re-runs are no-ops; the
-- deploy pipeline applies the file once (scripts/apply-deploy-migrations.sh).

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companySuggestions' AND COLUMN_NAME = 'jobFunction');
SET @ddl = IF(@c = 0, 'ALTER TABLE `companySuggestions` ADD COLUMN `jobFunction` VARCHAR(32) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
