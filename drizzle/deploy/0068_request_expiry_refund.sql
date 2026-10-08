-- Request expiry refunds (kit: expiring-soon cards, auto-returned credits).
-- Additive enum value only: expired unclaimed asks refund exactly like a
-- withdraw, but the ledger names the system cause. The deploy pipeline
-- applies this file (see server/schemaDeployGuard.test.ts). Guarded for
-- safe re-runs.
SET @kind_has_expiry = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenTransactions' AND COLUMN_TYPE LIKE '%expiry_refund%');
SET @ddl = IF(@kind_has_expiry = 0, 'ALTER TABLE `tokenTransactions` MODIFY `kind` ENUM(''purchase'',''direct_request'',''admin_adjustment'',''company_coverage_reward'',''personal_referral_reward'',''invite_reward_pending'',''invite_reward_granted'',''withdrawal_refund'',''promo_grant'',''promo_spend'',''expiry_refund'') NOT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
