-- 0096: D-079 card validation for free credits (docs/DECISIONS.md D-079,
-- docs/plans/D-079-card-validation-free-credits.md). Additive only:
--   tokenBalances.cardValidatedAt   when the provider confirmed a card for the
--                                   wallet's owner; null means no validated card
--   users.chargebeeCustomerId       the Chargebee customer created for the
--                                   validation page, reused by later provider
--                                   flows; created on first use, never client-set
-- Nothing is backfilled and no existing write path changes: with
-- FREE_CREDITS_REQUIRE_CARD_VALIDATION unset (the default), grants behave
-- exactly as before. The reconcile guard in server/schemaReconcile.ts applies
-- the same two columns at boot if this file has not run yet.
-- Every statement is information_schema-guarded, so re-runs are no-ops; the
-- deploy pipeline applies the file once (scripts/apply-deploy-migrations.sh).

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenBalances' AND COLUMN_NAME = 'cardValidatedAt');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `tokenBalances` ADD COLUMN `cardValidatedAt` TIMESTAMP NULL AFTER `monthlyCycleKey`', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'chargebeeCustomerId');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `users` ADD COLUMN `chargebeeCustomerId` VARCHAR(80) NULL AFTER `suspended`', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
