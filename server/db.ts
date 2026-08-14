import { and, count, desc, eq, isNull, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { companyOpportunities, type InsertUser, jobs, messages, notifications, operationalActivityLogs, profiles, referralAttachments, referralRequests, savedRoles, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); } catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

export function resolveSyncedUserRole(input: { openId: string; requestedRole?: "user" | "admin"; existingRole?: "user" | "admin" }) {
  return input.requestedRole ?? input.existingRole ?? (input.openId === ENV.ownerOpenId ? "admin" : "user");
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const current = await db.select({ role: users.role }).from(users).where(eq(users.openId, user.openId)).limit(1);
  const role = resolveSyncedUserRole({ openId: user.openId, requestedRole: user.role, existingRole: current[0]?.role });
  const values: InsertUser = { openId: user.openId, name: user.name ?? null, email: user.email ?? null, loginMethod: user.loginMethod ?? null, lastSignedIn: user.lastSignedIn ?? new Date(), role };
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: { name: values.name, email: values.email, loginMethod: values.loginMethod, lastSignedIn: values.lastSignedIn, role: values.role } });
}

export async function getUserByOpenId(openId: string) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1); return result[0]; }
export async function getProfileByUserId(userId: number) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1); return result[0]; }

export type OperationalActivityInput = { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number; companyDomain?: string; metadata?: Record<string, string | number | boolean | null | undefined> };
export async function recordOperationalActivity(input: OperationalActivityInput) {
  const db = await getDb(); if (!db) return;
  const metadata = input.metadata ? JSON.stringify(Object.fromEntries(Object.entries(input.metadata).filter(([, value]) => value !== undefined))) : null;
  await db.insert(operationalActivityLogs).values({ actorUserId: input.actorUserId ?? null, action: input.action.slice(0, 100), outcome: input.outcome, resourceType: input.resourceType?.slice(0, 80) ?? null, resourceId: input.resourceId === undefined ? null : String(input.resourceId).slice(0, 120), companyDomain: input.companyDomain?.toLowerCase().slice(0, 255) ?? null, metadata });
}
export async function listOperationalActivity(input: { limit?: number; action?: string } = {}) {
  const db = await getDb(); if (!db) return [];
  const limit = Math.max(1, Math.min(input.limit ?? 100, 250));
  const where = input.action?.trim() ? like(operationalActivityLogs.action, `%${input.action.trim()}%`) : undefined;
  return db.select({ id: operationalActivityLogs.id, action: operationalActivityLogs.action, outcome: operationalActivityLogs.outcome, resourceType: operationalActivityLogs.resourceType, resourceId: operationalActivityLogs.resourceId, companyDomain: operationalActivityLogs.companyDomain, metadata: operationalActivityLogs.metadata, createdAt: operationalActivityLogs.createdAt, actorUserId: operationalActivityLogs.actorUserId, actorName: users.name, actorEmail: users.email }).from(operationalActivityLogs).leftJoin(users, eq(operationalActivityLogs.actorUserId, users.id)).where(where).orderBy(desc(operationalActivityLogs.createdAt)).limit(limit);
}

export function companyDomainFromTargetUrl(targetRoleUrl: string): string | undefined {
  try {
    const hostname = new URL(targetRoleUrl).hostname.toLowerCase().replace(/^www\./, "");
    if (!hostname || hostname === "jobs.lever.co" || hostname.endsWith("greenhouse.io")) return undefined;
    const labels = hostname.split(".");
    return labels.length > 2 ? labels.slice(-2).join(".") : hostname;
  } catch { return undefined; }
}

const consumerEmailDomains = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com"]);
export function isWorkEmailDomain(domain: string): boolean { return Boolean(domain) && !consumerEmailDomains.has(domain.trim().toLowerCase()); }

export async function saveVerifiedWorkEmail(userId: number, email: string) {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain) throw new Error("A work email address is required");
  if (!isWorkEmailDomain(domain)) throw new Error("Use a verified company email, not a personal email domain");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await db.insert(profiles).values({ userId, accountType: "referrer", company: domain, workEmailDomain: domain, workEmailVerifiedAt: new Date(), isOnboarded: true }).onDuplicateKeyUpdate({ set: { accountType: "referrer", company: domain, workEmailDomain: domain, workEmailVerifiedAt: new Date(), isOnboarded: true } });
  return getProfileByUserId(userId);
}

