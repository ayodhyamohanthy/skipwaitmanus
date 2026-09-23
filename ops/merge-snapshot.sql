SELECT 'snap_user' AS kind, id, openId, canonicalPersonId, role, suspended, lastSignedIn FROM users WHERE id IN (5,6,7,22) ORDER BY id;
SELECT 'snap_wallet' AS kind, id, userId, role, balance, monthlyCreditsRemaining, monthlyCycleKey FROM tokenBalances WHERE userId IN (5,6,7,22) ORDER BY userId, role;
SELECT 'snap_profile' AS kind, id, userId, company FROM profiles WHERE userId IN (5,6,7,22) ORDER BY userId;
SELECT 'snap_request' AS kind, id, jobSeekerId, referrerId, status FROM referralRequests WHERE jobSeekerId IN (5,6,7,22) OR referrerId IN (5,6,7,22) ORDER BY id;
SELECT 'snap_emaillink' AS kind, id, referralRequestId, referrerId FROM referrerReviewEmailLinks WHERE referrerId IN (5,6,7,22) ORDER BY id;
SELECT 'snap_txn' AS kind, id, userId, role, tokenCount, kind FROM tokenTransactions WHERE userId IN (5,6,7,22) ORDER BY id;
SELECT 'snap_other' AS kind, 'notifications' t, userId u, COUNT(*) n FROM notifications WHERE userId IN (5,6,7,22) GROUP BY userId
 UNION ALL SELECT 'snap_other','activityLogs',actorUserId,COUNT(*) FROM operationalActivityLogs WHERE actorUserId IN (5,6,7,22) GROUP BY actorUserId
 UNION ALL SELECT 'snap_other','identityLinkAudits',canonicalUserId,COUNT(*) FROM identityLinkAudits WHERE canonicalUserId IN (5,6,7,22) GROUP BY canonicalUserId
 UNION ALL SELECT 'snap_other','personalReferralInvites',inviterUserId,COUNT(*) FROM personalReferralInvites WHERE inviterUserId IN (5,6,7,22) GROUP BY inviterUserId
 UNION ALL SELECT 'snap_other','referralAttachments',ownerId,COUNT(*) FROM referralAttachments WHERE ownerId IN (5,6,7,22) GROUP BY ownerId
 UNION ALL SELECT 'snap_other','resumeUploadSessions',ownerId,COUNT(*) FROM resumeUploadSessions WHERE ownerId IN (5,6,7,22) GROUP BY ownerId
 UNION ALL SELECT 'snap_other','referrerFastTrackLinks',referrerId,COUNT(*) FROM referrerFastTrackLinks WHERE referrerId IN (5,6,7,22) GROUP BY referrerId
 UNION ALL SELECT 'snap_other','users_total',NULL,COUNT(*) FROM users;
