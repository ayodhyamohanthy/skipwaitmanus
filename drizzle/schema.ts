import { bigint, boolean, customType, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  suspended: boolean("suspended").default(false).notNull(),
  sessionsValidAfter: timestamp("sessionsValidAfter").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const profiles = mysqlTable("profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountType: mysqlEnum("accountType", ["job_seeker", "referrer", "employer"]),
  headline: varchar("headline", { length: 180 }),
  location: varchar("location", { length: 120 }),
  bio: text("bio"),
  company: varchar("company", { length: 160 }),
  workEmailDomain: varchar("workEmailDomain", { length: 255 }),
  workEmailVerifiedAt: timestamp("workEmailVerifiedAt"),
  currentTitle: varchar("currentTitle", { length: 160 }),
  resumeUrl: varchar("resumeUrl", { length: 1024 }),
  skills: text("skills"),
  experience: text("experience"),
  expertise: text("expertise"),
  referralCapacity: int("referralCapacity").default(3),
  isOnboarded: boolean("isOnboarded").default(false).notNull(),
  // Talent discovery is strictly opt-in: a seeker must explicitly turn this on
  // before employers can ever see them in the anonymized talent list.
  anonymityOptIn: boolean("anonymityOptIn").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("profiles_user_id_unique").on(table.userId)]);

