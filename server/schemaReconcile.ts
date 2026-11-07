import { sql } from "drizzle-orm";
import { getDb } from "./db";

// Columns the running code expects. Each entry is applied idempotently at boot
// when missing (MySQL 8.0 has no ADD COLUMN IF NOT EXISTS, so check
// information_schema first). Add new columns here AND to drizzle/schema.ts.
// New tables are created idempotently (IF NOT EXISTS) so a drifted live DB
// self-heals without manual migration runs. Keep in sync with drizzle/schema.ts.
export const DESIRED_TABLES: Array<{ table: string; createSql: string }> = [
  { table: "seekerAgentGrants", createSql: `CREATE TABLE IF NOT EXISTS \`seekerAgentGrants\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`name\` varchar(120) NOT NULL, \`keyPrefix\` varchar(16) NOT NULL, \`keyHash\` varchar(64) NOT NULL, \`canLookup\` boolean NOT NULL DEFAULT true, \`canDraft\` boolean NOT NULL DEFAULT true, \`maxCreditsPerAsk\` int NOT NULL, \`maxCreditsPerDay\` int NOT NULL, \`maxCreditsPerWeek\` int NOT NULL, \`maxAsksPerDay\` int NOT NULL, \`expiresAt\` timestamp NOT NULL, \`revokedAt\` timestamp NULL, \`lastUsedAt\` timestamp NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`seekerAgentGrants_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`seeker_agent_grants_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE, UNIQUE INDEX \`seeker_agent_grants_key_hash_unique\`(\`keyHash\`), INDEX \`seeker_agent_grants_user_idx\`(\`userId\`))` },
  { table: "seekerAgentControls", createSql: `CREATE TABLE IF NOT EXISTS \`seekerAgentControls\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`pausedAt\` timestamp NULL, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`seekerAgentControls_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`seeker_agent_controls_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE, UNIQUE INDEX \`seeker_agent_controls_user_unique\`(\`userId\`))` },
  { table: "seekerAgentDrafts", createSql: `CREATE TABLE IF NOT EXISTS \`seekerAgentDrafts\` (\`id\` int AUTO_INCREMENT NOT NULL, \`grantId\` int NOT NULL, \`userId\` int NOT NULL, \`companySlug\` varchar(48) NOT NULL, \`targetRoleUrl\` varchar(2048) NOT NULL, \`note\` varchar(2000) NOT NULL DEFAULT '', \`jobLevel\` int NOT NULL, \`creditCost\` int NOT NULL, \`status\` ENUM('draft','discarded') NOT NULL DEFAULT 'draft', \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`seekerAgentDrafts_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`seeker_agent_drafts_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE, INDEX \`seeker_agent_drafts_grant_idx\`(\`grantId\`,\`createdAt\`), INDEX \`seeker_agent_drafts_user_idx\`(\`userId\`,\`createdAt\`))` },
  { table: "seekerAgentEvents", createSql: `CREATE TABLE IF NOT EXISTS \`seekerAgentEvents\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`grantId\` int NULL, \`agentName\` varchar(120) NOT NULL, \`action\` varchar(48) NOT NULL, \`outcome\` ENUM('success','denied','failure') NOT NULL, \`detail\` varchar(600) NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`seekerAgentEvents_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`seeker_agent_events_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE, INDEX \`seeker_agent_events_grant_idx\`(\`grantId\`,\`createdAt\`), INDEX \`seeker_agent_events_user_idx\`(\`userId\`,\`createdAt\`))` },
  { table: "billingReviewOutbox", createSql: `CREATE TABLE IF NOT EXISTS \`billingReviewOutbox\` (
 \`id\` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
 \`obligationKey\` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 \`payload\` text NULL,
 \`conflictDigest\` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 \`envelope\` text NULL,
 \`submissionState\` varchar(20) NOT NULL DEFAULT 'never_submitted',
 \`updatedAt\` timestamp(3) NOT NULL,
 \`status\` varchar(16) NOT NULL DEFAULT 'pending',
 \`attempts\` int NOT NULL DEFAULT 0,
 \`nextAttemptAt\` timestamp(3) NOT NULL,
 \`leaseOwner\` varchar(64) NULL,
 \`leaseUntil\` timestamp(3) NULL,
 \`firstAttemptAt\` timestamp(3) NULL,
 \`acceptedAt\` timestamp(3) NULL,
 \`providerMessageId\` varchar(255) NULL,
 \`lastError\` varchar(80) NULL,
 \`createdAt\` timestamp(3) NOT NULL,
 UNIQUE INDEX \`billing_review_obligation_unique\` (\`obligationKey\`),
 INDEX \`billing_review_due_idx\` (\`status\`, \`nextAttemptAt\`, \`id\`)
) ENGINE=InnoDB` },
  { table: "aiToolCallLogs", createSql: `CREATE TABLE IF NOT EXISTS \`aiToolCallLogs\` (\`id\` int AUTO_INCREMENT NOT NULL, \`tool\` varchar(64) NOT NULL, \`model\` varchar(128) NOT NULL, \`tokensIn\` int NOT NULL, \`tokensOut\` int NOT NULL, \`costUsdMicros\` bigint NULL, \`planFamilyId\` varchar(32) NULL, \`userId\` int NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`aiToolCallLogs_id\` PRIMARY KEY(\`id\`), INDEX \`ai_tool_call_log_tool_idx\`(\`tool\`,\`createdAt\`))` },
  { table: "askCosts", createSql: `CREATE TABLE IF NOT EXISTS \`askCosts\` (\`id\` int AUTO_INCREMENT NOT NULL, \`referralRequestId\` int NOT NULL, \`jobLevel\` int NOT NULL, \`creditCost\` int NOT NULL, \`source\` varchar(40) NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`askCosts_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`ask_costs_request_fk\` FOREIGN KEY (\`referralRequestId\`) REFERENCES \`referralRequests\` (\`id\`) ON DELETE CASCADE, UNIQUE INDEX \`ask_costs_request_unique\`(\`referralRequestId\`))` },
  { table: "seekerLevels", createSql: `CREATE TABLE IF NOT EXISTS \`seekerLevels\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`level\` int NOT NULL, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`seekerLevels_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`seeker_levels_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE, UNIQUE INDEX \`seeker_levels_user_unique\`(\`userId\`))` },
  { table: "askWorkItems", createSql: `CREATE TABLE IF NOT EXISTS \`askWorkItems\` (\`id\` int AUTO_INCREMENT NOT NULL, \`referralRequestId\` int NOT NULL, \`workItemId\` int NULL, \`title\` varchar(160) NOT NULL, \`kind\` ENUM('case_study','project','article','code','other') NOT NULL DEFAULT 'other', \`source\` varchar(80) NULL, \`url\` varchar(2048) NULL, \`position\` int NOT NULL DEFAULT 0, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`askWorkItems_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`ask_work_items_request_fk\` FOREIGN KEY (\`referralRequestId\`) REFERENCES \`referralRequests\` (\`id\`) ON DELETE CASCADE, CONSTRAINT \`ask_work_items_piece_fk\` FOREIGN KEY (\`workItemId\`) REFERENCES \`workItems\` (\`id\`) ON DELETE SET NULL, UNIQUE INDEX \`ask_work_items_request_piece_unique\`(\`referralRequestId\`,\`workItemId\`), INDEX \`ask_work_items_request_idx\`(\`referralRequestId\`,\`position\`))` },
  { table: "referralRequestSaves", createSql: `CREATE TABLE IF NOT EXISTS \`referralRequestSaves\` (\`id\` int AUTO_INCREMENT NOT NULL, \`referralRequestId\` int NOT NULL, \`referrerId\` int NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`referralRequestSaves_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`referral_request_save_request_referrer_unique\`(\`referralRequestId\`,\`referrerId\`), INDEX \`referral_request_save_referrer_idx\`(\`referrerId\`,\`createdAt\`), INDEX \`referral_request_save_request_idx\`(\`referralRequestId\`))` },
  { table: "referralRequestPasses", createSql: `CREATE TABLE IF NOT EXISTS \`referralRequestPasses\` (\`id\` int AUTO_INCREMENT NOT NULL, \`referralRequestId\` int NOT NULL, \`referrerId\` int NOT NULL, \`reason\` ENUM('role_not_a_fit','cannot_support','timing') NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`referralRequestPasses_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`referral_request_pass_request_referrer_unique\`(\`referralRequestId\`,\`referrerId\`), INDEX \`referral_request_pass_referrer_idx\`(\`referrerId\`,\`createdAt\`))` },
  { table: "workEmailOtpRateLimits", createSql: `CREATE TABLE IF NOT EXISTS \`workEmailOtpRateLimits\` (\`id\` int AUTO_INCREMENT NOT NULL, \`limiterKey\` varchar(96) NOT NULL, \`windowStart\` timestamp NOT NULL, \`hitCount\` int NOT NULL DEFAULT 1, \`expiresAt\` timestamp NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`workEmailOtpRateLimits_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`work_email_otp_rate_window_unique\`(\`limiterKey\`,\`windowStart\`), INDEX \`work_email_otp_rate_expiry_idx\`(\`expiresAt\`))` },
  { table: "employerPaymentFulfillments", createSql: `CREATE TABLE IF NOT EXISTS \`employerPaymentFulfillments\` (\`id\` int AUTO_INCREMENT NOT NULL, \`provider\` varchar(32) NOT NULL, \`providerOrderId\` varchar(255) NOT NULL, \`providerPaymentId\` varchar(255), \`userId\` int NOT NULL, \`pack\` ENUM('starter','growth','scale') NOT NULL, \`amount\` int NOT NULL, \`currency\` varchar(3) NOT NULL, \`status\` ENUM('creating','provider_create_in_progress','pending','processing','credited','requires_review','expired','canceled') NOT NULL DEFAULT 'creating', \`attemptCount\` int NOT NULL DEFAULT 0, \`lastError\` varchar(500), \`creditedAt\` timestamp NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`employerPaymentFulfillments_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`employer_payment_provider_order_unique\`(\`provider\`,\`providerOrderId\`), UNIQUE INDEX \`employer_payment_provider_payment_unique\`(\`provider\`,\`providerPaymentId\`), INDEX \`employer_payment_user_status_idx\`(\`userId\`,\`status\`))` },
  { table: "employerAccounts", createSql: `CREATE TABLE IF NOT EXISTS \`employerAccounts\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`companyName\` varchar(160) NOT NULL, \`billingEmail\` varchar(320) NOT NULL, \`credits\` int NOT NULL DEFAULT 0, \`budgetMonthlyUsdCents\` int NOT NULL DEFAULT 0, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`employerAccounts_id\` PRIMARY KEY(\`id\`))` },
  { table: "employerTalentRefs", createSql: `CREATE TABLE IF NOT EXISTS \`employerTalentRefs\` (\`id\` int AUTO_INCREMENT NOT NULL, \`employerUserId\` int NOT NULL, \`seekerProfileUserId\` int NOT NULL, \`publicRef\` varchar(64) NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`employerTalentRefs_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`employer_talent_refs_public_unique\` UNIQUE(\`publicRef\`), CONSTRAINT \`employer_talent_refs_pair_unique\` UNIQUE(\`employerUserId\`,\`seekerProfileUserId\`), INDEX \`employer_talent_refs_scope_idx\` (\`employerUserId\`,\`publicRef\`))` },
  { table: "employerTalentIntroRequests", createSql: `CREATE TABLE IF NOT EXISTS \`employerTalentIntroRequests\` (\`id\` int AUTO_INCREMENT NOT NULL, \`employerUserId\` int NOT NULL, \`seekerProfileUserId\` int NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`employerTalentIntroRequests_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`employer_talent_intro_pair_unique\` UNIQUE(\`employerUserId\`,\`seekerProfileUserId\`))` },
  { table: "profileUnlocks", createSql: `CREATE TABLE IF NOT EXISTS \`profileUnlocks\` (\`id\` int AUTO_INCREMENT NOT NULL, \`employerUserId\` int NOT NULL, \`seekerProfileUserId\` int NOT NULL, \`unlockedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`creditsSpent\` int NOT NULL, CONSTRAINT \`profileUnlocks_id\` PRIMARY KEY(\`id\`))` },
  { table: "partnerModules", createSql: `CREATE TABLE IF NOT EXISTS \`partnerModules\` (\`id\` int AUTO_INCREMENT NOT NULL, \`partnerName\` varchar(160) NOT NULL, \`category\` ENUM('interview_prep','resume_vetting','skill_assessment','other') NOT NULL, \`headline\` varchar(255) NOT NULL, \`description\` text NOT NULL, \`targetRoles\` text, \`ctaLabel\` varchar(80) NOT NULL, \`ctaUrl\` varchar(1024) NOT NULL, \`isActive\` boolean NOT NULL DEFAULT true, \`impressions\` int NOT NULL DEFAULT 0, \`clicks\` int NOT NULL DEFAULT 0, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`partnerModules_id\` PRIMARY KEY(\`id\`))` },
  { table: "userFollows", createSql: `CREATE TABLE IF NOT EXISTS \`userFollows\` (\`id\` int AUTO_INCREMENT NOT NULL, \`followerUserId\` int NOT NULL, \`followingUserId\` int NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`userFollows_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`user_follows_pair_unique\`(\`followerUserId\`, \`followingUserId\`), INDEX \`user_follows_following_idx\`(\`followingUserId\`))` },
  { table: "promoCreditGrants", createSql: `CREATE TABLE IF NOT EXISTS \`promoCreditGrants\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`role\` ENUM('job_seeker','referrer') NOT NULL DEFAULT 'job_seeker', \`tokenCount\` int NOT NULL, \`creditsRemaining\` int NOT NULL, \`status\` ENUM('active','exhausted','expired','revoked') NOT NULL DEFAULT 'active', \`source\` varchar(40) NOT NULL DEFAULT 'first_paid_invoice', \`providerRef\` varchar(255) NULL, \`grantedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`expiresAt\` timestamp NOT NULL, \`consumedAt\` timestamp NULL, \`revokedAt\` timestamp NULL, \`revokedReason\` varchar(255) NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`promoCreditGrants_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`promo_grant_user_role_unique\`(\`userId\`,\`role\`), INDEX \`promo_grant_user_status_idx\`(\`userId\`,\`role\`,\`status\`))` },
  { table: "giftSubscriptionFulfillments", createSql: `CREATE TABLE IF NOT EXISTS \`giftSubscriptionFulfillments\` (\`id\` int AUTO_INCREMENT NOT NULL, \`giftId\` varchar(150) NOT NULL, \`provider\` varchar(32) NOT NULL DEFAULT 'chargebee', \`buyerUserId\` int NULL, \`receiverEmail\` varchar(70) NULL, \`recipientUserId\` int NULL, \`role\` ENUM('job_seeker','referrer') NOT NULL DEFAULT 'job_seeker', \`plan\` ENUM('pro','max') NULL, \`currency\` varchar(3) NULL, \`amount\` int NULL, \`subscriptionId\` varchar(80) NULL, \`providerStatus\` varchar(20) NULL, \`fulfillmentStatus\` ENUM('pending','credited','conflict','expired','cancelled') NOT NULL DEFAULT 'pending', \`failureReason\` varchar(255) NULL, \`creditedAt\` timestamp NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`giftSubscriptionFulfillments_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`gift_fulfillment_gift_unique\`(\`giftId\`), INDEX \`gift_fulfillment_receiver_idx\`(\`receiverEmail\`,\`fulfillmentStatus\`), INDEX \`gift_fulfillment_buyer_idx\`(\`buyerUserId\`,\`createdAt\`), INDEX \`gift_fulfillment_subscription_idx\`(\`subscriptionId\`))` },
  { table: "safetyReports", createSql: `CREATE TABLE IF NOT EXISTS \`safetyReports\` (\`id\` int AUTO_INCREMENT PRIMARY KEY, \`reporterUserId\` int NOT NULL, \`reason\` varchar(80) NOT NULL, \`details\` text NULL, \`referralRequestId\` int NULL, \`reportedUserId\` int NULL, \`urgent\` boolean NOT NULL DEFAULT false, \`status\` ENUM('open','under_review','resolved','dismissed') NOT NULL DEFAULT 'open', \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`safetyReports_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`safety_reports_reporter_fk\` FOREIGN KEY (\`reporterUserId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE, INDEX \`safety_reports_reporter_idx\`(\`reporterUserId\`), INDEX \`safety_reports_status_idx\`(\`status\`))` },
  { table: "companySuggestions", createSql: `CREATE TABLE IF NOT EXISTS \`companySuggestions\` (\`id\` int AUTO_INCREMENT PRIMARY KEY, \`submitterUserId\` int NOT NULL, \`companyName\` varchar(160) NOT NULL, \`website\` varchar(512) NULL, \`jobFunction\` varchar(32) NULL, \`role\` ENUM('seeker','employee') NOT NULL DEFAULT 'seeker', \`status\` ENUM('open','under_review','approved','dismissed') NOT NULL DEFAULT 'open', \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`companySuggestions_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`company_suggestions_submitter_fk\` FOREIGN KEY (\`submitterUserId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE, INDEX \`company_suggestions_submitter_idx\`(\`submitterUserId\`), INDEX \`company_suggestions_status_idx\`(\`status\`))` },
  { table: "workItems", createSql: `CREATE TABLE IF NOT EXISTS \`workItems\` (\`id\` int AUTO_INCREMENT PRIMARY KEY, \`userId\` int NOT NULL, \`title\` varchar(160) NOT NULL, \`kind\` ENUM('case_study','project','article','code','other') NOT NULL DEFAULT 'other', \`source\` varchar(80) NULL, \`url\` varchar(2048) NULL, \`pinned\` boolean NOT NULL DEFAULT false, \`visibleOnProfile\` boolean NOT NULL DEFAULT false, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`workItems_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`work_items_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE, INDEX \`work_items_user_idx\`(\`userId\`))` },
  { table: "askDrafts", createSql: `CREATE TABLE IF NOT EXISTS \`askDrafts\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`companySlug\` varchar(64) NOT NULL, \`targetRoleUrl\` varchar(2048) NOT NULL, \`note\` varchar(600) NOT NULL DEFAULT '', \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`askDrafts_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`ask_drafts_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE, UNIQUE INDEX \`ask_drafts_user_unique\`(\`userId\`))` },
  { table: "dataExports", createSql: `CREATE TABLE IF NOT EXISTS \`dataExports\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`status\` varchar(16) NOT NULL DEFAULT 'requested', \`activeKey\` varchar(40) NULL, \`fileName\` varchar(120) NULL, \`byteSize\` int NOT NULL DEFAULT 0, \`zipData\` longblob NULL, \`failureNote\` varchar(200) NULL, \`requestedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`readyAt\` timestamp NULL DEFAULT NULL, \`expiresAt\` timestamp NULL DEFAULT NULL, CONSTRAINT \`dataExports_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`data_exports_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE, UNIQUE INDEX \`data_exports_active_unique\`(\`activeKey\`), INDEX \`data_exports_user_idx\`(\`userId\`, \`requestedAt\`))` },
  { table: "moderationEvents", createSql: `CREATE TABLE IF NOT EXISTS \`moderationEvents\` (\`id\` int AUTO_INCREMENT NOT NULL, \`reportId\` int NOT NULL, \`actorKind\` varchar(12) NOT NULL, \`actorUserId\` int NULL, \`kind\` varchar(32) NOT NULL, \`note\` varchar(600) NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`moderationEvents_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`moderation_events_report_fk\` FOREIGN KEY (\`reportId\`) REFERENCES \`safetyReports\` (\`id\`) ON DELETE CASCADE, INDEX \`moderation_events_report_idx\`(\`reportId\`, \`createdAt\`))` },
  { table: "moderationEvidence", createSql: `CREATE TABLE IF NOT EXISTS \`moderationEvidence\` (\`id\` int AUTO_INCREMENT NOT NULL, \`reportId\` int NOT NULL, \`seq\` int NOT NULL, \`sender\` varchar(10) NOT NULL, \`body\` text NOT NULL, \`sentAt\` timestamp NOT NULL, \`capturedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`moderationEvidence_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`moderation_evidence_report_fk\` FOREIGN KEY (\`reportId\`) REFERENCES \`safetyReports\` (\`id\`) ON DELETE CASCADE, INDEX \`moderation_evidence_report_idx\`(\`reportId\`, \`seq\`))` },
  { table: "accountPreferences", createSql: `CREATE TABLE IF NOT EXISTS \`accountPreferences\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`timeZone\` varchar(64) NULL, \`dateFormat\` varchar(8) NULL, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`accountPreferences_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`account_preferences_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE, UNIQUE INDEX \`account_preferences_user_unique\`(\`userId\`))` },
  { table: "seekerAlerts", createSql: `CREATE TABLE IF NOT EXISTS \`seekerAlerts\` (\`id\` int AUTO_INCREMENT PRIMARY KEY, \`userId\` int NOT NULL, \`companyDomain\` varchar(255) NOT NULL, \`paused\` boolean NOT NULL DEFAULT false, \`notifiedAt\` timestamp NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`seekerAlerts_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`seeker_alerts_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE, UNIQUE INDEX \`seeker_alerts_user_domain_unique\`(\`userId\`,\`companyDomain\`), INDEX \`seeker_alerts_user_idx\`(\`userId\`), INDEX \`seeker_alerts_domain_idx\`(\`companyDomain\`))` },
  { table: "assistantConnections", createSql: `CREATE TABLE IF NOT EXISTS \`assistantConnections\` (\`id\` int AUTO_INCREMENT PRIMARY KEY, \`userId\` int NOT NULL, \`provider\` ENUM('chatgpt','claude','custom') NOT NULL, \`appName\` varchar(160) NOT NULL, \`scopes\` text NOT NULL, \`status\` ENUM('connected','declined','expired','revoked') NOT NULL DEFAULT 'connected', \`connectedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`lastUsedAt\` timestamp NULL, \`revokedAt\` timestamp NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`assistantConnections_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`assistant_connections_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE, INDEX \`assistant_connections_user_idx\`(\`userId\`), INDEX \`assistant_connections_status_idx\`(\`status\`))` },
  { table: "assistantTokens", createSql: `CREATE TABLE IF NOT EXISTS \`assistantTokens\` (\`id\` int AUTO_INCREMENT PRIMARY KEY, \`userId\` int NOT NULL, \`name\` varchar(160) NOT NULL, \`tokenHash\` varchar(128) NOT NULL, \`prefix\` varchar(16) NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`lastUsedAt\` timestamp NULL, \`revokedAt\` timestamp NULL, CONSTRAINT \`assistantTokens_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`assistant_tokens_user_name_unique\`(\`userId\`,\`name\`), CONSTRAINT \`assistant_tokens_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE, INDEX \`assistant_tokens_user_idx\`(\`userId\`))` },
  { table: "developerApps", createSql: `CREATE TABLE IF NOT EXISTS \`developerApps\` (\`id\` int AUTO_INCREMENT PRIMARY KEY, \`userId\` int NOT NULL, \`name\` varchar(160) NOT NULL, \`kind\` ENUM('web_app','agent_mcp','server_integration') NOT NULL, \`description\` text NOT NULL, \`website\` varchar(512) NULL, \`redirectUrls\` text NOT NULL, \`scopes\` text NOT NULL, \`status\` ENUM('test','in_review','live','rejected','suspended') NOT NULL DEFAULT 'test', \`rejectReasons\` text NULL, \`webhookUrl\` varchar(512) NULL, \`clientId\` varchar(64) NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`developerApps_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`developer_apps_client_id_unique\`(\`clientId\`), CONSTRAINT \`developer_apps_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE, INDEX \`developer_apps_user_idx\`(\`userId\`), INDEX \`developer_apps_status_idx\`(\`status\`))` },
  { table: "assistantApprovals", createSql: `CREATE TABLE IF NOT EXISTS \`assistantApprovals\` (\`id\` int AUTO_INCREMENT PRIMARY KEY, \`userId\` int NOT NULL, \`connectionId\` int NULL, \`kind\` ENUM('ask_send','credit_spend') NOT NULL, \`status\` ENUM('pending','approved','declined','expired') NOT NULL DEFAULT 'pending', \`provider\` varchar(80) NOT NULL, \`companyDomain\` varchar(255) NULL, \`role\` varchar(180) NULL, \`note\` text NULL, \`creditCount\` int NULL, \`slotCount\` int NULL, \`expiresAt\` timestamp NOT NULL, \`decidedAt\` timestamp NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`assistantApprovals_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`assistant_approvals_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE, CONSTRAINT \`assistant_approvals_connection_fk\` FOREIGN KEY (\`connectionId\`) REFERENCES \`assistantConnections\` (\`id\`) ON DELETE SET NULL, INDEX \`assistant_approvals_user_idx\`(\`userId\`), INDEX \`assistant_approvals_status_idx\`(\`status\`), INDEX \`assistant_approvals_expiry_idx\`(\`expiresAt\`))` },
  { table: "oauthClients", createSql: `CREATE TABLE IF NOT EXISTS \`oauthClients\` (\`id\` int AUTO_INCREMENT PRIMARY KEY, \`clientId\` varchar(64) NOT NULL, \`clientName\` varchar(160) NOT NULL, \`redirectUris\` text NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE INDEX \`oauthClients_clientId_unique\`(\`clientId\`))` },
  { table: "oauthAuthCodes", createSql: `CREATE TABLE IF NOT EXISTS \`oauthAuthCodes\` (\`id\` int AUTO_INCREMENT PRIMARY KEY, \`codeHash\` varchar(64) NOT NULL, \`clientId\` varchar(64) NOT NULL, \`userId\` int NOT NULL, \`redirectUri\` varchar(512) NOT NULL, \`codeChallenge\` varchar(64) NOT NULL, \`expiresAt\` timestamp NOT NULL, \`usedAt\` timestamp NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE INDEX \`oauthAuthCodes_codeHash_unique\`(\`codeHash\`), CONSTRAINT \`oauth_auth_codes_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE, INDEX \`oauth_auth_codes_user_idx\`(\`userId\`), INDEX \`oauth_auth_codes_expiry_idx\`(\`expiresAt\`))` },
  { table: "companies", createSql: `CREATE TABLE IF NOT EXISTS \`companies\` (\`id\` int AUTO_INCREMENT NOT NULL, \`slug\` varchar(48) NOT NULL, \`name\` varchar(160) NOT NULL, \`initials\` varchar(4) NOT NULL, \`industry\` varchar(80) NOT NULL, \`location\` varchar(80) NOT NULL, \`functions\` text NOT NULL, \`blurb\` varchar(240) NOT NULL, \`status\` enum('listed','hidden') NOT NULL DEFAULT 'listed', \`sortOrder\` int NOT NULL DEFAULT 0, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`companies_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`companies_slug_unique\`(\`slug\`), INDEX \`companies_status_sort_idx\`(\`status\`,\`sortOrder\`))` },
  { table: "companyDomains", createSql: `CREATE TABLE IF NOT EXISTS \`companyDomains\` (\`id\` int AUTO_INCREMENT NOT NULL, \`companyId\` int NOT NULL, \`domain\` varchar(255) NOT NULL, \`isPrimary\` boolean NOT NULL DEFAULT false, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`companyDomains_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`companyDomains_companyId_companies_id_fk\` FOREIGN KEY (\`companyId\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE RESTRICT, UNIQUE INDEX \`company_domains_domain_unique\`(\`domain\`), INDEX \`company_domains_company_idx\`(\`companyId\`))` },
  { table: "jobRuns", createSql: `CREATE TABLE IF NOT EXISTS \`jobRuns\` (\`id\` int AUTO_INCREMENT NOT NULL, \`jobName\` varchar(64) NOT NULL, \`windowKey\` varchar(32) NOT NULL, \`status\` enum('running','succeeded','failed') NOT NULL DEFAULT 'running', \`attempt\` int NOT NULL DEFAULT 1, \`leaseOwner\` varchar(64) NOT NULL, \`startedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`leaseExpiresAt\` timestamp NOT NULL, \`finishedAt\` timestamp NULL, \`processedCount\` int NOT NULL DEFAULT 0, \`failedCount\` int NOT NULL DEFAULT 0, \`error\` varchar(500) NULL, CONSTRAINT \`jobRuns_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`job_runs_job_window_unique\`(\`jobName\`,\`windowKey\`), INDEX \`job_runs_job_started_idx\`(\`jobName\`,\`startedAt\`))` },
  // Kit credit ledger (0089): carried-over and welcome credit grants.
  { table: "planCreditGrants", createSql: `CREATE TABLE IF NOT EXISTS \`planCreditGrants\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`role\` enum('job_seeker','referrer') NOT NULL DEFAULT 'job_seeker', \`source\` enum('carryover','welcome','trial') NOT NULL, \`grantKey\` varchar(64) NOT NULL, \`planId\` varchar(32) NULL, \`subscriptionId\` varchar(80) NULL, \`cycleKey\` varchar(16) NULL, \`tokenCount\` int NOT NULL, \`creditsRemaining\` int NOT NULL, \`status\` enum('active','exhausted','expired','revoked') NOT NULL DEFAULT 'active', \`grantedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`expiresAt\` timestamp NULL, \`closedAt\` timestamp NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`planCreditGrants_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`plan_credit_grants_grant_key_unique\`(\`grantKey\`), INDEX \`plan_credit_grants_user_status_idx\`(\`userId\`,\`role\`,\`status\`), INDEX \`plan_credit_grants_status_expiry_idx\`(\`status\`,\`expiresAt\`), CONSTRAINT \`plan_credit_grants_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE)` },
  // Subscription management (0090): billing customers, receipts, cancellation feedback.
  { table: "billingCustomers", createSql: `CREATE TABLE IF NOT EXISTS \`billingCustomers\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`role\` enum('job_seeker','referrer') NOT NULL DEFAULT 'job_seeker', \`provider\` varchar(32) NOT NULL DEFAULT 'chargebee', \`site\` enum('test','live') NOT NULL, \`providerCustomerId\` varchar(80) NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`billingCustomers_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`billing_customers_provider_customer_unique\`(\`provider\`,\`site\`,\`providerCustomerId\`), UNIQUE INDEX \`billing_customers_owner_unique\`(\`userId\`,\`role\`,\`provider\`,\`site\`), CONSTRAINT \`billing_customers_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE)` },
  { table: "billingInvoices", createSql: `CREATE TABLE IF NOT EXISTS \`billingInvoices\` (\`id\` int AUTO_INCREMENT NOT NULL, \`provider\` varchar(32) NOT NULL DEFAULT 'chargebee', \`site\` enum('test','live') NOT NULL, \`providerInvoiceId\` varchar(80) NOT NULL, \`userId\` int NOT NULL, \`role\` enum('job_seeker','referrer') NOT NULL DEFAULT 'job_seeker', \`kind\` enum('subscription','credit_pack') NOT NULL, \`subscriptionId\` varchar(80) NULL, \`planId\` varchar(32) NULL, \`billingPeriod\` enum('monthly','yearly','30d','90d') NULL, \`tokenCount\` int NULL, \`amount\` int NOT NULL, \`amountRefunded\` int NOT NULL DEFAULT 0, \`currency\` varchar(3) NOT NULL, \`status\` enum('paid','refunded','partially_refunded','payment_due','not_paid','voided') NOT NULL, \`paidAt\` timestamp NULL, \`resourceVersion\` bigint NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`billingInvoices_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`billing_invoices_provider_invoice_unique\`(\`provider\`,\`site\`,\`providerInvoiceId\`), INDEX \`billing_invoices_owner_paid_idx\`(\`userId\`,\`role\`,\`paidAt\`), CONSTRAINT \`billing_invoices_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE)` },
  { table: "subscriptionCancellationFeedback", createSql: `CREATE TABLE IF NOT EXISTS \`subscriptionCancellationFeedback\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`role\` enum('job_seeker','referrer') NOT NULL DEFAULT 'job_seeker', \`subscriptionId\` varchar(80) NOT NULL, \`reason\` enum('got_job','too_expensive','not_using','missing_feature','other') NOT NULL, \`outcome\` enum('cancelled','paused') NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`subscriptionCancellationFeedback_id\` PRIMARY KEY(\`id\`), INDEX \`subscription_cancellation_feedback_user_idx\`(\`userId\`,\`createdAt\`), CONSTRAINT \`subscription_cancellation_feedback_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE)` },
  // Kit landed journey + private thank-you wall (0108, §3b row 20 slices C/D).
  { table: "landedJourney", createSql: `CREATE TABLE IF NOT EXISTS \`landedJourney\` (\`id\` int AUTO_INCREMENT NOT NULL, \`referralRequestId\` int NOT NULL, \`seekerUserId\` int NOT NULL, \`referrerUserId\` int NOT NULL, \`thankYouMessage\` text NULL, \`shareOnWall\` boolean NOT NULL DEFAULT false, \`payForwardChoice\` varchar(12) NULL, \`deliveredAt\` timestamp NULL, \`conversationMessageId\` int NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`landedJourney_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`landed_journey_request_unique\`(\`referralRequestId\`), INDEX \`landed_journey_referrer_wall_idx\`(\`referrerUserId\`,\`shareOnWall\`), CONSTRAINT \`landed_journey_request_fk\` FOREIGN KEY (\`referralRequestId\`) REFERENCES \`referralRequests\` (\`id\`) ON DELETE CASCADE, CONSTRAINT \`landed_journey_seeker_fk\` FOREIGN KEY (\`seekerUserId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE, CONSTRAINT \`landed_journey_referrer_fk\` FOREIGN KEY (\`referrerUserId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE)` },
  // Job catalog (0120, D-174-job-catalog packet section 5.5): board sources
  // registered with evidence and the catalog rows fetched from them. Both
  // start empty; the sync job writes nothing while JOB_CATALOG_ENABLED is
  // false.
  { table: "companyJobSources", createSql: `CREATE TABLE IF NOT EXISTS \`companyJobSources\` (\`id\` int AUTO_INCREMENT NOT NULL, \`companyId\` int NOT NULL, \`provider\` varchar(20) NOT NULL, \`boardToken\` varchar(120) NOT NULL, \`evidenceUrl\` varchar(2048) NOT NULL, \`verifiedAt\` timestamp NULL, \`lastFetchedAt\` timestamp NULL, \`lastCount\` int NULL, \`status\` enum('verified','unverified','failing') NOT NULL DEFAULT 'unverified', \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`companyJobSources_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`company_job_sources_company_fk\` FOREIGN KEY (\`companyId\`) REFERENCES \`companies\` (\`id\`) ON DELETE CASCADE, UNIQUE INDEX \`company_job_sources_provider_token_unique\`(\`provider\`,\`boardToken\`), INDEX \`company_job_sources_company_idx\`(\`companyId\`))` },
  { table: "catalogJobs", createSql: `CREATE TABLE IF NOT EXISTS \`catalogJobs\` (\`id\` int AUTO_INCREMENT NOT NULL, \`companyId\` int NOT NULL, \`sourceId\` int NOT NULL, \`externalId\` varchar(190) NOT NULL, \`title\` varchar(300) NOT NULL, \`rawLocation\` varchar(300) NULL, \`locations\` text NOT NULL, \`workMode\` enum('onsite','hybrid','remote','unknown') NOT NULL DEFAULT 'unknown', \`department\` varchar(200) NULL, \`jobFunction\` varchar(60) NULL, \`level\` int NOT NULL, \`applyUrl\` varchar(2048) NOT NULL, \`snippet\` varchar(400) NOT NULL DEFAULT '', \`publishedAt\` timestamp NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, \`firstSeenAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`lastSeenAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`closedAt\` timestamp NULL, CONSTRAINT \`catalogJobs_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`catalog_jobs_company_fk\` FOREIGN KEY (\`companyId\`) REFERENCES \`companies\` (\`id\`) ON DELETE CASCADE, CONSTRAINT \`catalog_jobs_source_fk\` FOREIGN KEY (\`sourceId\`) REFERENCES \`companyJobSources\` (\`id\`) ON DELETE CASCADE, UNIQUE INDEX \`catalog_jobs_source_external_unique\`(\`sourceId\`,\`externalId\`), INDEX \`catalog_jobs_company_closed_idx\`(\`companyId\`,\`closedAt\`), INDEX \`catalog_jobs_company_level_idx\`(\`companyId\`,\`level\`))` },
];

