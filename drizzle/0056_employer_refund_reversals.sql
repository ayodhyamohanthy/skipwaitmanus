ALTER TABLE `employerAccounts` ADD COLUMN `creditDebt` int NOT NULL DEFAULT 0;
ALTER TABLE `employerPaymentFulfillments` ADD COLUMN `refundedAmount` int NOT NULL DEFAULT 0, ADD COLUMN `refundedCredits` int NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS `employerPaymentRefunds` (
 `id` int AUTO_INCREMENT PRIMARY KEY, `provider` varchar(32) NOT NULL, `providerRefundId` varchar(255) NOT NULL,
 `providerPaymentId` varchar(255) NOT NULL, `providerOrderId` varchar(255) NULL, `fulfillmentId` int NULL,
 `amount` int NOT NULL, `currency` varchar(3) NOT NULL, `creditsReversed` int NOT NULL DEFAULT 0,
 `status` enum('applied','requires_review') NOT NULL, `reason` varchar(255) NULL, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE INDEX `employer_payment_refund_event_unique` (`provider`,`providerRefundId`), INDEX `employer_payment_refund_payment_idx` (`provider`,`providerPaymentId`)
);

-- Production applied and verified 2026-09-18.
