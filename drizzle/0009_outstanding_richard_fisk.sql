ALTER TABLE `paymentFulfillments` ADD `checkoutIntentId` varchar(96);--> statement-breakpoint
CREATE INDEX `payment_fulfillments_intent_idx` ON `paymentFulfillments` (`provider`,`checkoutIntentId`);