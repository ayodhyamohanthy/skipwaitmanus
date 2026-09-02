ALTER TABLE `paymentFulfillments` MODIFY `status` ENUM('pending', 'credited', 'requires_review', 'rejected', 'refunded') NOT NULL DEFAULT 'pending';
