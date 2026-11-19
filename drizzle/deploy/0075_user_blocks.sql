-- 0075: self-serve user blocks (one-way block graph; enforcement lands separately).
-- Additive only: new table, no changes to existing tables.
CREATE TABLE IF NOT EXISTS `userBlocks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `blockerUserId` int NOT NULL,
  `blockedUserId` int NOT NULL,
  `reason` varchar(255) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `userBlocks_id` PRIMARY KEY(`id`),
  CONSTRAINT `userBlocks_blockerUserId_users_id_fk` FOREIGN KEY (`blockerUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `userBlocks_blockedUserId_users_id_fk` FOREIGN KEY (`blockedUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  UNIQUE INDEX `user_blocks_pair_unique`(`blockerUserId`, `blockedUserId`),
  INDEX `user_blocks_blocked_idx`(`blockedUserId`)
);
