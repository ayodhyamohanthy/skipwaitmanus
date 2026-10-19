-- 0096: D-038/D-066 referral timers (docs/KIT_V4_BUILD_PLAN.md row
-- D-038-referral-timers, docs/DECISIONS.md D-038/D-066). Additive only:
--   referralRequests.claimedAt            the claim's 48-hour decision clock (null until claimed)
--   referralRequests.acceptedAt           the acceptance's 5-day "Referred" clock (null on
--                                         rows accepted before this migration, so a historic
--                                         acceptance is never stranded by the new timer)
--   referralRequests.referredAt           when the referrer (or the seeker's own confirmation)
--                                         recorded the referral; D-066(3) counts only these
--   referralRequests.referralExtendedAt   the one optional 3-day extension
--   referralRequests.referralConfirmedAt  the seeker's "I got the referral email" confirmation
--   referralRequests.status                adds "referred" between "approved" and "intro_made"
--   tokenTransactions.kind                 adds "referral_release_refund" for the credit returned
--                                         when an accepted referrer steps back or misses the
--                                         deadline (reversal-unique, so it can never return twice)
-- The only backfill marks rows already at intro_made/interview/offer as referred (they were
-- made under the old model, where "mark as referred" moved the status to intro_made); closed
-- rows without that evidence stay unreferred, which is D-066(3)'s honest count. No existing
-- status or credit changes. Every statement is information_schema-guarded, so re-runs are
-- no-ops; the deploy pipeline applies the file once (scripts/apply-deploy-migrations.sh).

-- referralRequests.status: widen the ENUM in place, preserving value order and existing rows.
SET @status_has_referred = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referralRequests' AND COLUMN_NAME = 'status' AND COLUMN_TYPE LIKE '%''referred''%');
SET @ddl = IF(@status_has_referred = 0, 'ALTER TABLE `referralRequests` MODIFY `status` ENUM(''pending'',''approved'',''referred'',''declined'',''intro_made'',''interview'',''offer'',''closed'',''withdrawn'') NOT NULL DEFAULT ''pending''', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- The five D-038 clocks (one atomic ALTER; all nullable, no default).
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referralRequests' AND COLUMN_NAME = 'claimedAt');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `referralRequests` ADD COLUMN `claimedAt` TIMESTAMP NULL, ADD COLUMN `acceptedAt` TIMESTAMP NULL, ADD COLUMN `referredAt` TIMESTAMP NULL, ADD COLUMN `referralExtendedAt` TIMESTAMP NULL, ADD COLUMN `referralConfirmedAt` TIMESTAMP NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Claim and referral timer sweeps scan by these two clocks.
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referralRequests' AND INDEX_NAME = 'referral_requests_claim_timer_idx');
SET @ddl = IF(@idx_exists = 0, 'CREATE INDEX `referral_requests_claim_timer_idx` ON `referralRequests` (`status`, `claimedAt`)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referralRequests' AND INDEX_NAME = 'referral_requests_referral_timer_idx');
SET @ddl = IF(@idx_exists = 0, 'CREATE INDEX `referral_requests_referral_timer_idx` ON `referralRequests` (`status`, `acceptedAt`)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Rows already past acceptance under the old model were referred by definition.
UPDATE `referralRequests` SET `referredAt` = `updatedAt` WHERE `referredAt` IS NULL AND `status` IN ('intro_made', 'interview', 'offer');

-- tokenTransactions.kind: append the D-038 release kind, preserving every existing value.
SET @kind_has_release = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenTransactions' AND COLUMN_NAME = 'kind' AND COLUMN_TYPE LIKE '%''referral_release_refund''%');
SET @ddl = IF(@kind_has_release = 0, 'ALTER TABLE `tokenTransactions` MODIFY `kind` ENUM(''purchase'',''direct_request'',''admin_adjustment'',''company_coverage_reward'',''personal_referral_reward'',''invite_reward_pending'',''invite_reward_granted'',''withdrawal_refund'',''promo_grant'',''promo_spend'',''expiry_refund'',''plan_grant'',''plan_credit_carryover'',''plan_credit_expiry'',''welcome_grant'',''credit_spend'',''trial_grant'',''referral_release_refund'') NOT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
