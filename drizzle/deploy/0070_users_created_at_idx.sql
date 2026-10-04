-- #90 audit: the admin user directory (server/db.ts:203) orders the whole
-- users table by createdAt DESC on every read; the table previously had
-- only the canonical-person index, so the newest-first page did a full
-- filesort. A single-column createdAt index lets MySQL walk the rows in
-- order and stop at the page limit.
-- Idempotent; the running API's recovery loop re-validates and turns ready.
SET @usr_idx_sql=IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='users' AND index_name='users_created_at_idx')=0,'ALTER TABLE `users` ADD INDEX `users_created_at_idx` (`createdAt`)','SELECT 1');
PREPARE usr_idx_stmt FROM @usr_idx_sql;EXECUTE usr_idx_stmt;DEALLOCATE PREPARE usr_idx_stmt;
