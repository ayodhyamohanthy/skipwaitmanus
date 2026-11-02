import { bigint, boolean, customType, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar, foreignKey, ForeignKeyBuilder } from "drizzle-orm/mysql-core";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";

export const canonicalPeople = mysqlTable("canonicalPeople", {
  id: int("id").autoincrement().primaryKey(),
  normalizedVerifiedEmail: varchar("normalizedVerifiedEmail", { length: 320 }),
  suspended: boolean("suspended").default(false).notNull(),
  sessionsValidAfter: timestamp("sessionsValidAfter").defaultNow().notNull(),
  reviewReason: varchar("reviewReason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("canonical_people_verified_email_unique").on(table.normalizedVerifiedEmail)]);

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  canonicalPersonId: int("canonicalPersonId").references(() => canonicalPeople.id, { onDelete: "restrict" }),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  suspended: boolean("suspended").default(false).notNull(),
  // D-079: the Chargebee customer created for card validation (and reusable by
  // later provider flows). Set by the server only; never from the client.
  chargebeeCustomerId: varchar("chargebeeCustomerId", { length: 80 }),
  sessionsValidAfter: timestamp("sessionsValidAfter").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
}, table => [index("users_canonical_person_idx").on(table.canonicalPersonId)]);

export const verifiedLoginAliases = mysqlTable("verifiedLoginAliases", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 32 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  openId: varchar("openId", { length: 64 }).notNull(),
  canonicalPersonId: int("canonicalPersonId").notNull().references(() => canonicalPeople.id, { onDelete: "cascade" }),
  canonicalUserId: int("canonicalUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  normalizedVerifiedEmail: varchar("normalizedVerifiedEmail", { length: 320 }),
  verifiedAt: timestamp("verifiedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("verified_login_alias_provider_subject_unique").on(table.provider, table.subject), uniqueIndex("verified_login_alias_open_id_unique").on(table.openId), index("verified_login_alias_person_idx").on(table.canonicalPersonId)]);

export const identityLinkAudits = mysqlTable("identityLinkAudits", {
 id: int("id").autoincrement().primaryKey(), canonicalPersonId: int("canonicalPersonId"), canonicalUserId: int("canonicalUserId"), provider: varchar("provider", {length:32}), subject: varchar("subject", {length:255}), action: varchar("action", {length:80}).notNull(), evidence: text("evidence"), createdAt: timestamp("createdAt").defaultNow().notNull()
}, table => [index("identity_link_audit_person_idx").on(table.canonicalPersonId, table.createdAt)]);

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
  openTo: text("openTo"),
  experience: text("experience"),
  expertise: text("expertise"),
  referralCapacity: int("referralCapacity").default(3),
  isOnboarded: boolean("isOnboarded").default(false).notNull(),
  // Talent discovery is strictly opt-in: a seeker must explicitly turn this on
  // before employers can ever see them in the anonymized talent list.
  anonymityOptIn: boolean("anonymityOptIn").default(false).notNull(),
  handle: varchar("handle", { length: 40 }),
  profileVisibility: mysqlEnum("profileVisibility", ["public", "link", "private"]).default("private").notNull(),
  preferAreas: text("preferAreas"),
  preferLevels: text("preferLevels"),
  referrerVisibility: mysqlEnum("referrerVisibility", ["anon", "named"]).default("anon").notNull(),
  notifyNewAsk: boolean("notifyNewAsk").default(true).notNull(),
  notifyDigest: boolean("notifyDigest").default(false).notNull(),
  paused: boolean("paused").default(false).notNull(),
  // Seeker setup answers (queue task 8). Roles live in openTo.
  experienceLevel: varchar("experienceLevel", { length: 40 }),
  seekerGoal: varchar("seekerGoal", { length: 60 }),
  searchCity: varchar("searchCity", { length: 120 }),
  searchCountries: varchar("searchCountries", { length: 240 }),
  searchRemote: boolean("searchRemote"),
  workAuthorization: varchar("workAuthorization", { length: 80 }),
  workLinkKinds: text("workLinkKinds"),
  defaultResumeAttachmentId: int("defaultResumeAttachmentId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("profiles_user_id_unique").on(table.userId), uniqueIndex("profiles_handle_unique").on(table.handle)]);

export const workItems = mysqlTable("workItems", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 160 }).notNull(),
  kind: mysqlEnum("kind", ["case_study", "project", "article", "code", "other"]).default("other").notNull(),
  source: varchar("source", { length: 80 }),
  url: varchar("url", { length: 2048 }),
  pinned: boolean("pinned").default(false).notNull(),
  visibleOnProfile: boolean("visibleOnProfile").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("work_items_user_idx").on(table.userId)]);

export const safetyReports = mysqlTable("safetyReports", {
  id: int("id").autoincrement().primaryKey(),
  reporterUserId: int("reporterUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: varchar("reason", { length: 80 }).notNull(),
  details: text("details"),
  referralRequestId: int("referralRequestId").references(() => referralRequests.id, { onDelete: "set null" }),
  reportedUserId: int("reportedUserId").references(() => users.id, { onDelete: "set null" }),
  urgent: boolean("urgent").default(false).notNull(),
  status: mysqlEnum("status", ["open", "under_review", "resolved", "dismissed"]).default("open").notNull(),
  severity: varchar("severity", { length: 8 }).default("normal").notNull(),
  dueAt: timestamp("dueAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("safety_reports_reporter_idx").on(table.reporterUserId), index("safety_reports_status_idx").on(table.status)]);

// Per-report case file (task 5 phase 1): reviewer notes and the audit trail. Admin-visible only.
export const moderationEvents = mysqlTable("moderationEvents", {
  id: int("id").autoincrement().primaryKey(),
  reportId: int("reportId").notNull().references(() => safetyReports.id, { onDelete: "cascade" }),
  actorKind: varchar("actorKind", { length: 12 }).notNull(),
  actorUserId: int("actorUserId"),
  kind: varchar("kind", { length: 32 }).notNull(),
  note: varchar("note", { length: 600 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("moderation_events_report_idx").on(table.reportId, table.createdAt)]);

// Filing-time copy of the reporter's own request thread (task 5 phase 1b). Insert-only; admin-visible only.
export const moderationEvidence = mysqlTable("moderationEvidence", {
  id: int("id").autoincrement().primaryKey(),
  reportId: int("reportId").notNull().references(() => safetyReports.id, { onDelete: "cascade" }),
  seq: int("seq").notNull(),
  sender: varchar("sender", { length: 10 }).notNull(),
  body: text("body").notNull(),
  sentAt: timestamp("sentAt").notNull(),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
}, table => [index("moderation_evidence_report_idx").on(table.reportId, table.seq)]);

// Per-account display preferences (queue task 25). NULL = use this device.
export const accountPreferences = mysqlTable("accountPreferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  timeZone: varchar("timeZone", { length: 64 }),
  dateFormat: varchar("dateFormat", { length: 8 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("account_preferences_user_unique").on(table.userId)]);

export const companySuggestions = mysqlTable("companySuggestions", {
  id: int("id").autoincrement().primaryKey(),
  submitterUserId: int("submitterUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyName: varchar("companyName", { length: 160 }).notNull(),
  website: varchar("website", { length: 512 }),
  // Job function taxonomy (0104): a JOB_FUNCTIONS value from shared/jobFunctions.ts
  // chosen on a seeker demand vote; NULL means the seeker chose nothing. Reads
  // parse with parseJobFunction, so an unknown stored value becomes null.
  jobFunction: varchar("jobFunction", { length: 32 }),
  role: mysqlEnum("role", ["seeker", "employee"]).default("seeker").notNull(),
  status: mysqlEnum("status", ["open", "under_review", "approved", "dismissed"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("company_suggestions_submitter_idx").on(table.submitterUserId), index("company_suggestions_status_idx").on(table.status)]);

// Server-owned company directory (0076). Contract: shared/companies.ts.
// Availability is derived on read from verified referrers, never stored.
// updatedAt is written by the app from the JS clock (invariant 5).
export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 48 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  initials: varchar("initials", { length: 4 }).notNull(),
  industry: varchar("industry", { length: 80 }).notNull(),
  location: varchar("location", { length: 80 }).notNull(),
  functions: text("functions").notNull(), // JSON array of function labels
  blurb: varchar("blurb", { length: 240 }).notNull(),
  status: mysqlEnum("status", ["listed", "hidden"]).default("listed").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, table => [uniqueIndex("companies_slug_unique").on(table.slug), index("companies_status_sort_idx").on(table.status, table.sortOrder)]);

export const companyDomains = mysqlTable("companyDomains", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => companies.id, { onDelete: "cascade" }),
  domain: varchar("domain", { length: 255 }).notNull(), // lowercase
  isPrimary: boolean("isPrimary").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("company_domains_domain_unique").on(table.domain), index("company_domains_company_idx").on(table.companyId)]);

// Job catalog (0120, D-174-job-catalog packet section 5.5). Sources are
// registered by an admin with evidence and verified by a human; the sync job
// fills catalogJobs from verified boards. Launch-gated: see JOB_CATALOG_ENABLED
// in shared/jobCatalog.ts.
export const companyJobSources = mysqlTable("companyJobSources", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => companies.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 20 }).notNull(), // jobCatalogProviderSchema; "greenhouse" in this row
  boardToken: varchar("boardToken", { length: 120 }).notNull(),
  evidenceUrl: varchar("evidenceUrl", { length: 2048 }).notNull(),
  verifiedAt: timestamp("verifiedAt"),
  lastFetchedAt: timestamp("lastFetchedAt"),
  lastCount: int("lastCount"),
  status: mysqlEnum("status", ["verified", "unverified", "failing"]).default("unverified").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, table => [uniqueIndex("company_job_sources_provider_token_unique").on(table.provider, table.boardToken), index("company_job_sources_company_idx").on(table.companyId)]);

export const catalogJobs = mysqlTable("catalogJobs", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().references(() => companies.id, { onDelete: "cascade" }),
  sourceId: int("sourceId").notNull().references(() => companyJobSources.id, { onDelete: "cascade" }),
  externalId: varchar("externalId", { length: 190 }).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  rawLocation: varchar("rawLocation", { length: 300 }),
  locations: text("locations").notNull(), // JSON array of normalized location labels
  workMode: mysqlEnum("workMode", ["onsite", "hybrid", "remote", "unknown"]).default("unknown").notNull(),
  department: varchar("department", { length: 200 }),
  jobFunction: varchar("jobFunction", { length: 60 }), // classifyJobFunction; null when unknown
  level: int("level").notNull(), // 1-10 per packet section 4.3 (assignJobLevel)
  applyUrl: varchar("applyUrl", { length: 2048 }).notNull(),
  snippet: varchar("snippet", { length: 400 }).notNull().default(""),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  closedAt: timestamp("closedAt"),
}, table => [uniqueIndex("catalog_jobs_source_external_unique").on(table.sourceId, table.externalId), index("catalog_jobs_company_closed_idx").on(table.companyId, table.closedAt), index("catalog_jobs_company_level_idx").on(table.companyId, table.level)]);

// Scheduled job runs (0078). Contract: shared/scheduledJobs.ts. One row per job
// per window: the unique (jobName, windowKey) key is the single-flight lock and
// the row is the idempotent run record. The app writes every timestamp from
// the JS clock and compares leaseExpiresAt only with a JS time (invariant 5).
export const jobRuns = mysqlTable("jobRuns", {
  id: int("id").autoincrement().primaryKey(),
  jobName: varchar("jobName", { length: 64 }).notNull(),
  windowKey: varchar("windowKey", { length: 32 }).notNull(),
  status: mysqlEnum("status", ["running", "succeeded", "failed"]).default("running").notNull(),
  attempt: int("attempt").default(1).notNull(),
  leaseOwner: varchar("leaseOwner", { length: 64 }).notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  leaseExpiresAt: timestamp("leaseExpiresAt").notNull(),
  finishedAt: timestamp("finishedAt"),
  processedCount: int("processedCount").default(0).notNull(),
  failedCount: int("failedCount").default(0).notNull(),
  error: varchar("error", { length: 500 }),
}, table => [uniqueIndex("job_runs_job_window_unique").on(table.jobName, table.windowKey), index("job_runs_job_started_idx").on(table.jobName, table.startedAt)]);

export const seekerAlerts = mysqlTable("seekerAlerts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyDomain: varchar("companyDomain", { length: 255 }).notNull(),
  paused: boolean("paused").default(false).notNull(),
  notifiedAt: timestamp("notifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("seeker_alerts_user_domain_unique").on(table.userId, table.companyDomain), index("seeker_alerts_user_idx").on(table.userId), index("seeker_alerts_domain_idx").on(table.companyDomain)]);

// One saved ask draft per user (queue task 11). Never sent; /ask continues it.
export const askDrafts = mysqlTable("askDrafts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  companySlug: varchar("companySlug", { length: 64 }).notNull(),
  targetRoleUrl: varchar("targetRoleUrl", { length: 2048 }).notNull(),
  note: varchar("note", { length: 600 }).notNull().default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, table => [uniqueIndex("ask_drafts_user_unique").on(table.userId)]);

// Async personal-data export (task 4a). zipData is dropped when the export expires.
const exportBlob = customType<{ data: Buffer; driverData: Buffer }>({ dataType() { return "longblob"; } });
export const dataExports = mysqlTable("dataExports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 16 }).notNull().default("requested"),
  activeKey: varchar("activeKey", { length: 40 }),
  fileName: varchar("fileName", { length: 120 }),
  byteSize: int("byteSize").notNull().default(0),
  zipData: exportBlob("zipData"),
  failureNote: varchar("failureNote", { length: 200 }),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
  readyAt: timestamp("readyAt"),
  expiresAt: timestamp("expiresAt"),
}, table => [uniqueIndex("data_exports_active_unique").on(table.activeKey), index("data_exports_user_idx").on(table.userId, table.requestedAt)]);

export const assistantConnections = mysqlTable("assistantConnections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: mysqlEnum("provider", ["chatgpt", "claude", "custom"]).notNull(),
  appName: varchar("appName", { length: 160 }).notNull(),
  scopes: text("scopes").notNull(), // JSON array of granted scopes
  status: mysqlEnum("status", ["connected", "declined", "expired", "revoked"]).default("connected").notNull(),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("assistant_connections_user_idx").on(table.userId), index("assistant_connections_status_idx").on(table.status)]);

export const assistantTokens = mysqlTable("assistantTokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull(), // sha256 hex
  prefix: varchar("prefix", { length: 16 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  revokedAt: timestamp("revokedAt"),
}, table => [uniqueIndex("assistant_tokens_user_name_unique").on(table.userId, table.name), index("assistant_tokens_user_idx").on(table.userId)]);

export const developerApps = mysqlTable("developerApps", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  kind: mysqlEnum("kind", ["web_app", "agent_mcp", "server_integration"]).notNull(),
  description: text("description").notNull(),
  website: varchar("website", { length: 512 }),
  redirectUrls: text("redirectUrls").notNull(), // JSON array
  scopes: text("scopes").notNull(), // JSON array
  status: mysqlEnum("status", ["test", "in_review", "live", "rejected", "suspended"]).default("test").notNull(),
  rejectReasons: text("rejectReasons"), // JSON array
  webhookUrl: varchar("webhookUrl", { length: 512 }),
  clientId: varchar("clientId", { length: 64 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("developer_apps_user_idx").on(table.userId), index("developer_apps_status_idx").on(table.status)]);

export const assistantApprovals = mysqlTable("assistantApprovals", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  connectionId: int("connectionId").references(() => assistantConnections.id, { onDelete: "set null" }),
  kind: mysqlEnum("kind", ["ask_send", "credit_spend"]).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "declined", "expired"]).default("pending").notNull(),
  provider: varchar("provider", { length: 80 }).notNull(),
  companyDomain: varchar("companyDomain", { length: 255 }),
  role: varchar("role", { length: 180 }),
  note: text("note"),
  creditCount: int("creditCount"),
  slotCount: int("slotCount"),
  targetRoleUrl: text("targetRoleUrl"),
  attachmentIds: text("attachmentIds"),
  idempotencyKey: varchar("idempotencyKey", { length: 64 }),
  executedRequestId: int("executedRequestId"),
  expiresAt: timestamp("expiresAt").notNull(),
  decidedAt: timestamp("decidedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("assistant_approvals_user_idx").on(table.userId), index("assistant_approvals_status_idx").on(table.status), index("assistant_approvals_expiry_idx").on(table.expiresAt)]);

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
  // Job function taxonomy (0077): a JOB_FUNCTIONS value from shared/jobFunctions.ts
  // (read through parseJobFunction), and how it was decided. Both NULL on rows
  // nothing has examined yet; a NULL jobFunction with a source means "unknown".
  jobFunction: varchar("jobFunction", { length: 32 }),
  jobFunctionSource: mysqlEnum("jobFunctionSource", ["seeker", "inferred", "backfill"]),
  referrerId: int("referrerId").references(() => users.id, { onDelete: "set null" }),
  publishedAt: timestamp("publishedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("jobs_company_idx").on(table.company), index("jobs_location_idx").on(table.location), index("jobs_company_function_idx").on(table.company, table.jobFunction)]);

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
  // D-022 referrer-posted roles: a post is live for 30 days; the poster can
  // renew it in one tap. Always set by the publish/renew paths (0094 backfilled
  // existing rows to their pre-migration visible state and holds the column NOT NULL).
  expiresAt: timestamp("expiresAt").notNull(),
  // D-022: the poster chose to show their first name (never the last name).
  showPosterFirstName: boolean("showPosterFirstName").default(false).notNull(),
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
  creditDebt: int("creditDebt").default(0).notNull(),
  approvalStatus: mysqlEnum("approvalStatus", ["pending", "approved", "rejected", "suspended", "revoked"]).default("pending").notNull(),
  approvedAt: timestamp("approvedAt"),
  approvedByUserId: int("approvedByUserId").references(() => users.id, { onDelete: "set null" }),
  submittedAt: timestamp("submittedAt").defaultNow().notNull(),
  decidedAt: timestamp("decidedAt"),
  decisionNote: varchar("decisionNote", { length: 500 }),
  evidenceVersion: varchar("evidenceVersion", { length: 40 }).default("employer-application-v1").notNull(),
  applicationVersion: int("applicationVersion").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("employer_accounts_user_unique").on(table.userId)]);

// Append-only seeker consent history. Every grant or revoke creates a new row;
// discovery only accepts the latest, unrevoked grant for the current policy.
export const talentDiscoveryConsents = mysqlTable("talentDiscoveryConsents", {
  id: int("id").autoincrement().primaryKey(),
  seekerUserId: int("seekerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  policyVersion: varchar("policyVersion", { length: 32 }).notNull(),
  disclosedFields: text("disclosedFields").notNull(),
  audience: varchar("audience", { length: 160 }).notNull(),
  purpose: varchar("purpose", { length: 255 }).notNull(),
  retentionDays: int("retentionDays").notNull(),
  contactFlow: varchar("contactFlow", { length: 255 }).notNull(),
  paidUnlockInvolved: boolean("paidUnlockInvolved").notNull(),
  source: varchar("source", { length: 80 }).notNull(),
  grantedAt: timestamp("grantedAt"),
  revokedAt: timestamp("revokedAt"),
  revocationReason: varchar("revocationReason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("talent_consents_seeker_created_idx").on(table.seekerUserId, table.createdAt)]);

// Employer-scoped random references are the only talent identifiers exposed to clients.
export const opportunitySponsorshipPurchases = mysqlTable("opportunitySponsorshipPurchases", {
  id: int("id").autoincrement().primaryKey(),
  idempotencyKey: varchar("idempotencyKey", { length: 64 }).notNull(),
  opportunityId: int("opportunityId").notNull(),
  opportunityOwnerId: int("opportunityOwnerId").notNull().references(() => users.id, { onDelete: "restrict" }),
  chargedUserId: int("chargedUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  actorUserId: int("actorUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  tier: mysqlEnum("tier", ["featured", "spotlight"]).notNull(),
  creditsSpent: int("creditsSpent").notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  opportunityUpdatedAt: timestamp("opportunityUpdatedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [ foreignKey({ name: "opportunitySponsorshipPurchases_opportunityId_fk", columns: [table.opportunityId], foreignColumns: [companyOpportunities.id] }).onDelete("restrict"),uniqueIndex("opportunity_sponsorship_purchase_idempotency_unique").on(table.chargedUserId, table.idempotencyKey), index("opportunity_sponsorship_delivery_idx").on(table.opportunityId, table.endsAt)]);

export const employerTalentRefs = mysqlTable("employerTalentRefs", {
  id: int("id").autoincrement().primaryKey(),
  employerUserId: int("employerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  seekerProfileUserId: int("seekerProfileUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  publicRef: varchar("publicRef", { length: 64 }).notNull(),
  consentId: int("consentId").notNull().references(() => talentDiscoveryConsents.id, { onDelete: "restrict" }),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("employer_talent_refs_public_unique").on(table.publicRef), index("employer_talent_refs_pair_active_idx").on(table.employerUserId, table.seekerProfileUserId, table.revokedAt), index("employer_talent_refs_scope_idx").on(table.employerUserId, table.publicRef)]);

// Credit Economy ledger: one unlock row per (employer, seeker) pair, ever.
export const profileUnlocks = mysqlTable("profileUnlocks", {
  id: int("id").autoincrement().primaryKey(),
  employerUserId: int("employerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  seekerProfileUserId: int("seekerProfileUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  consentId: int("consentId").notNull().references(() => talentDiscoveryConsents.id, { onDelete: "restrict" }),
  consentPolicyVersion: varchar("consentPolicyVersion", { length: 32 }).notNull(),
  employerCompanyName: varchar("employerCompanyName", { length: 160 }).notNull(),
  disclosedFields: text("disclosedFields").notNull(),
  profileVersion: timestamp("profileVersion").notNull(),
  profileSnapshot: text("profileSnapshot").notNull(),
  unlockedAt: timestamp("unlockedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt"),
  revocationReason: varchar("revocationReason", { length: 255 }),
  creditsSpent: int("creditsSpent").notNull(),
}, table => [index("profile_unlocks_employer_seeker_active_idx").on(table.employerUserId, table.seekerProfileUserId, table.revokedAt, table.expiresAt), index("profile_unlocks_seeker_idx").on(table.seekerProfileUserId)]);

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
  revision: int("revision").default(0).notNull(),
  waitingForCoverage: boolean("waitingForCoverage").default(false).notNull(),
  coverageQueuedAt: timestamp("coverageQueuedAt"),
  referrerMessage: text("referrerMessage"),
  savedAt: timestamp("savedAt"),
  idempotencyKey: varchar("idempotencyKey", { length: 64 }),
  requestFingerprint: varchar("requestFingerprint", { length: 64 }),
  debitTransactionId: int("debitTransactionId"),
  // D-022 referrer-posted roles: the post this ask was written from, and the
  // posting employee's 48-hour first look (they alone see it until then).
  opportunityId: int("opportunityId").references(() => companyOpportunities.id, { onDelete: "set null" }),
  firstLookReferrerId: int("firstLookReferrerId").references(() => users.id, { onDelete: "set null" }),
  firstLookUntil: timestamp("firstLookUntil"),
  // D-034/D-047/D-061 (migration 0095): when an available referrer could first
  // see the ask (starts the 7-day clock; null while it waits for coverage), and
  // when coverage opened but the seeker had no credit, so the ask is held
  // (server/coverageDelivery.ts) until the hourly sweep delivers it.
  coverageVisibleAt: timestamp("coverageVisibleAt"),
  coverageHeldAt: timestamp("coverageHeldAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("referral_requests_referrer_idx").on(table.referrerId), index("referral_requests_seeker_idx").on(table.jobSeekerId), index("referral_requests_status_idx").on(table.status), index("referral_requests_saved_idx").on(table.savedAt), index("referral_requests_coverage_queue_idx").on(table.waitingForCoverage, table.coverageQueuedAt), index("referral_requests_first_look_idx").on(table.firstLookUntil), index("referral_requests_coverage_held_idx").on(table.coverageHeldAt), uniqueIndex("referral_requests_seeker_idempotency_unique").on(table.jobSeekerId, table.idempotencyKey)]);

export const referralTransitionEvents = mysqlTable("referralTransitionEvents", {
  id: int("id").autoincrement().primaryKey(),
  referralRequestId: int("referralRequestId").notNull(),
  operationKey: varchar("operationKey", { length: 120 }).notNull(),
  actorUserId: int("actorUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 40 }).notNull(),
  fromStatus: varchar("fromStatus", { length: 32 }).notNull(),
  resultingStatus: varchar("resultingStatus", { length: 32 }).notNull(),
  resultingRevision: int("resultingRevision").notNull(),
  // Optional portal reference recorded on mark-as-referred (queue task 16).
  referenceId: varchar("referenceId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [ foreignKey({ name: "referralTransitionEvents_referralRequestId_fk", columns: [table.referralRequestId], foreignColumns: [referralRequests.id] }).onDelete("cascade"),uniqueIndex("referral_transition_operation_unique").on(table.referralRequestId, table.operationKey), uniqueIndex("referral_transition_revision_unique").on(table.referralRequestId, table.resultingRevision)]);

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
  reasonCode: varchar("reasonCode", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("referral_request_pass_request_referrer_unique").on(table.referralRequestId, table.referrerId), index("referral_request_pass_referrer_idx").on(table.referrerId, table.createdAt)]);

export const referralDocumentAccessGrants = mysqlTable("referralDocumentAccessGrants", {
  id: int("id").autoincrement().primaryKey(),
  referralRequestId: int("referralRequestId").notNull(),
  referrerId: int("referrerId").notNull().references(() => users.id, {onDelete:"cascade"}),
  requestRevision: int("requestRevision").notNull(),
  grantVersion: int("grantVersion").default(1).notNull(),
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt"),
  revokeReason: varchar("revokeReason", {length:255}),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [ foreignKey({ name: "referralDocumentAccessGrants_referralRequestId_fk", columns: [table.referralRequestId], foreignColumns: [referralRequests.id] }).onDelete("cascade"),uniqueIndex("referral_document_grant_request_referrer_unique").on(table.referralRequestId,table.referrerId), index("referral_document_grant_active_idx").on(table.referrerId,table.revokedAt,table.expiresAt)]);

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
  referralRequestId: int("referralRequestId").notNull(),
  referrerId: int("referrerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  linkToken: varchar("linkToken", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  grantVersion: int("grantVersion").default(1).notNull(),
  rotatedAt: timestamp("rotatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [ foreignKey({ name: "referrerReviewEmailLinks_referralRequestId_fk", columns: [table.referralRequestId], foreignColumns: [referralRequests.id] }).onDelete("cascade"),uniqueIndex("referrer_review_email_token_unique").on(table.linkToken), uniqueIndex("referrer_review_email_request_referrer_unique").on(table.referralRequestId, table.referrerId), index("referrer_review_email_lookup_idx").on(table.linkToken, table.referrerId, table.expiresAt), index("referrer_review_email_request_idx").on(table.referralRequestId)]);

export const referralReviewGrantRotations = mysqlTable("referralReviewGrantRotations", {
  id: int("id").autoincrement().primaryKey(), referralRequestId: int("referralRequestId").notNull(), referrerId: int("referrerId").notNull().references(() => users.id, {onDelete:"cascade"}), actorUserId: int("actorUserId").notNull().references(() => users.id, {onDelete:"cascade"}), fromVersion: int("fromVersion").notNull(), toVersion: int("toVersion").notNull(), reason: varchar("reason", {length:255}).notNull(), createdAt: timestamp("createdAt").defaultNow().notNull()
}, table => [ foreignKey({ name: "referralReviewGrantRotations_referralRequestId_fk", columns: [table.referralRequestId], foreignColumns: [referralRequests.id] }).onDelete("cascade"),uniqueIndex("referral_review_grant_rotation_unique").on(table.referralRequestId,table.referrerId,table.toVersion)]);

export const referralReviewDeliveries = mysqlTable("referralReviewDeliveries", {
  id: int("id").autoincrement().primaryKey(),
  referralRequestId: int("referralRequestId").notNull(),
  referrerId: int("referrerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  channel: mysqlEnum("channel", ["email", "slack"]).notNull(),
  grantVersion: int("grantVersion").default(1).notNull(),
  status: mysqlEnum("status", ["pending", "leased", "sent", "failed", "unknown", "revoked"]).default("pending").notNull(),
  attemptCount: int("attemptCount").default(0).notNull(),
  leaseOwner: varchar("leaseOwner", { length: 64 }),
  leaseExpiresAt: timestamp("leaseExpiresAt"),
  nextAttemptAt: timestamp("nextAttemptAt"),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
  lastError: varchar("lastError", { length: 255 }),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [ foreignKey({ name: "referralReviewDeliveries_referralRequestId_fk", columns: [table.referralRequestId], foreignColumns: [referralRequests.id] }).onDelete("cascade"),uniqueIndex("referral_review_delivery_recipient_unique").on(table.referralRequestId, table.referrerId, table.channel, table.grantVersion), index("referral_review_delivery_claim_idx").on(table.status, table.nextAttemptAt, table.leaseExpiresAt)]);

export const workEmailOtpCodes = mysqlTable("workEmailOtpCodes", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  codeHash: varchar("codeHash", { length: 64 }).notNull(),
  attempts: int("attempts").default(0).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("work_email_otp_email_hash_idx").on(table.email, table.codeHash), index("work_email_otp_active_idx").on(table.email, table.consumedAt, table.expiresAt, table.createdAt)]);

export const workEmailOtpReceipts = mysqlTable("workEmailOtpReceipts", {
  id: int("id").autoincrement().primaryKey(),
  receiptHash: varchar("receiptHash", { length: 64 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: mysqlEnum("purpose", ["work_email_enrollment"]).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("work_email_otp_receipt_hash_unique").on(table.receiptHash), index("work_email_otp_receipt_scope_idx").on(table.userId, table.purpose, table.expiresAt)]);

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
  referralRequestId: int("referralRequestId").notNull(),
  status: mysqlEnum("status", ["allocated", "released"]).default("allocated").notNull(),
  activeRequestKey: varchar("activeRequestKey", { length: 80 }),
  openedAt: timestamp("openedAt").defaultNow().notNull(),
  releasedAt: timestamp("releasedAt"),
}, table => [ foreignKey({ name: "referralAvailabilitySlots_referralRequestId_fk", columns: [table.referralRequestId], foreignColumns: [referralRequests.id] }).onDelete("cascade"),uniqueIndex("referral_availability_active_request_unique").on(table.activeRequestKey), index("referral_availability_referrer_idx").on(table.referrerId, table.status), index("referral_availability_company_idx").on(table.companyDomain, table.status), index("referral_availability_request_idx").on(table.referralRequestId)]);

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

export const userBlocks = mysqlTable("userBlocks", {
  id: int("id").autoincrement().primaryKey(),
  blockerUserId: int("blockerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  blockedUserId: int("blockedUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: varchar("reason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("user_blocks_pair_unique").on(table.blockerUserId, table.blockedUserId), index("user_blocks_blocked_idx").on(table.blockedUserId)]);

export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  referralRequestId: int("referralRequestId").references(() => referralRequests.id, { onDelete: "set null" }),
  senderId: int("senderId").notNull().references(() => users.id, { onDelete: "cascade" }),
  recipientId: int("recipientId").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  idempotencyKey: varchar("idempotencyKey", {length:64}),
  requestFingerprint: varchar("requestFingerprint", {length:64}),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("messages_recipient_idx").on(table.recipientId), index("messages_request_idx").on(table.referralRequestId), uniqueIndex("messages_sender_idempotency_unique").on(table.senderId,table.idempotencyKey)]);

export const directMessageQuotaWindows = mysqlTable("directMessageQuotaWindows", {
  id: int("id").autoincrement().primaryKey(), senderId: int("senderId").notNull().references(()=>users.id,{onDelete:"cascade"}), windowStart: timestamp("windowStart").notNull(), sendCount: int("sendCount").default(0).notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, table=>[uniqueIndex("dm_quota_sender_window_unique").on(table.senderId,table.windowStart)]);

export const directMessageNotificationOutbox = mysqlTable("directMessageNotificationOutbox", {
 id:int("id").autoincrement().primaryKey(),messageId:int("messageId").notNull().references(()=>messages.id,{onDelete:"cascade"}),recipientId:int("recipientId").notNull().references(()=>users.id,{onDelete:"cascade"}),status:mysqlEnum("status",["pending","leased","sent","failed","unknown"]).default("pending").notNull(),attemptCount:int("attemptCount").default(0).notNull(),nextAttemptAt:timestamp("nextAttemptAt"),createdAt:timestamp("createdAt").defaultNow().notNull()
},table=>[uniqueIndex("dm_notification_outbox_message_unique").on(table.messageId),index("dm_notification_outbox_claim_idx").on(table.status,table.nextAttemptAt)]);

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  category: mysqlEnum("category", ["referral", "message", "status", "system"]).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  eventKey: varchar("eventKey", { length: 120 }),
  kind: varchar("kind", { length: 32 }),
  refId: int("refId"),
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
  // D-079: when the provider (Chargebee) confirmed a card for this wallet's
  // owner. Written only from the verified webhook or a provider-truth re-read.
  cardValidatedAt: timestamp("cardValidatedAt"),
  // D-155: when the provider (Chargebee) first reported a successful nonzero
  // payment for this wallet's subscription. Written only from a verified
  // payment_succeeded webhook tied to this wallet's subscriptionId - never
  // from subscription activation alone.
  lastPaidAt: timestamp("lastPaidAt"),
  // Order pinned to shared/billingCatalog.ts WALLET_PLAN_IDS (server/subscriptionManagementContract.test.ts); 0090 added the kit plans,
  // 0091 the Oct 14 2026 plans (land_100/200/500 are reserved, never written).
  plan: mysqlEnum("plan", ["free", "pro", "max", "start", "momentum", "land_100", "land_200", "land_500", "keep_warm", "land_focus", "land_sprint", "land_concierge"]).default("free").notNull(),
  subscriptionId: varchar("subscriptionId", { length: 80 }),
  subscriptionStatus: varchar("subscriptionStatus", { length: 32 }),
  subscriptionCurrency: varchar("subscriptionCurrency", { length: 3 }),
  subscriptionCurrentTermStart: timestamp("subscriptionCurrentTermStart"),
  subscriptionCurrentTermEnd: timestamp("subscriptionCurrentTermEnd"),
  subscriptionResourceVersion: bigint("subscriptionResourceVersion", { mode: "number" }),
  // Subscription management (0090, shared/subscriptionState.ts): what the subscription bills,
  // a switch scheduled for term end, a scheduled or active pause, and the dunning state of a
  // failed renewal. Written only from provider responses and webhook snapshots.
  subscriptionItemPriceId: varchar("subscriptionItemPriceId", { length: 100 }),
  // Order pinned to shared/billingCatalog.ts BILLING_PERIODS; 0091 added the 30- and 90-day passes.
  subscriptionBillingPeriod: mysqlEnum("subscriptionBillingPeriod", ["monthly", "yearly", "30d", "90d"]),
  subscriptionAmount: int("subscriptionAmount"),
  pendingPlan: varchar("pendingPlan", { length: 32 }),
  pendingBillingPeriod: mysqlEnum("pendingBillingPeriod", ["monthly", "yearly", "30d", "90d"]),
  pendingPlanEffectiveAt: timestamp("pendingPlanEffectiveAt"),
  subscriptionPauseAt: timestamp("subscriptionPauseAt"),
  subscriptionResumeAt: timestamp("subscriptionResumeAt"),
  paymentDueSince: timestamp("paymentDueSince"),
  paymentDueInvoiceId: varchar("paymentDueInvoiceId", { length: 80 }),
  paymentDueAmount: int("paymentDueAmount"),
  paymentNextRetryAt: timestamp("paymentNextRetryAt"),
  paymentFailureReason: varchar("paymentFailureReason", { length: 32 }),
  paymentRetryRequestedAt: timestamp("paymentRetryRequestedAt"),
  // The one-time 14-day reverse trial (0091, shared/planEntitlements.ts): set once, from the JS
  // clock, when a Free seeker's ask starts it; the trial credits are a planCreditGrants "trial" row.
  trialStartedAt: timestamp("trialStartedAt"),
  trialEndsAt: timestamp("trialEndsAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("token_balances_user_idx").on(table.userId), uniqueIndex("token_balances_user_role_unique").on(table.userId, table.role), uniqueIndex("token_balances_subscription_unique").on(table.subscriptionId)]);

export const tokenTransactions = mysqlTable("tokenTransactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["job_seeker", "referrer"]).default("job_seeker").notNull(),
  tokenCount: int("tokenCount").notNull(),
  // Order pinned to shared/creditLedger.ts TOKEN_LEDGER_KINDS (server/creditLedgerContract.test.ts); 0089 added the kit ledger kinds, 0091 trial_grant.
  kind: mysqlEnum("kind", ["purchase", "direct_request", "admin_adjustment", "company_coverage_reward", "personal_referral_reward", "invite_reward_pending", "invite_reward_granted", "withdrawal_refund", "promo_grant", "promo_spend", "expiry_refund", "plan_grant", "plan_credit_carryover", "plan_credit_expiry", "welcome_grant", "credit_spend", "trial_grant"]).notNull(),
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
  /** The planCreditGrants row this row grants, spends, carries into or expires (0089). */
  creditGrantId: int("creditGrantId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("token_transactions_user_idx").on(table.userId), index("token_transactions_credit_grant_idx").on(table.creditGrantId), index("token_transactions_cycle_idx").on(table.userId, table.role, table.sourceCycleKey), uniqueIndex("token_transactions_debit_reference_unique").on(table.userId, table.role, table.kind, table.referenceType, table.referenceId), uniqueIndex("token_transactions_idempotency_kind_unique").on(table.userId, table.role, table.idempotencyKey, table.kind), uniqueIndex("token_transactions_reversal_unique").on(table.reversesTransactionId)]);

export const companyCoverageInvitations = mysqlTable("companyCoverageInvitations", {
  id: int("id").autoincrement().primaryKey(),
  inviteCode: varchar("inviteCode", { length: 64 }).notNull(),
  inviterUserId: int("inviterUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyDomain: varchar("companyDomain", { length: 255 }).notNull(),
  referralRequestId: int("referralRequestId"),
  status: mysqlEnum("status", ["active", "completed", "ineligible"]).default("active").notNull(),
  joinerUserId: int("joinerUserId").references(() => users.id, { onDelete: "set null" }),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [ foreignKey({ name: "companyCoverageInvitations_referralRequestId_fk", columns: [table.referralRequestId], foreignColumns: [referralRequests.id] }).onDelete("cascade"),uniqueIndex("coverage_invite_code_unique").on(table.inviteCode), index("coverage_invite_inviter_idx").on(table.inviterUserId), index("coverage_invite_company_status_idx").on(table.companyDomain, table.status), uniqueIndex("coverage_invite_request_unique").on(table.referralRequestId)]);

export const companyCoverageRewards = mysqlTable("companyCoverageRewards", {
  id: int("id").autoincrement().primaryKey(),
  invitationId: int("invitationId").notNull(),
  inviterUserId: int("inviterUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinerUserId: int("joinerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenCount: int("tokenCount").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [ foreignKey({ name: "companyCoverageRewards_invitationId_fk", columns: [table.invitationId], foreignColumns: [companyCoverageInvitations.id] }).onDelete("cascade"),uniqueIndex("coverage_reward_invitation_unique").on(table.invitationId), uniqueIndex("coverage_reward_joiner_unique").on(table.joinerUserId), index("coverage_reward_inviter_idx").on(table.inviterUserId)]);

export const personalReferralInvites = mysqlTable("personalReferralInvites", {
  id: int("id").autoincrement().primaryKey(),
  inviteCode: varchar("inviteCode", { length: 64 }).notNull(),
  inviterUserId: int("inviterUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("personal_referral_invite_code_unique").on(table.inviteCode), uniqueIndex("personal_referral_inviter_unique").on(table.inviterUserId)]);

export const personalReferralRewards = mysqlTable("personalReferralRewards", {
  id: int("id").autoincrement().primaryKey(),
  invitationId: int("invitationId").notNull(),
  inviterUserId: int("inviterUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinerUserId: int("joinerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinerEmailHash: varchar("joinerEmailHash", { length: 64 }).notNull(),
  tokenCount: int("tokenCount").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [ foreignKey({ name: "personalReferralRewards_invitationId_fk", columns: [table.invitationId], foreignColumns: [personalReferralInvites.id] }).onDelete("cascade"),uniqueIndex("personal_referral_reward_invitation_joiner_unique").on(table.invitationId, table.joinerUserId), uniqueIndex("personal_referral_reward_joiner_unique").on(table.joinerUserId), uniqueIndex("personal_referral_reward_email_unique").on(table.joinerEmailHash), index("personal_referral_reward_inviter_idx").on(table.inviterUserId)]);

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

export const promoCreditGrants = mysqlTable("promoCreditGrants", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["job_seeker", "referrer"]).default("job_seeker").notNull(),
  tokenCount: int("tokenCount").notNull(),
  creditsRemaining: int("creditsRemaining").notNull(),
  status: mysqlEnum("status", ["active", "exhausted", "expired", "revoked"]).default("active").notNull(),
  source: varchar("source", { length: 40 }).default("first_paid_invoice").notNull(),
  providerRef: varchar("providerRef", { length: 255 }),
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  revokedAt: timestamp("revokedAt"),
  revokedReason: varchar("revokedReason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("promo_grant_user_role_unique").on(table.userId, table.role), index("promo_grant_user_status_idx").on(table.userId, table.role, table.status)]);

// Kit credit ledger (0089, shared/creditLedger.ts): the dated and one-time
// credit buckets. "carryover" holds what a plan cycle left unspent, bound to the
// subscription that granted it (expiresAt NULL = while subscribed, Land);
// "welcome" is the one-time 3 credits per person; "trial" (0091) the reverse
// trial's 5 credits, ending with the trial. grantKey is the idempotency claim:
// one carryover per subscription cycle, one welcome and one trial per person.
// Every change to creditsRemaining has a tokenTransactions row with creditGrantId.
export const planCreditGrants = mysqlTable("planCreditGrants", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["job_seeker", "referrer"]).default("job_seeker").notNull(),
  // Order pinned to shared/creditLedger.ts CREDIT_GRANT_SOURCES; 0091 added "trial".
  source: mysqlEnum("source", ["carryover", "welcome", "trial"]).notNull(),
  grantKey: varchar("grantKey", { length: 64 }).notNull(),
  planId: varchar("planId", { length: 32 }),
  subscriptionId: varchar("subscriptionId", { length: 80 }),
  cycleKey: varchar("cycleKey", { length: 16 }),
  tokenCount: int("tokenCount").notNull(),
  creditsRemaining: int("creditsRemaining").notNull(),
  status: mysqlEnum("status", ["active", "exhausted", "expired", "revoked"]).default("active").notNull(),
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
  closedAt: timestamp("closedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("plan_credit_grants_grant_key_unique").on(table.grantKey), index("plan_credit_grants_user_status_idx").on(table.userId, table.role, table.status), index("plan_credit_grants_status_expiry_idx").on(table.status, table.expiresAt)]);

export const giftSubscriptionFulfillments = mysqlTable("giftSubscriptionFulfillments", {
  id: int("id").autoincrement().primaryKey(),
  giftId: varchar("giftId", { length: 150 }).notNull(),
  provider: varchar("provider", { length: 32 }).default("chargebee").notNull(),
  buyerUserId: int("buyerUserId").references(() => users.id, { onDelete: "cascade" }),
  receiverEmail: varchar("receiverEmail", { length: 70 }),
  recipientUserId: int("recipientUserId").references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["job_seeker", "referrer"]).default("job_seeker").notNull(),
  plan: mysqlEnum("plan", ["pro", "max"]),
  currency: varchar("currency", { length: 3 }),
  amount: int("amount"),
  subscriptionId: varchar("subscriptionId", { length: 80 }),
  providerStatus: varchar("providerStatus", { length: 20 }),
  fulfillmentStatus: mysqlEnum("fulfillmentStatus", ["pending", "credited", "conflict", "expired", "cancelled"]).default("pending").notNull(),
  failureReason: varchar("failureReason", { length: 255 }),
  creditedAt: timestamp("creditedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("gift_fulfillment_gift_unique").on(table.giftId), index("gift_fulfillment_receiver_idx").on(table.receiverEmail, table.fulfillmentStatus), index("gift_fulfillment_buyer_idx").on(table.buyerUserId, table.createdAt), index("gift_fulfillment_subscription_idx").on(table.subscriptionId)]);

export const paymentFulfillments = mysqlTable("paymentFulfillments", {  id: int("id").autoincrement().primaryKey(),
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
  providerOrderId: varchar("providerOrderId", { length: 255 }),
  checkoutKey: varchar("checkoutKey", { length: 64 }).notNull(),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  providerReceipt: varchar("providerReceipt", { length: 40 }).notNull(),
  providerPaymentId: varchar("providerPaymentId", { length: 255 }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  pack: mysqlEnum("pack", ["starter", "growth", "scale"]).notNull(),
  amount: int("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  status: mysqlEnum("status", ["creating", "provider_create_in_progress", "pending", "processing", "credited", "requires_review", "expired", "canceled"]).default("creating").notNull(),
  attemptCount: int("attemptCount").default(0).notNull(),
  createLeaseOwner: varchar("createLeaseOwner", { length: 64 }),
  createLeaseExpiresAt: timestamp("createLeaseExpiresAt"),
  lastError: varchar("lastError", { length: 500 }),
  creditedAt: timestamp("creditedAt"),
  refundedAmount: int("refundedAmount").default(0).notNull(),
  refundedCredits: int("refundedCredits").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("employer_payment_checkout_key_unique").on(table.userId, table.checkoutKey), uniqueIndex("employer_payment_provider_receipt_unique").on(table.provider, table.providerReceipt), uniqueIndex("employer_payment_provider_order_unique").on(table.provider, table.providerOrderId), uniqueIndex("employer_payment_provider_payment_unique").on(table.provider, table.providerPaymentId), index("employer_payment_user_status_idx").on(table.userId, table.status)]);

export const employerPaymentRefunds = mysqlTable("employerPaymentRefunds", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 32 }).notNull(),
  providerRefundId: varchar("providerRefundId", { length: 255 }).notNull(),
  providerPaymentId: varchar("providerPaymentId", { length: 255 }).notNull(),
  providerOrderId: varchar("providerOrderId", { length: 255 }),
  fulfillmentId: int("fulfillmentId"),
  amount: int("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  creditsReversed: int("creditsReversed").default(0).notNull(),
  status: mysqlEnum("status", ["applied", "requires_review"]).notNull(),
  reason: varchar("reason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [ foreignKey({ name: "employerPaymentRefunds_fulfillmentId_fk", columns: [table.fulfillmentId], foreignColumns: [employerPaymentFulfillments.id] }).onDelete("set null"),uniqueIndex("employer_payment_refund_event_unique").on(table.provider, table.providerRefundId), index("employer_payment_refund_payment_idx").on(table.provider, table.providerPaymentId)]);

export const subscriptionCheckoutIntents = mysqlTable("subscriptionCheckoutIntents", {
  id: int("id").autoincrement().primaryKey(),
  hostedPageId: varchar("hostedPageId", { length: 80 }).notNull(),
  checkoutIntentId: varchar("checkoutIntentId", { length: 96 }).notNull(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["job_seeker", "referrer"]).notNull(),
  // Order pinned to shared/billingCatalog.ts INTENT_PLAN_IDS; 0090 added the kit plans, 0091 the Oct 14 2026 plans.
  plan: mysqlEnum("plan", ["pro", "max", "start", "momentum", "land_100", "land_200", "land_500", "keep_warm", "land_focus", "land_sprint", "land_concierge"]).notNull(),
  itemPriceId: varchar("itemPriceId", { length: 100 }).notNull(),
  amount: int("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  status: mysqlEnum("status", ["pending", "activated", "cancelled"]).default("pending").notNull(),
  // 0090: yearly terms, plan changes of an existing subscription, and the provider's
  // recorded payment failure (shared/billingAccount.ts PAYMENT_FAILURE_REASONS).
  billingPeriod: mysqlEnum("billingPeriod", ["monthly", "yearly", "30d", "90d"]).default("monthly").notNull(),
  kind: mysqlEnum("kind", ["new", "change"]).default("new").notNull(),
  subscriptionId: varchar("subscriptionId", { length: 80 }),
  failureReason: varchar("failureReason", { length: 32 }),
  failureCode: varchar("failureCode", { length: 64 }),
  failedAt: timestamp("failedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("subscription_checkout_hosted_page_unique").on(table.hostedPageId), uniqueIndex("subscription_checkout_intent_unique").on(table.checkoutIntentId), index("subscription_checkout_user_idx").on(table.userId), index("subscription_checkout_subscription_idx").on(table.subscriptionId)]);

// Subscription management (0090). The Chargebee customer that holds a member's
// payment methods, per billing site (test and live ids never cross). Bound only
// from an owned subscription or checkout; one customer never maps to two people.
export const billingCustomers = mysqlTable("billingCustomers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["job_seeker", "referrer"]).default("job_seeker").notNull(),
  provider: varchar("provider", { length: 32 }).default("chargebee").notNull(),
  site: mysqlEnum("site", ["test", "live"]).notNull(),
  providerCustomerId: varchar("providerCustomerId", { length: 80 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("billing_customers_provider_customer_unique").on(table.provider, table.site, table.providerCustomerId), uniqueIndex("billing_customers_owner_unique").on(table.userId, table.role, table.provider, table.site)]);

// Receipts (0090): every provider invoice of a member's subscription or credit
// pack, upserted from webhook snapshots in invoice resource_version order.
export const billingInvoices = mysqlTable("billingInvoices", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 32 }).default("chargebee").notNull(),
  site: mysqlEnum("site", ["test", "live"]).notNull(),
  providerInvoiceId: varchar("providerInvoiceId", { length: 80 }).notNull(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["job_seeker", "referrer"]).default("job_seeker").notNull(),
  kind: mysqlEnum("kind", ["subscription", "credit_pack"]).notNull(),
  subscriptionId: varchar("subscriptionId", { length: 80 }),
  planId: varchar("planId", { length: 32 }),
  billingPeriod: mysqlEnum("billingPeriod", ["monthly", "yearly", "30d", "90d"]),
  tokenCount: int("tokenCount"),
  amount: int("amount").notNull(),
  amountRefunded: int("amountRefunded").default(0).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  status: mysqlEnum("status", ["paid", "refunded", "partially_refunded", "payment_due", "not_paid", "voided"]).notNull(),
  paidAt: timestamp("paidAt"),
  resourceVersion: bigint("resourceVersion", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("billing_invoices_provider_invoice_unique").on(table.provider, table.site, table.providerInvoiceId), index("billing_invoices_owner_paid_idx").on(table.userId, table.role, table.paidAt)]);

// Why members leave (0090): one row per confirmed cancel or pause from the kit flow.
export const subscriptionCancellationFeedback = mysqlTable("subscriptionCancellationFeedback", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["job_seeker", "referrer"]).default("job_seeker").notNull(),
  subscriptionId: varchar("subscriptionId", { length: 80 }).notNull(),
  reason: mysqlEnum("reason", ["got_job", "too_expensive", "not_using", "missing_feature", "other"]).notNull(),
  outcome: mysqlEnum("outcome", ["cancelled", "paused"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("subscription_cancellation_feedback_user_idx").on(table.userId, table.createdAt)]);

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
}, table => [new ForeignKeyBuilder(() => ({ name: "referralAttachments_uploadSessionId_fk", columns: [table.uploadSessionId], foreignColumns: [resumeUploadSessions.id] })).onDelete("set null"), index("referral_attachments_request_idx").on(table.referralRequestId), index("referral_attachments_owner_idx").on(table.ownerId), uniqueIndex("referral_attachments_upload_session_unique").on(table.uploadSessionId)]);

/**
 * The work a seeker pinned onto one ask (task 13). Columns are copied at send
 * time, not joined on read, so editing or deleting a showcase piece later never
 * rewrites what a referrer was already shown. How many pieces ride along is the
 * plan's existing `showcase.pins` entitlement, enforced in server/db.ts.
 */
export const askWorkItems = mysqlTable("askWorkItems", {
  id: int("id").autoincrement().primaryKey(),
  referralRequestId: int("referralRequestId").notNull().references(() => referralRequests.id, { onDelete: "cascade" }),
  workItemId: int("workItemId").references(() => workItems.id, { onDelete: "set null" }),
  title: varchar("title", { length: 160 }).notNull(),
  kind: mysqlEnum("kind", ["case_study", "project", "article", "code", "other"]).default("other").notNull(),
  source: varchar("source", { length: 80 }),
  url: varchar("url", { length: 2048 }),
  position: int("position").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("ask_work_items_request_piece_unique").on(table.referralRequestId, table.workItemId), index("ask_work_items_request_idx").on(table.referralRequestId, table.position)]);

/** D-132 audit item 2 (0106): the job level and credit cost an ask was priced at, stored once at creation. Written only while ASK_LEVEL_COST is on; no row means the flat 1-credit price. */
export const askCosts = mysqlTable("askCosts", {
  id: int("id").autoincrement().primaryKey(),
  referralRequestId: int("referralRequestId").notNull().references(() => referralRequests.id, { onDelete: "cascade" }),
  jobLevel: int("jobLevel").notNull(),
  creditCost: int("creditCost").notNull(),
  source: varchar("source", { length: 40 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("ask_costs_request_unique").on(table.referralRequestId)]);

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
  attachmentId: int("attachmentId").references((): AnyMySqlColumn => referralAttachments.id, { onDelete: "set null" }),
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

// OAuth for connected assistants (authorization code + PKCE S256, public clients).
export const oauthClients = mysqlTable("oauthClients", {
  id: int("id").autoincrement().primaryKey(),
  clientId: varchar("clientId", { length: 64 }).notNull().unique(),
  clientName: varchar("clientName", { length: 160 }).notNull(),
  redirectUris: text("redirectUris").notNull(), // JSON array
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const oauthAuthCodes = mysqlTable("oauthAuthCodes", {
  id: int("id").autoincrement().primaryKey(),
  codeHash: varchar("codeHash", { length: 64 }).notNull().unique(),
  clientId: varchar("clientId", { length: 64 }).notNull(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  redirectUri: varchar("redirectUri", { length: 512 }).notNull(),
  codeChallenge: varchar("codeChallenge", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("oauth_auth_codes_user_idx").on(table.userId), index("oauth_auth_codes_expiry_idx").on(table.expiresAt)]);

/**
 * The kit landed journey (queue row 20 slices C/D): one row per ask that ended with
 * a hire, holding the seeker's thank-you, whether they let the referrer keep it on
 * their private wall, and the pay-it-forward answer. `deliveredAt` is the claim that
 * makes the note send-at-most-once, and `conversationMessageId` (plain int, like
 * `referralRequests.debitTransactionId`) records the thread message it produced.
 */
export const landedJourney = mysqlTable("landedJourney", {
  id: int("id").autoincrement().primaryKey(),
  referralRequestId: int("referralRequestId").notNull().references(() => referralRequests.id, { onDelete: "cascade" }),
  seekerUserId: int("seekerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  referrerUserId: int("referrerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  thankYouMessage: text("thankYouMessage"),
  shareOnWall: boolean("shareOnWall").default(false).notNull(),
  payForwardChoice: varchar("payForwardChoice", { length: 12 }),
  deliveredAt: timestamp("deliveredAt"),
  conversationMessageId: int("conversationMessageId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("landed_journey_request_unique").on(table.referralRequestId), index("landed_journey_referrer_wall_idx").on(table.referrerUserId, table.shareOnWall)]);
// Aggregate-only company access. Work-mailbox proof grants no employee/admin rights.
export const companyAggregateAccess = mysqlTable("companyAggregateAccess", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  domain: varchar("domain", { length: 255 }).notNull(),
  verifiedAt: timestamp("verifiedAt").defaultNow().notNull(),
}, t => [uniqueIndex("company_aggregate_user_domain").on(t.userId, t.domain)]);
export const companyClaimChallenges = mysqlTable("companyClaimChallenges", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  domain: varchar("domain", { length: 255 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
}, t => [index("company_claim_user_created").on(t.userId, t.createdAt)]);
const billingReviewDigest = customType<{ data: string; driverData: string }>({ dataType() { return "varchar(64) CHARACTER SET ascii COLLATE ascii_bin"; } });

/** D-067 review notifications, no user cascade may erase unresolved evidence. */
export const billingReviewOutbox = mysqlTable("billingReviewOutbox", {
  id: int("id").autoincrement().primaryKey(),
  obligationKey: billingReviewDigest("obligationKey").notNull(),
  payload: text("payload"),
  conflictDigest: billingReviewDigest("conflictDigest").notNull(),
  envelope: text("envelope"),
  submissionState: varchar("submissionState", { length: 20 }).default("never_submitted").notNull(),
  updatedAt: timestamp("updatedAt", { fsp: 3 }).notNull(),
  status: varchar("status", { length: 16 }).default("pending").notNull(),
  attempts: int("attempts").default(0).notNull(),
  nextAttemptAt: timestamp("nextAttemptAt", { fsp: 3 }).notNull(),
  leaseOwner: varchar("leaseOwner", { length: 64 }),
  leaseUntil: timestamp("leaseUntil", { fsp: 3 }),
  firstAttemptAt: timestamp("firstAttemptAt", { fsp: 3 }),
  acceptedAt: timestamp("acceptedAt", { fsp: 3 }),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
  lastError: varchar("lastError", { length: 80 }),
  createdAt: timestamp("createdAt", { fsp: 3 }).notNull(),
}, table => [uniqueIndex("billing_review_obligation_unique").on(table.obligationKey), index("billing_review_due_idx").on(table.status, table.nextAttemptAt, table.id)]);

// D-115 plan family (main, Oct 21): one row per AI tool call so benefit caps
// can be set from real cost before pricing go-live. costUsdMicros is null
// until the model is priced in shared/aiCost.ts; tokens are always captured.
export const aiToolCallLogs = mysqlTable("aiToolCallLogs", {
  id: int("id").autoincrement().primaryKey(),
  tool: varchar("tool", { length: 64 }).notNull(),
  model: varchar("model", { length: 128 }).notNull(),
  tokensIn: int("tokensIn").notNull(),
  tokensOut: int("tokensOut").notNull(),
  costUsdMicros: bigint("costUsdMicros", { mode: "number" }),
  planFamilyId: varchar("planFamilyId", { length: 32 }),
  userId: int("userId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("ai_tool_call_log_tool_idx").on(table.tool, table.createdAt)]);

// Skippy step 5 (D-141): a seeker's own AI agents. Draft-only: scope lookups
// and ask drafts, never send, never buy. The key itself is never stored -
// only its sha256 hex and a short display prefix.
export const seekerAgentGrants = mysqlTable("seekerAgentGrants", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  keyPrefix: varchar("keyPrefix", { length: 16 }).notNull(),
  keyHash: varchar("keyHash", { length: 64 }).notNull(),
  canLookup: boolean("canLookup").default(true).notNull(),
  canDraft: boolean("canDraft").default(true).notNull(),
  maxCreditsPerAsk: int("maxCreditsPerAsk").notNull(),
  maxCreditsPerDay: int("maxCreditsPerDay").notNull(),
  maxCreditsPerWeek: int("maxCreditsPerWeek").notNull(),
  maxAsksPerDay: int("maxAsksPerDay").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt"),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("seeker_agent_grants_key_hash_unique").on(table.keyHash), index("seeker_agent_grants_user_idx").on(table.userId)]);

// Pause-all (D-141): one row per seeker; pausedAt set means every agent of
// theirs is refused until resumed.
export const seekerAgentControls = mysqlTable("seekerAgentControls", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  pausedAt: timestamp("pausedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("seeker_agent_controls_user_unique").on(table.userId)]);

export const seekerAgentDrafts = mysqlTable("seekerAgentDrafts", {
  id: int("id").autoincrement().primaryKey(),
  grantId: int("grantId").notNull(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  companySlug: varchar("companySlug", { length: 48 }).notNull(),
  targetRoleUrl: varchar("targetRoleUrl", { length: 2048 }).notNull(),
  note: varchar("note", { length: 2000 }).default("").notNull(),
  jobLevel: int("jobLevel").notNull(),
  creditCost: int("creditCost").notNull(),
  status: mysqlEnum("status", ["draft", "discarded"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("seeker_agent_drafts_grant_idx").on(table.grantId, table.createdAt), index("seeker_agent_drafts_user_idx").on(table.userId, table.createdAt)]);

// Audit log (D-141): every agent call and every grant lifecycle action, with
// the agent's name snapshotted so the log still reads after a revoke. The key
// and its hash are never written here.
export const seekerAgentEvents = mysqlTable("seekerAgentEvents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  grantId: int("grantId"),
  agentName: varchar("agentName", { length: 120 }).notNull(),
  action: varchar("action", { length: 48 }).notNull(),
  outcome: mysqlEnum("outcome", ["success", "denied", "failure"]).notNull(),
  detail: varchar("detail", { length: 600 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("seeker_agent_events_grant_idx").on(table.grantId, table.createdAt), index("seeker_agent_events_user_idx").on(table.userId, table.createdAt)]);

/** D-148 (0107): the level a seeker picks for themselves (1-10). Display only (plans "Who you can ask"); never inferred. */
export const seekerLevels = mysqlTable("seekerLevels", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  level: int("level").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("seeker_levels_user_unique").on(table.userId)]);
