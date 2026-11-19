-- 0078: scheduled job runs (Cloudflare cron -> container tick, shared/scheduledJobs.ts).
-- Additive only: one new table, no existing table changes, no data written.
-- One row per job per window. The unique (jobName, windowKey) key is the
-- single-flight lock, so overlapping cron fires or container instances can
-- never run the same window twice; the row is the idempotent run record the
-- admin status read reports. The app writes every timestamp from the JS clock
-- (invariant 5); startedAt carries a default only so it is never implicitly
-- auto-updated on servers with explicit_defaults_for_timestamp off.
CREATE TABLE IF NOT EXISTS `jobRuns` (
  `id` int AUTO_INCREMENT NOT NULL,
  `jobName` varchar(64) NOT NULL,
  `windowKey` varchar(32) NOT NULL,
  `status` enum('running','succeeded','failed') NOT NULL DEFAULT 'running',
  `attempt` int NOT NULL DEFAULT 1,
  `leaseOwner` varchar(64) NOT NULL,
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `leaseExpiresAt` timestamp NOT NULL,
  `finishedAt` timestamp NULL,
  `processedCount` int NOT NULL DEFAULT 0,
  `failedCount` int NOT NULL DEFAULT 0,
  `error` varchar(500) NULL,
  CONSTRAINT `jobRuns_id` PRIMARY KEY(`id`),
  UNIQUE INDEX `job_runs_job_window_unique`(`jobName`,`windowKey`),
  INDEX `job_runs_job_started_idx`(`jobName`,`startedAt`)
);