export const DESIRED_COLUMNS: Array<{ table: string; column: string; definition: string }> = [
  { table: "safetyReports", column: "severity", definition: "VARCHAR(8) NOT NULL DEFAULT 'normal'" },
  { table: "safetyReports", column: "dueAt", definition: "TIMESTAMP NULL" },
  { table: "companyOpportunities", column: "compensation", definition: "TEXT NULL" },
  { table: "jobs", column: "compensation", definition: "TEXT NULL" },
  { table: "referralRequests", column: "savedAt", definition: "TIMESTAMP NULL" },
  { table: "notifications", column: "eventKey", definition: "VARCHAR(120) NULL" },
  { table: "notifications", column: "kind", definition: "VARCHAR(32) NULL" },
  { table: "notifications", column: "refId", definition: "INT NULL" },
  { table: "users", column: "suspended", definition: "BOOLEAN NOT NULL DEFAULT false" },
  { table: "users", column: "sessionsValidAfter", definition: "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" },
  // B2B monetization (0037). The profiles.accountType enum widening
  // (append 'employer') is intentionally NOT here: ADD COLUMN cannot widen an
  // existing ENUM, so it is applied by drizzle/0037_b2b_monetization.sql only.
  { table: "profiles", column: "anonymityOptIn", definition: "BOOLEAN NOT NULL DEFAULT false" },
  { table: "companyOpportunities", column: "sponsoredUntil", definition: "TIMESTAMP NULL" },
  { table: "companyOpportunities", column: "sponsoredTier", definition: "ENUM('standard','featured','spotlight') NULL" },
  { table: "profiles", column: "handle", definition: "VARCHAR(40) NULL" },
  { table: "profiles", column: "preferAreas", definition: "TEXT NULL" },
  { table: "profiles", column: "preferLevels", definition: "TEXT NULL" },
  { table: "profiles", column: "openTo", definition: "TEXT NULL" },
  { table: "referralTransitionEvents", column: "referenceId", definition: "VARCHAR(64) NULL" },
  { table: "referralRequestPasses", column: "reasonCode", definition: "VARCHAR(32) NULL" },
  { table: "profiles", column: "experienceLevel", definition: "VARCHAR(40) NULL" },
  { table: "profiles", column: "seekerGoal", definition: "VARCHAR(60) NULL" },
  { table: "profiles", column: "searchCity", definition: "VARCHAR(120) NULL" },
  { table: "profiles", column: "searchCountries", definition: "VARCHAR(240) NULL" },
  { table: "profiles", column: "searchRemote", definition: "BOOLEAN NULL" },
  { table: "profiles", column: "workAuthorization", definition: "VARCHAR(80) NULL" },
  { table: "profiles", column: "workLinkKinds", definition: "TEXT NULL" },
  { table: "profiles", column: "defaultResumeAttachmentId", definition: "INT NULL" },
  { table: "assistantApprovals", column: "targetRoleUrl", definition: "TEXT NULL" },
  { table: "assistantApprovals", column: "attachmentIds", definition: "TEXT NULL" },
  { table: "assistantApprovals", column: "idempotencyKey", definition: "VARCHAR(64) NULL" },
  { table: "assistantApprovals", column: "executedRequestId", definition: "INT NULL" },
  { table: "profiles", column: "referrerVisibility", definition: "ENUM('anon','named') NOT NULL DEFAULT 'anon'" },
  { table: "profiles", column: "notifyNewAsk", definition: "boolean NOT NULL DEFAULT true" },
  { table: "profiles", column: "notifyDigest", definition: "boolean NOT NULL DEFAULT false" },
  { table: "profiles", column: "paused", definition: "boolean NOT NULL DEFAULT false" },
  { table: "profiles", column: "profileVisibility", definition: "ENUM('public','link','private') NOT NULL DEFAULT 'private'" },
  { table: "resumeUploadSessions", column: "clientUploadId", definition: "VARCHAR(64) NULL" },
  { table: "resumeUploadSessions", column: "finalizationOwner", definition: "VARCHAR(64) NULL" },
  { table: "resumeUploadSessions", column: "finalizationLeaseUntil", definition: "TIMESTAMP NULL" },
  { table: "resumeUploadSessions", column: "permanentStorageKey", definition: "VARCHAR(1024) NULL" },
  { table: "referralAttachments", column: "uploadSessionId", definition: "VARCHAR(64) NULL" },
  { table: "referralRequests", column: "idempotencyKey", definition: "VARCHAR(64) NULL" },
  { table: "referralRequests", column: "requestFingerprint", definition: "VARCHAR(64) NULL" },
  { table: "referralRequests", column: "debitTransactionId", definition: "INT NULL" },
  { table: "tokenTransactions", column: "source", definition: "VARCHAR(40) NULL" },
  { table: "tokenTransactions", column: "sourceCycleKey", definition: "VARCHAR(16) NULL" },
  { table: "tokenTransactions", column: "referenceType", definition: "VARCHAR(40) NULL" },
  { table: "tokenTransactions", column: "referenceId", definition: "VARCHAR(80) NULL" },
  { table: "tokenTransactions", column: "idempotencyKey", definition: "VARCHAR(64) NULL" },
  { table: "tokenTransactions", column: "reversesTransactionId", definition: "INT NULL" },
  { table: "tokenTransactions", column: "rewardStatus", definition: "ENUM('pending','granted') NULL" },
  { table: "tokenTransactions", column: "qualifiedByType", definition: "VARCHAR(40) NULL" },
  { table: "tokenTransactions", column: "qualifiedById", definition: "VARCHAR(80) NULL" },
  { table: "tokenTransactions", column: "qualifiedAt", definition: "TIMESTAMP NULL" },
  { table: "tokenTransactions", column: "balanceAfter", definition: "INT NULL" },
  { table: "tokenTransactions", column: "monthlyCreditsAfter", definition: "INT NULL" },
  { table: "companyCoverageInvitations", column: "referralRequestId", definition: "INT NULL" },
  // Job function taxonomy (0077).
  { table: "jobs", column: "jobFunction", definition: "VARCHAR(32) NULL" },
  { table: "jobs", column: "jobFunctionSource", definition: "ENUM('seeker','inferred','backfill') NULL" },
  // Kit credit ledger (0089). The kind ENUM widening is applied by the migration only.
  { table: "tokenTransactions", column: "creditGrantId", definition: "INT NULL" },
  // Subscription management (0090). The plan ENUM widenings are applied by the migration only.
  { table: "tokenBalances", column: "subscriptionItemPriceId", definition: "VARCHAR(100) NULL" },
  { table: "tokenBalances", column: "subscriptionBillingPeriod", definition: "ENUM('monthly','yearly','30d','90d') NULL" },
  { table: "tokenBalances", column: "subscriptionAmount", definition: "INT NULL" },
  { table: "tokenBalances", column: "pendingPlan", definition: "VARCHAR(32) NULL" },
  { table: "tokenBalances", column: "pendingBillingPeriod", definition: "ENUM('monthly','yearly','30d','90d') NULL" },
  { table: "tokenBalances", column: "pendingPlanEffectiveAt", definition: "TIMESTAMP NULL" },
  { table: "tokenBalances", column: "subscriptionPauseAt", definition: "TIMESTAMP NULL" },
  { table: "tokenBalances", column: "subscriptionResumeAt", definition: "TIMESTAMP NULL" },
  { table: "tokenBalances", column: "paymentDueSince", definition: "TIMESTAMP NULL" },
  { table: "tokenBalances", column: "paymentDueInvoiceId", definition: "VARCHAR(80) NULL" },
  { table: "tokenBalances", column: "paymentDueAmount", definition: "INT NULL" },
  { table: "tokenBalances", column: "paymentNextRetryAt", definition: "TIMESTAMP NULL" },
  { table: "tokenBalances", column: "paymentFailureReason", definition: "VARCHAR(32) NULL" },
  { table: "tokenBalances", column: "paymentRetryRequestedAt", definition: "TIMESTAMP NULL" },
  { table: "subscriptionCheckoutIntents", column: "billingPeriod", definition: "ENUM('monthly','yearly','30d','90d') NOT NULL DEFAULT 'monthly'" },
  { table: "subscriptionCheckoutIntents", column: "kind", definition: "ENUM('new','change') NOT NULL DEFAULT 'new'" },
  { table: "subscriptionCheckoutIntents", column: "subscriptionId", definition: "VARCHAR(80) NULL" },
  { table: "subscriptionCheckoutIntents", column: "failureReason", definition: "VARCHAR(32) NULL" },
  { table: "subscriptionCheckoutIntents", column: "failureCode", definition: "VARCHAR(64) NULL" },
  { table: "subscriptionCheckoutIntents", column: "failedAt", definition: "TIMESTAMP NULL" },
  // Pricing model (0091): the one-time reverse trial window. The plan, period, grant source
  // and ledger kind ENUM widenings are applied by the migration only.
  { table: "tokenBalances", column: "trialStartedAt", definition: "TIMESTAMP NULL" },
  { table: "tokenBalances", column: "trialEndsAt", definition: "TIMESTAMP NULL" },
  // D-022 referrer-posted roles (0094). Post expiry is added defensively as NULL here;
  // 0094 backfills each row to its pre-migration visible state (hiring-now: createdAt +
  // 30 days; walk-ins: walkInEndsAt, malformed end-less walk-ins stay hidden) and
  // enforces NOT NULL, and every read treats a missing expiry as "not expired" so a
  // drifted DB never hides live posts.
  { table: "companyOpportunities", column: "expiresAt", definition: "TIMESTAMP NULL" },
  { table: "companyOpportunities", column: "showPosterFirstName", definition: "BOOLEAN NOT NULL DEFAULT false" },
  { table: "referralRequests", column: "opportunityId", definition: "INT NULL" },
  { table: "referralRequests", column: "firstLookReferrerId", definition: "INT NULL" },
  { table: "referralRequests", column: "firstLookUntil", definition: "TIMESTAMP NULL" },
  // D-034/D-047/D-061 (0095): first visibility starts the 7-day clock; an ask
  // held for credit keeps coverageHeldAt until the sweep delivers it. Both are
  // nullable and older rows read through coalesce(coverageVisibleAt, createdAt).
  { table: "referralRequests", column: "coverageVisibleAt", definition: "TIMESTAMP NULL" },
  { table: "referralRequests", column: "coverageHeldAt", definition: "TIMESTAMP NULL" },
  // D-079 (0096): card validation for free credits. Both nullable; a null
  // cardValidatedAt means "no validated card" and a null chargebeeCustomerId
  // means the provider customer is created on first use.
  { table: "tokenBalances", column: "cardValidatedAt", definition: "TIMESTAMP NULL" },
  { table: "tokenBalances", column: "lastPaidAt", definition: "TIMESTAMP NULL" },
  { table: "users", column: "chargebeeCustomerId", definition: "VARCHAR(80) NULL" },
  // Seeker company demand (0104): the optional work function on a demand vote.
  { table: "companySuggestions", column: "jobFunction", definition: "VARCHAR(32) NULL" },
];

