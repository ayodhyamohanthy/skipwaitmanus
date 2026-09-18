CREATE TABLE IF NOT EXISTS `opportunitySponsorshipPurchases` (
  `id` int AUTO_INCREMENT NOT NULL,
  `idempotencyKey` varchar(64) NOT NULL,
  `opportunityId` int NOT NULL,
  `opportunityOwnerId` int NOT NULL,
  `chargedUserId` int NOT NULL,
  `actorUserId` int NOT NULL,
  `tier` enum('featured','spotlight') NOT NULL,
  `creditsSpent` int NOT NULL,
  `startsAt` timestamp NOT NULL,
  `endsAt` timestamp NOT NULL,
  `opportunityUpdatedAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `opportunitySponsorshipPurchases_id` PRIMARY KEY(`id`),
  CONSTRAINT `opportunity_sponsorship_purchase_idempotency_unique` UNIQUE(`chargedUserId`,`idempotencyKey`),
  INDEX `opportunity_sponsorship_delivery_idx` (`opportunityId`,`endsAt`)
);
