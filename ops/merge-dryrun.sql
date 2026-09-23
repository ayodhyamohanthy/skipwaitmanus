-- Duplicate-account merge. Founder-approved (founder message 2026-09-23 08:22:38 IST: merge, no duplicates).
-- Mode: DRYRUN. Single transaction; any error aborts and rolls back.
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
START TRANSACTION;
-- ===== Merge founder: user 22 -> user 6
SELECT 'founder: both users exist, source unlinked' AS guard, IF((SELECT COUNT(*) FROM users WHERE id IN (22,6))=2 AND (SELECT canonicalPersonId FROM users WHERE id=22) IS NULL, 'ok', (SELECT 1 UNION SELECT 2)) AS result;
SELECT 'founder: source wallets carry no subscription' AS guard, IF((SELECT COUNT(*) FROM tokenBalances WHERE userId=22 AND subscriptionId IS NOT NULL)=0, 'ok', (SELECT 1 UNION SELECT 2)) AS result;
-- Wallets: one row per (user, role). Same role on both: fold into target (sum paid balance, keep the lower free-credit remainder so no free credits are re-granted), drop source row.
UPDATE tokenBalances dd JOIN tokenBalances ss ON ss.userId=22 AND ss.role=dd.role
  SET dd.balance = dd.balance + ss.balance, dd.monthlyCreditsRemaining = LEAST(dd.monthlyCreditsRemaining, ss.monthlyCreditsRemaining)
  WHERE dd.userId=6;
