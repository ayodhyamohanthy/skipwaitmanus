-- #90 audit: the referrer hot path filters profiles on a triple the
-- lone profiles_user_id_unique index cannot serve:
--   eligible candidates (server/db.ts:764) and referrer review
--   notifications (server/db.ts:2141): WHERE accountType = 'referrer'
--   AND workEmailDomain = ? AND workEmailVerifiedAt IS NOT NULL
--   verified-domain scans (server/db.ts:554, listReferrerEnrollmentsAwaitingAction
--   server/db.ts:2378): WHERE accountType = 'referrer' AND workEmailVerifiedAt
--   IS NOT NULL
-- A composite (accountType, workEmailDomain, workEmailVerifiedAt) index lets
-- MySQL walk the referrer rows for a domain directly instead of scanning the
-- whole profiles table. Idempotent; the running API's recovery loop
-- re-validates and turns ready.
SET @pro_idx_sql=IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='profiles' AND index_name='profiles_referrer_hot_idx')=0,'ALTER TABLE `profiles` ADD INDEX `profiles_referrer_hot_idx` (`accountType`,`workEmailDomain`,`workEmailVerifiedAt`)','SELECT 1');
PREPARE pro_idx_stmt FROM @pro_idx_sql;EXECUTE pro_idx_stmt;DEALLOCATE PREPARE pro_idx_stmt;