// Indexes for OTP lookup and idempotency/atomic-spend contracts. Applied
// idempotently at boot: missing indexes are created, matching uniqueness is
// skipped, and mismatched uniqueness is dropped and recreated.
// Keep in sync with drizzle/schema.ts.
export const DESIRED_INDEXES: Array<{ table: string; name: string; columns: string; nonUnique?: boolean }> = [
  { table: "seekerAgentGrants", name: "seeker_agent_grants_key_hash_unique", columns: "`keyHash`" },
  { table: "seekerAgentGrants", name: "seeker_agent_grants_user_idx", columns: "`userId`", nonUnique: true },
  { table: "seekerAgentControls", name: "seeker_agent_controls_user_unique", columns: "`userId`" },
  { table: "seekerAgentDrafts", name: "seeker_agent_drafts_grant_idx", columns: "`grantId`,`createdAt`", nonUnique: true },
  { table: "seekerAgentDrafts", name: "seeker_agent_drafts_user_idx", columns: "`userId`,`createdAt`", nonUnique: true },
  { table: "seekerAgentEvents", name: "seeker_agent_events_grant_idx", columns: "`grantId`,`createdAt`", nonUnique: true },
  { table: "seekerAgentEvents", name: "seeker_agent_events_user_idx", columns: "`userId`,`createdAt`", nonUnique: true },
  { table: "workEmailOtpCodes", name: "work_email_otp_active_idx", columns: "`email`,`consumedAt`,`expiresAt`,`createdAt`", nonUnique: true },
  { table: "resumeUploadSessions", name: "resume_upload_sessions_owner_client_unique", columns: "`ownerId`,`clientUploadId`" },
  { table: "referralAttachments", name: "referral_attachments_upload_session_unique", columns: "`uploadSessionId`" },
  { table: "referralRequests", name: "referral_requests_seeker_idempotency_unique", columns: "`jobSeekerId`,`idempotencyKey`" },
  { table: "tokenTransactions", name: "token_transactions_debit_reference_unique", columns: "`userId`,`role`,`kind`,`referenceType`,`referenceId`" },
  { table: "tokenTransactions", name: "token_transactions_idempotency_kind_unique", columns: "`userId`,`role`,`idempotencyKey`,`kind`" },
  { table: "tokenTransactions", name: "token_transactions_reversal_unique", columns: "`reversesTransactionId`" },
  { table: "notifications", name: "notifications_event_key_unique", columns: "`eventKey`" },
  { table: "companyCoverageInvitations", name: "coverage_invite_request_unique", columns: "`referralRequestId`" },
  { table: "workItems", name: "work_items_user_idx", columns: "`userId`", nonUnique: true },
  { table: "profiles", name: "profiles_handle_unique", columns: "`handle`" },
  { table: "safetyReports", name: "safety_reports_reporter_idx", columns: "`reporterUserId`", nonUnique: true },
  { table: "safetyReports", name: "safety_reports_status_idx", columns: "`status`", nonUnique: true },
  { table: "companySuggestions", name: "company_suggestions_submitter_idx", columns: "`submitterUserId`", nonUnique: true },
  { table: "companySuggestions", name: "company_suggestions_status_idx", columns: "`status`", nonUnique: true },
  { table: "profiles", name: "profiles_handle_unique", columns: "`handle`" },
  { table: "askDrafts", name: "ask_drafts_user_unique", columns: "`userId`" },
  { table: "dataExports", name: "data_exports_active_unique", columns: "`activeKey`" },
  { table: "accountPreferences", name: "account_preferences_user_unique", columns: "`userId`" },
  { table: "moderationEvents", name: "moderation_events_report_idx", columns: "`reportId`,`createdAt`", nonUnique: true },
  { table: "moderationEvidence", name: "moderation_evidence_report_idx", columns: "`reportId`,`seq`", nonUnique: true },
  { table: "dataExports", name: "data_exports_user_idx", columns: "`userId`,`requestedAt`", nonUnique: true },
  { table: "seekerAlerts", name: "seeker_alerts_user_domain_unique", columns: "`userId`,`companyDomain`" },
  { table: "seekerAlerts", name: "seeker_alerts_user_idx", columns: "`userId`", nonUnique: true },
  { table: "seekerAlerts", name: "seeker_alerts_domain_idx", columns: "`companyDomain`", nonUnique: true },
  { table: "assistantConnections", name: "assistant_connections_user_idx", columns: "`userId`", nonUnique: true },
  { table: "assistantConnections", name: "assistant_connections_status_idx", columns: "`status`", nonUnique: true },
  { table: "assistantTokens", name: "assistant_tokens_user_name_unique", columns: "`userId`,`name`" },
  { table: "assistantTokens", name: "assistant_tokens_user_idx", columns: "`userId`", nonUnique: true },
  { table: "developerApps", name: "developer_apps_user_idx", columns: "`userId`", nonUnique: true },
  { table: "developerApps", name: "developer_apps_status_idx", columns: "`status`", nonUnique: true },
  { table: "assistantApprovals", name: "assistant_approvals_user_idx", columns: "`userId`", nonUnique: true },
  { table: "assistantApprovals", name: "assistant_approvals_status_idx", columns: "`status`", nonUnique: true },
  { table: "assistantApprovals", name: "assistant_approvals_expiry_idx", columns: "`expiresAt`", nonUnique: true },
  { table: "oauthClients", name: "oauthClients_clientId_unique", columns: "`clientId`" },
  { table: "oauthAuthCodes", name: "oauthAuthCodes_codeHash_unique", columns: "`codeHash`" },
  { table: "oauthAuthCodes", name: "oauth_auth_codes_user_idx", columns: "`userId`", nonUnique: true },
  { table: "oauthAuthCodes", name: "oauth_auth_codes_expiry_idx", columns: "`expiresAt`", nonUnique: true },
  { table: "companies", name: "companies_slug_unique", columns: "`slug`" },
  { table: "companies", name: "companies_status_sort_idx", columns: "`status`,`sortOrder`", nonUnique: true },
  { table: "companyDomains", name: "company_domains_domain_unique", columns: "`domain`" },
  { table: "companyDomains", name: "company_domains_company_idx", columns: "`companyId`", nonUnique: true },
  { table: "jobs", name: "jobs_company_function_idx", columns: "`company`,`jobFunction`", nonUnique: true },
  // Scheduled job runs (0078): the unique key is the single-flight lock.
  { table: "jobRuns", name: "job_runs_job_window_unique", columns: "`jobName`,`windowKey`" },
  { table: "jobRuns", name: "job_runs_job_started_idx", columns: "`jobName`,`startedAt`", nonUnique: true },
  // Kit credit ledger (0089): the grant key is the idempotency claim.
  { table: "planCreditGrants", name: "plan_credit_grants_grant_key_unique", columns: "`grantKey`" },
  { table: "planCreditGrants", name: "plan_credit_grants_user_status_idx", columns: "`userId`,`role`,`status`", nonUnique: true },
  { table: "planCreditGrants", name: "plan_credit_grants_status_expiry_idx", columns: "`status`,`expiresAt`", nonUnique: true },
  { table: "tokenTransactions", name: "token_transactions_credit_grant_idx", columns: "`creditGrantId`", nonUnique: true },
  { table: "tokenTransactions", name: "token_transactions_cycle_idx", columns: "`userId`,`role`,`sourceCycleKey`", nonUnique: true },
  // Subscription management (0090).
  { table: "subscriptionCheckoutIntents", name: "subscription_checkout_subscription_idx", columns: "`subscriptionId`", nonUnique: true },
  { table: "billingCustomers", name: "billing_customers_provider_customer_unique", columns: "`provider`,`site`,`providerCustomerId`" },
  { table: "billingCustomers", name: "billing_customers_owner_unique", columns: "`userId`,`role`,`provider`,`site`" },
  { table: "billingInvoices", name: "billing_invoices_provider_invoice_unique", columns: "`provider`,`site`,`providerInvoiceId`" },
  { table: "billingInvoices", name: "billing_invoices_owner_paid_idx", columns: "`userId`,`role`,`paidAt`", nonUnique: true },
  { table: "subscriptionCancellationFeedback", name: "subscription_cancellation_feedback_user_idx", columns: "`userId`,`createdAt`", nonUnique: true },
  // D-022 referrer-posted roles (0094): the first-look-release sweep scans by this clock.
  { table: "referralRequests", name: "referral_requests_first_look_idx", columns: "`firstLookUntil`", nonUnique: true },
  // Kit landed journey + private thank-you wall (0108).
  { table: "landedJourney", name: "landed_journey_request_unique", columns: "`referralRequestId`" },
  { table: "landedJourney", name: "landed_journey_referrer_wall_idx", columns: "`referrerUserId`,`shareOnWall`", nonUnique: true },
  // D-047 (0095): the coverage-delivery sweep scans held asks by this clock.
  { table: "referralRequests", name: "referral_requests_coverage_held_idx", columns: "`coverageHeldAt`", nonUnique: true },
  // Task 13 (0105): the pieces pinned to one ask, read in the order the seeker chose.
  { table: "askCosts", name: "ask_costs_request_unique", columns: "`referralRequestId`" },
  { table: "seekerLevels", name: "seeker_levels_user_unique", columns: "`userId`" },
  { table: "askWorkItems", name: "ask_work_items_request_piece_unique", columns: "`referralRequestId`,`workItemId`" },
  { table: "askWorkItems", name: "ask_work_items_request_idx", columns: "`referralRequestId`,`position`", nonUnique: true },
];

