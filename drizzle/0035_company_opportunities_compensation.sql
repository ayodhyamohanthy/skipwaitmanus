-- 0035: companyOpportunities.compensation (was missing from live DB; 0031 only
-- covered jobs.compensation + referralRequests.savedAt). MySQL 8.0 syntax —
-- no IF NOT EXISTS; use scripts/apply-missing-columns.mjs for idempotent apply.
ALTER TABLE `companyOpportunities` ADD COLUMN `compensation` TEXT NULL;
