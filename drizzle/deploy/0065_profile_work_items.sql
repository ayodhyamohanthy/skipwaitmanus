-- Profile showcase (kit: /profile, /work, /p/:handle).
-- Additive only: two nullable profile columns and one new table.
-- Reconcile self-heals via DESIRED_TABLES/DESIRED_COLUMNS; this file is what
-- the deploy pipeline applies (see server/schemaDeployGuard.test.ts).
-- Every ALTER/CREATE INDEX is guarded by information_schema so the file is
-- safe to re-run.
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'handle');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `profiles` ADD COLUMN `handle` varchar(40) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'profileVisibility');
SET @ddl = IF(@col_exists = 0, 'ALTER TABLE `profiles` ADD COLUMN `profileVisibility` ENUM(''public'',''link'',''private'') NOT NULL DEFAULT ''private''', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND INDEX_NAME = 'profiles_handle_unique');
SET @ddl = IF(@idx_exists = 0, 'CREATE UNIQUE INDEX `profiles_handle_unique` ON `profiles` (`handle`)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
CREATE TABLE IF NOT EXISTS `workItems` (
 `id` int AUTO_INCREMENT PRIMARY KEY,
 `userId` int NOT NULL,
 `title` varchar(160) NOT NULL,
 `kind` ENUM('case_study','project','article','code','other') NOT NULL DEFAULT 'other',
 `source` varchar(80) NULL,
 `url` varchar(2048) NULL,
 `pinned` boolean NOT NULL DEFAULT false,
 `visibleOnProfile` boolean NOT NULL DEFAULT false,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT `workItems_id` PRIMARY KEY(`id`),
 CONSTRAINT `work_items_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 INDEX `work_items_user_idx`(`userId`)
);
