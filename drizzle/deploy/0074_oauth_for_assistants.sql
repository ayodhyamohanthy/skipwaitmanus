-- OAuth (authorization code + PKCE) for connected assistants. Additive, guarded.
CREATE TABLE IF NOT EXISTS `oauthClients` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `clientId` varchar(64) NOT NULL,
  `clientName` varchar(160) NOT NULL,
  `redirectUris` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX `oauthClients_clientId_unique`(`clientId`)
);
CREATE TABLE IF NOT EXISTS `oauthAuthCodes` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `codeHash` varchar(64) NOT NULL,
  `clientId` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `redirectUri` varchar(512) NOT NULL,
  `codeChallenge` varchar(64) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `usedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX `oauthAuthCodes_codeHash_unique`(`codeHash`),
  CONSTRAINT `oauth_auth_codes_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `oauth_auth_codes_user_idx`(`userId`),
  INDEX `oauth_auth_codes_expiry_idx`(`expiresAt`)
);
