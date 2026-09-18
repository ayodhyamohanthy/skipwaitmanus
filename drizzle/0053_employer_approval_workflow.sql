ALTER TABLE `employerAccounts`
  MODIFY COLUMN `approvalStatus` enum('pending','approved','rejected','suspended','revoked') NOT NULL DEFAULT 'pending',
  ADD COLUMN `submittedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN `decidedAt` timestamp NULL,
  ADD COLUMN `decisionNote` varchar(500) NULL,
  ADD COLUMN `evidenceVersion` varchar(40) NOT NULL DEFAULT 'employer-application-v1',
  ADD COLUMN `applicationVersion` int NOT NULL DEFAULT 1;
CREATE INDEX `employer_accounts_queue_idx` ON `employerAccounts` (`approvalStatus`,`submittedAt`);
