CREATE TABLE IF NOT EXISTS `passkeyCredentials` (
 `id` int AUTO_INCREMENT PRIMARY KEY,
 `openId` varchar(64) NOT NULL,
 `credentialId` varchar(255) NOT NULL,
 `publicKey` text NOT NULL,
 `counter` bigint NOT NULL DEFAULT 0,
 `transports` varchar(255) NULL,
 `deviceName` varchar(120) NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `lastUsedAt` timestamp NULL,
 UNIQUE INDEX `passkey_credential_id_unique` (`credentialId`),
 INDEX `passkey_openid_idx` (`openId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `passkeyChallenges` (
 `id` int AUTO_INCREMENT PRIMARY KEY,
 `openId` varchar(64) NULL,
 `challenge` varchar(255) NOT NULL,
 `kind` ENUM('registration','login') NOT NULL,
 `expiresAt` timestamp NOT NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX `passkey_challenge_idx` (`challenge`)
);
