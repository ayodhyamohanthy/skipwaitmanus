-- 0076: server-owned company directory (kit v4 /explore, /verify, /invite,
-- /suggest-company, /for-companies, admin Companies).
-- Additive only: two new tables and an idempotent seed of the five launch
-- companies exactly as the retired client constant listed them (owner to
-- confirm the domains and the descriptor copy). Availability is derived on
-- read from verified referrers and is never stored here. No existing table
-- changes. The seed rows mirror shared/companyDirectorySeed.ts
-- (server/companyDirectoryContract.test.ts keeps them identical).
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `companies` (
  `id` int AUTO_INCREMENT NOT NULL,
  `slug` varchar(48) NOT NULL,
  `name` varchar(160) NOT NULL,
  `initials` varchar(4) NOT NULL,
  `industry` varchar(80) NOT NULL,
  `location` varchar(80) NOT NULL,
  `functions` text NOT NULL,
  `blurb` varchar(240) NOT NULL,
  `status` enum('listed','hidden') NOT NULL DEFAULT 'listed',
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `companies_id` PRIMARY KEY(`id`),
  UNIQUE INDEX `companies_slug_unique`(`slug`),
  INDEX `companies_status_sort_idx`(`status`,`sortOrder`)
);

CREATE TABLE IF NOT EXISTS `companyDomains` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int NOT NULL,
  `domain` varchar(255) NOT NULL,
  `isPrimary` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `companyDomains_id` PRIMARY KEY(`id`),
  CONSTRAINT `companyDomains_companyId_companies_id_fk` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  UNIQUE INDEX `company_domains_domain_unique`(`domain`),
  INDEX `company_domains_company_idx`(`companyId`)
);

-- Seed: skipped per row when the slug already exists, so re-runs and admin
-- edits made after the first apply are never overwritten.
INSERT INTO `companies` (`slug`, `name`, `initials`, `industry`, `location`, `functions`, `blurb`, `status`, `sortOrder`)
SELECT v.slug, v.name, v.initials, v.industry, v.location, v.functions, v.blurb, 'listed', v.sortOrder FROM (
  SELECT 'skipwait' AS slug, 'SkipWait' AS name, 'SW' AS initials, 'Technology' AS industry, 'Global · Remote' AS location, '["Engineering","Product","Design"]' AS functions, 'Build the platform making warm introductions more accessible.' AS blurb, 10 AS sortOrder
  UNION ALL SELECT 'wipro', 'Wipro', 'W', 'Technology services', 'Global', '["Engineering","Data","Operations"]', 'Explore roles across technology, consulting, and business operations.', 20
  UNION ALL SELECT 'go-neutrinos', 'Go Neutrinos', 'GN', 'Digital products', 'India · Remote', '["Engineering","Product","Design"]', 'Connect around product, design, and engineering opportunities.', 30
  UNION ALL SELECT 'tcs', 'TCS', 'T', 'Technology services', 'Global', '["Engineering","Data","Operations"]', 'Find a warmer path into global technology and consulting teams.', 40
  UNION ALL SELECT 'merkle', 'Merkle', 'M', 'Customer experience', 'Global', '["Data","Design","Operations"]', 'Explore opportunities across experience, data, media, and technology.', 50
) v
WHERE NOT EXISTS (SELECT 1 FROM `companies` c WHERE c.slug = v.slug);

-- Primary domains: skipped per row when the domain is already registered.
INSERT INTO `companyDomains` (`companyId`, `domain`, `isPrimary`)
SELECT c.id, v.domain, true FROM (
  SELECT 'skipwait' AS slug, 'skipwait.me' AS domain
  UNION ALL SELECT 'wipro', 'wipro.com'
  UNION ALL SELECT 'go-neutrinos', 'goneutrinos.com'
  UNION ALL SELECT 'tcs', 'tcs.com'
  UNION ALL SELECT 'merkle', 'merkle.com'
) v
INNER JOIN `companies` c ON c.slug = v.slug
WHERE NOT EXISTS (SELECT 1 FROM `companyDomains` d WHERE d.domain = v.domain);
