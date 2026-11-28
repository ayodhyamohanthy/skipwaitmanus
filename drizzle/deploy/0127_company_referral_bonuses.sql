-- 0127: D-099 slice A (D-374). Two additive tables for one sourced referral-bonus
-- figure per company and the reports filed about it. No existing row is rewritten,
-- there is no backfill, and both statements are IF NOT EXISTS so re-runs are no-ops.
-- The boot reconcile in server/schemaReconcile.ts declares the same tables, indexes
-- and foreign key. The employer sets and pays its own programme; skipwait.me never
-- pays referrers (D-055, D-063).

CREATE TABLE IF NOT EXISTS `companyReferralBonuses` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int NOT NULL,
  `amountMinor` bigint NOT NULL,
  `currency` char(3) NOT NULL,
  `upTo` boolean NOT NULL DEFAULT FALSE,
  `scopeNote` varchar(120) NULL,
  `sourceUrl` varchar(2048) NOT NULL,
  `checkedAt` datetime NOT NULL,
  `status` enum('published','withdrawn') NOT NULL DEFAULT 'published',
  `updatedByUserId` int NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `companyReferralBonuses_id` PRIMARY KEY (`id`),
  UNIQUE INDEX `company_referral_bonuses_company_unique` (`companyId`),
  CONSTRAINT `company_referral_bonuses_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `companyBonusReports` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int NOT NULL,
  `reporterUserId` int NOT NULL,
  `reason` enum('figure_changed','source_gone','not_this_company','new_source','other') NOT NULL,
  `note` varchar(280) NULL,
  `suggestedSourceUrl` varchar(2048) NULL,
  `status` enum('open','fixed','dismissed') NOT NULL DEFAULT 'open',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewedAt` datetime NULL,
  `reviewedByUserId` int NULL,
  CONSTRAINT `companyBonusReports_id` PRIMARY KEY (`id`),
  INDEX `company_bonus_reports_status_idx` (`status`,`createdAt`),
  INDEX `company_bonus_reports_reporter_idx` (`reporterUserId`,`createdAt`),
  CONSTRAINT `company_bonus_reports_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
