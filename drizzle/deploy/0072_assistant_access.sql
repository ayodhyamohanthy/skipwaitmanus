-- Assistant access (kit screens 22 / 23 / 24 / 26):
-- assistant connections, API tokens, developer apps, assistant approvals.
-- Additive only. The deploy pipeline applies this file
-- (see server/schemaDeployGuard.test.ts).
CREATE TABLE IF NOT EXISTS `assistantConnections` (
 `id` int AUTO_INCREMENT,
 `userId` int NOT NULL,
 `provider` ENUM('chatgpt','claude','custom') NOT NULL,
 `appName` varchar(160) NOT NULL,
 `scopes` text NOT NULL,
 `status` ENUM('connected','declined','expired','revoked') NOT NULL DEFAULT 'connected',
 `connectedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `lastUsedAt` timestamp NULL,
 `revokedAt` timestamp NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT `assistantConnections_id` PRIMARY KEY(`id`),
 CONSTRAINT `assistant_connections_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 INDEX `assistant_connections_user_idx`(`userId`),
 INDEX `assistant_connections_status_idx`(`status`)
);
CREATE TABLE IF NOT EXISTS `assistantTokens` (
 `id` int AUTO_INCREMENT,
 `userId` int NOT NULL,
 `name` varchar(160) NOT NULL,
 `tokenHash` varchar(128) NOT NULL,
 `prefix` varchar(16) NOT NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `lastUsedAt` timestamp NULL,
 `revokedAt` timestamp NULL,
 CONSTRAINT `assistantTokens_id` PRIMARY KEY(`id`),
 UNIQUE INDEX `assistant_tokens_user_name_unique`(`userId`,`name`),
 CONSTRAINT `assistant_tokens_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 INDEX `assistant_tokens_user_idx`(`userId`)
);
CREATE TABLE IF NOT EXISTS `developerApps` (
 `id` int AUTO_INCREMENT,
 `userId` int NOT NULL,
 `name` varchar(160) NOT NULL,
 `kind` ENUM('web_app','agent_mcp','server_integration') NOT NULL,
 `description` text NOT NULL,
 `website` varchar(512) NULL,
 `redirectUrls` text NOT NULL,
 `scopes` text NOT NULL,
 `status` ENUM('test','in_review','live','rejected','suspended') NOT NULL DEFAULT 'test',
 `rejectReasons` text NULL,
 `webhookUrl` varchar(512) NULL,
 `clientId` varchar(64) NOT NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT `developerApps_id` PRIMARY KEY(`id`),
 UNIQUE INDEX `developer_apps_client_id_unique`(`clientId`),
 CONSTRAINT `developer_apps_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 INDEX `developer_apps_user_idx`(`userId`),
 INDEX `developer_apps_status_idx`(`status`)
);
CREATE TABLE IF NOT EXISTS `assistantApprovals` (
 `id` int AUTO_INCREMENT,
 `userId` int NOT NULL,
 `connectionId` int NULL,
 `kind` ENUM('ask_send','credit_spend') NOT NULL,
 `status` ENUM('pending','approved','declined','expired') NOT NULL DEFAULT 'pending',
 `provider` varchar(80) NOT NULL,
 `companyDomain` varchar(255) NULL,
 `role` varchar(180) NULL,
 `note` text NULL,
 `creditCount` int NULL,
 `slotCount` int NULL,
 `expiresAt` timestamp NOT NULL,
 `decidedAt` timestamp NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT `assistantApprovals_id` PRIMARY KEY(`id`),
 CONSTRAINT `assistant_approvals_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 CONSTRAINT `assistant_approvals_connection_fk` FOREIGN KEY (`connectionId`) REFERENCES `assistantConnections` (`id`) ON DELETE SET NULL,
 INDEX `assistant_approvals_user_idx`(`userId`),
 INDEX `assistant_approvals_status_idx`(`status`),
 INDEX `assistant_approvals_expiry_idx`(`expiresAt`)
);
