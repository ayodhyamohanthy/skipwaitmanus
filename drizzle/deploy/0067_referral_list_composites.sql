-- #90 audit: listReferralRequests filters on either side of the request and
-- sorts by recency:
--   WHERE jobSeekerId = ? OR referrerId = ? ORDER BY updatedAt DESC
-- The single-column seeker/referrer indexes cannot serve the OR pair, so
-- MySQL merges them and filesorts the result on the largest table. Composite
-- (owner, updatedAt) indexes on both sides narrow the retrieval for each
-- branch of the OR.
-- Idempotent; the running API's recovery loop re-validates and turns ready.
SET @ref_idx_sql=IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='referralRequests' AND index_name='referral_requests_seeker_updated_idx')=0,'ALTER TABLE `referralRequests` ADD INDEX `referral_requests_seeker_updated_idx` (`jobSeekerId`,`updatedAt`)','SELECT 1');
PREPARE ref_idx_stmt FROM @ref_idx_sql;EXECUTE ref_idx_stmt;DEALLOCATE PREPARE ref_idx_stmt;
SET @ref_idx_sql=IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='referralRequests' AND index_name='referral_requests_referrer_updated_idx')=0,'ALTER TABLE `referralRequests` ADD INDEX `referral_requests_referrer_updated_idx` (`referrerId`,`updatedAt`)','SELECT 1');
PREPARE ref_idx_stmt FROM @ref_idx_sql;EXECUTE ref_idx_stmt;DEALLOCATE PREPARE ref_idx_stmt;