export async function saveProfile(userId: number, input: { accountType: "job_seeker" | "referrer"; headline?: string; location?: string; bio?: string; company?: string; currentTitle?: string; resumeUrl?: string; skills?: string; experience?: string; expertise?: string; referralCapacity?: number; }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await db.insert(profiles).values({ userId, ...input, isOnboarded: true }).onDuplicateKeyUpdate({ set: { ...input, isOnboarded: true } });
  return getProfileByUserId(userId);
}

export type PublishCompanyOpportunityInput = { kind: "hiring_now" | "walk_in"; roleTitle: string; targetRoleUrl?: string; location?: string; walkInAt?: Date; walkInEndsAt?: Date };

export async function publishCompanyOpportunity(userId: number, input: PublishCompanyOpportunityInput) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !profile.workEmailVerifiedAt) throw new Error("Verify your work email before publishing an opportunity");
  const roleTitle = input.roleTitle.trim();
  if (!roleTitle || roleTitle.length > 180) throw new Error("Add a role title before publishing");
  if (input.targetRoleUrl) {
    try { new URL(input.targetRoleUrl); } catch { throw new Error("Use a valid public job link or leave it blank"); }
  }
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const result = await db.insert(companyOpportunities).values({ ownerId: userId, companyDomain: profile.workEmailDomain, kind: input.kind, roleTitle, targetRoleUrl: input.targetRoleUrl?.trim() || null, location: input.location?.trim() || null, walkInAt: input.walkInAt ?? null, walkInEndsAt: input.walkInEndsAt ?? null, isActive: true });
  return { id: Number(result[0].insertId), companyDomain: profile.workEmailDomain, kind: input.kind, roleTitle };
}

export async function listPublicCompanyOpportunities() {
  const db = await getDb(); if (!db) return [];
  return db.select({ id: companyOpportunities.id, companyDomain: companyOpportunities.companyDomain, kind: companyOpportunities.kind, roleTitle: companyOpportunities.roleTitle, targetRoleUrl: companyOpportunities.targetRoleUrl, location: companyOpportunities.location, walkInAt: companyOpportunities.walkInAt, walkInEndsAt: companyOpportunities.walkInEndsAt, createdAt: companyOpportunities.createdAt }).from(companyOpportunities).where(eq(companyOpportunities.isActive, true)).orderBy(desc(companyOpportunities.createdAt)).limit(24);
}

export async function listJobs(input: { query?: string; company?: string; location?: string; seniority?: string }) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select().from(jobs).orderBy(desc(jobs.publishedAt));
  const term = input.query?.trim().toLowerCase();
  return rows.filter(row => (!term || `${row.title} ${row.company} ${row.description}`.toLowerCase().includes(term)) && (!input.company || row.company === input.company) && (!input.location || row.location.includes(input.location)) && (!input.seniority || row.seniority === input.seniority));
}

export async function listReferrers(input: { query?: string; company?: string; role?: string }) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ profileId: profiles.id, userId: users.id, name: users.name, email: users.email, company: profiles.company, title: profiles.currentTitle, location: profiles.location, expertise: profiles.expertise, capacity: profiles.referralCapacity, headline: profiles.headline }).from(profiles).innerJoin(users, eq(profiles.userId, users.id)).where(eq(profiles.accountType, "referrer"));
  const term = input.query?.trim().toLowerCase();
  return rows.filter(row => (!term || `${row.name ?? ""} ${row.company ?? ""} ${row.title ?? ""} ${row.expertise ?? ""}`.toLowerCase().includes(term)) && (!input.company || row.company === input.company) && (!input.role || (row.title ?? "").toLowerCase().includes(input.role.toLowerCase())));
}

export async function listSavedRoles(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select({ savedId: savedRoles.id, createdAt: savedRoles.createdAt, jobId: jobs.id, title: jobs.title, company: jobs.company, location: jobs.location, seniority: jobs.seniority, workMode: jobs.workMode }).from(savedRoles).innerJoin(jobs, eq(savedRoles.jobId, jobs.id)).where(eq(savedRoles.jobSeekerId, userId)).orderBy(desc(savedRoles.createdAt));
}

