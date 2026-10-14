-- D-012 (2): a referrer's decline returns the reserved credit, as the Terms
-- and Refund Policy promise. tokenTransactions.kind needs the
-- 'decline_refund' value so the ledger names that cause (withdraw and expiry
-- refunds already have their own kinds). drizzle/*.sql never runs in
-- production (only this folder does). Additive enum value only, guarded so
-- re-runs and already-correct databases are a no-op.
SET @kind_has_decline_refund = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenTransactions' AND COLUMN_NAME = 'kind' AND COLUMN_TYPE LIKE '%decline_refund%');
SET @ddl = IF(@kind_has_decline_refund = 0, 'ALTER TABLE `tokenTransactions` MODIFY `kind` ENUM(''purchase'',''direct_request'',''admin_adjustment'',''company_coverage_reward'',''personal_referral_reward'',''invite_reward_pending'',''invite_reward_granted'',''withdrawal_refund'',''promo_grant'',''promo_spend'',''expiry_refund'',''decline_refund'') NOT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
