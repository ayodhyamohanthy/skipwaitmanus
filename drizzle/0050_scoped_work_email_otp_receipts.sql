CREATE TABLE IF NOT EXISTS `workEmailOtpReceipts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `receiptHash` varchar(64) NOT NULL,
  `email` varchar(320) NOT NULL,
  `userId` int NOT NULL,
  `purpose` enum('work_email_enrollment') NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `usedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `workEmailOtpReceipts_id` PRIMARY KEY(`id`),
  CONSTRAINT `work_email_otp_receipt_hash_unique` UNIQUE(`receiptHash`),
  INDEX `work_email_otp_receipt_scope_idx` (`userId`,`purpose`,`expiresAt`)
);
