-- Resume-safe employer checkout intents migration.
DELIMITER $$
DROP PROCEDURE IF EXISTS `apply_0054_employer_checkout_intents`$$
CREATE PROCEDURE `apply_0054_employer_checkout_intents`()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='employerPaymentFulfillments' AND column_name='checkoutKey') THEN ALTER TABLE `employerPaymentFulfillments` ADD COLUMN `checkoutKey` varchar(64) NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='employerPaymentFulfillments' AND column_name='fingerprint') THEN ALTER TABLE `employerPaymentFulfillments` ADD COLUMN `fingerprint` varchar(64) NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='employerPaymentFulfillments' AND column_name='providerReceipt') THEN ALTER TABLE `employerPaymentFulfillments` ADD COLUMN `providerReceipt` varchar(40) NULL; END IF;
  ALTER TABLE `employerPaymentFulfillments` MODIFY COLUMN `providerOrderId` varchar(255) NULL;
  ALTER TABLE `employerPaymentFulfillments` MODIFY COLUMN `status` enum('creating','pending','processing','credited','requires_review','expired','canceled') NOT NULL DEFAULT 'creating';

  UPDATE `employerPaymentFulfillments`
  SET `checkoutKey`=COALESCE(`checkoutKey`,CONCAT('legacy-',id)),
      `fingerprint`=COALESCE(`fingerprint`,SHA2(CONCAT(userId,'|',pack,'|',amount,'|',currency),256)),
      `providerReceipt`=COALESCE(`providerReceipt`,CONCAT('legacy_',id))
  WHERE `checkoutKey` IS NULL OR `fingerprint` IS NULL OR `providerReceipt` IS NULL;

  ALTER TABLE `employerPaymentFulfillments` MODIFY COLUMN `checkoutKey` varchar(64) NOT NULL;
  ALTER TABLE `employerPaymentFulfillments` MODIFY COLUMN `fingerprint` varchar(64) NOT NULL;
  ALTER TABLE `employerPaymentFulfillments` MODIFY COLUMN `providerReceipt` varchar(40) NOT NULL;
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='employerPaymentFulfillments' AND index_name='employer_payment_checkout_key_unique') THEN ALTER TABLE `employerPaymentFulfillments` ADD UNIQUE INDEX `employer_payment_checkout_key_unique` (`userId`,`checkoutKey`); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='employerPaymentFulfillments' AND index_name='employer_payment_provider_receipt_unique') THEN ALTER TABLE `employerPaymentFulfillments` ADD UNIQUE INDEX `employer_payment_provider_receipt_unique` (`provider`,`providerReceipt`); END IF;
END$$
CALL `apply_0054_employer_checkout_intents`()$$
DROP PROCEDURE `apply_0054_employer_checkout_intents`$$
DELIMITER ;

-- Production applied and verified 2026-09-18; keep resume-safe for recovery.
