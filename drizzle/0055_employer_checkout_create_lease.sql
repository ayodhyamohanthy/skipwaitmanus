ALTER TABLE `employerPaymentFulfillments`
  MODIFY COLUMN `status` enum('creating','provider_create_in_progress','pending','processing','credited','requires_review','expired','canceled') NOT NULL DEFAULT 'creating',
  ADD COLUMN `createLeaseOwner` varchar(64) NULL,
  ADD COLUMN `createLeaseExpiresAt` timestamp NULL;
CREATE INDEX `employer_payment_create_lease_idx` ON `employerPaymentFulfillments` (`status`,`createLeaseExpiresAt`);
