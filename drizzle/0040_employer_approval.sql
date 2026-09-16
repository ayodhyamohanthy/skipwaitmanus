ALTER TABLE `employerAccounts` ADD `approvalStatus` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending';
ALTER TABLE `employerAccounts` ADD `approvedAt` timestamp NULL;
ALTER TABLE `employerAccounts` ADD `approvedByUserId` int NULL;
ALTER TABLE `employerAccounts` ADD CONSTRAINT `employerAccounts_approvedByUserId_users_id_fk` FOREIGN KEY (`approvedByUserId`) REFERENCES `users`(`id`) ON DELETE set null;
