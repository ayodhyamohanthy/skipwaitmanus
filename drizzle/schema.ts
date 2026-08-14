import { boolean, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("referral_requests_referrer_idx").on(table.referrerId), index("referral_requests_seeker_idx").on(table.jobSeekerId), index("referral_requests_status_idx").on(table.status)]);

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
  balance: int("balance").default(0).notNull(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("token_balances_user_unique").on(table.userId)]);

export const tokenTransactions = mysqlTable("tokenTransactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenCount: int("tokenCount").notNull(),
  kind: mysqlEnum("kind", ["purchase", "direct_request"]).notNull(),
  stripeCheckoutSessionId: varchar("stripeCheckoutSessionId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("token_transactions_user_idx").on(table.userId)]);

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

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type CompanyOpportunity = typeof companyOpportunities.$inferSelect;
export type ReferralRequest = typeof referralRequests.$inferSelect;
export type OperationalActivityLog = typeof operationalActivityLogs.$inferSelect;
