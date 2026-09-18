CREATE TABLE IF NOT EXISTS `canonicalPeople` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `normalizedVerifiedEmail` varchar(320) NULL,
  `suspended` boolean NOT NULL DEFAULT false,
  `sessionsValidAfter` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewReason` varchar(255) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `canonical_people_verified_email_unique` (`normalizedVerifiedEmail`)
);
SET @identity_column_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='canonicalPersonId')=0, 'ALTER TABLE `users` ADD COLUMN `canonicalPersonId` int NULL', 'SELECT 1');
PREPARE identity_column_stmt FROM @identity_column_sql;
EXECUTE identity_column_stmt;
DEALLOCATE PREPARE identity_column_stmt;
SET @identity_idx_sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='users' AND index_name='users_canonical_person_idx')=0, 'CREATE INDEX `users_canonical_person_idx` ON `users` (`canonicalPersonId`)', 'SELECT 1');
PREPARE identity_idx_stmt FROM @identity_idx_sql;
EXECUTE identity_idx_stmt;
DEALLOCATE PREPARE identity_idx_stmt;
SET @identity_fk_sql = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='users' AND constraint_name='users_canonical_person_fk')=0, 'ALTER TABLE `users` ADD CONSTRAINT `users_canonical_person_fk` FOREIGN KEY (`canonicalPersonId`) REFERENCES `canonicalPeople` (`id`) ON DELETE RESTRICT', 'SELECT 1');
PREPARE identity_fk_stmt FROM @identity_fk_sql;
EXECUTE identity_fk_stmt;
DEALLOCATE PREPARE identity_fk_stmt;
CREATE TABLE IF NOT EXISTS `verifiedLoginAliases` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `provider` varchar(32) NOT NULL,
  `subject` varchar(255) NOT NULL,
  `openId` varchar(64) NOT NULL,
  `canonicalPersonId` int NOT NULL,
  `canonicalUserId` int NOT NULL,
  `normalizedVerifiedEmail` varchar(320) NULL,
  `verifiedAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX `verified_login_alias_provider_subject_unique` (`provider`,`subject`),
  UNIQUE INDEX `verified_login_alias_open_id_unique` (`openId`),
  INDEX `verified_login_alias_person_idx` (`canonicalPersonId`),
  CONSTRAINT `verified_login_alias_person_fk` FOREIGN KEY (`canonicalPersonId`) REFERENCES `canonicalPeople` (`id`) ON DELETE CASCADE,
  CONSTRAINT `verified_login_alias_user_fk` FOREIGN KEY (`canonicalUserId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS `identityLinkAudits` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `canonicalPersonId` int NULL,
  `canonicalUserId` int NULL,
  `provider` varchar(32) NULL,
  `subject` varchar(255) NULL,
  `action` varchar(80) NOT NULL,
  `evidence` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `identity_link_audit_person_idx` (`canonicalPersonId`,`createdAt`)
);

-- Migration is deliberately non-merging. Historic duplicate email rows are
-- frozen for an operator; wallets, referrals, roles, payments and consent stay put.
INSERT INTO `identityLinkAudits` (`canonicalUserId`,`action`,`evidence`)
SELECT u.`id`, 'historic_duplicate_email_frozen', JSON_OBJECT('emailHash', SHA2(LOWER(TRIM(u.`email`)),256))
FROM `users` u
JOIN (SELECT LOWER(TRIM(`email`)) AS e FROM `users` WHERE `email` IS NOT NULL GROUP BY LOWER(TRIM(`email`)) HAVING COUNT(*) > 1) d
  ON LOWER(TRIM(u.`email`)) = d.e
WHERE NOT EXISTS (SELECT 1 FROM `identityLinkAudits` a WHERE a.`canonicalUserId`=u.`id` AND a.`action`='historic_duplicate_email_frozen');
UPDATE `users` u
JOIN `identityLinkAudits` a ON a.`canonicalUserId`=u.`id` AND a.`action`='historic_duplicate_email_frozen'
SET u.`suspended` = true,
    u.`sessionsValidAfter` = IF(u.`suspended`, u.`sessionsValidAfter`, CURRENT_TIMESTAMP)
WHERE u.`suspended` = false;
