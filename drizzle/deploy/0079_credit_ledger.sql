-- 0079: kit credit ledger (PRICING.md credits, shared/creditLedger.ts).
-- Additive only: one new table, five new tokenTransactions.kind values, one
-- nullable column and two indexes on tokenTransactions. No data is written or
-- moved here: existing balances stay where they are (tokenBalances.balance for
-- purchased credits, monthlyCreditsRemaining for the current cycle) and the
-- application carries or expires each wallet's cycle leftover at its next cycle
-- boundary, on the JS clock (invariant 5), with a ledger row for every move.
-- Each statement is guarded by information_schema so re-runs are no-ops.

-- Carried-over plan credits and the one-time welcome credits. grantKey is the
-- idempotency claim (one carryover per subscription cycle, one welcome per
-- canonical person). expiresAt NULL: while subscribed (carryover) or never
-- (welcome). The app writes grantedAt/expiresAt/closedAt from the JS clock.
CREATE TABLE IF NOT EXISTS `planCreditGrants` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `role` enum('job_seeker','referrer') NOT NULL DEFAULT 'job_seeker',
  `source` enum('carryover','welcome') NOT NULL,
  `grantKey` varchar(64) NOT NULL,
  `planId` varchar(32) NULL,
  `subscriptionId` varchar(80) NULL,
  `cycleKey` varchar(16) NULL,
  `tokenCount` int NOT NULL,
  `creditsRemaining` int NOT NULL,
  `status` enum('active','exhausted','expired','revoked') NOT NULL DEFAULT 'active',
  `grantedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expiresAt` timestamp NULL,
  `closedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `planCreditGrants_id` PRIMARY KEY(`id`),
  UNIQUE INDEX `plan_credit_grants_grant_key_unique`(`grantKey`),
  INDEX `plan_credit_grants_user_status_idx`(`userId`,`role`,`status`),
  INDEX `plan_credit_grants_status_expiry_idx`(`status`,`expiresAt`),
  CONSTRAINT `plan_credit_grants_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

-- Ledger kinds: cycle grants, carryover moves, plan-credit expiry, welcome
-- grants and generic credit spends. Existing values keep their order.
SET @kind_has_ledger = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenTransactions' AND COLUMN_NAME = 'kind' AND COLUMN_TYPE LIKE '%credit_spend%');
SET @ddl = IF(@kind_has_ledger = 0, 'ALTER TABLE `tokenTransactions` MODIFY `kind` ENUM(''purchase'',''direct_request'',''admin_adjustment'',''company_coverage_reward'',''personal_referral_reward'',''invite_reward_pending'',''invite_reward_granted'',''withdrawal_refund'',''promo_grant'',''promo_spend'',''expiry_refund'',''plan_grant'',''plan_credit_carryover'',''plan_credit_expiry'',''welcome_grant'',''credit_spend'') NOT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenTransactions' AND COLUMN_NAME = 'creditGrantId');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `tokenTransactions` ADD COLUMN `creditGrantId` INT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenTransactions' AND INDEX_NAME = 'token_transactions_credit_grant_idx');
SET @ddl = IF(@idx_exists = 0, 'CREATE INDEX `token_transactions_credit_grant_idx` ON `tokenTransactions` (`creditGrantId`)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenTransactions' AND INDEX_NAME = 'token_transactions_cycle_idx');
SET @ddl = IF(@idx_exists = 0, 'CREATE INDEX `token_transactions_cycle_idx` ON `tokenTransactions` (`userId`, `role`, `sourceCycleKey`)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
