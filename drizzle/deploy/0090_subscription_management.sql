-- 0090: kit subscriptions and subscription management (PRICING.md plans,
-- shared/billingCatalog.ts, shared/subscriptionState.ts, shared/billingAccount.ts).
-- Additive only: two plan ENUM widenings (existing values first, in order),
-- nullable columns on tokenBalances and subscriptionCheckoutIntents, and three
-- new tables. No data is written or moved: existing Pro/Max wallets and intents
-- keep their values, and the new columns stay NULL (or their default) until a
-- provider response or webhook snapshot fills them. Each statement is guarded
-- by information_schema so re-runs are no-ops.

-- Kit plans on the wallet: Start, Momentum and the three Land levels.
SET @plan_has_kit = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenBalances' AND COLUMN_NAME = 'plan' AND COLUMN_TYPE LIKE '%land_500%');
SET @ddl = IF(@plan_has_kit = 0, 'ALTER TABLE `tokenBalances` MODIFY `plan` ENUM(''free'',''pro'',''max'',''start'',''momentum'',''land_100'',''land_200'',''land_500'') NOT NULL DEFAULT ''free''', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- What the subscription bills, the switch scheduled for term end, the pause,
-- and the dunning state of a failed renewal.
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenBalances' AND COLUMN_NAME = 'subscriptionItemPriceId');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `tokenBalances` ADD COLUMN `subscriptionItemPriceId` VARCHAR(100) NULL, ADD COLUMN `subscriptionBillingPeriod` ENUM(''monthly'',''yearly'') NULL, ADD COLUMN `subscriptionAmount` INT NULL, ADD COLUMN `pendingPlan` VARCHAR(32) NULL, ADD COLUMN `pendingBillingPeriod` ENUM(''monthly'',''yearly'') NULL, ADD COLUMN `pendingPlanEffectiveAt` TIMESTAMP NULL, ADD COLUMN `subscriptionPauseAt` TIMESTAMP NULL, ADD COLUMN `subscriptionResumeAt` TIMESTAMP NULL, ADD COLUMN `paymentDueSince` TIMESTAMP NULL, ADD COLUMN `paymentDueInvoiceId` VARCHAR(80) NULL, ADD COLUMN `paymentDueAmount` INT NULL, ADD COLUMN `paymentNextRetryAt` TIMESTAMP NULL, ADD COLUMN `paymentFailureReason` VARCHAR(32) NULL, ADD COLUMN `paymentRetryRequestedAt` TIMESTAMP NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Kit plans, yearly terms and plan changes on checkout intents.
SET @intent_has_kit = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptionCheckoutIntents' AND COLUMN_NAME = 'plan' AND COLUMN_TYPE LIKE '%land_500%');
SET @ddl = IF(@intent_has_kit = 0, 'ALTER TABLE `subscriptionCheckoutIntents` MODIFY `plan` ENUM(''pro'',''max'',''start'',''momentum'',''land_100'',''land_200'',''land_500'') NOT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptionCheckoutIntents' AND COLUMN_NAME = 'billingPeriod');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `subscriptionCheckoutIntents` ADD COLUMN `billingPeriod` ENUM(''monthly'',''yearly'') NOT NULL DEFAULT ''monthly'', ADD COLUMN `kind` ENUM(''new'',''change'') NOT NULL DEFAULT ''new'', ADD COLUMN `subscriptionId` VARCHAR(80) NULL, ADD COLUMN `failureReason` VARCHAR(32) NULL, ADD COLUMN `failureCode` VARCHAR(64) NULL, ADD COLUMN `failedAt` TIMESTAMP NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptionCheckoutIntents' AND INDEX_NAME = 'subscription_checkout_subscription_idx');
SET @ddl = IF(@idx_exists = 0, 'CREATE INDEX `subscription_checkout_subscription_idx` ON `subscriptionCheckoutIntents` (`subscriptionId`)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- The Chargebee customer that holds a member's payment methods, per site.
CREATE TABLE IF NOT EXISTS `billingCustomers` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `role` enum('job_seeker','referrer') NOT NULL DEFAULT 'job_seeker',
  `provider` varchar(32) NOT NULL DEFAULT 'chargebee',
  `site` enum('test','live') NOT NULL,
  `providerCustomerId` varchar(80) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `billingCustomers_id` PRIMARY KEY(`id`),
  UNIQUE INDEX `billing_customers_provider_customer_unique`(`provider`,`site`,`providerCustomerId`),
  UNIQUE INDEX `billing_customers_owner_unique`(`userId`,`role`,`provider`,`site`),
  CONSTRAINT `billing_customers_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

-- Receipts: provider invoices of a member's subscription or credit pack.
CREATE TABLE IF NOT EXISTS `billingInvoices` (
  `id` int AUTO_INCREMENT NOT NULL,
  `provider` varchar(32) NOT NULL DEFAULT 'chargebee',
  `site` enum('test','live') NOT NULL,
  `providerInvoiceId` varchar(80) NOT NULL,
  `userId` int NOT NULL,
  `role` enum('job_seeker','referrer') NOT NULL DEFAULT 'job_seeker',
  `kind` enum('subscription','credit_pack') NOT NULL,
  `subscriptionId` varchar(80) NULL,
  `planId` varchar(32) NULL,
  `billingPeriod` enum('monthly','yearly') NULL,
  `tokenCount` int NULL,
  `amount` int NOT NULL,
  `amountRefunded` int NOT NULL DEFAULT 0,
  `currency` varchar(3) NOT NULL,
  `status` enum('paid','refunded','partially_refunded','payment_due','not_paid','voided') NOT NULL,
  `paidAt` timestamp NULL,
  `resourceVersion` bigint NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `billingInvoices_id` PRIMARY KEY(`id`),
  UNIQUE INDEX `billing_invoices_provider_invoice_unique`(`provider`,`site`,`providerInvoiceId`),
  INDEX `billing_invoices_owner_paid_idx`(`userId`,`role`,`paidAt`),
  CONSTRAINT `billing_invoices_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

-- Why members leave: one row per confirmed cancel or pause.
CREATE TABLE IF NOT EXISTS `subscriptionCancellationFeedback` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `role` enum('job_seeker','referrer') NOT NULL DEFAULT 'job_seeker',
  `subscriptionId` varchar(80) NOT NULL,
  `reason` enum('got_job','too_expensive','not_using','missing_feature','other') NOT NULL,
  `outcome` enum('cancelled','paused') NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `subscriptionCancellationFeedback_id` PRIMARY KEY(`id`),
  INDEX `subscription_cancellation_feedback_user_idx`(`userId`,`createdAt`),
  CONSTRAINT `subscription_cancellation_feedback_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
