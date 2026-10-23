-- 0107: D-148 - the level a seeker picks for themselves (L1-L10), used only to
-- show "Who you can ask" on the plans page. Additive only: one new table, no
-- change to any existing table or row. Empty until a seeker picks a level;
-- nothing is inferred or backfilled. No money behaviour.
CREATE TABLE IF NOT EXISTS `seekerLevels` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `level` int NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `seekerLevels_id` PRIMARY KEY(`id`),
  UNIQUE INDEX `seeker_levels_user_unique`(`userId`),
  CONSTRAINT `seeker_levels_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
