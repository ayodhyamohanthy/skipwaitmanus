-- Developer applications: OAuth clients registered by third-party apps, AI
-- agents and MCP servers.
--
-- Registration and review only. The authorization-code flow, the consent
-- screen, scope enforcement and the MCP endpoint are NOT part of this migration;
-- an app can be registered and approved, but nothing can authenticate as one
-- yet. That boundary is deliberate -- see the note on the table in schema.ts.
--
-- clientSecretHash stores a SHA-256 digest. The plaintext secret is returned
-- once, at creation, and is never persisted.

CREATE TABLE IF NOT EXISTS `developerApps` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ownerId` int NOT NULL,
  `name` varchar(120) NOT NULL,
  `kind` enum('app','agent','server') NOT NULL,
  `websiteUrl` varchar(512),
  `redirectUrls` text NOT NULL,
  `description` text NOT NULL,
  `scopes` text NOT NULL,
  `status` enum('draft','in_review','approved','rejected','suspended') NOT NULL DEFAULT 'in_review',
  `clientId` varchar(64) NOT NULL,
  `clientSecretHash` varchar(64) NOT NULL,
  `isTestMode` boolean NOT NULL DEFAULT true,
  `reviewNote` varchar(512),
  `reviewedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `developerApps_id` PRIMARY KEY (`id`),
  CONSTRAINT `developerApps_clientId_unique` UNIQUE (`clientId`),
  CONSTRAINT `developerApps_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `developer_apps_owner_idx` (`ownerId`, `createdAt`),
  INDEX `developer_apps_status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
