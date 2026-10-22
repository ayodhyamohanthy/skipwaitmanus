-- 0108: queue row 20 slices C+D, the kit landed journey and the private
-- thank-you wall (docs/KIT_V4_BUILD_PLAN.md section 3b row 20,
-- docs/KIT_V4_AUDIT.md 10_landed__* and 12_referrer-home__*). Additive only:
-- one new table, no column changes to any existing table.
--   landedJourney  one row per ask that ended with a hire: the seeker's
--   thank-you, whether the referrer may keep it on their private wall, and the
--   pay-it-forward answer. deliveredAt is the claim that makes the note reach
--   the thread at most once; conversationMessageId records the message it
--   produced. Historic hires simply have no row, so no thank-you or wall entry
--   is invented for them.
-- CREATE TABLE IF NOT EXISTS makes a re-run a no-op; the deploy pipeline applies
-- the file once (scripts/apply-deploy-migrations.sh).

CREATE TABLE IF NOT EXISTS `landedJourney` (
  `id` int AUTO_INCREMENT NOT NULL,
  `referralRequestId` int NOT NULL,
  `seekerUserId` int NOT NULL,
  `referrerUserId` int NOT NULL,
  `thankYouMessage` text NULL,
  `shareOnWall` boolean NOT NULL DEFAULT false,
  `payForwardChoice` varchar(12) NULL,
  `deliveredAt` timestamp NULL,
  `conversationMessageId` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `landedJourney_id` PRIMARY KEY(`id`),
  UNIQUE INDEX `landed_journey_request_unique`(`referralRequestId`),
  INDEX `landed_journey_referrer_wall_idx`(`referrerUserId`,`shareOnWall`),
  CONSTRAINT `landed_journey_request_fk` FOREIGN KEY (`referralRequestId`) REFERENCES `referralRequests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `landed_journey_seeker_fk` FOREIGN KEY (`seekerUserId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `landed_journey_referrer_fk` FOREIGN KEY (`referrerUserId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
