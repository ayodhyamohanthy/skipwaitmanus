-- #90 audit: the public jobs catalog (server/db.ts:685) orders the whole
-- jobs table by publishedAt DESC on every read; the table previously had
-- only company and location indexes, so the listing did a full filesort.
-- A single-column publishedAt index lets MySQL walk the rows in order.
-- The list itself is still unbounded by design (filters run in JS on the
-- full candidate set), so this does not cap what the endpoint returns.
-- Idempotent; the running API's recovery loop re-validates and turns ready.
SET @job_idx_sql=IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='jobs' AND index_name='jobs_published_at_idx')=0,'ALTER TABLE `jobs` ADD INDEX `jobs_published_at_idx` (`publishedAt`)','SELECT 1');
PREPARE job_idx_stmt FROM @job_idx_sql;EXECUTE job_idx_stmt;DEALLOCATE PREPARE job_idx_stmt;