// Foreign keys the running code relies on. Unlike tables and columns, a FK is
// never created here: reconcile only READS, so every entry must already be
// created by a drizzle/deploy/*.sql migration, which server/schemaDeployGuard.test.ts
// enforces. Keep in sync with the .references() calls in drizzle/schema.ts.
//
// Dropped 2026-09-24: this list also required resumeUploadChunks.acceptedAttemptId
// -> resumeUploadAttempts.id. Production satisfies it, but no file in the
// repository can: schema.ts declares neither the column nor the table, and no
// deploy migration creates them, so a database rebuilt from repo SQL could never
// pass and would sit at /api/health/ready 503 forever. Nothing reads the column.
// The live table it implies is undocumented source/prod drift, not a requirement.
export const DESIRED_FOREIGN_KEYS: Array<{ table: string; column: string; referencedTable: string; referencedColumn: string }> = [
  { table: "seekerAgentGrants", column: "userId", referencedTable: "users", referencedColumn: "id" },
  { table: "seekerAgentControls", column: "userId", referencedTable: "users", referencedColumn: "id" },
  { table: "seekerAgentDrafts", column: "userId", referencedTable: "users", referencedColumn: "id" },
  { table: "seekerAgentEvents", column: "userId", referencedTable: "users", referencedColumn: "id" },
  { table: "referralAttachments", column: "uploadSessionId", referencedTable: "resumeUploadSessions", referencedColumn: "id" },
  { table: "workItems", column: "userId", referencedTable: "users", referencedColumn: "id" },
  { table: "safetyReports", column: "reporterUserId", referencedTable: "users", referencedColumn: "id" },
  { table: "safetyReports", column: "referralRequestId", referencedTable: "referralRequests", referencedColumn: "id" },
  { table: "safetyReports", column: "reportedUserId", referencedTable: "users", referencedColumn: "id" },
  { table: "companySuggestions", column: "submitterUserId", referencedTable: "users", referencedColumn: "id" },
  { table: "seekerAlerts", column: "userId", referencedTable: "users", referencedColumn: "id" },
  { table: "askDrafts", column: "userId", referencedTable: "users", referencedColumn: "id" },
  // Task 13 (0105): the ask owns its pinned-work history; a deleted showcase
  // piece nulls the link and the snapshot row stays.
  { table: "askCosts", column: "referralRequestId", referencedTable: "referralRequests", referencedColumn: "id" },
  { table: "seekerLevels", column: "userId", referencedTable: "users", referencedColumn: "id" },
  { table: "askWorkItems", column: "referralRequestId", referencedTable: "referralRequests", referencedColumn: "id" },
  { table: "askWorkItems", column: "workItemId", referencedTable: "workItems", referencedColumn: "id" },
  { table: "dataExports", column: "userId", referencedTable: "users", referencedColumn: "id" },
  { table: "accountPreferences", column: "userId", referencedTable: "users", referencedColumn: "id" },
  { table: "moderationEvents", column: "reportId", referencedTable: "safetyReports", referencedColumn: "id" },
  { table: "moderationEvidence", column: "reportId", referencedTable: "safetyReports", referencedColumn: "id" },
  { table: "assistantConnections", column: "userId", referencedTable: "users", referencedColumn: "id" },
  { table: "assistantTokens", column: "userId", referencedTable: "users", referencedColumn: "id" },
  { table: "developerApps", column: "userId", referencedTable: "users", referencedColumn: "id" },
  { table: "assistantApprovals", column: "userId", referencedTable: "users", referencedColumn: "id" },
  { table: "assistantApprovals", column: "connectionId", referencedTable: "assistantConnections", referencedColumn: "id" },
  { table: "companyDomains", column: "companyId", referencedTable: "companies", referencedColumn: "id" },
  { table: "planCreditGrants", column: "userId", referencedTable: "users", referencedColumn: "id" },
  { table: "billingCustomers", column: "userId", referencedTable: "users", referencedColumn: "id" },
  { table: "billingInvoices", column: "userId", referencedTable: "users", referencedColumn: "id" },
  { table: "subscriptionCancellationFeedback", column: "userId", referencedTable: "users", referencedColumn: "id" },
  // D-022 referrer-posted roles (0094): deleting a post or a person must never
  // pin ask history, so both links null out.
  { table: "referralRequests", column: "opportunityId", referencedTable: "companyOpportunities", referencedColumn: "id" },
  { table: "referralRequests", column: "firstLookReferrerId", referencedTable: "users", referencedColumn: "id" },
  // Kit landed journey (0108): a thank-you goes when the ask or either person goes.
  { table: "landedJourney", column: "referralRequestId", referencedTable: "referralRequests", referencedColumn: "id" },
  { table: "landedJourney", column: "seekerUserId", referencedTable: "users", referencedColumn: "id" },
  { table: "landedJourney", column: "referrerUserId", referencedTable: "users", referencedColumn: "id" },
];

