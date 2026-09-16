CREATE TABLE IF NOT EXISTS `workEmailOtpRateLimits` (
  `id` int AUTO_INCREMENT NOT NULL,
  `limiterKey` varchar(96) NOT NULL,
  `windowStart` timestamp NOT NULL,
  `hitCount` int NOT NULL DEFAULT 1,
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `workEmailOtpRateLimits_id` PRIMARY KEY(`id`),
  UNIQUE INDEX `work_email_otp_rate_window_unique` (`limiterKey`,`windowStart`),
  INDEX `work_email_otp_rate_expiry_idx` (`expiresAt`)
);

CREATE INDEX `work_email_otp_active_idx` ON `workEmailOtpCodes` (`email`,`consumedAt`,`expiresAt`,`createdAt`);
