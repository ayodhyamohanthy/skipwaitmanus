ALTER TABLE `referralRequests` MODIFY `status` ENUM('pending', 'approved', 'declined', 'intro_made', 'interview', 'offer', 'closed', 'withdrawn') NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE `paymentFulfillments` MODIFY `status` ENUM('pending', 'credited', 'requires_review', 'rejected') NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE `tokenTransactions` MODIFY `kind` ENUM('purchase', 'direct_request', 'admin_adjustment', 'company_coverage_reward', 'personal_referral_reward', 'invite_reward_pending', 'invite_reward_granted', 'withdrawal_refund') NOT NULL;