// Foreign keys the running code relies on. Unlike tables and columns, a FK is
// never created here: reconcile only READS, so every entry must already be
// created by a drizzle/deploy/*.sql migration, which server/schemaDeployGuard.test.ts
// enforces. Keep in sync with the .references() calls in drizzle/schema.ts.
//
// Dropped 2026-09-24: this list also required resumeUploadChunks.acceptedAttemptId
// -> resumeUploadAttempts.id. Production satisfies it, but no file in the
// repository can: schema.ts declares neither the column nor the table, and no
// deploy migration creates them, so a database rebuilt from repo SQL could never
// pass and would sit at /api/health/ready 503 forever. Nothing reads the column.
// The live table it implies is undocumented source/prod drift, not a requirement.
export const DESIRED_FOREIGN_KEYS: Array<{ table: string; column: string; referencedTable: string; referencedColumn: string }> = [
  { table: "referralAttachments", column: "uploadSessionId", referencedTable: "resumeUploadSessions", referencedColumn: "id" },
];

// The only DDL this module ever runs: the fixed ALTER/CREATE statements derived
// from DESIRED_COLUMNS + DESIRED_TABLES above. Nothing request-controlled is
// ever interpolated — the admin trigger just chooses WHEN the allowlist runs.
export type ReconcileStatementResult = { statement: string; ok: boolean; error?: string; errorCode?: string };

