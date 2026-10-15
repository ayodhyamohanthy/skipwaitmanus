-- 0091: the Oct 14 2026 pricing model (docs/PRICING_RECOMMENDATION.md,
-- shared/planCatalog.ts, shared/billingCatalog.ts, shared/creditLedger.ts).
-- Additive only: ENUM widenings that append values (existing values first, in
-- order, so no stored index moves) and two nullable columns. No data is written
-- or moved: existing Pro/Max wallets, intents, invoices and ledger rows keep
-- their values. land_100/land_200/land_500 from 0090 stay as reserved members
-- (never written); the Land levels are land_focus/land_sprint/land_concierge.
-- Each statement is guarded by information_schema so re-runs are no-ops.

-- Plans on the wallet: Keep warm and the renamed Land levels.
SET @plan_has_model = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenBalances' AND COLUMN_NAME = 'plan' AND COLUMN_TYPE LIKE '%land_concierge%');
SET @ddl = IF(@plan_has_model = 0, 'ALTER TABLE `tokenBalances` MODIFY `plan` ENUM(''free'',''pro'',''max'',''start'',''momentum'',''land_100'',''land_200'',''land_500'',''keep_warm'',''land_focus'',''land_sprint'',''land_concierge'') NOT NULL DEFAULT ''free''', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Billing periods on the wallet: 30- and 90-day passes beside legacy monthly and yearly.
SET @period_has_pass = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenBalances' AND COLUMN_NAME = 'subscriptionBillingPeriod' AND COLUMN_TYPE LIKE '%90d%');
SET @ddl = IF(@period_has_pass = 0, 'ALTER TABLE `tokenBalances` MODIFY `subscriptionBillingPeriod` ENUM(''monthly'',''yearly'',''30d'',''90d'') NULL, MODIFY `pendingBillingPeriod` ENUM(''monthly'',''yearly'',''30d'',''90d'') NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- The one-time reverse trial window, written once from the JS clock.
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenBalances' AND COLUMN_NAME = 'trialStartedAt');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `tokenBalances` ADD COLUMN `trialStartedAt` TIMESTAMP NULL, ADD COLUMN `trialEndsAt` TIMESTAMP NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Checkout intents: the same plans and periods.
SET @intent_has_model = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptionCheckoutIntents' AND COLUMN_NAME = 'plan' AND COLUMN_TYPE LIKE '%land_concierge%');
SET @ddl = IF(@intent_has_model = 0, 'ALTER TABLE `subscriptionCheckoutIntents` MODIFY `plan` ENUM(''pro'',''max'',''start'',''momentum'',''land_100'',''land_200'',''land_500'',''keep_warm'',''land_focus'',''land_sprint'',''land_concierge'') NOT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @intent_period_has_pass = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptionCheckoutIntents' AND COLUMN_NAME = 'billingPeriod' AND COLUMN_TYPE LIKE '%90d%');
SET @ddl = IF(@intent_period_has_pass = 0, 'ALTER TABLE `subscriptionCheckoutIntents` MODIFY `billingPeriod` ENUM(''monthly'',''yearly'',''30d'',''90d'') NOT NULL DEFAULT ''monthly''', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Receipts: a pass invoice records its period.
SET @invoice_period_has_pass = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billingInvoices' AND COLUMN_NAME = 'billingPeriod' AND COLUMN_TYPE LIKE '%90d%');
SET @ddl = IF(@invoice_period_has_pass = 0, 'ALTER TABLE `billingInvoices` MODIFY `billingPeriod` ENUM(''monthly'',''yearly'',''30d'',''90d'') NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Ledger: the reverse trial's credit grant and its ledger kind.
SET @source_has_trial = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'planCreditGrants' AND COLUMN_NAME = 'source' AND COLUMN_TYPE LIKE '%trial%');
SET @ddl = IF(@source_has_trial = 0, 'ALTER TABLE `planCreditGrants` MODIFY `source` ENUM(''carryover'',''welcome'',''trial'') NOT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @kind_has_trial = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenTransactions' AND COLUMN_NAME = 'kind' AND COLUMN_TYPE LIKE '%trial_grant%');
SET @ddl = IF(@kind_has_trial = 0, 'ALTER TABLE `tokenTransactions` MODIFY `kind` ENUM(''purchase'',''direct_request'',''admin_adjustment'',''company_coverage_reward'',''personal_referral_reward'',''invite_reward_pending'',''invite_reward_granted'',''withdrawal_refund'',''promo_grant'',''promo_spend'',''expiry_refund'',''plan_grant'',''plan_credit_carryover'',''plan_credit_expiry'',''welcome_grant'',''credit_spend'',''trial_grant'') NOT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
