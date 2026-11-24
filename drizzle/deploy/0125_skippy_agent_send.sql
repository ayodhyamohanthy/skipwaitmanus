-- 0125: SKIPPY-6 (D-290 (1), D-142). Additive storage only: no send, no spend, no grant.
--   seekerAgentGrants.canSend   off by default; only lets an agent *request* a send
--   assistantApprovals.grantId  set when a seeker's own agent requested the send
--   askOrigins                  how an ask was started (agent / skippy), for the referrer label
-- No existing row is rewritten and there is no backfill: a null grantId and a
-- missing askOrigins row mean exactly today's behaviour. Every statement is
-- information_schema-guarded, so re-runs are no-ops; the deploy pipeline applies
-- the file once (scripts/apply-deploy-migrations.sh). The boot reconcile in
-- server/schemaReconcile.ts declares the same table, columns, index and key.

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seekerAgentGrants' AND COLUMN_NAME = 'canSend');
SET @ddl = IF(@c = 0, 'ALTER TABLE `seekerAgentGrants` ADD COLUMN `canSend` boolean NOT NULL DEFAULT FALSE', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assistantApprovals' AND COLUMN_NAME = 'grantId');
SET @ddl = IF(@c = 0, 'ALTER TABLE `assistantApprovals` ADD COLUMN `grantId` int NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assistantApprovals' AND INDEX_NAME = 'assistant_approvals_grant_idx');
SET @ddl = IF(@c = 0, 'ALTER TABLE `assistantApprovals` ADD INDEX `assistant_approvals_grant_idx` (`grantId`,`createdAt`)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assistantApprovals' AND CONSTRAINT_NAME = 'assistant_approvals_grant_fk');
SET @ddl = IF(@c = 0, 'ALTER TABLE `assistantApprovals` ADD CONSTRAINT `assistant_approvals_grant_fk` FOREIGN KEY (`grantId`) REFERENCES `seekerAgentGrants` (`id`) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `askOrigins` (
  `referralRequestId` int NOT NULL,
  `channel` enum('skippy','agent') NOT NULL,
  `agentGrantId` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `askOrigins_referralRequestId` PRIMARY KEY (`referralRequestId`),
  CONSTRAINT `ask_origins_request_fk` FOREIGN KEY (`referralRequestId`) REFERENCES `referralRequests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ask_origins_grant_fk` FOREIGN KEY (`agentGrantId`) REFERENCES `seekerAgentGrants` (`id`) ON DELETE SET NULL,
  INDEX `ask_origins_channel_idx` (`channel`,`createdAt`)
) ENGINE=InnoDB;
