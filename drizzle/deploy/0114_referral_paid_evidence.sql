-- 0114: D-194 - /share personal referral link unlocks on provider-verified
-- paid evidence (docs/DECISIONS.md D-194). Additive only:
--   tokenBalances.lastPaidAt   when the provider (Chargebee) first reported a
--                              successful nonzero payment for this wallet's
--                              subscription; null means no settled payment is
--                              recorded. Written only from the verified
--                              payment_succeeded webhook tied to the wallet's
--                              subscriptionId - never from activation alone.
-- Nothing is backfilled and no existing write path changes: with the column
-- null everywhere, /share eligibility behaves as before this branch (the
-- gate reads only credited fulfillments until a payment event stamps it).
-- The reconcile guard in server/schemaReconcile.ts applies the same column
-- at boot if this file has not run yet.
-- Every statement is information_schema-guarded, so re-runs are no-ops; the
-- deploy pipeline applies the file once (scripts/apply-deploy-migrations.sh).

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenBalances' AND COLUMN_NAME = 'lastPaidAt');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `tokenBalances` ADD COLUMN `lastPaidAt` TIMESTAMP NULL AFTER `cardValidatedAt`', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
