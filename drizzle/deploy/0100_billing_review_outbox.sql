-- D-067 owner-approved recovery. Additive, safe for old binaries. No backfill.
CREATE TABLE IF NOT EXISTS `billingReviewOutbox` (
 `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
 `obligationKey` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `payload` text NULL,
 `conflictDigest` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `envelope` text NULL,
 `submissionState` varchar(20) NOT NULL DEFAULT 'never_submitted',
 `updatedAt` timestamp(3) NOT NULL,
 `status` varchar(16) NOT NULL DEFAULT 'pending',
 `attempts` int NOT NULL DEFAULT 0,
 `nextAttemptAt` timestamp(3) NOT NULL,
 `leaseOwner` varchar(64) NULL,
 `leaseUntil` timestamp(3) NULL,
 `firstAttemptAt` timestamp(3) NULL,
 `acceptedAt` timestamp(3) NULL,
 `providerMessageId` varchar(255) NULL,
 `lastError` varchar(80) NULL,
 `createdAt` timestamp(3) NOT NULL,
 UNIQUE INDEX `billing_review_obligation_unique` (`obligationKey`),
 INDEX `billing_review_due_idx` (`status`, `nextAttemptAt`, `id`)
) ENGINE=InnoDB;
