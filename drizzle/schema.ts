import { bigint, boolean, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const profiles = mysqlTable("profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountType: mysqlEnum("accountType", ["job_seeker", "referrer"]),
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("profiles_user_id_unique").on(table.userId)]);

export const jobs = mysqlTable("jobs", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  company: varchar("company", { length: 160 }).notNull(),
  location: varchar("location", { length: 120 }).notNull(),
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
  walkInAt: timestamp("walkInAt"),
  walkInEndsAt: timestamp("walkInEndsAt"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("company_opportunities_public_idx").on(table.isActive, table.createdAt), index("company_opportunities_domain_idx").on(table.companyDomain), index("company_opportunities_owner_idx").on(table.ownerId)]);

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
  status: mysqlEnum("status", ["pending", "approved", "declined", "intro_made", "interview", "offer", "closed"]).default("pending").notNull(),
  referrerMessage: text("referrerMessage"),
  savedAt: timestamp("savedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("referral_requests_referrer_idx").on(table.referrerId), index("referral_requests_seeker_idx").on(table.jobSeekerId), index("referral_requests_status_idx").on(table.status), index("referral_requests_saved_idx").on(table.savedAt)]);

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
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("notifications_user_idx").on(table.userId)]);

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
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("token_balances_user_idx").on(table.userId), uniqueIndex("token_balances_user_role_unique").on(table.userId, table.role), uniqueIndex("token_balances_subscription_unique").on(table.subscriptionId)]);

export const tokenTransactions = mysqlTable("tokenTransactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["job_seeker", "referrer"]).default("job_seeker").notNull(),
  tokenCount: int("tokenCount").notNull(),
  kind: mysqlEnum("kind", ["purchase", "direct_request", "admin_adjustment", "company_coverage_reward", "personal_referral_reward"]).notNull(),
  stripeCheckoutSessionId: varchar("stripeCheckoutSessionId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("token_transactions_user_idx").on(table.userId)]);

export const companyCoverageInvitations = mysqlTable("companyCoverageInvitations", {
  id: int("id").autoincrement().primaryKey(),
  inviteCode: varchar("inviteCode", { length: 64 }).notNull(),
  inviterUserId: int("inviterUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyDomain: varchar("companyDomain", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["active", "completed", "ineligible"]).default("active").notNull(),
  joinerUserId: int("joinerUserId").references(() => users.id, { onDelete: "set null" }),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("coverage_invite_code_unique").on(table.inviteCode), index("coverage_invite_inviter_idx").on(table.inviterUserId), index("coverage_invite_company_status_idx").on(table.companyDomain, table.status)]);

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
  status: mysqlEnum("status", ["pending", "credited", "requires_review"]).default("pending").notNull(),
  reconciliationReason: varchar("reconciliationReason", { length: 120 }),
  lastCheckedAt: timestamp("lastCheckedAt"),
  creditedAt: timestamp("creditedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("payment_fulfillments_provider_event_unique").on(table.provider, table.providerEventId), index("payment_fulfillments_user_idx").on(table.userId), index("payment_fulfillments_user_status_idx").on(table.userId, table.role, table.status), index("payment_fulfillments_intent_idx").on(table.provider, table.checkoutIntentId)]);

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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("referral_attachments_request_idx").on(table.referralRequestId), index("referral_attachments_owner_idx").on(table.ownerId)]);

export const resumeUploadSessions = mysqlTable("resumeUploadSessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  expectedSize: int("expectedSize").notNull(),
  receivedSize: int("receivedSize").default(0).notNull(),
  nextChunkIndex: int("nextChunkIndex").default(0).notNull(),
  status: mysqlEnum("status", ["active", "completed", "failed"]).default("active").notNull(),
  attachmentId: int("attachmentId").references(() => referralAttachments.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("resume_upload_sessions_owner_status_idx").on(table.ownerId, table.status, table.createdAt)]);

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