DELETE ss FROM tokenBalances ss JOIN tokenBalances dd ON dd.userId=6 AND dd.role=ss.role WHERE ss.userId=22;
-- Profiles: one per user. Target keeps its profile; source profile dropped when target has one.
DELETE ss FROM profiles ss JOIN profiles dd ON dd.userId=6 WHERE ss.userId=22;
-- Review email links: unique (request, referrer). Drop source duplicates of links the target already holds.
DELETE ss FROM referrerReviewEmailLinks ss JOIN referrerReviewEmailLinks dd ON dd.referrerId=6 AND dd.referralRequestId=ss.referralRequestId WHERE ss.referrerId=22;
-- Re-point every remaining user reference. Any other unique conflict raises a duplicate-key error and aborts the whole transaction.
UPDATE `adminTokenAdjustments` SET `adminUserId`=6 WHERE `adminUserId`=22;
UPDATE `adminTokenAdjustments` SET `recipientUserId`=6 WHERE `recipientUserId`=22;
UPDATE `companyCoverageInvitations` SET `inviterUserId`=6 WHERE `inviterUserId`=22;
UPDATE `companyCoverageInvitations` SET `joinerUserId`=6 WHERE `joinerUserId`=22;
UPDATE `companyCoverageRewards` SET `inviterUserId`=6 WHERE `inviterUserId`=22;
UPDATE `companyCoverageRewards` SET `joinerUserId`=6 WHERE `joinerUserId`=22;
UPDATE `companyOpportunities` SET `ownerId`=6 WHERE `ownerId`=22;
UPDATE `directMessageNotificationOutbox` SET `recipientId`=6 WHERE `recipientId`=22;
UPDATE `directMessageQuotaWindows` SET `senderId`=6 WHERE `senderId`=22;
UPDATE `employerAccounts` SET `approvedByUserId`=6 WHERE `approvedByUserId`=22;
UPDATE `employerAccounts` SET `userId`=6 WHERE `userId`=22;
UPDATE `employerPaymentFulfillments` SET `userId`=6 WHERE `userId`=22;
UPDATE `employerTalentIntroRequests` SET `employerUserId`=6 WHERE `employerUserId`=22;
UPDATE `employerTalentIntroRequests` SET `seekerProfileUserId`=6 WHERE `seekerProfileUserId`=22;
UPDATE `employerTalentRefs` SET `employerUserId`=6 WHERE `employerUserId`=22;
UPDATE `employerTalentRefs` SET `seekerProfileUserId`=6 WHERE `seekerProfileUserId`=22;
UPDATE `identityLinkAudits` SET `canonicalUserId`=6 WHERE `canonicalUserId`=22;
UPDATE `jobs` SET `referrerId`=6 WHERE `referrerId`=22;
UPDATE `messages` SET `recipientId`=6 WHERE `recipientId`=22;
UPDATE `messages` SET `senderId`=6 WHERE `senderId`=22;
UPDATE `notifications` SET `userId`=6 WHERE `userId`=22;
UPDATE `operationalActivityLogs` SET `actorUserId`=6 WHERE `actorUserId`=22;
UPDATE `opportunitySponsorshipPurchases` SET `actorUserId`=6 WHERE `actorUserId`=22;
UPDATE `opportunitySponsorshipPurchases` SET `chargedUserId`=6 WHERE `chargedUserId`=22;
UPDATE `paymentFulfillments` SET `userId`=6 WHERE `userId`=22;
UPDATE `personalReferralInvites` SET `inviterUserId`=6 WHERE `inviterUserId`=22;
UPDATE `personalReferralRewards` SET `inviterUserId`=6 WHERE `inviterUserId`=22;
UPDATE `personalReferralRewards` SET `joinerUserId`=6 WHERE `joinerUserId`=22;
UPDATE `privacyRequests` SET `reviewedByUserId`=6 WHERE `reviewedByUserId`=22;
UPDATE `privacyRequests` SET `userId`=6 WHERE `userId`=22;
UPDATE `profileUnlocks` SET `employerUserId`=6 WHERE `employerUserId`=22;
UPDATE `profileUnlocks` SET `seekerProfileUserId`=6 WHERE `seekerProfileUserId`=22;
UPDATE `profiles` SET `userId`=6 WHERE `userId`=22;
UPDATE `promoCreditGrants` SET `userId`=6 WHERE `userId`=22;
UPDATE `referralAttachments` SET `ownerId`=6 WHERE `ownerId`=22;
UPDATE `referralAvailabilitySlots` SET `referrerId`=6 WHERE `referrerId`=22;
UPDATE `referralDocumentAccessGrants` SET `referrerId`=6 WHERE `referrerId`=22;
UPDATE `referralRequestPasses` SET `referrerId`=6 WHERE `referrerId`=22;
UPDATE `referralRequestSaves` SET `referrerId`=6 WHERE `referrerId`=22;
UPDATE `referralRequests` SET `jobSeekerId`=6 WHERE `jobSeekerId`=22;
UPDATE `referralRequests` SET `referrerId`=6 WHERE `referrerId`=22;
UPDATE `referralReviewDeliveries` SET `referrerId`=6 WHERE `referrerId`=22;
UPDATE `referralReviewGrantRotations` SET `actorUserId`=6 WHERE `actorUserId`=22;
UPDATE `referralReviewGrantRotations` SET `referrerId`=6 WHERE `referrerId`=22;
UPDATE `referralShareCards` SET `createdByUserId`=6 WHERE `createdByUserId`=22;
UPDATE `referralTransitionEvents` SET `actorUserId`=6 WHERE `actorUserId`=22;
UPDATE `referrerFastTrackLinks` SET `referrerId`=6 WHERE `referrerId`=22;
UPDATE `referrerReviewEmailLinks` SET `referrerId`=6 WHERE `referrerId`=22;
UPDATE `referrerSlackWebhooks` SET `referrerId`=6 WHERE `referrerId`=22;
UPDATE `resumeUploadSessions` SET `ownerId`=6 WHERE `ownerId`=22;
UPDATE `savedRoles` SET `jobSeekerId`=6 WHERE `jobSeekerId`=22;
UPDATE `subscriptionCheckoutIntents` SET `userId`=6 WHERE `userId`=22;
UPDATE `talentDiscoveryConsents` SET `seekerUserId`=6 WHERE `seekerUserId`=22;
UPDATE `tokenBalances` SET `userId`=6 WHERE `userId`=22;
UPDATE `tokenTransactions` SET `userId`=6 WHERE `userId`=22;
UPDATE `userFollows` SET `followerUserId`=6 WHERE `followerUserId`=22;
UPDATE `userFollows` SET `followingUserId`=6 WHERE `followingUserId`=22;
UPDATE `verifiedLoginAliases` SET `canonicalUserId`=6 WHERE `canonicalUserId`=22;
UPDATE `workEmailOtpReceipts` SET `userId`=6 WHERE `userId`=22;
UPDATE users dd JOIN users ss ON ss.id=22 SET dd.lastSignedIn = GREATEST(dd.lastSignedIn, ss.lastSignedIn) WHERE dd.id=6;
SELECT 'founder: zero references left on source before delete' AS guard, IF(((SELECT COUNT(*) FROM `adminTokenAdjustments` WHERE `adminUserId`=22) + (SELECT COUNT(*) FROM `adminTokenAdjustments` WHERE `recipientUserId`=22) + (SELECT COUNT(*) FROM `companyCoverageInvitations` WHERE `inviterUserId`=22) + (SELECT COUNT(*) FROM `companyCoverageInvitations` WHERE `joinerUserId`=22) + (SELECT COUNT(*) FROM `companyCoverageRewards` WHERE `inviterUserId`=22) + (SELECT COUNT(*) FROM `companyCoverageRewards` WHERE `joinerUserId`=22) + (SELECT COUNT(*) FROM `companyOpportunities` WHERE `ownerId`=22) + (SELECT COUNT(*) FROM `directMessageNotificationOutbox` WHERE `recipientId`=22) + (SELECT COUNT(*) FROM `directMessageQuotaWindows` WHERE `senderId`=22) + (SELECT COUNT(*) FROM `employerAccounts` WHERE `approvedByUserId`=22) + (SELECT COUNT(*) FROM `employerAccounts` WHERE `userId`=22) + (SELECT COUNT(*) FROM `employerPaymentFulfillments` WHERE `userId`=22) + (SELECT COUNT(*) FROM `employerTalentIntroRequests` WHERE `employerUserId`=22) + (SELECT COUNT(*) FROM `employerTalentIntroRequests` WHERE `seekerProfileUserId`=22) + (SELECT COUNT(*) FROM `employerTalentRefs` WHERE `employerUserId`=22) + (SELECT COUNT(*) FROM `employerTalentRefs` WHERE `seekerProfileUserId`=22) + (SELECT COUNT(*) FROM `identityLinkAudits` WHERE `canonicalUserId`=22) + (SELECT COUNT(*) FROM `jobs` WHERE `referrerId`=22) + (SELECT COUNT(*) FROM `messages` WHERE `recipientId`=22) + (SELECT COUNT(*) FROM `messages` WHERE `senderId`=22) + (SELECT COUNT(*) FROM `notifications` WHERE `userId`=22) + (SELECT COUNT(*) FROM `operationalActivityLogs` WHERE `actorUserId`=22) + (SELECT COUNT(*) FROM `opportunitySponsorshipPurchases` WHERE `actorUserId`=22) + (SELECT COUNT(*) FROM `opportunitySponsorshipPurchases` WHERE `chargedUserId`=22) + (SELECT COUNT(*) FROM `paymentFulfillments` WHERE `userId`=22) + (SELECT COUNT(*) FROM `personalReferralInvites` WHERE `inviterUserId`=22) + (SELECT COUNT(*) FROM `personalReferralRewards` WHERE `inviterUserId`=22) + (SELECT COUNT(*) FROM `personalReferralRewards` WHERE `joinerUserId`=22) + (SELECT COUNT(*) FROM `privacyRequests` WHERE `reviewedByUserId`=22) + (SELECT COUNT(*) FROM `privacyRequests` WHERE `userId`=22) + (SELECT COUNT(*) FROM `profileUnlocks` WHERE `employerUserId`=22) + (SELECT COUNT(*) FROM `profileUnlocks` WHERE `seekerProfileUserId`=22) + (SELECT COUNT(*) FROM `profiles` WHERE `userId`=22) + (SELECT COUNT(*) FROM `promoCreditGrants` WHERE `userId`=22) + (SELECT COUNT(*) FROM `referralAttachments` WHERE `ownerId`=22) + (SELECT COUNT(*) FROM `referralAvailabilitySlots` WHERE `referrerId`=22) + (SELECT COUNT(*) FROM `referralDocumentAccessGrants` WHERE `referrerId`=22) + (SELECT COUNT(*) FROM `referralRequestPasses` WHERE `referrerId`=22) + (SELECT COUNT(*) FROM `referralRequestSaves` WHERE `referrerId`=22) + (SELECT COUNT(*) FROM `referralRequests` WHERE `jobSeekerId`=22) + (SELECT COUNT(*) FROM `referralRequests` WHERE `referrerId`=22) + (SELECT COUNT(*) FROM `referralReviewDeliveries` WHERE `referrerId`=22) + (SELECT COUNT(*) FROM `referralReviewGrantRotations` WHERE `actorUserId`=22) + (SELECT COUNT(*) FROM `referralReviewGrantRotations` WHERE `referrerId`=22) + (SELECT COUNT(*) FROM `referralShareCards` WHERE `createdByUserId`=22) + (SELECT COUNT(*) FROM `referralTransitionEvents` WHERE `actorUserId`=22) + (SELECT COUNT(*) FROM `referrerFastTrackLinks` WHERE `referrerId`=22) + (SELECT COUNT(*) FROM `referrerReviewEmailLinks` WHERE `referrerId`=22) + (SELECT COUNT(*) FROM `referrerSlackWebhooks` WHERE `referrerId`=22) + (SELECT COUNT(*) FROM `resumeUploadSessions` WHERE `ownerId`=22) + (SELECT COUNT(*) FROM `savedRoles` WHERE `jobSeekerId`=22) + (SELECT COUNT(*) FROM `subscriptionCheckoutIntents` WHERE `userId`=22) + (SELECT COUNT(*) FROM `talentDiscoveryConsents` WHERE `seekerUserId`=22) + (SELECT COUNT(*) FROM `tokenBalances` WHERE `userId`=22) + (SELECT COUNT(*) FROM `tokenTransactions` WHERE `userId`=22) + (SELECT COUNT(*) FROM `userFollows` WHERE `followerUserId`=22) + (SELECT COUNT(*) FROM `userFollows` WHERE `followingUserId`=22) + (SELECT COUNT(*) FROM `verifiedLoginAliases` WHERE `canonicalUserId`=22) + (SELECT COUNT(*) FROM `workEmailOtpReceipts` WHERE `userId`=22))=0, 'ok', (SELECT 1 UNION SELECT 2)) AS result;
DELETE FROM users WHERE id=22;
INSERT INTO operationalActivityLogs (actorUserId, action, outcome, resourceType, resourceId, metadata) VALUES (NULL,'admin.user_merged','success','user','6','{"mergedFromUserId":22,"note":"operator duplicate-account merge, founder-approved 2026-09-23 08:22 IST"}');
INSERT INTO identityLinkAudits (canonicalUserId, action, evidence) VALUES (6, 'operator_duplicate_merge', JSON_OBJECT('mergedFromUserId', 22));
-- ===== Merge ethoslife: user 5 -> user 7
SELECT 'ethoslife: both users exist, source unlinked' AS guard, IF((SELECT COUNT(*) FROM users WHERE id IN (5,7))=2 AND (SELECT canonicalPersonId FROM users WHERE id=5) IS NULL, 'ok', (SELECT 1 UNION SELECT 2)) AS result;
SELECT 'ethoslife: source wallets carry no subscription' AS guard, IF((SELECT COUNT(*) FROM tokenBalances WHERE userId=5 AND subscriptionId IS NOT NULL)=0, 'ok', (SELECT 1 UNION SELECT 2)) AS result;
-- Wallets: one row per (user, role). Same role on both: fold into target (sum paid balance, keep the lower free-credit remainder so no free credits are re-granted), drop source row.
UPDATE tokenBalances dd JOIN tokenBalances ss ON ss.userId=5 AND ss.role=dd.role
  SET dd.balance = dd.balance + ss.balance, dd.monthlyCreditsRemaining = LEAST(dd.monthlyCreditsRemaining, ss.monthlyCreditsRemaining)
  WHERE dd.userId=7;
