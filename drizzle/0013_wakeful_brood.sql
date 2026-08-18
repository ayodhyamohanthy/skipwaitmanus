ALTER TABLE `paymentFulfillments` ADD `status` enum('pending','credited','requires_review') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `paymentFulfillments` ADD `reconciliationReason` varchar(120);--> statement-breakpoint
ALTER TABLE `paymentFulfillments` ADD `lastCheckedAt` timestamp;--> statement-breakpoint
ALTER TABLE `paymentFulfillments` ADD `creditedAt` timestamp;--> statement-breakpoint
CREATE INDEX `payment_fulfillments_user_status_idx` ON `paymentFulfillments` (`userId`,`role`,`status`);