export async function toggleSavedRole(userId: number, jobId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const existing = await db.select().from(savedRoles).where(and(eq(savedRoles.jobSeekerId, userId), eq(savedRoles.jobId, jobId))).limit(1);
  if (existing[0]) { await db.delete(savedRoles).where(eq(savedRoles.id, existing[0].id)); return { saved: false }; }
  await db.insert(savedRoles).values({ jobSeekerId: userId, jobId }); return { saved: true };
}

export async function listReferralRequests(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select({ id: referralRequests.id, jobId: jobs.id, jobTitle: jobs.title, company: jobs.company, jobLocation: jobs.location, jobSeekerId: referralRequests.jobSeekerId, referrerId: referralRequests.referrerId, personalPitch: referralRequests.personalPitch, status: referralRequests.status, referrerMessage: referralRequests.referrerMessage, createdAt: referralRequests.createdAt, updatedAt: referralRequests.updatedAt }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(or(eq(referralRequests.jobSeekerId, userId), eq(referralRequests.referrerId, userId))).orderBy(desc(referralRequests.updatedAt));
}

export async function createReferralRequest(userId: number, input: { jobId: number; referrerId: number; personalPitch: string; attachmentIds?: number[] }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const result = await db.insert(referralRequests).values({ jobId: input.jobId, jobSeekerId: userId, referrerId: input.referrerId, personalPitch: input.personalPitch });
  const requestId = Number(result[0].insertId);
  for (const attachmentId of input.attachmentIds ?? []) await db.update(referralAttachments).set({ referralRequestId: requestId }).where(and(eq(referralAttachments.id, attachmentId), eq(referralAttachments.ownerId, userId)));
  await db.insert(notifications).values({ userId: input.referrerId, category: "referral", title: "New Referral Request", body: "A Job Seeker has shared a Referral Request for your review." });
  return { id: requestId };
}

export async function createCompanyReferralRequest(userId: number, input: { targetRoleUrl: string; personalPitch: string; attachmentIds: number[] }) {
  const companyDomain = companyDomainFromTargetUrl(input.targetRoleUrl);
  if (!companyDomain) throw new Error("Use the employer’s direct careers URL so we can route this request privately");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const jobResult = await db.insert(jobs).values({ title: "Role from shared job link", company: companyDomain, location: "Not specified", description: "Private referral request routed from a Target Role URL.", targetRoleUrl: input.targetRoleUrl, workMode: "Not specified", seniority: "Not specified", employmentType: "Not specified", publishedAt: new Date() });
  const jobId = Number(jobResult[0].insertId);
  const requestResult = await db.insert(referralRequests).values({ jobId, jobSeekerId: userId, personalPitch: input.personalPitch, status: "pending" });
  const requestId = Number(requestResult[0].insertId);
  for (const attachmentId of input.attachmentIds) await db.update(referralAttachments).set({ referralRequestId: requestId }).where(and(eq(referralAttachments.id, attachmentId), eq(referralAttachments.ownerId, userId)));
  const eligible = await db.select({ userId: profiles.userId }).from(profiles).where(and(eq(profiles.accountType, "referrer"), eq(profiles.workEmailDomain, companyDomain)));
  for (const employee of eligible) await db.insert(notifications).values({ userId: employee.userId, category: "referral", title: "A private referral request is available", body: `A Job Seeker shared a role at ${companyDomain}. Sign in to review and claim it.` });
  return { requestId, companyDomain, notifiedEmployees: eligible.length };
}

export async function listCompanyReferralInbox(userId: number) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !profile.workEmailVerifiedAt) return [];
  const db = await getDb(); if (!db) return [];
  return db.select({ id: referralRequests.id, targetRoleUrl: jobs.targetRoleUrl, companyDomain: jobs.company, jobSeekerName: users.name, createdAt: referralRequests.createdAt, attachmentCount: count(referralAttachments.id) }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).innerJoin(users, eq(referralRequests.jobSeekerId, users.id)).leftJoin(referralAttachments, eq(referralAttachments.referralRequestId, referralRequests.id)).where(and(eq(jobs.company, profile.workEmailDomain), isNull(referralRequests.referrerId), eq(referralRequests.status, "pending"))).groupBy(referralRequests.id, jobs.targetRoleUrl, jobs.company, users.name, referralRequests.createdAt).orderBy(desc(referralRequests.createdAt));
}

