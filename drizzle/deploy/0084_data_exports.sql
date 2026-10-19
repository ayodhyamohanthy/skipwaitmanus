-- Async personal-data export (queue task 4a, kit data-export-async). Additive only: one new table.
-- A request row is built into a ZIP by the hourly data-export-sweep job, held as a size-capped
-- blob for 7 days, then the blob is dropped. Nothing here touches credits, asks or email.
CREATE TABLE IF NOT EXISTS `dataExports` (
 `id` int AUTO_INCREMENT,
 `userId` int NOT NULL,
 `status` varchar(16) NOT NULL DEFAULT 'requested',
 `activeKey` varchar(40) NULL,
 `fileName` varchar(120) NULL,
 `byteSize` int NOT NULL DEFAULT 0,
 `zipData` longblob NULL,
 `failureNote` varchar(200) NULL,
 `requestedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `readyAt` timestamp NULL DEFAULT NULL,
 `expiresAt` timestamp NULL DEFAULT NULL,
 CONSTRAINT `dataExports_id` PRIMARY KEY(`id`),
 CONSTRAINT `data_exports_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 UNIQUE INDEX `data_exports_active_unique`(`activeKey`),
 INDEX `data_exports_user_idx`(`userId`, `requestedAt`)
);
