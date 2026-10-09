-- Seeker open-to roles (kit: /p/:handle Open to chips, /profile field).
-- Additive column only, JSON list like preferAreas. The deploy pipeline
-- applies this file (see server/schemaDeployGuard.test.ts). Guarded for
-- safe re-runs.
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'openTo');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `profiles` ADD COLUMN `openTo` TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
