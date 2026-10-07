-- Profile showcase (kit: /profile, /work, /p/:handle).
-- Additive only: two nullable profile columns and one new table.
-- Reconcile self-heals via DESIRED_TABLES/DESIRED_COLUMNS; this file is what
-- the deploy pipeline applies (see server/schemaDeployGuard.test.ts).
ALTER TABLE `profiles` ADD COLUMN `handle` varchar(40) NULL;
ALTER TABLE `profiles` ADD COLUMN `profileVisibility` ENUM('public','link','private') NOT NULL DEFAULT 'private';
CREATE UNIQUE INDEX `profiles_handle_unique` ON `profiles` (`handle`);
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
