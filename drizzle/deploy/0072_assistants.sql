-- Connected assistants (kit: /settings assistants, connect-assistant consent,
-- approve, developer console). Additive only: five new tables, no changes to
-- existing ones. Tokens are stored as SHA-256 hashes, never in clear.
-- The deploy pipeline applies this file (see server/schemaDeployGuard.test.ts).
CREATE TABLE IF NOT EXISTS `assistantApps` (
 `id` int AUTO_INCREMENT,
 `clientId` varchar(64) NOT NULL,
 `name` varchar(120) NOT NULL,
 `ownerUserId` int NULL,
 `homepageUrl` varchar(512) NULL,
 `redirectUris` text NOT NULL,
 `status` ENUM('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending',
 `builtin` boolean NOT NULL DEFAULT false,
 `reviewNote` varchar(500) NULL,
 `reviewedAt` timestamp NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT `assistantApps_id` PRIMARY KEY(`id`),
 CONSTRAINT `assistant_apps_owner_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL,
 UNIQUE INDEX `assistant_apps_client_unique`(`clientId`),
 INDEX `assistant_apps_owner_idx`(`ownerUserId`),
 INDEX `assistant_apps_status_idx`(`status`)
);
CREATE TABLE IF NOT EXISTS `assistantConnections` (
 `id` int AUTO_INCREMENT,
 `userId` int NOT NULL,
 `appId` int NOT NULL,
 `scopes` text NOT NULL,
 `status` ENUM('active','revoked') NOT NULL DEFAULT 'active',
 `lastUsedAt` timestamp NULL,
 `revokedAt` timestamp NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT `assistantConnections_id` PRIMARY KEY(`id`),
 CONSTRAINT `assistant_connections_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 CONSTRAINT `assistant_connections_app_fk` FOREIGN KEY (`appId`) REFERENCES `assistantApps` (`id`) ON DELETE CASCADE,
 UNIQUE INDEX `assistant_connections_user_app_unique`(`userId`,`appId`),
 INDEX `assistant_connections_user_idx`(`userId`)
);
CREATE TABLE IF NOT EXISTS `assistantTokens` (
 `id` int AUTO_INCREMENT,
 `userId` int NOT NULL,
 `connectionId` int NULL,
 `kind` ENUM('api','access','refresh') NOT NULL,
 `name` varchar(80) NULL,
 `tokenHash` char(64) NOT NULL,
 `prefix` varchar(16) NOT NULL,
 `scopes` text NOT NULL,
 `expiresAt` timestamp NULL,
 `lastUsedAt` timestamp NULL,
 `revokedAt` timestamp NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT `assistantTokens_id` PRIMARY KEY(`id`),
 CONSTRAINT `assistant_tokens_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 CONSTRAINT `assistant_tokens_connection_fk` FOREIGN KEY (`connectionId`) REFERENCES `assistantConnections` (`id`) ON DELETE CASCADE,
 UNIQUE INDEX `assistant_tokens_hash_unique`(`tokenHash`),
 INDEX `assistant_tokens_user_idx`(`userId`),
 INDEX `assistant_tokens_connection_idx`(`connectionId`)
);
CREATE TABLE IF NOT EXISTS `assistantApprovals` (
 `id` int AUTO_INCREMENT,
 `userId` int NOT NULL,
 `connectionId` int NOT NULL,
 `kind` ENUM('send_ask','spend_credits') NOT NULL,
 `payload` text NOT NULL,
 `costCredits` int NULL,
 `status` ENUM('pending','approved','declined','expired','executed') NOT NULL DEFAULT 'pending',
 `expiresAt` timestamp NOT NULL,
 `decidedAt` timestamp NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT `assistantApprovals_id` PRIMARY KEY(`id`),
 CONSTRAINT `assistant_approvals_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 CONSTRAINT `assistant_approvals_connection_fk` FOREIGN KEY (`connectionId`) REFERENCES `assistantConnections` (`id`) ON DELETE CASCADE,
 INDEX `assistant_approvals_user_status_idx`(`userId`,`status`)
);
CREATE TABLE IF NOT EXISTS `assistantActivity` (
 `id` int AUTO_INCREMENT,
 `userId` int NOT NULL,
 `connectionId` int NULL,
 `action` varchar(60) NOT NULL,
 `summary` varchar(255) NOT NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT `assistantActivity_id` PRIMARY KEY(`id`),
 CONSTRAINT `assistant_activity_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 CONSTRAINT `assistant_activity_connection_fk` FOREIGN KEY (`connectionId`) REFERENCES `assistantConnections` (`id`) ON DELETE SET NULL,
 INDEX `assistant_activity_user_idx`(`userId`,`createdAt`)
);
