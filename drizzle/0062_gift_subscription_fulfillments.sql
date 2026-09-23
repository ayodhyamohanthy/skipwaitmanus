CREATE TABLE IF NOT EXISTS `giftSubscriptionFulfillments` (
 `id` int AUTO_INCREMENT PRIMARY KEY, `giftId` varchar(150) NOT NULL, `provider` varchar(32) NOT NULL DEFAULT 'chargebee',
 `buyerUserId` int NULL, `receiverEmail` varchar(70) NULL, `recipientUserId` int NULL,
 `role` ENUM('job_seeker','referrer') NOT NULL DEFAULT 'job_seeker', `plan` ENUM('pro','max') NOT NULL,
 `currency` varchar(3) NOT NULL, `amount` int NOT NULL, `subscriptionId` varchar(80) NULL,
 `providerStatus` varchar(20) NULL, `fulfillmentStatus` ENUM('pending','credited','conflict','expired','cancelled') NOT NULL DEFAULT 'pending',
 `failureReason` varchar(255) NULL, `creditedAt` timestamp NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE INDEX `gift_fulfillment_gift_unique` (`giftId`),
 INDEX `gift_fulfillment_receiver_idx` (`receiverEmail`,`fulfillmentStatus`),
 INDEX `gift_fulfillment_buyer_idx` (`buyerUserId`,`createdAt`),
 INDEX `gift_fulfillment_subscription_idx` (`subscriptionId`),
 CONSTRAINT `gift_fulfillment_buyer_fk` FOREIGN KEY (`buyerUserId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 CONSTRAINT `gift_fulfillment_recipient_fk` FOREIGN KEY (`recipientUserId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
