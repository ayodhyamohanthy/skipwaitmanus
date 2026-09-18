-- Resume-safe talent consent migration. Safe after any partial earlier 0052 run.
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

DELIMITER $$
DROP PROCEDURE IF EXISTS `apply_0052_talent_consent`$$
CREATE PROCEDURE `apply_0052_talent_consent`()
BEGIN
  DECLARE pair_index VARCHAR(128);

  -- Drop an old permanent pair-unique constraint only if one actually exists,
  -- regardless of its production name.
  SELECT x.index_name INTO pair_index
  FROM (
    SELECT index_name, non_unique,
           GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') AS cols
    FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'employerTalentRefs' AND index_name <> 'PRIMARY'
    GROUP BY index_name, non_unique
  ) x WHERE x.non_unique = 0 AND x.cols = 'employerUserId,seekerProfileUserId' LIMIT 1;
  IF pair_index IS NOT NULL THEN
    SET @sql = CONCAT('ALTER TABLE `employerTalentRefs` DROP INDEX `', REPLACE(pair_index,'`','``'), '`');
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='employerTalentRefs' AND column_name='consentId') THEN ALTER TABLE `employerTalentRefs` ADD COLUMN `consentId` int NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='employerTalentRefs' AND column_name='revokedAt') THEN ALTER TABLE `employerTalentRefs` ADD COLUMN `revokedAt` timestamp NULL; END IF;
  UPDATE `employerTalentRefs` SET `revokedAt`=CURRENT_TIMESTAMP WHERE `revokedAt` IS NULL;
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='employerTalentRefs' AND index_name='employer_talent_refs_pair_active_idx') THEN ALTER TABLE `employerTalentRefs` ADD INDEX `employer_talent_refs_pair_active_idx` (`employerUserId`,`seekerProfileUserId`,`revokedAt`); END IF;

  SET pair_index = NULL;
  SELECT x.index_name INTO pair_index
  FROM (
    SELECT index_name, non_unique,
           GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') AS cols
    FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'profileUnlocks' AND index_name <> 'PRIMARY'
    GROUP BY index_name, non_unique
  ) x WHERE x.non_unique = 0 AND x.cols = 'employerUserId,seekerProfileUserId' LIMIT 1;
  IF pair_index IS NOT NULL THEN
    SET @sql = CONCAT('ALTER TABLE `profileUnlocks` DROP INDEX `', REPLACE(pair_index,'`','``'), '`');
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='profileUnlocks' AND column_name='consentId') THEN ALTER TABLE `profileUnlocks` ADD COLUMN `consentId` int NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='profileUnlocks' AND column_name='consentPolicyVersion') THEN ALTER TABLE `profileUnlocks` ADD COLUMN `consentPolicyVersion` varchar(32) NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='profileUnlocks' AND column_name='employerCompanyName') THEN ALTER TABLE `profileUnlocks` ADD COLUMN `employerCompanyName` varchar(160) NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='profileUnlocks' AND column_name='disclosedFields') THEN ALTER TABLE `profileUnlocks` ADD COLUMN `disclosedFields` text NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='profileUnlocks' AND column_name='profileVersion') THEN ALTER TABLE `profileUnlocks` ADD COLUMN `profileVersion` timestamp NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='profileUnlocks' AND column_name='profileSnapshot') THEN ALTER TABLE `profileUnlocks` ADD COLUMN `profileSnapshot` text NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='profileUnlocks' AND column_name='expiresAt') THEN ALTER TABLE `profileUnlocks` ADD COLUMN `expiresAt` timestamp NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='profileUnlocks' AND column_name='revokedAt') THEN ALTER TABLE `profileUnlocks` ADD COLUMN `revokedAt` timestamp NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='profileUnlocks' AND column_name='revocationReason') THEN ALTER TABLE `profileUnlocks` ADD COLUMN `revocationReason` varchar(255) NULL; END IF;
  UPDATE `profileUnlocks` SET `revokedAt`=CURRENT_TIMESTAMP, `revocationReason`='historic_pair_without_scoped_consent', `expiresAt`=CURRENT_TIMESTAMP WHERE `revokedAt` IS NULL;
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='profileUnlocks' AND index_name='profile_unlocks_employer_seeker_active_idx') THEN ALTER TABLE `profileUnlocks` ADD INDEX `profile_unlocks_employer_seeker_active_idx` (`employerUserId`,`seekerProfileUserId`,`revokedAt`,`expiresAt`); END IF;
END$$
CALL `apply_0052_talent_consent`()$$
DROP PROCEDURE `apply_0052_talent_consent`$$
DELIMITER ;
