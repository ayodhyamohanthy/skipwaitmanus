ALTER TABLE `employerPaymentFulfillments`
  MODIFY COLUMN `providerOrderId` varchar(255) NULL,
  MODIFY COLUMN `status` enum('creating','pending','processing','credited','requires_review','expired','canceled') NOT NULL DEFAULT 'creating',
  ADD COLUMN `checkoutKey` varchar(64) NULL,
  ADD COLUMN `fingerprint` varchar(64) NULL,
  ADD COLUMN `providerReceipt` varchar(40) NULL;
UPDATE `employerPaymentFulfillments`
SET `checkoutKey`=CONCAT('legacy-',id), `fingerprint`=SHA2(CONCAT(userId,'|',pack,'|',amount,'|',currency),256), `providerReceipt`=CONCAT('legacy_',id),
    `status`=IF(`status`='pending','pending',`status`)
WHERE `checkoutKey` IS NULL OR `fingerprint` IS NULL OR `providerReceipt` IS NULL;
ALTER TABLE `employerPaymentFulfillments`
  MODIFY COLUMN `checkoutKey` varchar(64) NOT NULL,
  MODIFY COLUMN `fingerprint` varchar(64) NOT NULL,
  MODIFY COLUMN `providerReceipt` varchar(40) NOT NULL,
  ADD UNIQUE INDEX `employer_payment_checkout_key_unique` (`userId`,`checkoutKey`),
  ADD UNIQUE INDEX `employer_payment_provider_receipt_unique` (`provider`,`providerReceipt`);
