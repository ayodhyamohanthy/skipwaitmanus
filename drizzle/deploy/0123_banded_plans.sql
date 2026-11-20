-- 0123: BANDED-schema (D-367). Storage only: no grants, checkout or sales.
-- Append ENUM values in place; retain every existing ordinal and default.
-- Runtime schema reconciliation only validates after this migration is verified.

SET @plan_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokenBalances' AND COLUMN_NAME = 'plan');
SET @ddl = IF(LOCATE('''early_to_mid''', @plan_type) > 0 AND LOCATE('''mid_to_senior''', @plan_type) > 0 AND LOCATE('''senior_to_executive''', @plan_type) > 0, 'SELECT 1', 'ALTER TABLE `tokenBalances` MODIFY `plan` ENUM(''free'',''pro'',''max'',''start'',''momentum'',''land_100'',''land_200'',''land_500'',''keep_warm'',''land_focus'',''land_sprint'',''land_concierge'',''early_to_mid'',''mid_to_senior'',''senior_to_executive'') NOT NULL DEFAULT ''free''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @plan_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptionCheckoutIntents' AND COLUMN_NAME = 'plan');
SET @ddl = IF(LOCATE('''early_to_mid''', @plan_type) > 0 AND LOCATE('''mid_to_senior''', @plan_type) > 0 AND LOCATE('''senior_to_executive''', @plan_type) > 0, 'SELECT 1', 'ALTER TABLE `subscriptionCheckoutIntents` MODIFY `plan` ENUM(''pro'',''max'',''start'',''momentum'',''land_100'',''land_200'',''land_500'',''keep_warm'',''land_focus'',''land_sprint'',''land_concierge'',''early_to_mid'',''mid_to_senior'',''senior_to_executive'') NOT NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `bandedReferralBalances` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `level` enum('early','mid','senior','executive') NOT NULL,
  `includedRemaining` int unsigned NOT NULL DEFAULT 0,
  `includedCycleKey` varchar(128) NULL,
  `includedExpiresAt` timestamp NULL,
  `purchasedRemaining` int unsigned NOT NULL DEFAULT 0,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `bandedReferralBalances_id` PRIMARY KEY (`id`),
  CONSTRAINT `banded_balances_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  UNIQUE INDEX `banded_balances_user_level_unique` (`userId`,`level`),
  CONSTRAINT `banded_balances_included_cycle` CHECK (`includedRemaining` = 0 OR (`includedCycleKey` IS NOT NULL AND `includedExpiresAt` IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `bandedFoundingCounters` (
  `site` enum('test','live') NOT NULL,
  `planId` enum('early_to_mid','mid_to_senior','senior_to_executive') NOT NULL,
  `issuedCount` int unsigned NOT NULL DEFAULT 0,
  `reservedCount` int unsigned NOT NULL DEFAULT 0,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`site`,`planId`),
  CONSTRAINT `banded_founding_counter_cap` CHECK (`issuedCount` + `reservedCount` <= CASE `planId` WHEN 'early_to_mid' THEN 500 WHEN 'mid_to_senior' THEN 250 WHEN 'senior_to_executive' THEN 100 ELSE 0 END)
) ENGINE=InnoDB;

-- TEST reservations must never consume LIVE places. Replay never resets a count.
INSERT INTO `bandedFoundingCounters` (`site`,`planId`) VALUES
  ('test','early_to_mid'), ('test','mid_to_senior'), ('test','senior_to_executive'),
  ('live','early_to_mid'), ('live','mid_to_senior'), ('live','senior_to_executive')
ON DUPLICATE KEY UPDATE `planId` = `planId`;

CREATE TABLE IF NOT EXISTS `bandedFoundingMemberships` (
  `id` int AUTO_INCREMENT NOT NULL,
  `site` enum('test','live') NOT NULL,
  `planId` enum('early_to_mid','mid_to_senior','senior_to_executive') NOT NULL,
  `userId` int NULL,
  `checkoutIntentId` varchar(96) NOT NULL,
  `subscriptionId` varchar(80) NULL,
  `status` enum('reserved','issued','released') NOT NULL DEFAULT 'reserved',
  `issuedSequence` int unsigned NULL,
  `expiresAt` timestamp NOT NULL,
  `issuedAt` timestamp NULL,
  `releasedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `bandedFoundingMemberships_id` PRIMARY KEY (`id`),
  CONSTRAINT `banded_founding_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `banded_founding_counter_fk` FOREIGN KEY (`site`,`planId`) REFERENCES `bandedFoundingCounters` (`site`,`planId`),
  UNIQUE INDEX `banded_founding_checkout_unique` (`site`,`checkoutIntentId`),
  UNIQUE INDEX `banded_founding_subscription_unique` (`site`,`subscriptionId`),
  UNIQUE INDEX `banded_founding_sequence_unique` (`site`,`planId`,`issuedSequence`),
  INDEX `banded_founding_expiry_idx` (`status`,`expiresAt`),
  CONSTRAINT `banded_founding_sequence_cap` CHECK (`issuedSequence` IS NULL OR `issuedSequence` BETWEEN 1 AND CASE `planId` WHEN 'early_to_mid' THEN 500 WHEN 'mid_to_senior' THEN 250 WHEN 'senior_to_executive' THEN 100 ELSE 0 END),
  CONSTRAINT `banded_founding_state` CHECK (
    (`status` = 'reserved' AND `issuedSequence` IS NULL AND `issuedAt` IS NULL AND `releasedAt` IS NULL)
    OR (`status` = 'issued' AND `issuedSequence` IS NOT NULL AND `issuedAt` IS NOT NULL AND `releasedAt` IS NULL)
    OR (`status` = 'released' AND `issuedSequence` IS NULL AND `issuedAt` IS NULL AND `releasedAt` IS NOT NULL)
  )
) ENGINE=InnoDB;
