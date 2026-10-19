-- 0096: free monthly credits require a payment method on file. Additive only:
--   tokenBalances.paymentMethodOnFileAt  when the provider last confirmed the
--                                        member has a usable saved payment
--                                        source (server/billingAccount.ts);
--                                        null means none is on file.
--
-- Read semantics, so pre-0096 rows keep working: a Free seeker month is granted
-- only while this column is set (server/creditCycles.ts openCycleTx). Every
-- existing wallet therefore starts at null, which is the "add a payment method"
-- state the /billing screen prompts for. Nothing is backfilled, because whether
-- a member has a card is a provider fact we must read from Chargebee, not guess
-- from their credit history: a member who only ever spent free credits has no
-- source saved.
--
-- The reconcile guard in server/schemaReconcile.ts applies the same column at
-- boot if this file has not run yet. The statement is information_schema-guarded,
-- so re-runs are no-ops; the deploy pipeline applies the file once
-- (scripts/apply-deploy-migrations.sh).

-- tokenBalances: the eligibility clock.
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenBalances' AND COLUMN_NAME = 'paymentMethodOnFileAt');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `tokenBalances` ADD COLUMN `paymentMethodOnFileAt` TIMESTAMP NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