DELETE ss FROM tokenBalances ss JOIN tokenBalances dd ON dd.userId=7 AND dd.role=ss.role WHERE ss.userId=5;
-- Profiles: one per user. Target keeps its profile; source profile dropped when target has one.
DELETE ss FROM profiles ss JOIN profiles dd ON dd.userId=7 WHERE ss.userId=5;
-- Review email links: unique (request, referrer). Drop source duplicates of links the target already holds.
DELETE ss FROM referrerReviewEmailLinks ss JOIN referrerReviewEmailLinks dd ON dd.referrerId=7 AND dd.referralRequestId=ss.referralRequestId WHERE ss.referrerId=5;
-- Re-point every remaining user reference. Any other unique conflict raises a duplicate-key error and aborts the whole transaction.
UPDATE `adminTokenAdjustments` SET `adminUserId`=7 WHERE `adminUserId`=5;
UPDATE `adminTokenAdjustments` SET `recipientUserId`=7 WHERE `recipientUserId`=5;
UPDATE `companyCoverageInvitations` SET `inviterUserId`=7 WHERE `inviterUserId`=5;
UPDATE `companyCoverageInvitations` SET `joinerUserId`=7 WHERE `joinerUserId`=5;
UPDATE `companyCoverageRewards` SET `inviterUserId`=7 WHERE `inviterUserId`=5;
UPDATE `companyCoverageRewards` SET `joinerUserId`=7 WHERE `joinerUserId`=5;
UPDATE `companyOpportunities` SET `ownerId`=7 WHERE `ownerId`=5;
UPDATE `directMessageNotificationOutbox` SET `recipientId`=7 WHERE `recipientId`=5;
UPDATE `directMessageQuotaWindows` SET `senderId`=7 WHERE `senderId`=5;
UPDATE `employerAccounts` SET `approvedByUserId`=7 WHERE `approvedByUserId`=5;
UPDATE `employerAccounts` SET `userId`=7 WHERE `userId`=5;
UPDATE `employerPaymentFulfillments` SET `userId`=7 WHERE `userId`=5;
UPDATE `employerTalentIntroRequests` SET `employerUserId`=7 WHERE `employerUserId`=5;
UPDATE `employerTalentIntroRequests` SET `seekerProfileUserId`=7 WHERE `seekerProfileUserId`=5;
UPDATE `employerTalentRefs` SET `employerUserId`=7 WHERE `employerUserId`=5;
UPDATE `employerTalentRefs` SET `seekerProfileUserId`=7 WHERE `seekerProfileUserId`=5;
UPDATE `identityLinkAudits` SET `canonicalUserId`=7 WHERE `canonicalUserId`=5;
UPDATE `jobs` SET `referrerId`=7 WHERE `referrerId`=5;
UPDATE `messages` SET `recipientId`=7 WHERE `recipientId`=5;
UPDATE `messages` SET `senderId`=7 WHERE `senderId`=5;
UPDATE `notifications` SET `userId`=7 WHERE `userId`=5;
UPDATE `operationalActivityLogs` SET `actorUserId`=7 WHERE `actorUserId`=5;
UPDATE `opportunitySponsorshipPurchases` SET `actorUserId`=7 WHERE `actorUserId`=5;
UPDATE `opportunitySponsorshipPurchases` SET `chargedUserId`=7 WHERE `chargedUserId`=5;
UPDATE `paymentFulfillments` SET `userId`=7 WHERE `userId`=5;
UPDATE `personalReferralInvites` SET `inviterUserId`=7 WHERE `inviterUserId`=5;
UPDATE `personalReferralRewards` SET `inviterUserId`=7 WHERE `inviterUserId`=5;
UPDATE `personalReferralRewards` SET `joinerUserId`=7 WHERE `joinerUserId`=5;
UPDATE `privacyRequests` SET `reviewedByUserId`=7 WHERE `reviewedByUserId`=5;
UPDATE `privacyRequests` SET `userId`=7 WHERE `userId`=5;
UPDATE `profileUnlocks` SET `employerUserId`=7 WHERE `employerUserId`=5;
UPDATE `profileUnlocks` SET `seekerProfileUserId`=7 WHERE `seekerProfileUserId`=5;
UPDATE `profiles` SET `userId`=7 WHERE `userId`=5;
UPDATE `promoCreditGrants` SET `userId`=7 WHERE `userId`=5;
UPDATE `referralAttachments` SET `ownerId`=7 WHERE `ownerId`=5;
UPDATE `referralAvailabilitySlots` SET `referrerId`=7 WHERE `referrerId`=5;
UPDATE `referralDocumentAccessGrants` SET `referrerId`=7 WHERE `referrerId`=5;
UPDATE `referralRequestPasses` SET `referrerId`=7 WHERE `referrerId`=5;
UPDATE `referralRequestSaves` SET `referrerId`=7 WHERE `referrerId`=5;
UPDATE `referralRequests` SET `jobSeekerId`=7 WHERE `jobSeekerId`=5;
UPDATE `referralRequests` SET `referrerId`=7 WHERE `referrerId`=5;
UPDATE `referralReviewDeliveries` SET `referrerId`=7 WHERE `referrerId`=5;
UPDATE `referralReviewGrantRotations` SET `actorUserId`=7 WHERE `actorUserId`=5;
UPDATE `referralReviewGrantRotations` SET `referrerId`=7 WHERE `referrerId`=5;
UPDATE `referralShareCards` SET `createdByUserId`=7 WHERE `createdByUserId`=5;
UPDATE `referralTransitionEvents` SET `actorUserId`=7 WHERE `actorUserId`=5;
UPDATE `referrerFastTrackLinks` SET `referrerId`=7 WHERE `referrerId`=5;
UPDATE `referrerReviewEmailLinks` SET `referrerId`=7 WHERE `referrerId`=5;
UPDATE `referrerSlackWebhooks` SET `referrerId`=7 WHERE `referrerId`=5;
UPDATE `resumeUploadSessions` SET `ownerId`=7 WHERE `ownerId`=5;
UPDATE `savedRoles` SET `jobSeekerId`=7 WHERE `jobSeekerId`=5;
UPDATE `subscriptionCheckoutIntents` SET `userId`=7 WHERE `userId`=5;
UPDATE `talentDiscoveryConsents` SET `seekerUserId`=7 WHERE `seekerUserId`=5;
UPDATE `tokenBalances` SET `userId`=7 WHERE `userId`=5;
UPDATE `tokenTransactions` SET `userId`=7 WHERE `userId`=5;
UPDATE `userFollows` SET `followerUserId`=7 WHERE `followerUserId`=5;
UPDATE `userFollows` SET `followingUserId`=7 WHERE `followingUserId`=5;
UPDATE `verifiedLoginAliases` SET `canonicalUserId`=7 WHERE `canonicalUserId`=5;
UPDATE `workEmailOtpReceipts` SET `userId`=7 WHERE `userId`=5;
UPDATE users dd JOIN users ss ON ss.id=5 SET dd.lastSignedIn = GREATEST(dd.lastSignedIn, ss.lastSignedIn) WHERE dd.id=7;
SELECT 'ethoslife: zero references left on source before delete' AS guard, IF(((SELECT COUNT(*) FROM `adminTokenAdjustments` WHERE `adminUserId`=5) + (SELECT COUNT(*) FROM `adminTokenAdjustments` WHERE `recipientUserId`=5) + (SELECT COUNT(*) FROM `companyCoverageInvitations` WHERE `inviterUserId`=5) + (SELECT COUNT(*) FROM `companyCoverageInvitations` WHERE `joinerUserId`=5) + (SELECT COUNT(*) FROM `companyCoverageRewards` WHERE `inviterUserId`=5) + (SELECT COUNT(*) FROM `companyCoverageRewards` WHERE `joinerUserId`=5) + (SELECT COUNT(*) FROM `companyOpportunities` WHERE `ownerId`=5) + (SELECT COUNT(*) FROM `directMessageNotificationOutbox` WHERE `recipientId`=5) + (SELECT COUNT(*) FROM `directMessageQuotaWindows` WHERE `senderId`=5) + (SELECT COUNT(*) FROM `employerAccounts` WHERE `approvedByUserId`=5) + (SELECT COUNT(*) FROM `employerAccounts` WHERE `userId`=5) + (SELECT COUNT(*) FROM `employerPaymentFulfillments` WHERE `userId`=5) + (SELECT COUNT(*) FROM `employerTalentIntroRequests` WHERE `employerUserId`=5) + (SELECT COUNT(*) FROM `employerTalentIntroRequests` WHERE `seekerProfileUserId`=5) + (SELECT COUNT(*) FROM `employerTalentRefs` WHERE `employerUserId`=5) + (SELECT COUNT(*) FROM `employerTalentRefs` WHERE `seekerProfileUserId`=5) + (SELECT COUNT(*) FROM `identityLinkAudits` WHERE `canonicalUserId`=5) + (SELECT COUNT(*) FROM `jobs` WHERE `referrerId`=5) + (SELECT COUNT(*) FROM `messages` WHERE `recipientId`=5) + (SELECT COUNT(*) FROM `messages` WHERE `senderId`=5) + (SELECT COUNT(*) FROM `notifications` WHERE `userId`=5) + (SELECT COUNT(*) FROM `operationalActivityLogs` WHERE `actorUserId`=5) + (SELECT COUNT(*) FROM `opportunitySponsorshipPurchases` WHERE `actorUserId`=5) + (SELECT COUNT(*) FROM `opportunitySponsorshipPurchases` WHERE `chargedUserId`=5) + (SELECT COUNT(*) FROM `paymentFulfillments` WHERE `userId`=5) + (SELECT COUNT(*) FROM `personalReferralInvites` WHERE `inviterUserId`=5) + (SELECT COUNT(*) FROM `personalReferralRewards` WHERE `inviterUserId`=5) + (SELECT COUNT(*) FROM `personalReferralRewards` WHERE `joinerUserId`=5) + (SELECT COUNT(*) FROM `privacyRequests` WHERE `reviewedByUserId`=5) + (SELECT COUNT(*) FROM `privacyRequests` WHERE `userId`=5) + (SELECT COUNT(*) FROM `profileUnlocks` WHERE `employerUserId`=5) + (SELECT COUNT(*) FROM `profileUnlocks` WHERE `seekerProfileUserId`=5) + (SELECT COUNT(*) FROM `profiles` WHERE `userId`=5) + (SELECT COUNT(*) FROM `promoCreditGrants` WHERE `userId`=5) + (SELECT COUNT(*) FROM `referralAttachments` WHERE `ownerId`=5) + (SELECT COUNT(*) FROM `referralAvailabilitySlots` WHERE `referrerId`=5) + (SELECT COUNT(*) FROM `referralDocumentAccessGrants` WHERE `referrerId`=5) + (SELECT COUNT(*) FROM `referralRequestPasses` WHERE `referrerId`=5) + (SELECT COUNT(*) FROM `referralRequestSaves` WHERE `referrerId`=5) + (SELECT COUNT(*) FROM `referralRequests` WHERE `jobSeekerId`=5) + (SELECT COUNT(*) FROM `referralRequests` WHERE `referrerId`=5) + (SELECT COUNT(*) FROM `referralReviewDeliveries` WHERE `referrerId`=5) + (SELECT COUNT(*) FROM `referralReviewGrantRotations` WHERE `actorUserId`=5) + (SELECT COUNT(*) FROM `referralReviewGrantRotations` WHERE `referrerId`=5) + (SELECT COUNT(*) FROM `referralShareCards` WHERE `createdByUserId`=5) + (SELECT COUNT(*) FROM `referralTransitionEvents` WHERE `actorUserId`=5) + (SELECT COUNT(*) FROM `referrerFastTrackLinks` WHERE `referrerId`=5) + (SELECT COUNT(*) FROM `referrerReviewEmailLinks` WHERE `referrerId`=5) + (SELECT COUNT(*) FROM `referrerSlackWebhooks` WHERE `referrerId`=5) + (SELECT COUNT(*) FROM `resumeUploadSessions` WHERE `ownerId`=5) + (SELECT COUNT(*) FROM `savedRoles` WHERE `jobSeekerId`=5) + (SELECT COUNT(*) FROM `subscriptionCheckoutIntents` WHERE `userId`=5) + (SELECT COUNT(*) FROM `talentDiscoveryConsents` WHERE `seekerUserId`=5) + (SELECT COUNT(*) FROM `tokenBalances` WHERE `userId`=5) + (SELECT COUNT(*) FROM `tokenTransactions` WHERE `userId`=5) + (SELECT COUNT(*) FROM `userFollows` WHERE `followerUserId`=5) + (SELECT COUNT(*) FROM `userFollows` WHERE `followingUserId`=5) + (SELECT COUNT(*) FROM `verifiedLoginAliases` WHERE `canonicalUserId`=5) + (SELECT COUNT(*) FROM `workEmailOtpReceipts` WHERE `userId`=5))=0, 'ok', (SELECT 1 UNION SELECT 2)) AS result;
DELETE FROM users WHERE id=5;
INSERT INTO operationalActivityLogs (actorUserId, action, outcome, resourceType, resourceId, metadata) VALUES (NULL,'admin.user_merged','success','user','7','{"mergedFromUserId":5,"note":"operator duplicate-account merge, founder-approved 2026-09-23 08:22 IST"}');
INSERT INTO identityLinkAudits (canonicalUserId, action, evidence) VALUES (7, 'operator_duplicate_merge', JSON_OBJECT('mergedFromUserId', 5));
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
ROLLBACK;
