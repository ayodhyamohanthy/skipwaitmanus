ALTER TABLE `tokenBalances` DROP COLUMN `stripeCustomerId`;
--> statement-breakpoint
ALTER TABLE `tokenTransactions` DROP COLUMN `stripeCheckoutSessionId`;
