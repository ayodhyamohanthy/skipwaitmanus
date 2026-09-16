ALTER TABLE `tokenTransactions` ADD `rewardStatus` enum('pending','granted');--> statement-breakpoint
ALTER TABLE `tokenTransactions` ADD `qualifiedByType` varchar(40);--> statement-breakpoint
ALTER TABLE `tokenTransactions` ADD `qualifiedById` varchar(80);--> statement-breakpoint
ALTER TABLE `tokenTransactions` ADD `qualifiedAt` timestamp;
