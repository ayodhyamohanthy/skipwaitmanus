-- 0031: bring live databases in line with schema.ts (jobs.compensation,
-- referralRequests.savedAt). Idempotent: safe to re-run.
ALTER TABLE `jobs` ADD COLUMN IF NOT EXISTS `compensation` TEXT NULL;
ALTER TABLE `referralRequests` ADD COLUMN IF NOT EXISTS `savedAt` TIMESTAMP NULL;
