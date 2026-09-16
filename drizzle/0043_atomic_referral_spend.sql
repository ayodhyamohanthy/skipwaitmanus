ALTER TABLE `referralRequests` ADD COLUMN `idempotencyKey` varchar(64), ADD COLUMN `requestFingerprint` varchar(64), ADD COLUMN `debitTransactionId` int;
--> statement-breakpoint
CREATE UNIQUE INDEX `referral_requests_seeker_idempotency_unique` ON `referralRequests` (`jobSeekerId`,`idempotencyKey`);
--> statement-breakpoint
ALTER TABLE `tokenTransactions` ADD COLUMN `source` varchar(40), ADD COLUMN `sourceCycleKey` varchar(16), ADD COLUMN `referenceType` varchar(40), ADD COLUMN `referenceId` varchar(80), ADD COLUMN `idempotencyKey` varchar(64), ADD COLUMN `reversesTransactionId` int, ADD COLUMN `balanceAfter` int, ADD COLUMN `monthlyCreditsAfter` int;
--> statement-breakpoint
CREATE UNIQUE INDEX `token_transactions_debit_reference_unique` ON `tokenTransactions` (`userId`,`role`,`kind`,`referenceType`,`referenceId`);
--> statement-breakpoint
CREATE UNIQUE INDEX `token_transactions_idempotency_kind_unique` ON `tokenTransactions` (`userId`,`role`,`idempotencyKey`,`kind`);
--> statement-breakpoint
CREATE UNIQUE INDEX `token_transactions_reversal_unique` ON `tokenTransactions` (`reversesTransactionId`);
--> statement-breakpoint
ALTER TABLE `companyCoverageInvitations` ADD COLUMN `referralRequestId` int;
--> statement-breakpoint
CREATE UNIQUE INDEX `coverage_invite_request_unique` ON `companyCoverageInvitations` (`referralRequestId`);
