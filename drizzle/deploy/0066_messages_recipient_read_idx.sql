-- #90 audit: the unread-count query filters on a pair the single-column
-- recipient index cannot serve:
--   getReferrerImpactSummary: WHERE recipientId = ? AND readAt IS NULL
-- A composite (recipientId, readAt) index lets MySQL walk only that
-- recipient's unread rows instead of filtering their full history.
-- Idempotent; the running API's recovery loop re-validates and turns ready.
SET @unread_idx_sql=IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='messages' AND index_name='messages_recipient_read_idx')=0,'ALTER TABLE `messages` ADD INDEX `messages_recipient_read_idx` (`recipientId`,`readAt`)','SELECT 1');
PREPARE unread_idx_stmt FROM @unread_idx_sql;EXECUTE unread_idx_stmt;DEALLOCATE PREPARE unread_idx_stmt;
