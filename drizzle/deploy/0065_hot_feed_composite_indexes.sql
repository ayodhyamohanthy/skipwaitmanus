-- #90 audit: the two hottest feed queries filter and sort in a way the
-- single-column indexes cannot serve:
--   listNotifications: WHERE userId = ? ORDER BY createdAt DESC
--   countRecentMessagesBySender: WHERE senderId = ? AND createdAt > ?
-- Composite indexes let MySQL walk the range instead of sorting rows.
-- Idempotent; the running API's recovery loop re-validates and turns ready.
SET @hot_idx_sql=IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='notifications' AND index_name='notifications_user_created_idx')=0,'ALTER TABLE `notifications` ADD INDEX `notifications_user_created_idx` (`userId`,`createdAt`)','SELECT 1');
PREPARE hot_idx_stmt FROM @hot_idx_sql;EXECUTE hot_idx_stmt;DEALLOCATE PREPARE hot_idx_stmt;
SET @hot_idx_sql=IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='messages' AND index_name='messages_sender_created_idx')=0,'ALTER TABLE `messages` ADD INDEX `messages_sender_created_idx` (`senderId`,`createdAt`)','SELECT 1');
PREPARE hot_idx_stmt FROM @hot_idx_sql;EXECUTE hot_idx_stmt;DEALLOCATE PREPARE hot_idx_stmt;
