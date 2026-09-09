-- 0038: user follows (X-style one-way graph; mutual = both directions)
CREATE TABLE IF NOT EXISTS `userFollows` (
  `id` int AUTO_INCREMENT NOT NULL,
  `followerUserId` int NOT NULL,
  `followingUserId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `userFollows_id` PRIMARY KEY(`id`),
  CONSTRAINT `userFollows_followerUserId_users_id_fk` FOREIGN KEY (`followerUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `userFollows_followingUserId_users_id_fk` FOREIGN KEY (`followingUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  UNIQUE INDEX `user_follows_pair_unique`(`followerUserId`, `followingUserId`),
  INDEX `user_follows_following_idx`(`followingUserId`)
);
