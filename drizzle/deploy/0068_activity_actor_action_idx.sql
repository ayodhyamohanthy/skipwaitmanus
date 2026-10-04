-- #90 audit: the upload rate-limit check filters on a triple the
-- single-column actor/action indexes cannot serve together:
--   getRecentUploadStartedCount: WHERE actorUserId = ? AND action = ?
--   AND createdAt > ? ORDER BY createdAt DESC LIMIT 30
-- A composite (actorUserId, action, createdAt) index lets MySQL walk only
-- that actor's rows for that action instead of merging two index scans.
-- Idempotent; the running API's recovery loop re-validates and turns ready.
SET @act_idx_sql=IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='operationalActivityLogs' AND index_name='operational_activity_actor_action_created_idx')=0,'ALTER TABLE `operationalActivityLogs` ADD INDEX `operational_activity_actor_action_created_idx` (`actorUserId`,`action`,`createdAt`)','SELECT 1');
PREPARE act_idx_stmt FROM @act_idx_sql;EXECUTE act_idx_stmt;DEALLOCATE PREPARE act_idx_stmt;