// Drizzle surfaces driver failures as DrizzleQueryError("Failed query: …
// params: …") with the real MySQL error on `cause` (code/errno/sqlState).
// Recording only err.message discards the diagnosis (missing table vs denied
// DDL vs no database selected vs lock timeout), so unwrap the cause chain.
export function isDuplicateColumnError(err: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (typeof current === "object") {
      const typed = current as { code?: unknown; errno?: unknown; sqlState?: unknown; cause?: unknown };
      if (typed.code === "ER_DUP_FIELDNAME" || typed.errno === 1060 || typed.sqlState === "42S21") return true;
      current = typed.cause;
    } else break;
  }
  return false;
}

export function isDuplicateEntryError(err: unknown): boolean {
  const seen = new Set<unknown>(); let current: unknown = err;
  while (current && !seen.has(current)) { seen.add(current); if (typeof current === "object") { const typed=current as {code?:unknown;errno?:unknown;sqlState?:unknown;cause?:unknown}; if (typed.code === "ER_DUP_ENTRY" || typed.errno === 1062 || typed.sqlState === "23000") return true; current=typed.cause; } else break; }
  return false;
}


export function reconcileErrorCode(err: unknown): string | undefined {
  const seen=new Set<unknown>(); let current:unknown=err;
  while(current&&!seen.has(current)){seen.add(current);if(typeof current==="object"){const typed=current as {code?:unknown;errno?:unknown;cause?:unknown};if(typeof typed.code==="string"&&typed.code.startsWith("ER_"))return typed.code;if(typeof typed.errno==="number")return `MYSQL_${typed.errno}`;current=typed.cause;}else break;}
  return undefined;
}