export async function claimCompanyReferralRequest(userId: number, requestId: number) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !profile.workEmailVerifiedAt) throw new Error("Verify your work email before claiming referrals");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const request = await db.select({ jobSeekerId: referralRequests.jobSeekerId, company: jobs.company }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(and(eq(referralRequests.id, requestId), eq(referralRequests.status, "pending"), isNull(referralRequests.referrerId))).limit(1);
  if (!request[0] || request[0].company !== profile.workEmailDomain) throw new Error("This referral request is no longer available");
  const update = await db.update(referralRequests).set({ referrerId: userId }).where(and(eq(referralRequests.id, requestId), isNull(referralRequests.referrerId)));
  if (Number(update[0].affectedRows) !== 1) throw new Error("Another verified employee already claimed this request");
  await db.insert(notifications).values({ userId: request[0].jobSeekerId, category: "status", title: "Your referral request was claimed", body: "A verified employee at the target company is reviewing your request." });
  return { requestId, claimed: true };
}

export async function getClaimedCompanyReferralDetail(userId: number, requestId: number) {
  const db = await getDb(); if (!db) return undefined;
  const request = await db.select({ id: referralRequests.id, targetRoleUrl: jobs.targetRoleUrl, companyDomain: jobs.company, candidateName: users.name, referrerId: referralRequests.referrerId }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).innerJoin(users, eq(referralRequests.jobSeekerId, users.id)).where(and(eq(referralRequests.id, requestId), eq(referralRequests.referrerId, userId))).limit(1);
  if (!request[0]) return undefined;
  const attachments = await db.select({ id: referralAttachments.id, fileName: referralAttachments.fileName, mimeType: referralAttachments.mimeType, fileSize: referralAttachments.fileSize }).from(referralAttachments).where(eq(referralAttachments.referralRequestId, requestId));
  return { ...request[0], attachments };
}

export async function createReferralAttachment(ownerId: number, input: { fileName: string; fileKey: string; mimeType: string; fileSize: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const result = await db.insert(referralAttachments).values({ ownerId, ...input });
  return { id: Number(result[0].insertId), ...input };
}

export async function getAccessibleReferralAttachment(userId: number, attachmentId: number) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select({ id: referralAttachments.id, ownerId: referralAttachments.ownerId, fileName: referralAttachments.fileName, fileKey: referralAttachments.fileKey, mimeType: referralAttachments.mimeType, fileSize: referralAttachments.fileSize, referralRequestId: referralAttachments.referralRequestId, referrerId: referralRequests.referrerId }).from(referralAttachments).leftJoin(referralRequests, eq(referralAttachments.referralRequestId, referralRequests.id)).where(and(eq(referralAttachments.id, attachmentId), or(eq(referralAttachments.ownerId, userId), eq(referralRequests.referrerId, userId)))).limit(1);
  return result[0];
}

export function canAccessReferralAttachment(actorUserId: number, attachment: { ownerId: number; referrerId?: number | null }): boolean {
  return attachment.ownerId === actorUserId || attachment.referrerId === actorUserId;
}

