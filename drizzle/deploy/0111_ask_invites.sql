-- 0111: D-090 BYOR — a seeker's own insider gets a one-time link to a waiting ask.
-- (D-162 waives the D-086 build gate; the packet is docs/plans/D-090-BYOR.md.)
-- Additive only: one new table, no change to any existing table or row. With
-- BYOR_LINK_ENABLED off nothing writes here and every surface answers 404.
--
-- Only the SHA-256 of the token is stored, never the token itself. `activeRequestKey`
-- carries `link:<requestId>` while a link is live and NULL once it is not, so the
-- unique index enforces "at most one active link per ask" the same way
-- referralAvailabilitySlots enforces one active slot.
CREATE TABLE IF NOT EXISTS `askInviteLinks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `referralRequestId` int NOT NULL,
  `createdByUserId` int NOT NULL,
  `linkTokenHash` varchar(64) NOT NULL,
  `status` enum('active','claimed','delivered','revoked','expired') NOT NULL DEFAULT 'active',
  `claimedByUserId` int NULL,
  `claimedAt` timestamp NULL,
  `reservationExpiresAt` timestamp NULL,
  `activeRequestKey` varchar(64) NULL,
  `expiresAt` timestamp NOT NULL,
  `closedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `askInviteLinks_id` PRIMARY KEY(`id`),
  UNIQUE INDEX `ask_invites_token_hash_unique`(`linkTokenHash`),
  UNIQUE INDEX `ask_invites_active_request_unique`(`activeRequestKey`),
  INDEX `ask_invites_request_idx`(`referralRequestId`),
  INDEX `ask_invites_status_expiry_idx`(`status`,`expiresAt`),
  INDEX `ask_invites_creator_created_idx`(`createdByUserId`,`createdAt`),
  CONSTRAINT `ask_invites_request_fk` FOREIGN KEY (`referralRequestId`) REFERENCES `referralRequests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ask_invites_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ask_invites_claimer_fk` FOREIGN KEY (`claimedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