export function describeReconcileError(err: unknown): string {
  const top = err instanceof Error ? err.message : String(err);
  const causes: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err instanceof Error ? (err as { cause?: unknown }).cause : undefined;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      const code = (current as { code?: unknown }).code;
      const errno = (current as { errno?: unknown }).errno;
      const sqlState = (current as { sqlState?: unknown }).sqlState;
      const qualifier = [typeof code === "string" && code ? code : null, typeof errno === "number" ? `errno ${errno}` : null, typeof sqlState === "string" && sqlState ? `sqlstate ${sqlState}` : null].filter(Boolean).join(" ");
      causes.push(qualifier ? `${qualifier}: ${current.message}` : current.message);
      current = (current as { cause?: unknown }).cause;
    } else {
      causes.push(String(current));
      break;
    }
  }
  return causes.length ? `${top} | cause: ${causes.join(" <- ")}` : top;
}

// Centralized safe diagnostic serializer for failed reconciliation attempts.
// Built on describeReconcileError; adds error classification, attempt number,
// and backoff delay. Defensively redacts connection strings, credentials,
// tokens, and driver-echoed SQL params so logs never carry secrets or user data.
export function redactReconcileLogText(text: string): string {
  let out = text;
  const envUrl = process.env.DATABASE_URL;
  if (envUrl) {
    out = out.split(envUrl).join("[redacted-database-url]");
    try {
      const parsed = new URL(envUrl);
      if (parsed.password) out = out.split(parsed.password).join("[redacted]");
      if (parsed.username) out = out.split(parsed.username).join("[redacted-user]");
      if (parsed.hostname) out = out.split(parsed.hostname).join("[redacted-host]");
    } catch { /* non-URL value: exact-match redaction above suffices */ }
  }
  out = out.replace(/[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s'"]+/g, "[redacted-connection-string]");
  out = out.replace(/\bparams\s*:\s*\[[^\]]*\]/gi, "params: [redacted]");
  out = out.replace(/(password|passwd|pwd|secret|token|api[_-]?key|auth(?:orization)?|credential|DATABASE_URL|connection[_-]?string)\s*[:=]\s*('[^']*'|"[^"]*"|[^\s'";,]+)/gi, "$1=[redacted]");
  out = out.replace(/(\bpass(?:word)?\b\s*[:=]\s*)([^\s'";,]+)/gi, "$1[redacted]");
  out = out.replace(/Bearer\s+[A-Za-z0-9\-._~+/=]+/g, "Bearer [redacted]");
  return out.length > 2000 ? `${out.slice(0, 2000)}…[truncated]` : out;
}

export type ReconcileFailureReason = "validation_error" | "db_unavailable" | "db_error" | "schema_mismatch";

export function formatSafeReconcileDiagnostic(error: unknown, opts: { attempt: number; nextDelayMs?: number | null; reason: ReconcileFailureReason }): string {
  const code = reconcileErrorCode(error) ?? (opts.reason === "db_unavailable" ? "DB_UNAVAILABLE" : "UNKNOWN");
  const message = error instanceof Error ? error.message : String(error ?? opts.reason);
  const described = error === null || error === undefined ? opts.reason : describeReconcileError(error);
  return redactReconcileLogText(
    `attempt=${opts.attempt} reason=${opts.reason} code=${code} nextDelayMs=${opts.nextDelayMs ?? "none"} message=${message} detail=${described}`,
  );
}

let reconciled = false;
let lastError: string | null = null;
let lastResults: ReconcileStatementResult[] = [];
let inFlight: Promise<{ applied: string[]; skipped: string[] }> | null = null;
let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
let recoveryAttempts = 0;
let recoveryBaseDelayMs = 1000;
let recoveryMaxDelayMs = 30000;

function computeBackoffDelayMs(failedAttempt: number): number {
  return Math.min(recoveryBaseDelayMs * 2 ** Math.min(Math.max(failedAttempt - 1, 0), 5), recoveryMaxDelayMs);
}

function logFailedReconcileAttempt(error: unknown, reason: ReconcileFailureReason): void {
  recoveryAttempts += 1;
  console.error("[schema-validation]", formatSafeReconcileDiagnostic(error, { attempt: recoveryAttempts, nextDelayMs: computeBackoffDelayMs(recoveryAttempts), reason }));
}

export async function reconcileSchema(): Promise<{ applied: string[]; skipped: string[] }> {
  // Schema changes belong to versioned migrations. Runtime validation is
  // deliberately read-only so startup and public health traffic can never run DDL.
  if (reconciled) return { applied: [], skipped: [] };
  if (inFlight) return inFlight;
  let db: Awaited<ReturnType<typeof getDb>>;
  try {
    db = await getDb();
  } catch (error) {
    // Preserve the throw contract (admin trigger answers 500) while emitting
    // the single per-attempt diagnostic through the centralized serializer.
    // The recovery loop's catch skips re-logging via the marker below.
    logFailedReconcileAttempt(error, "db_error");
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { __reconcileLogged: true });
  }
  if (!db) {
    logFailedReconcileAttempt(null, "db_unavailable");
    console.error("[schema-validation] DB-unavailable: no database handle (DATABASE_URL unset or connect failed)");
    return { applied: [], skipped: [] };
  }
  const run = (async () => {
    const results: ReconcileStatementResult[] = [];
    lastError = null;
    try {
      const result = await db.execute(sql`SELECT TABLE_NAME, COLUMN_NAME, NULL AS INDEX_NAME, NULL AS NON_UNIQUE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() UNION ALL SELECT TABLE_NAME, NULL AS COLUMN_NAME, INDEX_NAME, NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()`);
      const rows = result[0] as unknown as Array<{ TABLE_NAME: string; COLUMN_NAME: string | null; INDEX_NAME?: string | null; NON_UNIQUE?: number | string | null }>;
      // Azure MySQL can return table identifiers folded to lowercase when
      // lower_case_table_names is enabled. Compare identifiers case-insensitively
      // while keeping the public validation keys in their canonical source form.
      const schemaKey = (...parts: Array<string | null | undefined>) => parts.map(part => part?.toLowerCase() ?? "").join(".");
      const columns = new Set(rows.filter(row => row.COLUMN_NAME).map(row => schemaKey(row.TABLE_NAME, row.COLUMN_NAME)));
      const tables = new Set(rows.map(row => row.TABLE_NAME.toLowerCase()));
      const indexes = new Map(rows.filter(row => row.INDEX_NAME).map(row => [schemaKey(row.TABLE_NAME, row.INDEX_NAME), Number(row.NON_UNIQUE ?? 0)]));
      const checks: Array<{ key: string; ok: boolean }> = [
        ...DESIRED_COLUMNS.map(item => ({ key: `column:${item.table}.${item.column}`, ok: columns.has(schemaKey(item.table, item.column)) })),
        ...DESIRED_TABLES.map(item => ({ key: `table:${item.table}`, ok: tables.has(item.table.toLowerCase()) })),
        ...DESIRED_INDEXES.map(item => ({ key: `index:${item.table}.${item.name}`, ok: indexes.get(schemaKey(item.table, item.name)) === (item.nonUnique ? 1 : 0) })),
      ];
      const fkResult = await db.execute(sql`SELECT TABLE_NAME,COLUMN_NAME,CONSTRAINT_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`);
      const foreignKeys = new Set((fkResult[0] as unknown as Array<{ TABLE_NAME:string; COLUMN_NAME:string; REFERENCED_TABLE_NAME:string; REFERENCED_COLUMN_NAME:string }>).map(row => `${schemaKey(row.TABLE_NAME, row.COLUMN_NAME)}->${schemaKey(row.REFERENCED_TABLE_NAME, row.REFERENCED_COLUMN_NAME)}`));
      checks.push(
        ...DESIRED_FOREIGN_KEYS.map(item => ({
          key: `fk:${item.table}.${item.column}`,
          ok: foreignKeys.has(`${schemaKey(item.table, item.column)}->${schemaKey(item.referencedTable, item.referencedColumn)}`),
        })),
      );
      for (const check of checks) results.push({ statement: check.key, ok: check.ok, ...(!check.ok ? { errorCode: "SCHEMA_MISMATCH" } : {}) });
      const failed = checks.filter(check => !check.ok);
      if (failed.length) lastError = `Schema validation failed (${failed.length} checks)`;
      else reconciled = true;
      lastResults = results;
      return { applied: [], skipped: checks.filter(check => check.ok).map(check => check.key) };
    } catch (error) {
      lastError = "Schema validation unavailable";
      lastResults = [];
      logFailedReconcileAttempt(error, "validation_error");
      return { applied: [], skipped: [] };
    }
  })();
  inFlight = run;
  try { return await run; } finally { if (inFlight === run) inFlight = null; }
}
export function isSchemaReconciled() { return reconciled; }
export function getLastReconcileError() { return lastError; }
// Per-statement outcome of the most recent run (empty until one has happened;
// the array is reset at the start of every run).
export function getLastReconcileResults() { return lastResults; }

// Boot-time recovery loop: retry read-only validation with backoff until it
// passes. Boot never blocks on the DB; /api/health/ready stays 503 meanwhile
// (validating/failed) and flips to 200 once reconciled. SELECT-only — the
// retry chooses WHEN validation runs, never WHAT it runs.
export function startSchemaReconcileRecovery(options?: { baseDelayMs?: number; maxDelayMs?: number }) {
  if (reconciled || recoveryTimer) return;
  recoveryBaseDelayMs = options?.baseDelayMs ?? 1000;
  recoveryMaxDelayMs = options?.maxDelayMs ?? 30000;
  const scheduleNext = () => {
    // Exception/null paths already counted this failure when they logged.
    // A silent mismatch (no exception) still backs off: count it here so the
    // delay grows instead of hot-looping.
    const before = recoveryAttempts;
    void reconcileSchema()
      .catch((error: unknown) => {
        if (!(error instanceof Error) || !(error as { __reconcileLogged?: unknown }).__reconcileLogged) {
          logFailedReconcileAttempt(error, "db_error");
        }
        return { applied: [], skipped: [] as string[] };
      })
      .then(() => {
        if (isSchemaReconciled()) {
          stopSchemaReconcileRecovery();
          return;
        }
        if (recoveryAttempts === before) recoveryAttempts += 1;
        const delayMs = computeBackoffDelayMs(recoveryAttempts);
        if (recoveryTimer) return;
        recoveryTimer = setTimeout(() => {
          recoveryTimer = null;
          scheduleNext();
        }, delayMs);
        if (typeof recoveryTimer.unref === "function") recoveryTimer.unref();
      });
  };
  scheduleNext();
}
export function stopSchemaReconcileRecovery() {
  if (recoveryTimer) {
    clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }
  recoveryAttempts = 0;
}