export const jobs = mysqlTable("jobs", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  company: varchar("company", { length: 160 }).notNull(),
  location: varchar("location", { length: 120 }).notNull(),
  compensation: text("compensation"), // human-readable pay range; free-text
  seniority: varchar("seniority", { length: 80 }).notNull(),
  employmentType: varchar("employmentType", { length: 80 }).notNull(),
  workMode: varchar("workMode", { length: 80 }).notNull(),
  description: text("description").notNull(),
  targetRoleUrl: varchar("targetRoleUrl", { length: 2048 }),
  compatibilityHint: varchar("compatibilityHint", { length: 255 }),
  referrerId: int("referrerId").references(() => users.id, { onDelete: "set null" }),
  publishedAt: timestamp("publishedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("jobs_company_idx").on(table.company), index("jobs_location_idx").on(table.location)]);

export const companyOpportunities = mysqlTable("companyOpportunities", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyDomain: varchar("companyDomain", { length: 255 }).notNull(),
  kind: mysqlEnum("kind", ["hiring_now", "walk_in"]).notNull(),
  roleTitle: varchar("roleTitle", { length: 180 }).notNull(),
  targetRoleUrl: varchar("targetRoleUrl", { length: 2048 }),
  location: varchar("location", { length: 180 }),
  compensation: text("compensation"), // human-readable pay range; free-text
  walkInAt: timestamp("walkInAt"),
  walkInEndsAt: timestamp("walkInEndsAt"),
  isActive: boolean("isActive").default(true).notNull(),
  // Sponsored Role Engine: paid placement window + tier. NULL while organic.
  sponsoredUntil: timestamp("sponsoredUntil"),
  sponsoredTier: mysqlEnum("sponsoredTier", ["standard", "featured", "spotlight"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("company_opportunities_public_idx").on(table.isActive, table.createdAt), index("company_opportunities_domain_idx").on(table.companyDomain), index("company_opportunities_owner_idx").on(table.ownerId), index("company_opportunities_sponsor_idx").on(table.sponsoredUntil)]);

// B2B credit economy: one self-serve billing account per employer user.
export const employerAccounts = mysqlTable("employerAccounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyName: varchar("companyName", { length: 160 }).notNull(),
  billingEmail: varchar("billingEmail", { length: 320 }).notNull(),
  credits: int("credits").default(0).notNull(),
  budgetMonthlyUsdCents: int("budgetMonthlyUsdCents").default(0).notNull(),
  approvalStatus: mysqlEnum("approvalStatus", ["pending", "approved", "rejected"]).default("pending").notNull(),
  approvedAt: timestamp("approvedAt"),
  approvedByUserId: int("approvedByUserId").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("employer_accounts_user_unique").on(table.userId)]);

// Employer-scoped random references are the only talent identifiers exposed to clients.
export const employerTalentRefs = mysqlTable("employerTalentRefs", {
  id: int("id").autoincrement().primaryKey(),
  employerUserId: int("employerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  seekerProfileUserId: int("seekerProfileUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  publicRef: varchar("publicRef", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("employer_talent_refs_public_unique").on(table.publicRef), uniqueIndex("employer_talent_refs_pair_unique").on(table.employerUserId, table.seekerProfileUserId), index("employer_talent_refs_scope_idx").on(table.employerUserId, table.publicRef)]);

// Credit Economy ledger: one unlock row per (employer, seeker) pair, ever.
export const profileUnlocks = mysqlTable("profileUnlocks", {
  id: int("id").autoincrement().primaryKey(),
  employerUserId: int("employerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  seekerProfileUserId: int("seekerProfileUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  unlockedAt: timestamp("unlockedAt").defaultNow().notNull(),
  creditsSpent: int("creditsSpent").notNull(),
}, table => [uniqueIndex("profile_unlocks_employer_seeker_unique").on(table.employerUserId, table.seekerProfileUserId), index("profile_unlocks_seeker_idx").on(table.seekerProfileUserId)]);

// A separate, consent-based intro request. Unlock purchases never double as intros.
export const employerTalentIntroRequests = mysqlTable("employerTalentIntroRequests", {
  id: int("id").autoincrement().primaryKey(),
  employerUserId: int("employerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  seekerProfileUserId: int("seekerProfileUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("employer_talent_intro_pair_unique").on(table.employerUserId, table.seekerProfileUserId)]);

// Contextual High-Intent Partner Modules: admin-curated third-party tooling
// slots rendered inside seeker-facing role feeds.
export const partnerModules = mysqlTable("partnerModules", {
  id: int("id").autoincrement().primaryKey(),
  partnerName: varchar("partnerName", { length: 120 }).notNull(),
  category: mysqlEnum("category", ["interview_prep", "resume_vetting", "skill_assessment", "other"]).notNull(),
  headline: varchar("headline", { length: 180 }).notNull(),
  description: text("description"),
  targetRoles: text("targetRoles"),
  ctaLabel: varchar("ctaLabel", { length: 80 }).notNull(),
  ctaUrl: varchar("ctaUrl", { length: 2048 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  impressions: int("impressions").default(0).notNull(),
  clicks: int("clicks").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("partner_modules_active_idx").on(table.isActive, table.createdAt)]);

export const savedRoles = mysqlTable("savedRoles", {
  id: int("id").autoincrement().primaryKey(),
  jobSeekerId: int("jobSeekerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: int("jobId").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("saved_roles_unique").on(table.jobSeekerId, table.jobId)]);

export const referralRequests = mysqlTable("referralRequests", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  jobSeekerId: int("jobSeekerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  referrerId: int("referrerId").references(() => users.id, { onDelete: "set null" }),
  personalPitch: text("personalPitch").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "declined", "intro_made", "interview", "offer", "closed", "withdrawn"]).default("pending").notNull(),
  waitingForCoverage: boolean("waitingForCoverage").default(false).notNull(),
  coverageQueuedAt: timestamp("coverageQueuedAt"),
  referrerMessage: text("referrerMessage"),
  savedAt: timestamp("savedAt"),
  idempotencyKey: varchar("idempotencyKey", { length: 64 }),
  requestFingerprint: varchar("requestFingerprint", { length: 64 }),
  debitTransactionId: int("debitTransactionId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("referral_requests_referrer_idx").on(table.referrerId), index("referral_requests_seeker_idx").on(table.jobSeekerId), index("referral_requests_status_idx").on(table.status), index("referral_requests_saved_idx").on(table.savedAt), index("referral_requests_coverage_queue_idx").on(table.waitingForCoverage, table.coverageQueuedAt), uniqueIndex("referral_requests_seeker_idempotency_unique").on(table.jobSeekerId, table.idempotencyKey)]);

export const referralRequestSaves = mysqlTable("referralRequestSaves", {
  id: int("id").autoincrement().primaryKey(),
  referralRequestId: int("referralRequestId").notNull().references(() => referralRequests.id, { onDelete: "cascade" }),
  referrerId: int("referrerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("referral_request_save_request_referrer_unique").on(table.referralRequestId, table.referrerId), index("referral_request_save_referrer_idx").on(table.referrerId, table.createdAt), index("referral_request_save_request_idx").on(table.referralRequestId)]);

export const referralRequestPasses = mysqlTable("referralRequestPasses", {
  id: int("id").autoincrement().primaryKey(),
  referralRequestId: int("referralRequestId").notNull().references(() => referralRequests.id, { onDelete: "cascade" }),
  referrerId: int("referrerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: mysqlEnum("reason", ["role_not_a_fit", "cannot_support", "timing"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("referral_request_pass_request_referrer_unique").on(table.referralRequestId, table.referrerId), index("referral_request_pass_referrer_idx").on(table.referrerId, table.createdAt)]);

export const referralShareCards = mysqlTable("referralShareCards", {
  id: int("id").autoincrement().primaryKey(),
  referralRequestId: int("referralRequestId").notNull().references(() => referralRequests.id, { onDelete: "cascade" }),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  shareToken: varchar("shareToken", { length: 64 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
}, table => [uniqueIndex("referral_share_card_token_unique").on(table.shareToken), uniqueIndex("referral_share_card_owner_request_unique").on(table.referralRequestId, table.createdByUserId), index("referral_share_card_public_idx").on(table.shareToken, table.isActive), index("referral_share_card_request_idx").on(table.referralRequestId)]);

export const referrerReviewEmailLinks = mysqlTable("referrerReviewEmailLinks", {
  id: int("id").autoincrement().primaryKey(),
  referralRequestId: int("referralRequestId").notNull().references(() => referralRequests.id, { onDelete: "cascade" }),
  referrerId: int("referrerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  linkToken: varchar("linkToken", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("referrer_review_email_token_unique").on(table.linkToken), uniqueIndex("referrer_review_email_request_referrer_unique").on(table.referralRequestId, table.referrerId), index("referrer_review_email_lookup_idx").on(table.linkToken, table.referrerId, table.expiresAt), index("referrer_review_email_request_idx").on(table.referralRequestId)]);

export const workEmailOtpCodes = mysqlTable("workEmailOtpCodes", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  codeHash: varchar("codeHash", { length: 64 }).notNull(),
  attempts: int("attempts").default(0).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("work_email_otp_email_hash_idx").on(table.email, table.codeHash), index("work_email_otp_active_idx").on(table.email, table.consumedAt, table.expiresAt, table.createdAt)]);

export const workEmailOtpRateLimits = mysqlTable("workEmailOtpRateLimits", {
  id: int("id").autoincrement().primaryKey(),
  limiterKey: varchar("limiterKey", { length: 96 }).notNull(),
  windowStart: timestamp("windowStart").notNull(),
  hitCount: int("hitCount").default(1).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("work_email_otp_rate_window_unique").on(table.limiterKey, table.windowStart), index("work_email_otp_rate_expiry_idx").on(table.expiresAt)]);

export const referrerSlackWebhooks = mysqlTable("referrerSlackWebhooks", {
  id: int("id").autoincrement().primaryKey(),
  referrerId: int("referrerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  webhookUrl: varchar("webhookUrl", { length: 512 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("referrer_slack_webhook_user_unique").on(table.referrerId)]);

export const referralAvailabilitySlots = mysqlTable("referralAvailabilitySlots", {
  id: int("id").autoincrement().primaryKey(),
  referrerId: int("referrerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyDomain: varchar("companyDomain", { length: 255 }).notNull(),
  referralRequestId: int("referralRequestId").notNull().references(() => referralRequests.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["allocated", "released"]).default("allocated").notNull(),
  activeRequestKey: varchar("activeRequestKey", { length: 80 }),
  openedAt: timestamp("openedAt").defaultNow().notNull(),
  releasedAt: timestamp("releasedAt"),
}, table => [uniqueIndex("referral_availability_active_request_unique").on(table.activeRequestKey), index("referral_availability_referrer_idx").on(table.referrerId, table.status), index("referral_availability_company_idx").on(table.companyDomain, table.status), index("referral_availability_request_idx").on(table.referralRequestId)]);

export const referrerFastTrackLinks = mysqlTable("referrerFastTrackLinks", {
  id: int("id").autoincrement().primaryKey(),
  referrerId: int("referrerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyDomain: varchar("companyDomain", { length: 255 }).notNull(),
  linkCode: varchar("linkCode", { length: 64 }).notNull(),
  vanityAlias: varchar("vanityAlias", { length: 30 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deactivatedAt: timestamp("deactivatedAt"),
}, table => [uniqueIndex("referrer_fast_track_referrer_unique").on(table.referrerId), uniqueIndex("referrer_fast_track_code_unique").on(table.linkCode), uniqueIndex("referrer_fast_track_alias_unique").on(table.vanityAlias), index("referrer_fast_track_public_idx").on(table.linkCode, table.isActive), index("referrer_fast_track_alias_public_idx").on(table.vanityAlias, table.isActive), index("referrer_fast_track_company_idx").on(table.companyDomain, table.isActive)]);

export const userFollows = mysqlTable("userFollows", {
  id: int("id").autoincrement().primaryKey(),
  followerUserId: int("followerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  followingUserId: int("followingUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("user_follows_pair_unique").on(table.followerUserId, table.followingUserId), index("user_follows_following_idx").on(table.followingUserId)]);

export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  referralRequestId: int("referralRequestId").references(() => referralRequests.id, { onDelete: "set null" }),
  senderId: int("senderId").notNull().references(() => users.id, { onDelete: "cascade" }),
  recipientId: int("recipientId").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("messages_recipient_idx").on(table.recipientId), index("messages_request_idx").on(table.referralRequestId)]);

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  category: mysqlEnum("category", ["referral", "message", "status", "system"]).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  eventKey: varchar("eventKey", { length: 120 }),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("notifications_user_idx").on(table.userId), uniqueIndex("notifications_event_key_unique").on(table.eventKey)]);

export const tokenBalances = mysqlTable("tokenBalances", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["job_seeker", "referrer"]).default("job_seeker").notNull(),
  balance: int("balance").default(0).notNull(),
  monthlyCreditsRemaining: int("monthlyCreditsRemaining").default(3).notNull(),
  monthlyAllowance: int("monthlyAllowance").default(3).notNull(),
  monthlyCycleKey: varchar("monthlyCycleKey", { length: 16 }).default("legacy").notNull(),
  plan: mysqlEnum("plan", ["free", "pro", "max"]).default("free").notNull(),
  subscriptionId: varchar("subscriptionId", { length: 80 }),
  subscriptionStatus: varchar("subscriptionStatus", { length: 32 }),
  subscriptionCurrency: varchar("subscriptionCurrency", { length: 3 }),
  subscriptionCurrentTermStart: timestamp("subscriptionCurrentTermStart"),
  subscriptionCurrentTermEnd: timestamp("subscriptionCurrentTermEnd"),
  subscriptionResourceVersion: bigint("subscriptionResourceVersion", { mode: "number" }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("token_balances_user_idx").on(table.userId), uniqueIndex("token_balances_user_role_unique").on(table.userId, table.role), uniqueIndex("token_balances_subscription_unique").on(table.subscriptionId)]);

export const tokenTransactions = mysqlTable("tokenTransactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["job_seeker", "referrer"]).default("job_seeker").notNull(),
  tokenCount: int("tokenCount").notNull(),
  kind: mysqlEnum("kind", ["purchase", "direct_request", "admin_adjustment", "company_coverage_reward", "personal_referral_reward", "invite_reward_pending", "invite_reward_granted", "withdrawal_refund"]).notNull(),
  source: varchar("source", { length: 40 }),
  sourceCycleKey: varchar("sourceCycleKey", { length: 16 }),
  referenceType: varchar("referenceType", { length: 40 }),
  referenceId: varchar("referenceId", { length: 80 }),
  idempotencyKey: varchar("idempotencyKey", { length: 64 }),
  reversesTransactionId: int("reversesTransactionId"),
  rewardStatus: mysqlEnum("rewardStatus", ["pending", "granted"]),
  qualifiedByType: varchar("qualifiedByType", { length: 40 }),
  qualifiedById: varchar("qualifiedById", { length: 80 }),
  qualifiedAt: timestamp("qualifiedAt"),
  balanceAfter: int("balanceAfter"),
  monthlyCreditsAfter: int("monthlyCreditsAfter"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("token_transactions_user_idx").on(table.userId), uniqueIndex("token_transactions_debit_reference_unique").on(table.userId, table.role, table.kind, table.referenceType, table.referenceId), uniqueIndex("token_transactions_idempotency_kind_unique").on(table.userId, table.role, table.idempotencyKey, table.kind), uniqueIndex("token_transactions_reversal_unique").on(table.reversesTransactionId)]);

export const companyCoverageInvitations = mysqlTable("companyCoverageInvitations", {
  id: int("id").autoincrement().primaryKey(),
  inviteCode: varchar("inviteCode", { length: 64 }).notNull(),
  inviterUserId: int("inviterUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyDomain: varchar("companyDomain", { length: 255 }).notNull(),
  referralRequestId: int("referralRequestId").references(() => referralRequests.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["active", "completed", "ineligible"]).default("active").notNull(),
  joinerUserId: int("joinerUserId").references(() => users.id, { onDelete: "set null" }),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("coverage_invite_code_unique").on(table.inviteCode), index("coverage_invite_inviter_idx").on(table.inviterUserId), index("coverage_invite_company_status_idx").on(table.companyDomain, table.status), uniqueIndex("coverage_invite_request_unique").on(table.referralRequestId)]);

export const companyCoverageRewards = mysqlTable("companyCoverageRewards", {
  id: int("id").autoincrement().primaryKey(),
  invitationId: int("invitationId").notNull().references(() => companyCoverageInvitations.id, { onDelete: "cascade" }),
  inviterUserId: int("inviterUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinerUserId: int("joinerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenCount: int("tokenCount").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("coverage_reward_invitation_unique").on(table.invitationId), uniqueIndex("coverage_reward_joiner_unique").on(table.joinerUserId), index("coverage_reward_inviter_idx").on(table.inviterUserId)]);

export const personalReferralInvites = mysqlTable("personalReferralInvites", {
  id: int("id").autoincrement().primaryKey(),
  inviteCode: varchar("inviteCode", { length: 64 }).notNull(),
  inviterUserId: int("inviterUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("personal_referral_invite_code_unique").on(table.inviteCode), uniqueIndex("personal_referral_inviter_unique").on(table.inviterUserId)]);

export const personalReferralRewards = mysqlTable("personalReferralRewards", {
  id: int("id").autoincrement().primaryKey(),
  invitationId: int("invitationId").notNull().references(() => personalReferralInvites.id, { onDelete: "cascade" }),
  inviterUserId: int("inviterUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinerUserId: int("joinerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinerEmailHash: varchar("joinerEmailHash", { length: 64 }).notNull(),
  tokenCount: int("tokenCount").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("personal_referral_reward_invitation_joiner_unique").on(table.invitationId, table.joinerUserId), uniqueIndex("personal_referral_reward_joiner_unique").on(table.joinerUserId), uniqueIndex("personal_referral_reward_email_unique").on(table.joinerEmailHash), index("personal_referral_reward_inviter_idx").on(table.inviterUserId)]);

export const adminTokenAdjustments = mysqlTable("adminTokenAdjustments", {
  id: int("id").autoincrement().primaryKey(),
  recipientUserId: int("recipientUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  adminUserId: int("adminUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  role: mysqlEnum("role", ["job_seeker", "referrer"]).notNull(),
  tokenCount: int("tokenCount").notNull(),
  caseReference: varchar("caseReference", { length: 120 }).notNull(),
  reason: varchar("reason", { length: 500 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("admin_token_adjustments_case_unique").on(table.recipientUserId, table.role, table.caseReference), index("admin_token_adjustments_recipient_idx").on(table.recipientUserId, table.createdAt), index("admin_token_adjustments_admin_idx").on(table.adminUserId, table.createdAt)]);

export const paymentFulfillments = mysqlTable("paymentFulfillments", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 32 }).notNull(),
  providerEventId: varchar("providerEventId", { length: 255 }).notNull(),
  providerInvoiceId: varchar("providerInvoiceId", { length: 255 }),
  providerHostedPageId: varchar("providerHostedPageId", { length: 255 }),
  checkoutIntentId: varchar("checkoutIntentId", { length: 96 }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["job_seeker", "referrer"]).notNull(),
  tokenCount: int("tokenCount").notNull(),
  amount: int("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  status: mysqlEnum("status", ["pending", "credited", "requires_review", "rejected", "refunded"]).default("pending").notNull(),
  reconciliationReason: varchar("reconciliationReason", { length: 120 }),
  lastCheckedAt: timestamp("lastCheckedAt"),
  creditedAt: timestamp("creditedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("payment_fulfillments_provider_event_unique").on(table.provider, table.providerEventId), index("payment_fulfillments_user_idx").on(table.userId), index("payment_fulfillments_user_status_idx").on(table.userId, table.role, table.status), index("payment_fulfillments_intent_idx").on(table.provider, table.checkoutIntentId)]);

export const employerPaymentFulfillments = mysqlTable("employerPaymentFulfillments", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 32 }).notNull(),
  providerOrderId: varchar("providerOrderId", { length: 255 }).notNull(),
  providerPaymentId: varchar("providerPaymentId", { length: 255 }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  pack: mysqlEnum("pack", ["starter", "growth", "scale"]).notNull(),
  amount: int("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  status: mysqlEnum("status", ["pending", "processing", "credited", "requires_review"]).default("pending").notNull(),
  attemptCount: int("attemptCount").default(0).notNull(),
  lastError: varchar("lastError", { length: 500 }),
  creditedAt: timestamp("creditedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("employer_payment_provider_order_unique").on(table.provider, table.providerOrderId), uniqueIndex("employer_payment_provider_payment_unique").on(table.provider, table.providerPaymentId), index("employer_payment_user_status_idx").on(table.userId, table.status)]);

export const subscriptionCheckoutIntents = mysqlTable("subscriptionCheckoutIntents", {
  id: int("id").autoincrement().primaryKey(),
  hostedPageId: varchar("hostedPageId", { length: 80 }).notNull(),
  checkoutIntentId: varchar("checkoutIntentId", { length: 96 }).notNull(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["job_seeker", "referrer"]).notNull(),
  plan: mysqlEnum("plan", ["pro", "max"]).notNull(),
  itemPriceId: varchar("itemPriceId", { length: 100 }).notNull(),
  amount: int("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  status: mysqlEnum("status", ["pending", "activated", "cancelled"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("subscription_checkout_hosted_page_unique").on(table.hostedPageId), uniqueIndex("subscription_checkout_intent_unique").on(table.checkoutIntentId), index("subscription_checkout_user_idx").on(table.userId)]);

export const subscriptionEvents = mysqlTable("subscriptionEvents", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 32 }).notNull(),
  providerEventId: varchar("providerEventId", { length: 80 }).notNull(),
  subscriptionId: varchar("subscriptionId", { length: 80 }),
  resourceVersion: bigint("resourceVersion", { mode: "number" }),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("subscription_events_provider_event_unique").on(table.provider, table.providerEventId), index("subscription_events_subscription_idx").on(table.subscriptionId)]);

export const referralAttachments = mysqlTable("referralAttachments", {
  id: int("id").autoincrement().primaryKey(),
  referralRequestId: int("referralRequestId").references(() => referralRequests.id, { onDelete: "cascade" }),
  ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 1024 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  fileSize: int("fileSize").notNull(),
  uploadSessionId: varchar("uploadSessionId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("referral_attachments_request_idx").on(table.referralRequestId), index("referral_attachments_owner_idx").on(table.ownerId), uniqueIndex("referral_attachments_upload_session_unique").on(table.uploadSessionId)]);

export const resumeUploadSessions = mysqlTable("resumeUploadSessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  clientUploadId: varchar("clientUploadId", { length: 64 }),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  expectedSize: int("expectedSize").notNull(),
  receivedSize: int("receivedSize").default(0).notNull(),
  nextChunkIndex: int("nextChunkIndex").default(0).notNull(),
  status: mysqlEnum("status", ["active", "finalizing", "completed", "failed"]).default("active").notNull(),
  finalizationOwner: varchar("finalizationOwner", { length: 64 }),
  finalizationLeaseUntil: timestamp("finalizationLeaseUntil"),
  permanentStorageKey: varchar("permanentStorageKey", { length: 1024 }),
  attachmentId: int("attachmentId").references(() => referralAttachments.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("resume_upload_sessions_owner_status_idx").on(table.ownerId, table.status, table.createdAt), uniqueIndex("resume_upload_sessions_owner_client_unique").on(table.ownerId, table.clientUploadId)]);

export const resumeUploadChunks = mysqlTable("resumeUploadChunks", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull().references(() => resumeUploadSessions.id, { onDelete: "cascade" }),
  chunkIndex: int("chunkIndex").notNull(),
  storageKey: varchar("storageKey", { length: 1024 }).notNull(),
  byteSize: int("byteSize").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("resume_upload_chunks_session_index_unique").on(table.sessionId, table.chunkIndex), index("resume_upload_chunks_session_idx").on(table.sessionId, table.chunkIndex)]);

export const operationalActivityLogs = mysqlTable("operationalActivityLogs", {
  id: int("id").autoincrement().primaryKey(),
  actorUserId: int("actorUserId").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(),
  outcome: mysqlEnum("outcome", ["success", "failure", "denied"]).notNull(),
  resourceType: varchar("resourceType", { length: 80 }),
  resourceId: varchar("resourceId", { length: 120 }),
  companyDomain: varchar("companyDomain", { length: 255 }),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("operational_activity_created_idx").on(table.createdAt), index("operational_activity_actor_idx").on(table.actorUserId), index("operational_activity_action_idx").on(table.action)]);

export const privacyRequests = mysqlTable("privacyRequests", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: mysqlEnum("kind", ["erasure"]).notNull(),
  status: mysqlEnum("status", ["requested", "in_review", "completed", "declined"]).default("requested").notNull(),
  source: varchar("source", { length: 32 }).default("account_settings").notNull(),
  activeKey: varchar("activeKey", { length: 80 }),
  resolution: varchar("resolution", { length: 500 }),
  reviewedByUserId: int("reviewedByUserId").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("privacy_request_active_key_unique").on(table.activeKey), index("privacy_request_user_kind_status_idx").on(table.userId, table.kind, table.status), index("privacy_request_status_created_idx").on(table.status, table.createdAt), index("privacy_request_user_idx").on(table.userId, table.createdAt)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type CompanyOpportunity = typeof companyOpportunities.$inferSelect;
export type ReferralRequest = typeof referralRequests.$inferSelect;
export type OperationalActivityLog = typeof operationalActivityLogs.$inferSelect;
export type PrivacyRequest = typeof privacyRequests.$inferSelect;
export type EmployerAccount = typeof employerAccounts.$inferSelect;
export type ProfileUnlock = typeof profileUnlocks.$inferSelect;
export type PartnerModule = typeof partnerModules.$inferSelect;
export type PartnerModuleCategory = PartnerModule["category"];

const longblob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "longblob";
  },
});

export const documentBlobs = mysqlTable("documentBlobs", {
  id: int("id").autoincrement().primaryKey(),
  fileKey: varchar("fileKey", { length: 512 }).notNull().unique(),
  data: longblob("data").notNull(),
  sizeBytes: int("sizeBytes").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
