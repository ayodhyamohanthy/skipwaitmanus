-- 0120: D-174-job-catalog (packet docs/plans/D-193-journey-foundations.md
-- section 5.5). Additive only: the company job-board source registry and the
-- catalog job rows fetched from verified boards. No existing table changes.
-- Both tables start empty; while shared/jobCatalog.ts JOB_CATALOG_ENABLED is
-- false the sync job writes nothing and the jobs route answers unavailable.
-- CREATE TABLE IF NOT EXISTS keeps re-runs no-ops; the deploy pipeline
-- applies the file once (scripts/apply-deploy-migrations.sh). The reconcile
-- guard in server/schemaReconcile.ts applies the same tables at boot if this
-- file has not run yet.

CREATE TABLE IF NOT EXISTS `companyJobSources` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int NOT NULL,
  `provider` varchar(20) NOT NULL,
  `boardToken` varchar(120) NOT NULL,
  `evidenceUrl` varchar(2048) NOT NULL,
  `verifiedAt` timestamp NULL,
  `lastFetchedAt` timestamp NULL,
  `lastCount` int NULL,
  `status` enum('verified','unverified','failing') NOT NULL DEFAULT 'unverified',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `companyJobSources_id` PRIMARY KEY(`id`),
  CONSTRAINT `company_job_sources_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  UNIQUE INDEX `company_job_sources_provider_token_unique`(`provider`,`boardToken`),
  INDEX `company_job_sources_company_idx`(`companyId`)
);

CREATE TABLE IF NOT EXISTS `catalogJobs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int NOT NULL,
  `sourceId` int NOT NULL,
  `externalId` varchar(190) NOT NULL,
  `title` varchar(300) NOT NULL,
  `rawLocation` varchar(300) NULL,
  `locations` text NOT NULL,
  `workMode` enum('onsite','hybrid','remote','unknown') NOT NULL DEFAULT 'unknown',
  `department` varchar(200) NULL,
  `jobFunction` varchar(60) NULL,
  `level` int NOT NULL,
  `applyUrl` varchar(2048) NOT NULL,
  `snippet` varchar(400) NOT NULL DEFAULT '',
  `publishedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `firstSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closedAt` timestamp NULL,
  CONSTRAINT `catalogJobs_id` PRIMARY KEY(`id`),
  CONSTRAINT `catalog_jobs_company_fk` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `catalog_jobs_source_fk` FOREIGN KEY (`sourceId`) REFERENCES `companyJobSources` (`id`) ON DELETE CASCADE,
  UNIQUE INDEX `catalog_jobs_source_external_unique`(`sourceId`,`externalId`),
  INDEX `catalog_jobs_company_closed_idx`(`companyId`,`closedAt`),
  INDEX `catalog_jobs_company_level_idx`(`companyId`,`level`)
);
