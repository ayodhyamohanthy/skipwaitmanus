-- Ask drafts (queue task 11, kit company-door request dialog). Additive only:
-- one new table. A seeker's saved job link + fit note, one draft per user,
-- continued on /ask. Nothing here sends an ask or touches credits. The app
-- writes timestamps from the JS clock; createdAt only carries a default.
CREATE TABLE IF NOT EXISTS `askDrafts` (
 `id` int AUTO_INCREMENT,
 `userId` int NOT NULL,
 `companySlug` varchar(64) NOT NULL,
 `targetRoleUrl` varchar(2048) NOT NULL,
 `note` varchar(600) NOT NULL DEFAULT '',
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT `askDrafts_id` PRIMARY KEY(`id`),
 CONSTRAINT `ask_drafts_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 UNIQUE INDEX `ask_drafts_user_unique`(`userId`)
);
