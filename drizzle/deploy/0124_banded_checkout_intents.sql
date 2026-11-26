-- 0124: BANDED-grants-intents-migration (D-367, D-370). Storage only: no grants, checkout or sales.
-- Create initially empty bandedCheckoutIntents table for durable checkout ownership before fulfillment.
-- Retain all existing data, ENUM ordinals, defaults and migration SQL.

CREATE TABLE IF NOT EXISTS `bandedCheckoutIntents` (
  `id` int AUTO_INCREMENT NOT NULL,
  `site` enum('test','live') NOT NULL,
  `checkoutIntentId` varchar(96) NOT NULL,
  `userId` int NULL,
  `kind` enum('plan','referral') NOT NULL,
  `planId` enum('early_to_mid','mid_to_senior','senior_to_executive') NULL,
  `billingRoute` enum('IN','INTL') NOT NULL,
  `currency` enum('INR','USD') NOT NULL,
  `expectedTotal` int unsigned NOT NULL,
  `fingerprint` varchar(64) NOT NULL,
  `cart` json NOT NULL,
  `hostedPageId` varchar(128) NULL,
  `invoiceId` varchar(128) NULL,
  `subscriptionId` varchar(80) NULL,
  `status` enum('creating','pending','fulfilled','requires_review','cancelled') NOT NULL DEFAULT 'creating',
  `failureReason` varchar(255) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `expiresAt` timestamp NOT NULL,
  `replayDeadline` timestamp NOT NULL,
  `lastCheckedAt` timestamp NULL,
  `fulfilledAt` timestamp NULL,
  CONSTRAINT `bandedCheckoutIntents_id` PRIMARY KEY (`id`),
  CONSTRAINT `banded_intents_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  UNIQUE INDEX `banded_intents_checkout_unique` (`site`,`checkoutIntentId`),
  UNIQUE INDEX `banded_intents_hosted_page_unique` (`site`,`hostedPageId`),
  UNIQUE INDEX `banded_intents_invoice_unique` (`site`,`invoiceId`),
  INDEX `banded_intents_reconcile_idx` (`status`,`lastCheckedAt`,`createdAt`),
  INDEX `banded_intents_recovery_idx` (`userId`,`site`,`createdAt`),
  CONSTRAINT `banded_intents_expected_total_positive` CHECK (`expectedTotal` > 0)
) ENGINE=InnoDB;
