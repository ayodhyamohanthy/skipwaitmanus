ALTER TABLE `referralRequests` ADD `savedAt` timestamp;--> statement-breakpoint
CREATE INDEX `referral_requests_saved_idx` ON `referralRequests` (`savedAt`);