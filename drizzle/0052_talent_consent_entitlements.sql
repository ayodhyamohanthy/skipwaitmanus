CREATE TABLE IF NOT EXISTS `talentDiscoveryConsents` (
  `id` int AUTO_INCREMENT NOT NULL,
  `seekerUserId` int NOT NULL,
  `policyVersion` varchar(32) NOT NULL,
  `disclosedFields` text NOT NULL,
  `audience` varchar(160) NOT NULL,
  `purpose` varchar(255) NOT NULL,
  `retentionDays` int NOT NULL,
  `contactFlow` varchar(255) NOT NULL,
  `paidUnlockInvolved` boolean NOT NULL,
  `source` varchar(80) NOT NULL,
  `grantedAt` timestamp NULL,
  `revokedAt` timestamp NULL,
  `revocationReason` varchar(255) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), INDEX `talent_consents_seeker_created_idx` (`seekerUserId`,`createdAt`)
);

-- Historic refs cannot prove consent. Revoke them before adding consent linkage.
ALTER TABLE `employerTalentRefs` DROP INDEX `employer_talent_refs_pair_unique`;
ALTER TABLE `employerTalentRefs` ADD COLUMN `consentId` int NULL, ADD COLUMN `revokedAt` timestamp NULL;
UPDATE `employerTalentRefs` SET `revokedAt` = CURRENT_TIMESTAMP WHERE `revokedAt` IS NULL;
ALTER TABLE `employerTalentRefs` ADD INDEX `employer_talent_refs_pair_active_idx` (`employerUserId`,`seekerProfileUserId`,`revokedAt`);

-- Historic permanent unlocks are revoked, never silently restored or migrated as consented.
ALTER TABLE `profileUnlocks` DROP INDEX `profile_unlocks_employer_seeker_unique`;
ALTER TABLE `profileUnlocks`
  ADD COLUMN `consentId` int NULL,
  ADD COLUMN `consentPolicyVersion` varchar(32) NULL,
  ADD COLUMN `employerCompanyName` varchar(160) NULL,
  ADD COLUMN `disclosedFields` text NULL,
  ADD COLUMN `profileVersion` timestamp NULL,
  ADD COLUMN `profileSnapshot` text NULL,
  ADD COLUMN `expiresAt` timestamp NULL,
  ADD COLUMN `revokedAt` timestamp NULL,
  ADD COLUMN `revocationReason` varchar(255) NULL;
UPDATE `profileUnlocks` SET `revokedAt` = CURRENT_TIMESTAMP, `revocationReason` = 'historic_pair_without_scoped_consent', `expiresAt` = CURRENT_TIMESTAMP WHERE `revokedAt` IS NULL;
ALTER TABLE `profileUnlocks` ADD INDEX `profile_unlocks_employer_seeker_active_idx` (`employerUserId`,`seekerProfileUserId`,`revokedAt`,`expiresAt`);
