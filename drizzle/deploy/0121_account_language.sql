-- 0121: D-093.capture (packet docs/plans/D-093-language.md section 5.1).
-- Additive only: two nullable columns on accountPreferences.
--   language        the account's chosen visible language (null = follow device)
--   signupLanguage  the primary subtag seen at signup, written at most once
-- No existing row is rewritten and there is no backfill. While
-- LANGUAGE_CAPTURE_ENABLED is false nothing is collected, and a null in either
-- column means behaviour exactly as before.
-- Every statement is information_schema-guarded, so re-runs are no-ops; the
-- deploy pipeline applies the file once (scripts/apply-deploy-migrations.sh).
-- The boot reconcile in server/schemaReconcile.ts declares the same columns.

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accountPreferences' AND COLUMN_NAME = 'language');
SET @ddl = IF(@c = 0, 'ALTER TABLE `accountPreferences` ADD COLUMN `language` VARCHAR(16) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accountPreferences' AND COLUMN_NAME = 'signupLanguage');
SET @ddl = IF(@c = 0, 'ALTER TABLE `accountPreferences` ADD COLUMN `signupLanguage` VARCHAR(16) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
