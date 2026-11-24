-- 0126: SKIPPY-7 (D-201 (4), D-141, D-290). Additive storage only:
--   seekerAgentGrants.autoSend    opt-in auto-send for this grant, default false
--   assistantApprovals.decidedBy  'seeker' | 'agent_auto' (NULL for existing rows)
-- No existing row is rewritten and there is no backfill. Every statement is
-- information_schema-guarded, so re-runs are no-ops; the deploy pipeline applies
-- the file once (scripts/apply-deploy-migrations.sh). The boot reconcile in
-- server/schemaReconcile.ts declares the same columns.

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seekerAgentGrants' AND COLUMN_NAME = 'autoSend');
SET @ddl = IF(@c = 0, 'ALTER TABLE `seekerAgentGrants` ADD COLUMN `autoSend` boolean NOT NULL DEFAULT FALSE', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assistantApprovals' AND COLUMN_NAME = 'decidedBy');
SET @ddl = IF(@c = 0, 'ALTER TABLE `assistantApprovals` ADD COLUMN `decidedBy` varchar(16) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
