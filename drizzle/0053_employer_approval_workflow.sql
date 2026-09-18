-- Resume-safe employer approval migration.
ALTER TABLE `employerAccounts` MODIFY COLUMN `approvalStatus` enum('pending','approved','rejected','suspended','revoked') NOT NULL DEFAULT 'pending';
DELIMITER $$
DROP PROCEDURE IF EXISTS `apply_0053_employer_approval`$$
CREATE PROCEDURE `apply_0053_employer_approval`()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='employerAccounts' AND column_name='submittedAt') THEN ALTER TABLE `employerAccounts` ADD COLUMN `submittedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='employerAccounts' AND column_name='decidedAt') THEN ALTER TABLE `employerAccounts` ADD COLUMN `decidedAt` timestamp NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='employerAccounts' AND column_name='decisionNote') THEN ALTER TABLE `employerAccounts` ADD COLUMN `decisionNote` varchar(500) NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='employerAccounts' AND column_name='evidenceVersion') THEN ALTER TABLE `employerAccounts` ADD COLUMN `evidenceVersion` varchar(40) NOT NULL DEFAULT 'employer-application-v1'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='employerAccounts' AND column_name='applicationVersion') THEN ALTER TABLE `employerAccounts` ADD COLUMN `applicationVersion` int NOT NULL DEFAULT 1; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='employerAccounts' AND index_name='employer_accounts_queue_idx') THEN ALTER TABLE `employerAccounts` ADD INDEX `employer_accounts_queue_idx` (`approvalStatus`,`submittedAt`); END IF;
END$$
CALL `apply_0053_employer_approval`()$$
DROP PROCEDURE `apply_0053_employer_approval`$$
DELIMITER ;