export async function reviewReferralRequest(userId: number, input: { requestId: number; decision: "approved" | "declined"; message?: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const existing = await db.select().from(referralRequests).where(eq(referralRequests.id, input.requestId)).limit(1);
  if (!existing[0] || existing[0].referrerId !== userId) throw new Error("Referral Request not found");
  if (existing[0].status !== "pending") throw new Error("This Referral Request has already been reviewed");
  await db.update(referralRequests).set({ status: input.decision, referrerMessage: input.message ?? null }).where(eq(referralRequests.id, input.requestId));
  await db.insert(notifications).values({ userId: existing[0].jobSeekerId, category: "status", title: `Referral Request ${input.decision === "approved" ? "approved" : "declined"}`, body: input.message || "Your Referrer has reviewed your Referral Request." });
  return { status: input.decision };
}

export async function listMessages(userId: number) { const db = await getDb(); if (!db) return []; return db.select().from(messages).where(or(eq(messages.senderId, userId), eq(messages.recipientId, userId))).orderBy(desc(messages.createdAt)); }
export async function sendMessage(userId: number, input: { recipientId: number; body: string; referralRequestId?: number }) { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const result = await db.insert(messages).values({ senderId: userId, recipientId: input.recipientId, body: input.body, referralRequestId: input.referralRequestId }); await db.insert(notifications).values({ userId: input.recipientId, category: "message", title: "New message", body: "You have a new message in Bridge." }); return { id: Number(result[0].insertId) }; }
export async function listNotifications(userId: number) { const db = await getDb(); if (!db) return []; return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)); }
export async function markNotificationRead(userId: number, notificationId: number) { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId))); return { success: true }; }

export async function getDashboardStats(userId: number) {
  const db = await getDb(); if (!db) return { savedRoles: 0, activeReferralRequests: 0, incomingReferralRequests: 0, introductionsMade: 0, conversationsStarted: 0, peopleHired: 0 };
  const [saved] = await db.select({ value: count() }).from(savedRoles).where(eq(savedRoles.jobSeekerId, userId));
  const [active] = await db.select({ value: count() }).from(referralRequests).where(and(eq(referralRequests.jobSeekerId, userId), or(eq(referralRequests.status, "pending"), eq(referralRequests.status, "approved"), eq(referralRequests.status, "intro_made"), eq(referralRequests.status, "interview"))));
  const [incoming] = await db.select({ value: count() }).from(referralRequests).where(and(eq(referralRequests.referrerId, userId), eq(referralRequests.status, "pending")));
  const [introductions] = await db.select({ value: count() }).from(referralRequests).where(and(eq(referralRequests.referrerId, userId), or(eq(referralRequests.status, "intro_made"), eq(referralRequests.status, "interview"), eq(referralRequests.status, "offer"), eq(referralRequests.status, "closed"))));
  const [conversations] = await db.select({ value: count() }).from(referralRequests).where(and(eq(referralRequests.referrerId, userId), or(eq(referralRequests.status, "interview"), eq(referralRequests.status, "offer"), eq(referralRequests.status, "closed"))));
  const [hires] = await db.select({ value: count() }).from(referralRequests).where(and(eq(referralRequests.referrerId, userId), eq(referralRequests.status, "offer")));
  return { savedRoles: Number(saved?.value ?? 0), activeReferralRequests: Number(active?.value ?? 0), incomingReferralRequests: Number(incoming?.value ?? 0), introductionsMade: Number(introductions?.value ?? 0), conversationsStarted: Number(conversations?.value ?? 0), peopleHired: Number(hires?.value ?? 0) };
}

export async function getAiWorkspaceContext(userId: number) {
  const [profile, availableJobs, availableReferrers, saved, referrals, memberMessages, stats] = await Promise.all([
    getProfileByUserId(userId),
    listJobs({}),
    listReferrers({}),
    listSavedRoles(userId),
    listReferralRequests(userId),
    listMessages(userId),
    getDashboardStats(userId),
  ]);
  return {
    profile,
    jobs: availableJobs.slice(0, 12).map(job => ({ id: job.id, title: job.title, company: job.company, location: job.location, seniority: job.seniority, workMode: job.workMode, description: job.description })),
    referrers: availableReferrers.slice(0, 12).map(referrer => ({ userId: referrer.userId, name: referrer.name, company: referrer.company, title: referrer.title, expertise: referrer.expertise, capacity: referrer.capacity })),
    savedRoles: saved.slice(0, 8).map(role => ({ title: role.title, company: role.company, seniority: role.seniority })),
    referrals: referrals.slice(0, 8).map(referral => ({ jobTitle: referral.jobTitle, company: referral.company, status: referral.status, updatedAt: referral.updatedAt })),
    recentMessageCount: memberMessages.length,
    stats,
  };
}
