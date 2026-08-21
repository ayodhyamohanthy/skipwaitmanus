import { and, asc, count, desc, eq, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { adminTokenAdjustments, companyCoverageInvitations, companyCoverageRewards, companyOpportunities, paymentFulfillments, personalReferralInvites, personalReferralRewards, privacyRequests, referralAvailabilitySlots, referralShareCards, referrerFastTrackLinks, resumeUploadChunks, resumeUploadSessions, subscriptionCheckoutIntents, subscriptionEvents, tokenBalances, tokenTransactions, type InsertUser, jobs, messages, notifications, operationalActivityLogs, profiles, referralAttachments, referralRequests, savedRoles, users } from "../drizzle/schema";
import { createHash, randomUUID } from "node:crypto";
import { ENV } from "./_core/env";
import { FREE_MONTHLY_ALLOWANCE, SUBSCRIPTION_PLANS, currentMonthlyCycleKey, isPaidSubscriptionPlan, type PaidSubscriptionPlan, type SubscriptionPlan } from "../shared/subscriptionPlans";
import { isPostApprovalReferralStatus, referralProgressUpdateStatuses, referralStatusLabels, type ReferralProgressUpdateStatus, type ReferralStatus } from "../shared/referral";
import { normalizeTargetRoleUrl } from "../shared/referralUrl";
import { directEmployerDomainFromTargetUrl, employerCandidatesFromJobPageHtml, hostedEmployerCandidatesFromTargetUrl, isHostedJobPlatform, officialEmployerDomainsFromJobPageHtml, publicEmployerPageUrls, verifiedEmployerDomainFromCandidates, verifiedEmployerDomainFromProtectedHostedListing } from "./employerRouting";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); } catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

const durableAdministratorEmail = "ayodhya@skipwait.me";

export function resolveSyncedUserRole(input: { openId: string; email?: string | null; requestedRole?: "user" | "admin"; existingRole?: "user" | "admin" }) {
  const normalizedEmail = input.email?.trim().toLowerCase();
  if (normalizedEmail === durableAdministratorEmail) return "admin" as const;
  return input.requestedRole ?? input.existingRole ?? (input.openId === ENV.ownerOpenId ? "admin" : "user");
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const current = await db.select({ role: users.role }).from(users).where(eq(users.openId, user.openId)).limit(1);
  const role = resolveSyncedUserRole({ openId: user.openId, email: user.email, requestedRole: user.role, existingRole: current[0]?.role });
  const values: InsertUser = { openId: user.openId, name: user.name ?? null, email: user.email ?? null, loginMethod: user.loginMethod ?? null, lastSignedIn: user.lastSignedIn ?? new Date(), role };
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: { name: values.name, email: values.email, loginMethod: values.loginMethod, lastSignedIn: values.lastSignedIn, role: values.role } });
}

export async function getUserByOpenId(openId: string) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1); return result[0]; }
export async function getProfileByUserId(userId: number) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1); return result[0]; }

export async function createResumeUploadSession(ownerId: number, input: { fileName: string; mimeType: string; expectedSize: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const id = randomUUID(); await db.insert(resumeUploadSessions).values({ id, ownerId, fileName: input.fileName, mimeType: input.mimeType, expectedSize: input.expectedSize });
  return { id, fileName: input.fileName, mimeType: input.mimeType, expectedSize: input.expectedSize, receivedSize: 0, nextChunkIndex: 0, status: "active" as const, attachmentId: null };
}

export async function getResumeUploadSession(ownerId: number, sessionId: string) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const session = await db.select().from(resumeUploadSessions).where(and(eq(resumeUploadSessions.id, sessionId), eq(resumeUploadSessions.ownerId, ownerId))).limit(1);
  if (!session[0]) return undefined;
  const chunks = await db.select().from(resumeUploadChunks).where(eq(resumeUploadChunks.sessionId, sessionId)).orderBy(asc(resumeUploadChunks.chunkIndex));
  return { ...session[0], chunks };
}

export async function appendResumeUploadChunk(ownerId: number, input: { sessionId: string; chunkIndex: number; storageKey: string; byteSize: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const session = await getResumeUploadSession(ownerId, input.sessionId); if (!session) throw new Error("Resume upload session was not found");
  if (session.status !== "active") throw new Error("Resume upload is no longer active");
  if (input.chunkIndex < session.nextChunkIndex) return { nextChunkIndex: session.nextChunkIndex, receivedSize: session.receivedSize, alreadyStored: true };
  if (input.chunkIndex !== session.nextChunkIndex || input.byteSize <= 0 || session.receivedSize + input.byteSize > session.expectedSize) throw new Error("Resume upload chunks arrived out of order");
  await db.transaction(async tx => {
    const result = await tx.update(resumeUploadSessions).set({ receivedSize: session.receivedSize + input.byteSize, nextChunkIndex: session.nextChunkIndex + 1 }).where(and(eq(resumeUploadSessions.id, input.sessionId), eq(resumeUploadSessions.ownerId, ownerId), eq(resumeUploadSessions.status, "active"), eq(resumeUploadSessions.nextChunkIndex, input.chunkIndex)));
    if (!result[0].affectedRows) throw new Error("Resume upload changed; retry this chunk");
    await tx.insert(resumeUploadChunks).values({ sessionId: input.sessionId, chunkIndex: input.chunkIndex, storageKey: input.storageKey, byteSize: input.byteSize });
  });
  return { nextChunkIndex: session.nextChunkIndex + 1, receivedSize: session.receivedSize + input.byteSize, alreadyStored: false };
}

export async function completeResumeUploadSession(ownerId: number, sessionId: string, attachmentId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await db.update(resumeUploadSessions).set({ status: "completed", attachmentId }).where(and(eq(resumeUploadSessions.id, sessionId), eq(resumeUploadSessions.ownerId, ownerId), eq(resumeUploadSessions.status, "active")));
}

export async function exportUserData(userId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const [account, profile, requests, attachments, conversation, opportunities, wallet, transactions, privacy] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt, updatedAt: users.updatedAt }).from(users).where(eq(users.id, userId)).limit(1),
    db.select({ accountType: profiles.accountType, headline: profiles.headline, location: profiles.location, bio: profiles.bio, company: profiles.company, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt, currentTitle: profiles.currentTitle, skills: profiles.skills, experience: profiles.experience, expertise: profiles.expertise, createdAt: profiles.createdAt, updatedAt: profiles.updatedAt }).from(profiles).where(eq(profiles.userId, userId)).limit(1),
    db.select({ id: referralRequests.id, status: referralRequests.status, personalPitch: referralRequests.personalPitch, referrerMessage: referralRequests.referrerMessage, createdAt: referralRequests.createdAt, updatedAt: referralRequests.updatedAt, targetRoleUrl: jobs.targetRoleUrl, companyDomain: jobs.company }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(eq(referralRequests.jobSeekerId, userId)),
    db.select({ id: referralAttachments.id, fileName: referralAttachments.fileName, mimeType: referralAttachments.mimeType, fileSize: referralAttachments.fileSize, createdAt: referralAttachments.createdAt }).from(referralAttachments).where(eq(referralAttachments.ownerId, userId)),
    db.select({ id: messages.id, referralRequestId: messages.referralRequestId, senderId: messages.senderId, recipientId: messages.recipientId, body: messages.body, readAt: messages.readAt, createdAt: messages.createdAt }).from(messages).where(or(eq(messages.senderId, userId), eq(messages.recipientId, userId))),
    db.select({ id: companyOpportunities.id, companyDomain: companyOpportunities.companyDomain, kind: companyOpportunities.kind, roleTitle: companyOpportunities.roleTitle, targetRoleUrl: companyOpportunities.targetRoleUrl, location: companyOpportunities.location, walkInAt: companyOpportunities.walkInAt, walkInEndsAt: companyOpportunities.walkInEndsAt, isActive: companyOpportunities.isActive, createdAt: companyOpportunities.createdAt, updatedAt: companyOpportunities.updatedAt }).from(companyOpportunities).where(eq(companyOpportunities.ownerId, userId)),
    db.select({ role: tokenBalances.role, balance: tokenBalances.balance, monthlyCreditsRemaining: tokenBalances.monthlyCreditsRemaining, monthlyAllowance: tokenBalances.monthlyAllowance, monthlyCycleKey: tokenBalances.monthlyCycleKey, plan: tokenBalances.plan, subscriptionStatus: tokenBalances.subscriptionStatus, subscriptionCurrency: tokenBalances.subscriptionCurrency, subscriptionCurrentTermEnd: tokenBalances.subscriptionCurrentTermEnd, updatedAt: tokenBalances.updatedAt }).from(tokenBalances).where(eq(tokenBalances.userId, userId)),
    db.select({ role: tokenTransactions.role, tokenCount: tokenTransactions.tokenCount, kind: tokenTransactions.kind, createdAt: tokenTransactions.createdAt }).from(tokenTransactions).where(eq(tokenTransactions.userId, userId)),
    db.select({ id: privacyRequests.id, kind: privacyRequests.kind, status: privacyRequests.status, source: privacyRequests.source, resolution: privacyRequests.resolution, createdAt: privacyRequests.createdAt, updatedAt: privacyRequests.updatedAt }).from(privacyRequests).where(eq(privacyRequests.userId, userId)),
  ]);
  return { generatedAt: new Date().toISOString(), format: "skipwait.me-personal-data-export-v1", account: account[0] ?? null, profile: profile[0] ?? null, referralRequests: requests, uploadedDocuments: attachments.map(attachment => ({ ...attachment, downloadPath: `/api/documents/${attachment.id}` })), acceptedConversations: conversation, publishedOpportunities: opportunities, creditWallets: wallet, creditTransactions: transactions, privacyRequests: privacy };
}

export async function listMyPrivacyRequests(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select({ id: privacyRequests.id, kind: privacyRequests.kind, status: privacyRequests.status, resolution: privacyRequests.resolution, createdAt: privacyRequests.createdAt, updatedAt: privacyRequests.updatedAt }).from(privacyRequests).where(eq(privacyRequests.userId, userId)).orderBy(desc(privacyRequests.createdAt));
}

export async function createPrivacyErasureRequest(userId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const existing = await db.select({ id: privacyRequests.id, kind: privacyRequests.kind, status: privacyRequests.status, createdAt: privacyRequests.createdAt }).from(privacyRequests).where(and(eq(privacyRequests.userId, userId), eq(privacyRequests.kind, "erasure"))).orderBy(desc(privacyRequests.createdAt));
  const active = existing.find(request => request.status === "requested" || request.status === "in_review");
  if (active) return { ...active, alreadyRequested: true };
  try {
    const result = await db.insert(privacyRequests).values({ userId, kind: "erasure", status: "requested", activeKey: `erasure:${userId}` });
    return { id: Number(result[0].insertId), kind: "erasure" as const, status: "requested" as const, createdAt: new Date(), alreadyRequested: false };
  } catch {
    const concurrent = await db.select({ id: privacyRequests.id, kind: privacyRequests.kind, status: privacyRequests.status, createdAt: privacyRequests.createdAt }).from(privacyRequests).where(eq(privacyRequests.activeKey, `erasure:${userId}`)).limit(1);
    if (concurrent[0]) return { ...concurrent[0], alreadyRequested: true };
    throw new Error("We could not create your privacy request");
  }
}

export async function listAdminPrivacyRequests(limit: number = 100) {
  const db = await getDb(); if (!db) return [];
  const safeLimit = Math.max(1, Math.min(250, Math.floor(limit)));
  return db.select({ id: privacyRequests.id, kind: privacyRequests.kind, status: privacyRequests.status, source: privacyRequests.source, resolution: privacyRequests.resolution, createdAt: privacyRequests.createdAt, updatedAt: privacyRequests.updatedAt, userId: privacyRequests.userId, requesterName: users.name, requesterEmail: users.email, reviewedByUserId: privacyRequests.reviewedByUserId, reviewedAt: privacyRequests.reviewedAt }).from(privacyRequests).innerJoin(users, eq(privacyRequests.userId, users.id)).orderBy(desc(privacyRequests.createdAt)).limit(safeLimit);
}

export async function reviewPrivacyRequest(adminUserId: number, requestId: number, input: { status: "in_review" | "completed" | "declined"; resolution?: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const existing = await db.select({ id: privacyRequests.id, userId: privacyRequests.userId, kind: privacyRequests.kind }).from(privacyRequests).where(eq(privacyRequests.id, requestId)).limit(1);
  if (!existing[0]) return undefined;
  const resolution = input.resolution?.trim().slice(0, 500) || null;
  const activeKey = input.status === "completed" || input.status === "declined" ? null : `${existing[0].kind}:${existing[0].userId}`;
  await db.update(privacyRequests).set({ status: input.status, activeKey, resolution, reviewedByUserId: adminUserId, reviewedAt: new Date() }).where(eq(privacyRequests.id, requestId));
  return { id: requestId, status: input.status, resolution };
}

export async function getVerifiedWorkEmailAccess(userId: number) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !isVerifiedEmployeeOfCompany(profile, profile.workEmailDomain)) return undefined;
  return { workEmailDomain: profile.workEmailDomain };
}

export type PrivateReferrerImpactSummary = { reviewed: number; approved: number; introductions: number; interviews: number; offers: number };

export async function getPrivateReferrerImpactSummary(userId: number): Promise<PrivateReferrerImpactSummary> {
  const access = await getVerifiedWorkEmailAccess(userId);
  if (!access) throw new Error("Verify your company email to view your private impact");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const rows = await db.select({ status: referralRequests.status }).from(referralRequests).where(eq(referralRequests.referrerId, userId));
  const statusCount = (status: ReferralStatus) => rows.filter(row => row.status === status).length;
  return {
    reviewed: rows.length,
    approved: statusCount("approved") + statusCount("intro_made") + statusCount("interview") + statusCount("offer"),
    introductions: statusCount("intro_made") + statusCount("interview") + statusCount("offer"),
    interviews: statusCount("interview") + statusCount("offer"),
    offers: statusCount("offer"),
  };
}

export type ReferrerFastTrackLink = { linkCode: string; vanityAlias: string; companyDomain: string; isActive: boolean };

const createFastTrackCode = () => randomUUID().replace(/-/g, "");
const createFastTrackAlias = () => `ref-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const reservedFastTrackAliases = new Set(["admin", "api", "auth", "fast", "inbox", "login", "notifications", "refer", "request", "settings", "start"]);

export function companySlugFromDomain(companyDomain: string) {
  const normalized = companyDomain.trim().toLowerCase().replace(/^www\./, "");
  const parts = normalized.split(".").filter(Boolean);
  return (parts.length > 1 ? parts[0] : normalized).replace(/[^a-z0-9-]/g, "").slice(0, 48);
}

export function isSafeFastTrackAlias(alias: string) {
  const normalized = alias.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(normalized) && !reservedFastTrackAliases.has(normalized);
}

export async function getOrCreateReferrerFastTrackLink(userId: number): Promise<ReferrerFastTrackLink> {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !isVerifiedEmployeeOfCompany(profile, profile.workEmailDomain)) throw new Error("Verify your company email before creating a Fast-Track Link");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const companyDomain = profile.workEmailDomain.trim().toLowerCase();
  const existing = await db.select({ linkCode: referrerFastTrackLinks.linkCode, vanityAlias: referrerFastTrackLinks.vanityAlias, companyDomain: referrerFastTrackLinks.companyDomain, isActive: referrerFastTrackLinks.isActive }).from(referrerFastTrackLinks).where(eq(referrerFastTrackLinks.referrerId, userId)).limit(1);
  if (existing[0] && existing[0].companyDomain === companyDomain && existing[0].vanityAlias) return { ...existing[0], vanityAlias: existing[0].vanityAlias };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const linkCode = existing[0]?.companyDomain === companyDomain ? existing[0].linkCode : createFastTrackCode();
    const vanityAlias = createFastTrackAlias();
    try {
      if (existing[0]) await db.update(referrerFastTrackLinks).set({ companyDomain, linkCode, vanityAlias, isActive: true, deactivatedAt: null }).where(eq(referrerFastTrackLinks.referrerId, userId));
      else await db.insert(referrerFastTrackLinks).values({ referrerId: userId, companyDomain, linkCode, vanityAlias, isActive: true });
      return { linkCode, vanityAlias, companyDomain, isActive: true };
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
  throw new Error("We could not create your Fast-Track Link");
}

export async function getPublicReferrerFastTrackLink(linkCode: string): Promise<{ companyDomain: string; isActive: true } | undefined> {
  const normalizedCode = linkCode.trim().slice(0, 64);
  if (!normalizedCode) return undefined;
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select({ companyDomain: referrerFastTrackLinks.companyDomain, isActive: referrerFastTrackLinks.isActive, accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt }).from(referrerFastTrackLinks).innerJoin(profiles, eq(referrerFastTrackLinks.referrerId, profiles.userId)).where(and(eq(referrerFastTrackLinks.linkCode, normalizedCode), eq(referrerFastTrackLinks.isActive, true))).limit(1);
  const link = result[0];
  if (!link || !isVerifiedEmployeeOfCompany(link, link.companyDomain)) return undefined;
  return { companyDomain: link.companyDomain, isActive: true };
}

export async function getPublicReferrerFastTrackVanityLink(companySlug: string, vanityAlias: string): Promise<{ companyDomain: string; isActive: true } | undefined> {
  const normalizedSlug = companySlug.trim().toLowerCase();
  const normalizedAlias = vanityAlias.trim().toLowerCase();
  if (!normalizedSlug || !isSafeFastTrackAlias(normalizedAlias)) return undefined;
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select({ companyDomain: referrerFastTrackLinks.companyDomain, isActive: referrerFastTrackLinks.isActive, accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt }).from(referrerFastTrackLinks).innerJoin(profiles, eq(referrerFastTrackLinks.referrerId, profiles.userId)).where(and(eq(referrerFastTrackLinks.vanityAlias, normalizedAlias), eq(referrerFastTrackLinks.isActive, true))).limit(1);
  const link = result[0];
  if (!link || companySlugFromDomain(link.companyDomain) !== normalizedSlug || !isVerifiedEmployeeOfCompany(link, link.companyDomain)) return undefined;
  return { companyDomain: link.companyDomain, isActive: true };
}

async function getActiveReferrerFastTrackLink(linkCode: string) {
  const normalizedCode = linkCode.trim().slice(0, 64);
  if (!normalizedCode) return undefined;
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const result = await db.select({ referrerId: referrerFastTrackLinks.referrerId, companyDomain: referrerFastTrackLinks.companyDomain, isActive: referrerFastTrackLinks.isActive, accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt }).from(referrerFastTrackLinks).innerJoin(profiles, eq(referrerFastTrackLinks.referrerId, profiles.userId)).where(and(eq(referrerFastTrackLinks.linkCode, normalizedCode), eq(referrerFastTrackLinks.isActive, true))).limit(1);
  const link = result[0];
  if (!link || !isVerifiedEmployeeOfCompany(link, link.companyDomain)) return undefined;
  return { referrerId: link.referrerId, companyDomain: link.companyDomain };
}

async function getActiveReferrerFastTrackVanityLink(companySlug: string, vanityAlias: string) {
  const normalizedSlug = companySlug.trim().toLowerCase();
  const normalizedAlias = vanityAlias.trim().toLowerCase();
  if (!normalizedSlug || !isSafeFastTrackAlias(normalizedAlias)) return undefined;
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const result = await db.select({ referrerId: referrerFastTrackLinks.referrerId, companyDomain: referrerFastTrackLinks.companyDomain, isActive: referrerFastTrackLinks.isActive, accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt }).from(referrerFastTrackLinks).innerJoin(profiles, eq(referrerFastTrackLinks.referrerId, profiles.userId)).where(and(eq(referrerFastTrackLinks.vanityAlias, normalizedAlias), eq(referrerFastTrackLinks.isActive, true))).limit(1);
  const link = result[0];
  if (!link || companySlugFromDomain(link.companyDomain) !== normalizedSlug || !isVerifiedEmployeeOfCompany(link, link.companyDomain)) return undefined;
  return { referrerId: link.referrerId, companyDomain: link.companyDomain };
}

export async function deactivateReferrerFastTrackLink(userId: number): Promise<{ deactivated: boolean }> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const result = await db.update(referrerFastTrackLinks).set({ isActive: false, deactivatedAt: new Date() }).where(and(eq(referrerFastTrackLinks.referrerId, userId), eq(referrerFastTrackLinks.isActive, true)));
  return { deactivated: Number(result[0].affectedRows) === 1 };
}

export type OperationalActivityInput = { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number; companyDomain?: string; metadata?: Record<string, string | number | boolean | null | undefined> };
export async function recordOperationalActivity(input: OperationalActivityInput) {
  const db = await getDb(); if (!db) return;
  const metadata = input.metadata ? JSON.stringify(Object.fromEntries(Object.entries(input.metadata).filter(([, value]) => value !== undefined))) : null;
  await db.insert(operationalActivityLogs).values({ actorUserId: input.actorUserId ?? null, action: input.action.slice(0, 100), outcome: input.outcome, resourceType: input.resourceType?.slice(0, 80) ?? null, resourceId: input.resourceId === undefined ? null : String(input.resourceId).slice(0, 120), companyDomain: input.companyDomain?.toLowerCase().slice(0, 255) ?? null, metadata });
}
export async function listOperationalActivity(input: { limit?: number; action?: string; query?: string; outcome?: "success" | "failure" | "denied" } = {}) {
  const db = await getDb(); if (!db) return [];
  const limit = Math.max(1, Math.min(input.limit ?? 100, 250));
  const term = input.query?.trim();
  const conditions = [input.action?.trim() ? like(operationalActivityLogs.action, `%${input.action.trim()}%`) : undefined, input.outcome ? eq(operationalActivityLogs.outcome, input.outcome) : undefined, term ? or(like(operationalActivityLogs.action, `%${term}%`), like(operationalActivityLogs.resourceId, `%${term}%`), like(operationalActivityLogs.companyDomain, `%${term}%`), like(users.name, `%${term}%`), like(users.email, `%${term}%`)) : undefined].filter(Boolean);
  const where = conditions.length ? and(...conditions) : undefined;
  return db.select({ id: operationalActivityLogs.id, action: operationalActivityLogs.action, outcome: operationalActivityLogs.outcome, resourceType: operationalActivityLogs.resourceType, resourceId: operationalActivityLogs.resourceId, companyDomain: operationalActivityLogs.companyDomain, metadata: operationalActivityLogs.metadata, createdAt: operationalActivityLogs.createdAt, actorUserId: operationalActivityLogs.actorUserId, actorName: users.name, actorEmail: users.email }).from(operationalActivityLogs).leftJoin(users, eq(operationalActivityLogs.actorUserId, users.id)).where(where).orderBy(desc(operationalActivityLogs.createdAt)).limit(limit);
}

export function companyDomainFromTargetUrl(targetRoleUrl: string): string | undefined {
  return directEmployerDomainFromTargetUrl(targetRoleUrl);
}

async function employerPageEvidence(targetRoleUrl: string) {
  try {
    const url = new URL(targetRoleUrl);
    if (!isHostedJobPlatform(url.hostname)) return { candidates: [], officialDomains: [] };
    const candidateSets = await Promise.all(publicEmployerPageUrls(targetRoleUrl).map(async pageUrl => {
      const response = await fetch(pageUrl, { headers: { "User-Agent": "skipwait.me employer routing" }, redirect: "manual", signal: AbortSignal.timeout(4_000) });
      if (!response.ok) return { candidates: [], officialDomains: [] };
      const html = (await response.text()).slice(0, 512_000);
      return { candidates: employerCandidatesFromJobPageHtml(html), officialDomains: officialEmployerDomainsFromJobPageHtml(html) };
    }));
    return {
      candidates: Array.from(new Set(candidateSets.flatMap(result => result.candidates))),
      officialDomains: Array.from(new Set(candidateSets.flatMap(result => result.officialDomains))),
    };
  } catch {
    return { candidates: [], officialDomains: [] };
  }
}

export async function resolveEmployerDomainFromTargetUrl(targetRoleUrl: string) {
  const normalizedTargetRoleUrl = normalizeTargetRoleUrl(targetRoleUrl);
  const directDomain = companyDomainFromTargetUrl(normalizedTargetRoleUrl);
  if (directDomain) return directDomain;
  const protectedHostedDomain = verifiedEmployerDomainFromProtectedHostedListing(normalizedTargetRoleUrl);
  if (protectedHostedDomain) return protectedHostedDomain;
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const verifiedDomains = await db.select({ domain: profiles.workEmailDomain }).from(profiles).where(and(eq(profiles.accountType, "referrer"), isNotNull(profiles.workEmailVerifiedAt)));
  const urlCandidates = hostedEmployerCandidatesFromTargetUrl(normalizedTargetRoleUrl);
  const matchedFromUrl = verifiedEmployerDomainFromCandidates(urlCandidates, verifiedDomains.map(row => row.domain));
  if (matchedFromUrl) return matchedFromUrl;
  const pageEvidence = await employerPageEvidence(normalizedTargetRoleUrl);
  if (pageEvidence.officialDomains.length === 1) return pageEvidence.officialDomains[0];
  return verifiedEmployerDomainFromCandidates(pageEvidence.candidates, verifiedDomains.map(row => row.domain));
}

const consumerEmailDomains = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com"]);
export function isWorkEmailDomain(domain: string): boolean { return Boolean(domain) && !consumerEmailDomains.has(domain.trim().toLowerCase()); }

export function isVerifiedEmployeeOfCompany(profile: { accountType?: string | null; workEmailDomain?: string | null; workEmailVerifiedAt?: Date | null }, companyDomain: string) {
  return profile.accountType === "referrer" && Boolean(profile.workEmailVerifiedAt) && profile.workEmailDomain?.trim().toLowerCase() === companyDomain.trim().toLowerCase();
}

export function companyCoverageStatus(eligibleEmployeeCount: number) {
  return eligibleEmployeeCount > 0 ? "covered" as const : "waiting_for_company_coverage" as const;
}

export function fastTrackLinkMatchesCompany(linkCompanyDomain: string, resolvedCompanyDomain: string) {
  return linkCompanyDomain.trim().toLowerCase() === resolvedCompanyDomain.trim().toLowerCase();
}

export async function createCompanyCoverageInvitation(inviterUserId: number, companyDomain: string) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const inviteCode = randomUUID().replace(/-/g, "");
  await db.insert(companyCoverageInvitations).values({ inviteCode, inviterUserId, companyDomain: companyDomain.trim().toLowerCase() });
  return { inviteCode };
}

export async function saveVerifiedWorkEmail(userId: number, email: string) {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain) throw new Error("A work email address is required");
  if (!isWorkEmailDomain(domain)) throw new Error("Use a verified company email, not a personal email domain");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const previous = await db.select({ workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt }).from(profiles).where(eq(profiles.userId, userId)).limit(1);
  await db.insert(profiles).values({ userId, accountType: "referrer", company: domain, workEmailDomain: domain, workEmailVerifiedAt: new Date(), isOnboarded: true }).onDuplicateKeyUpdate({ set: { accountType: "referrer", company: domain, workEmailDomain: domain, workEmailVerifiedAt: new Date(), isOnboarded: true } });
  const newlyVerifiedForDomain = previous[0]?.workEmailDomain !== domain || !previous[0]?.workEmailVerifiedAt;
  if (newlyVerifiedForDomain) {
    const waitingRequests = await db.select({ requestId: referralRequests.id }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(and(eq(jobs.company, domain), eq(referralRequests.status, "pending"), isNull(referralRequests.referrerId)));
    for (const request of waitingRequests) await db.insert(notifications).values({ userId, category: "referral", title: "A private referral request is waiting", body: `A candidate has asked for help at ${domain}. Review it only if you choose to help.` });
  }
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

export async function createCompanyReferralRequest(userId: number, input: { targetRoleUrl: string; personalPitch: string; attachmentIds: number[]; fastTrackCode?: string; fastTrackCompanySlug?: string; fastTrackAlias?: string }) {
  const companyDomain = await resolveEmployerDomainFromTargetUrl(input.targetRoleUrl);
  if (!companyDomain) throw new Error("We could not safely identify the employer behind this job link. Paste the employer’s careers-page link so we notify only the right employees.");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (input.fastTrackCode && (input.fastTrackCompanySlug || input.fastTrackAlias)) throw new Error("Use one private referral link at a time");
  const fastTrackLink = input.fastTrackCode ? await getActiveReferrerFastTrackLink(input.fastTrackCode) : input.fastTrackCompanySlug && input.fastTrackAlias ? await getActiveReferrerFastTrackVanityLink(input.fastTrackCompanySlug, input.fastTrackAlias) : undefined;
  if ((input.fastTrackCode || input.fastTrackCompanySlug || input.fastTrackAlias) && !fastTrackLink) throw new Error("This private referral link is no longer active");
  if (fastTrackLink && !fastTrackLinkMatchesCompany(fastTrackLink.companyDomain, companyDomain)) throw new Error("Use a job link for the same company as this private referral link");
  const eligibleCandidates = fastTrackLink ? [{ userId: fastTrackLink.referrerId, accountType: "referrer", workEmailDomain: companyDomain, workEmailVerifiedAt: new Date() }] : await db.select({ userId: profiles.userId, accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt }).from(profiles).where(and(eq(profiles.accountType, "referrer"), eq(profiles.workEmailDomain, companyDomain), isNotNull(profiles.workEmailVerifiedAt)));
  const eligible = eligibleCandidates.filter(profile => isVerifiedEmployeeOfCompany(profile, companyDomain));
  const coverageStatus = companyCoverageStatus(eligible.length);
  // A valid, private request always reserves one Job Seeker credit. Requests
  // without current coverage remain queued for manual administrator follow-up.
  const remaining = await spendToken(userId, "job_seeker");
  const jobResult = await db.insert(jobs).values({ title: "Role from shared job link", company: companyDomain, location: "Not specified", description: "Private referral request routed from a Target Role URL.", targetRoleUrl: input.targetRoleUrl, workMode: "Not specified", seniority: "Not specified", employmentType: "Not specified", publishedAt: new Date() });
  const jobId = Number(jobResult[0].insertId);
  const isWaitingForCoverage = coverageStatus === "waiting_for_company_coverage";
  const requestResult = await db.insert(referralRequests).values({ jobId, jobSeekerId: userId, referrerId: fastTrackLink?.referrerId ?? null, personalPitch: input.personalPitch, status: "pending", waitingForCoverage: isWaitingForCoverage, coverageQueuedAt: isWaitingForCoverage ? new Date() : null });
  const requestId = Number(requestResult[0].insertId);
  for (const attachmentId of input.attachmentIds) await db.update(referralAttachments).set({ referralRequestId: requestId }).where(and(eq(referralAttachments.id, attachmentId), eq(referralAttachments.ownerId, userId)));
  for (const employee of eligible) await db.insert(notifications).values({ userId: employee.userId, category: "referral", title: fastTrackLink ? "A Fast-Track referral request is ready" : "A private referral request is available", body: fastTrackLink ? `A Job Seeker used your private link for a role at ${companyDomain}. Review it only if you choose to help.` : `A Job Seeker shared a role at ${companyDomain}. Sign in to review and claim it.` });
  const coverageInvite = !fastTrackLink && coverageStatus === "waiting_for_company_coverage" ? await createCompanyCoverageInvitation(userId, companyDomain) : undefined;
  return { requestId, companyDomain, coverageStatus, coverageInviteCode: coverageInvite?.inviteCode, notifiedEmployees: eligible.length, remainingTokens: remaining.totalAvailable, creditSummary: remaining, fastTrack: Boolean(fastTrackLink) };
}

export async function listCompanyReferralInbox(userId: number) {
  return listCompanyReferralInboxByState(userId, "new");
}

export type CompanyReferralInboxState = "new" | "saved" | "completed";

export async function listCompanyReferralInboxByState(userId: number, state: CompanyReferralInboxState) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !isVerifiedEmployeeOfCompany(profile, profile.workEmailDomain)) return [];
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ id: referralRequests.id, targetRoleUrl: jobs.targetRoleUrl, companyDomain: jobs.company, status: referralRequests.status, referrerId: referralRequests.referrerId, savedAt: referralRequests.savedAt, createdAt: referralRequests.createdAt, updatedAt: referralRequests.updatedAt, attachmentCount: count(referralAttachments.id), queueAllocationId: referralAvailabilitySlots.id }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).leftJoin(referralAvailabilitySlots, and(eq(referralAvailabilitySlots.referralRequestId, referralRequests.id), eq(referralAvailabilitySlots.status, "allocated"))).leftJoin(referralAttachments, eq(referralAttachments.referralRequestId, referralRequests.id)).where(eq(jobs.company, profile.workEmailDomain)).groupBy(referralRequests.id, jobs.targetRoleUrl, jobs.company, referralRequests.status, referralRequests.referrerId, referralRequests.savedAt, referralRequests.createdAt, referralRequests.updatedAt, referralAvailabilitySlots.id).orderBy(desc(referralRequests.updatedAt));
  const scopedRows = rows.filter(row => {
    const isQueueAllocationForYou = row.queueAllocationId !== null && row.referrerId === userId;
    if (state === "new") return row.status === "pending" && (!row.referrerId || row.referrerId === userId || isQueueAllocationForYou);
    if (state === "saved") return row.status === "pending" && ((row.referrerId === userId && !row.queueAllocationId) || (!row.referrerId && Boolean(row.savedAt)));
    return row.referrerId === userId && row.status !== "pending";
  });
  const unreadRows = await db.select({ requestId: messages.referralRequestId, unreadMessageCount: count(messages.id) }).from(messages).where(and(eq(messages.recipientId, userId), isNull(messages.readAt))).groupBy(messages.referralRequestId);
  const unreadByRequestId = new Map(unreadRows.map(row => [row.requestId, Number(row.unreadMessageCount)]));
  return scopedRows.map(row => ({ ...row, inboxState: state, isClaimedByYou: row.referrerId === userId, isQueueOpenAllocation: row.queueAllocationId !== null && row.referrerId === userId, unreadMessageCount: unreadByRequestId.get(row.id) ?? 0 }));
}

export async function getUnclaimedCompanyReferralPreview(userId: number, requestId: number) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !isVerifiedEmployeeOfCompany(profile, profile.workEmailDomain)) return undefined;
  const db = await getDb(); if (!db) return undefined;
  const request = await db.select({ id: referralRequests.id, targetRoleUrl: jobs.targetRoleUrl, companyDomain: jobs.company, candidateName: users.name, candidateMessage: referralRequests.personalPitch }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).innerJoin(users, eq(referralRequests.jobSeekerId, users.id)).where(and(eq(referralRequests.id, requestId), eq(referralRequests.status, "pending"), or(isNull(referralRequests.referrerId), eq(referralRequests.referrerId, userId)), eq(jobs.company, profile.workEmailDomain))).limit(1);
  if (!request[0]) return undefined;
  const attachments = await db.select({ id: referralAttachments.id, fileName: referralAttachments.fileName, fileKey: referralAttachments.fileKey, mimeType: referralAttachments.mimeType, fileSize: referralAttachments.fileSize }).from(referralAttachments).where(eq(referralAttachments.referralRequestId, requestId));
  return { ...request[0], attachments };
}

export async function saveCompanyReferralRequest(userId: number, requestId: number, saved: boolean) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !profile.workEmailVerifiedAt) throw new Error("Verify your work email before saving referrals");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const request = await db.select({ id: referralRequests.id, status: referralRequests.status, referrerId: referralRequests.referrerId, companyDomain: jobs.company }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(eq(referralRequests.id, requestId)).limit(1);
  if (!request[0] || request[0].companyDomain !== profile.workEmailDomain || request[0].status !== "pending" || request[0].referrerId) throw new Error("This private referral request is no longer available to save");
  await db.update(referralRequests).set({ savedAt: saved ? new Date() : null }).where(eq(referralRequests.id, requestId));
  return { requestId, saved };
}

export async function listJobSeekerCompanyReferrals(userId: number) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ id: referralRequests.id, targetRoleUrl: jobs.targetRoleUrl, companyDomain: jobs.company, status: referralRequests.status, referrerId: referralRequests.referrerId, waitingForCoverage: referralRequests.waitingForCoverage, referrerMessage: referralRequests.referrerMessage, createdAt: referralRequests.createdAt, updatedAt: referralRequests.updatedAt, attachmentCount: count(referralAttachments.id) }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).leftJoin(referralAttachments, eq(referralAttachments.referralRequestId, referralRequests.id)).where(eq(referralRequests.jobSeekerId, userId)).groupBy(referralRequests.id, jobs.targetRoleUrl, jobs.company, referralRequests.status, referralRequests.referrerId, referralRequests.waitingForCoverage, referralRequests.referrerMessage, referralRequests.createdAt, referralRequests.updatedAt).orderBy(desc(referralRequests.updatedAt));
  const unreadRows = await db.select({ requestId: messages.referralRequestId, unreadMessageCount: count(messages.id) }).from(messages).where(and(eq(messages.recipientId, userId), isNull(messages.readAt))).groupBy(messages.referralRequestId);
  const unreadByRequestId = new Map(unreadRows.map(row => [row.requestId, Number(row.unreadMessageCount)]));
  return rows.map(row => ({ ...row, queueStatus: row.referrerId && row.status === "pending" ? "available_for_review" as const : row.waitingForCoverage ? "waiting_for_coverage" as const : null, unreadMessageCount: unreadByRequestId.get(row.id) ?? 0 }));
}

export async function openCompanyReferralAvailability(userId: number, input: { slotCount?: number }) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !isVerifiedEmployeeOfCompany(profile, profile.workEmailDomain)) throw new Error("Verify your company email before opening referral capacity");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const slotCount = Math.max(1, Math.min(3, Math.floor(input.slotCount ?? 1)));
  const companyDomain = profile.workEmailDomain;
  return db.transaction(async tx => {
    const allocatedRequestIds: number[] = [];
    let attempts = 0;
    while (allocatedRequestIds.length < slotCount && attempts < slotCount * 4) {
      attempts += 1;
      const candidate = await tx.select({ id: referralRequests.id, jobSeekerId: referralRequests.jobSeekerId }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(and(eq(jobs.company, companyDomain), eq(referralRequests.status, "pending"), isNull(referralRequests.referrerId), eq(referralRequests.waitingForCoverage, true))).orderBy(asc(referralRequests.coverageQueuedAt), asc(referralRequests.id)).limit(1);
      if (!candidate[0]) break;
      const allocation = await tx.update(referralRequests).set({ referrerId: userId, waitingForCoverage: false, coverageQueuedAt: null }).where(and(eq(referralRequests.id, candidate[0].id), isNull(referralRequests.referrerId), eq(referralRequests.waitingForCoverage, true)));
      if (Number(allocation[0].affectedRows) !== 1) continue;
      await tx.insert(referralAvailabilitySlots).values({ referrerId: userId, companyDomain, referralRequestId: candidate[0].id, status: "allocated", activeRequestKey: `request:${candidate[0].id}` });
      await tx.insert(notifications).values({ userId: candidate[0].jobSeekerId, category: "status", title: "A referral review opened", body: `A verified employee at ${companyDomain} can now review your request.` });
      allocatedRequestIds.push(candidate[0].id);
    }
    return { companyDomain, requestedSlotCount: slotCount, allocatedRequestIds, allocatedCount: allocatedRequestIds.length };
  });
}

export async function getReferralFlowHealth() {
  const db = await getDb();
  if (!db) return { funnel: { requestsCreated: 0, requestsClaimed: 0, decisionsRecorded: 0, waitingForCoverage: 0 }, coverageGaps: [], instrumentation: { uploadedDocuments: 0, recordedFailures: 0 } };
  const [requests, verifiedProfiles, activities] = await Promise.all([
    db.select({ companyDomain: jobs.company, status: referralRequests.status, referrerId: referralRequests.referrerId }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)),
    db.select({ workEmailDomain: profiles.workEmailDomain }).from(profiles).where(eq(profiles.accountType, "referrer")),
    db.select({ action: operationalActivityLogs.action, outcome: operationalActivityLogs.outcome }).from(operationalActivityLogs).orderBy(desc(operationalActivityLogs.createdAt)).limit(1000),
  ]);
  const coverageByCompany = new Map<string, number>();
  for (const profile of verifiedProfiles) if (profile.workEmailDomain) coverageByCompany.set(profile.workEmailDomain, (coverageByCompany.get(profile.workEmailDomain) ?? 0) + 1);
  const waitingByCompany = new Map<string, number>();
  for (const request of requests) if (request.status === "pending" && !request.referrerId) waitingByCompany.set(request.companyDomain, (waitingByCompany.get(request.companyDomain) ?? 0) + 1);
  const coverageGaps = Array.from(waitingByCompany.entries()).map(([companyDomain, waitingRequests]) => ({ companyDomain, waitingRequests, verifiedCoverage: coverageByCompany.get(companyDomain) ?? 0 })).filter(item => item.verifiedCoverage === 0).sort((a, b) => b.waitingRequests - a.waitingRequests).slice(0, 12);
  return {
    funnel: {
      requestsCreated: requests.length,
      requestsClaimed: requests.filter(request => Boolean(request.referrerId)).length,
      decisionsRecorded: requests.filter(request => request.status !== "pending").length,
      waitingForCoverage: requests.filter(request => request.status === "pending" && !request.referrerId).length,
    },
    coverageGaps,
    instrumentation: {
      uploadedDocuments: activities.filter(activity => activity.action === "document.uploaded" && activity.outcome === "success").length,
      recordedFailures: activities.filter(activity => activity.outcome === "failure" || activity.outcome === "denied").length,
    },
  };
}

export async function claimCompanyReferralRequest(userId: number, requestId: number) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !profile.workEmailVerifiedAt) throw new Error("Verify your work email before claiming referrals");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const request = await db.select({ jobSeekerId: referralRequests.jobSeekerId, company: jobs.company, referrerId: referralRequests.referrerId }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(and(eq(referralRequests.id, requestId), eq(referralRequests.status, "pending"), or(isNull(referralRequests.referrerId), eq(referralRequests.referrerId, userId)))).limit(1);
  if (!request[0] || !isVerifiedEmployeeOfCompany(profile, request[0].company)) throw new Error("This referral request is no longer available");
  if (request[0].referrerId === userId) return { requestId, claimed: true };
  const update = await db.update(referralRequests).set({ referrerId: userId }).where(and(eq(referralRequests.id, requestId), isNull(referralRequests.referrerId)));
  if (Number(update[0].affectedRows) !== 1) throw new Error("Another verified employee already claimed this request");
  await db.insert(notifications).values({ userId: request[0].jobSeekerId, category: "status", title: "Your referral request was claimed", body: "A verified employee at the target company is reviewing your request." });
  return { requestId, claimed: true };
}

export async function getClaimedCompanyReferralDetail(userId: number, requestId: number) {
  const db = await getDb(); if (!db) return undefined;
  const request = await db.select({ id: referralRequests.id, targetRoleUrl: jobs.targetRoleUrl, companyDomain: jobs.company, candidateName: users.name, referrerId: referralRequests.referrerId }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).innerJoin(users, eq(referralRequests.jobSeekerId, users.id)).where(and(eq(referralRequests.id, requestId), eq(referralRequests.referrerId, userId))).limit(1);
  if (!request[0]) return undefined;
  const attachments = await db.select({ id: referralAttachments.id, fileName: referralAttachments.fileName, fileKey: referralAttachments.fileKey, mimeType: referralAttachments.mimeType, fileSize: referralAttachments.fileSize }).from(referralAttachments).where(eq(referralAttachments.referralRequestId, requestId));
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

export async function getOwnedResumeAttachmentForPitch(userId: number, attachmentId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const result = await db.select({ id: referralAttachments.id, fileName: referralAttachments.fileName, fileKey: referralAttachments.fileKey, mimeType: referralAttachments.mimeType, fileSize: referralAttachments.fileSize }).from(referralAttachments).where(and(eq(referralAttachments.id, attachmentId), eq(referralAttachments.ownerId, userId))).limit(1);
  if (!result[0]) throw new Error("Your private resume is unavailable");
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

export function authorizeApprovedReferralConversation(userId: number, request: { jobSeekerId: number; referrerId: number | null; status: string } | undefined) {
  if (!request || (request.jobSeekerId !== userId && request.referrerId !== userId)) throw new Error("This conversation is not available to you");
  if (!isPostApprovalReferralStatus(request.status) || !request.referrerId) throw new Error("Conversation is only available after the referral is accepted");
  return { jobSeekerId: request.jobSeekerId, referrerId: request.referrerId, recipientId: userId === request.jobSeekerId ? request.referrerId : request.jobSeekerId };
}

export async function updateReferralProgress(userId: number, input: { requestId: number; status: ReferralProgressUpdateStatus }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const request = await db.select({ jobSeekerId: referralRequests.jobSeekerId, referrerId: referralRequests.referrerId, status: referralRequests.status }).from(referralRequests).where(eq(referralRequests.id, input.requestId)).limit(1);
  const existing = request[0];
  const { recipientId } = authorizeApprovedReferralConversation(userId, existing);
  if (existing.status === "closed") throw new Error("This referral request is already closed");
  const currentIndex = referralProgressUpdateStatuses.indexOf(existing.status as ReferralProgressUpdateStatus);
  const nextIndex = referralProgressUpdateStatuses.indexOf(input.status);
  const canClose = input.status === "closed";
  if (!canClose && (nextIndex < 0 || nextIndex <= currentIndex)) throw new Error("Choose a later real progress milestone");
  await db.update(referralRequests).set({ status: input.status }).where(eq(referralRequests.id, input.requestId));
  await db.insert(notifications).values({ userId: recipientId, category: "status", title: `Referral progress: ${referralStatusLabels[input.status]}`, body: "Your private referral partner recorded a factual progress update." });
  return { status: input.status, changed: true };
}

async function getApprovedReferralConversationParticipants(userId: number, requestId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const request = await db.select({ jobSeekerId: referralRequests.jobSeekerId, referrerId: referralRequests.referrerId, status: referralRequests.status }).from(referralRequests).where(eq(referralRequests.id, requestId)).limit(1);
  return { db, ...authorizeApprovedReferralConversation(userId, request[0]) };
}

export async function getApprovedReferralProgressStatus(userId: number, requestId: number): Promise<{ status: ReferralStatus }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const request = await db.select({ jobSeekerId: referralRequests.jobSeekerId, referrerId: referralRequests.referrerId, status: referralRequests.status }).from(referralRequests).where(eq(referralRequests.id, requestId)).limit(1);
  authorizeApprovedReferralConversation(userId, request[0]);
  return { status: request[0].status as ReferralStatus };
}

export type PrivateReferralShareCard = { shareToken: string; companyDomain: string; status: ReferralStatus; isActive: boolean };

async function getAuthorizedReferralShareCardRequest(userId: number, requestId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const rows = await db.select({ id: referralRequests.id, jobSeekerId: referralRequests.jobSeekerId, referrerId: referralRequests.referrerId, status: referralRequests.status, companyDomain: jobs.company }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(eq(referralRequests.id, requestId)).limit(1);
  const request = rows[0]; authorizeApprovedReferralConversation(userId, request);
  return { db, request };
}

export async function getOrCreateReferralShareCard(userId: number, requestId: number): Promise<PrivateReferralShareCard> {
  const { db, request } = await getAuthorizedReferralShareCardRequest(userId, requestId);
  const shareToken = randomUUID().replace(/-/g, "");
  await db.insert(referralShareCards).values({ referralRequestId: request.id, createdByUserId: userId, shareToken, isActive: true }).onDuplicateKeyUpdate({ set: { shareToken, isActive: true, revokedAt: null } });
  const card = await db.select({ shareToken: referralShareCards.shareToken, isActive: referralShareCards.isActive }).from(referralShareCards).where(and(eq(referralShareCards.referralRequestId, request.id), eq(referralShareCards.createdByUserId, userId))).limit(1);
  return { shareToken: card[0].shareToken, isActive: card[0].isActive, companyDomain: request.companyDomain, status: request.status as ReferralStatus };
}

export async function revokeReferralShareCard(userId: number, requestId: number) {
  const { db } = await getAuthorizedReferralShareCardRequest(userId, requestId);
  const result = await db.update(referralShareCards).set({ isActive: false, revokedAt: new Date() }).where(and(eq(referralShareCards.referralRequestId, requestId), eq(referralShareCards.createdByUserId, userId), eq(referralShareCards.isActive, true)));
  return { revoked: Number(result[0].affectedRows) > 0 };
}

export async function getPublicReferralShareCard(shareToken: string): Promise<{ companyDomain: string; status: ReferralStatus } | undefined> {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select({ companyDomain: jobs.company, status: referralRequests.status }).from(referralShareCards).innerJoin(referralRequests, eq(referralShareCards.referralRequestId, referralRequests.id)).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(and(eq(referralShareCards.shareToken, shareToken), eq(referralShareCards.isActive, true))).limit(1);
  const card = result[0];
  return card && isPostApprovalReferralStatus(card.status) ? { companyDomain: card.companyDomain, status: card.status as ReferralStatus } : undefined;
}

export type ReferralConversationMessage = { id: number; body: string; createdAt: Date; isMine: boolean };

export async function listReferralConversation(userId: number, requestId: number): Promise<ReferralConversationMessage[]> {
  const { db, jobSeekerId, referrerId } = await getApprovedReferralConversationParticipants(userId, requestId);
  await db.update(messages).set({ readAt: new Date() }).where(and(eq(messages.referralRequestId, requestId), eq(messages.recipientId, userId), isNull(messages.readAt)));
  const rows = await db.select({ id: messages.id, body: messages.body, createdAt: messages.createdAt, senderId: messages.senderId }).from(messages).where(and(eq(messages.referralRequestId, requestId), or(and(eq(messages.senderId, jobSeekerId), eq(messages.recipientId, referrerId)), and(eq(messages.senderId, referrerId), eq(messages.recipientId, jobSeekerId))))).orderBy(asc(messages.createdAt), asc(messages.id));
  return rows.map(row => ({ id: row.id, body: row.body, createdAt: row.createdAt, isMine: row.senderId === userId }));
}

export async function sendReferralConversationMessage(userId: number, requestId: number, body: string) {
  const trimmedBody = body.trim();
  if (!trimmedBody) throw new Error("Write a message before sending");
  const { db, recipientId } = await getApprovedReferralConversationParticipants(userId, requestId);
  const result = await db.insert(messages).values({ senderId: userId, recipientId, body: trimmedBody.slice(0, 3000), referralRequestId: requestId });
  await db.insert(notifications).values({ userId: recipientId, category: "message", title: "New private referral message", body: "You have a new message in an accepted referral request." });
  return { id: Number(result[0].insertId) };
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


export type WalletRole = "job_seeker" | "referrer";
export type CreditSummary = {
  plan: SubscriptionPlan;
  monthlyAllowance: number;
  monthlyCreditsRemaining: number;
  purchasedCreditsRemaining: number;
  totalAvailable: number;
  cycleKey: string;
  subscriptionStatus: string | null;
  subscriptionCurrentTermEnd: Date | null;
};
export const MAX_ADMIN_TOKEN_ADJUSTMENT = 1000;
export const COMPANY_COVERAGE_REWARD_TOKENS = 1;
export const PERSONAL_REFERRAL_REWARD_TOKENS = 1;

async function addCoverageRewardCredit(tx: any, userId: number, role: WalletRole) {
  const wallet = await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, role))).limit(1);
  if (wallet[0]) await tx.update(tokenBalances).set({ balance: wallet[0].balance + COMPANY_COVERAGE_REWARD_TOKENS }).where(eq(tokenBalances.id, wallet[0].id));
  else await tx.insert(tokenBalances).values({ userId, role, balance: COMPANY_COVERAGE_REWARD_TOKENS, monthlyCreditsRemaining: FREE_MONTHLY_ALLOWANCE, monthlyAllowance: FREE_MONTHLY_ALLOWANCE, monthlyCycleKey: currentMonthlyCycleKey() });
}

export async function fulfillCompanyCoverageInvitation(joinerUserId: number, input: { inviteCode: string; workEmailDomain: string }) {
  const inviteCode = input.inviteCode.trim(); const workEmailDomain = input.workEmailDomain.trim().toLowerCase();
  if (!inviteCode || !workEmailDomain) return { rewarded: false as const, reason: "missing" as const };
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const invitation = (await tx.select().from(companyCoverageInvitations).where(eq(companyCoverageInvitations.inviteCode, inviteCode)).limit(1))[0];
    if (!invitation || invitation.status !== "active") return { rewarded: false as const, reason: "unavailable" as const };
    if (invitation.inviterUserId === joinerUserId || invitation.companyDomain !== workEmailDomain) {
      await tx.update(companyCoverageInvitations).set({ status: "ineligible" }).where(eq(companyCoverageInvitations.id, invitation.id));
      return { rewarded: false as const, reason: "ineligible" as const };
    }
    const priorForInviter = await tx.select({ id: companyCoverageRewards.id }).from(companyCoverageRewards).where(eq(companyCoverageRewards.inviterUserId, invitation.inviterUserId)).limit(1);
    const priorForJoiner = await tx.select({ id: companyCoverageRewards.id }).from(companyCoverageRewards).where(eq(companyCoverageRewards.joinerUserId, joinerUserId)).limit(1);
    if (priorForInviter[0] || priorForJoiner[0]) {
      await tx.update(companyCoverageInvitations).set({ status: "ineligible", joinerUserId }).where(eq(companyCoverageInvitations.id, invitation.id));
      return { rewarded: false as const, reason: "reward_limit" as const };
    }
    await tx.insert(companyCoverageRewards).values({ invitationId: invitation.id, inviterUserId: invitation.inviterUserId, joinerUserId, tokenCount: COMPANY_COVERAGE_REWARD_TOKENS });
    await addCoverageRewardCredit(tx, invitation.inviterUserId, "job_seeker");
    await addCoverageRewardCredit(tx, joinerUserId, "referrer");
    await tx.insert(tokenTransactions).values([{ userId: invitation.inviterUserId, role: "job_seeker", tokenCount: COMPANY_COVERAGE_REWARD_TOKENS, kind: "company_coverage_reward" }, { userId: joinerUserId, role: "referrer", tokenCount: COMPANY_COVERAGE_REWARD_TOKENS, kind: "company_coverage_reward" }]);
    await tx.insert(notifications).values([{ userId: invitation.inviterUserId, category: "system", title: "Company coverage reward added", body: "A matching employee verified their work email. One referral credit was added to your account." }, { userId: joinerUserId, category: "system", title: "Welcome credit added", body: "You joined private company coverage with a verified work email. One referral credit was added." }]);
    await tx.update(companyCoverageInvitations).set({ status: "completed", joinerUserId, completedAt: new Date() }).where(eq(companyCoverageInvitations.id, invitation.id));
    return { rewarded: true as const, tokenCount: COMPANY_COVERAGE_REWARD_TOKENS };
  });
}

async function addPersonalReferralRewardCredit(tx: any, userId: number) {
  const wallet = await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, "job_seeker"))).limit(1);
  if (wallet[0]) await tx.update(tokenBalances).set({ balance: wallet[0].balance + PERSONAL_REFERRAL_REWARD_TOKENS }).where(eq(tokenBalances.id, wallet[0].id));
  else await tx.insert(tokenBalances).values({ userId, role: "job_seeker", balance: PERSONAL_REFERRAL_REWARD_TOKENS, monthlyCreditsRemaining: FREE_MONTHLY_ALLOWANCE, monthlyAllowance: FREE_MONTHLY_ALLOWANCE, monthlyCycleKey: currentMonthlyCycleKey() });
}

export async function getOrCreatePersonalReferralInvite(userId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const existing = (await db.select().from(personalReferralInvites).where(eq(personalReferralInvites.inviterUserId, userId)).limit(1))[0];
  if (existing) return { inviteCode: existing.inviteCode };
  const inviteCode = `r${userId}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  try {
    await db.insert(personalReferralInvites).values({ inviterUserId: userId, inviteCode });
    return { inviteCode };
  } catch (error) {
    const concurrent = (await db.select().from(personalReferralInvites).where(eq(personalReferralInvites.inviterUserId, userId)).limit(1))[0];
    if (concurrent) return { inviteCode: concurrent.inviteCode };
    throw error;
  }
}

export function personalReferralInviteEligibility(input: { inviterUserId: number; joinerUserId: number; invitationCreatedAt: Date; joinerCreatedAt: Date; storedEmail: string | null; verifiedEmail: string }) {
  if (input.inviterUserId === input.joinerUserId) return "self_invite" as const;
  if (!input.storedEmail || input.storedEmail.trim().toLowerCase() !== input.verifiedEmail || input.joinerCreatedAt <= input.invitationCreatedAt) return "ineligible" as const;
  return "eligible" as const;
}

export async function claimPersonalReferralInvite(joinerUserId: number, input: { inviteCode: string; verifiedEmail: string }) {
  const inviteCode = input.inviteCode.trim();
  const verifiedEmail = input.verifiedEmail.trim().toLowerCase();
  if (!inviteCode || !verifiedEmail) return { rewarded: false as const, reason: "missing" as const };
  const joinerEmailHash = createHash("sha256").update(verifiedEmail).digest("hex");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  try {
    return await db.transaction(async tx => {
      const invitation = (await tx.select().from(personalReferralInvites).where(eq(personalReferralInvites.inviteCode, inviteCode)).limit(1))[0];
      if (!invitation) return { rewarded: false as const, reason: "unavailable" as const };
      const joiner = (await tx.select({ email: users.email, createdAt: users.createdAt }).from(users).where(eq(users.id, joinerUserId)).limit(1))[0];
      const eligibility = personalReferralInviteEligibility({ inviterUserId: invitation.inviterUserId, joinerUserId, invitationCreatedAt: invitation.createdAt, joinerCreatedAt: joiner?.createdAt ?? new Date(0), storedEmail: joiner?.email ?? null, verifiedEmail });
      if (eligibility !== "eligible") return { rewarded: false as const, reason: eligibility };
      const [priorForJoiner, priorForEmail] = await Promise.all([
        tx.select({ id: personalReferralRewards.id }).from(personalReferralRewards).where(eq(personalReferralRewards.joinerUserId, joinerUserId)).limit(1),
        tx.select({ id: personalReferralRewards.id }).from(personalReferralRewards).where(eq(personalReferralRewards.joinerEmailHash, joinerEmailHash)).limit(1),
      ]);
      if (priorForJoiner[0] || priorForEmail[0]) return { rewarded: false as const, reason: "duplicate_account" as const };
      await tx.insert(personalReferralRewards).values({ invitationId: invitation.id, inviterUserId: invitation.inviterUserId, joinerUserId, joinerEmailHash, tokenCount: PERSONAL_REFERRAL_REWARD_TOKENS });
      await addPersonalReferralRewardCredit(tx, invitation.inviterUserId);
      await addPersonalReferralRewardCredit(tx, joinerUserId);
      await tx.insert(tokenTransactions).values([
        { userId: invitation.inviterUserId, role: "job_seeker", tokenCount: PERSONAL_REFERRAL_REWARD_TOKENS, kind: "personal_referral_reward" },
        { userId: joinerUserId, role: "job_seeker", tokenCount: PERSONAL_REFERRAL_REWARD_TOKENS, kind: "personal_referral_reward" },
      ]);
      await tx.insert(notifications).values([
        { userId: invitation.inviterUserId, category: "system", title: "Invite reward added", body: "A friend joined with your link. One extra referral credit was added." },
        { userId: joinerUserId, category: "system", title: "Welcome credit added", body: "You joined with an invite. One extra referral credit was added alongside your monthly credits." },
      ]);
      return { rewarded: true as const, tokenCount: PERSONAL_REFERRAL_REWARD_TOKENS };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") return { rewarded: false as const, reason: "duplicate_account" as const };
    throw error;
  }
}

function creditSummaryFromWallet(wallet: typeof tokenBalances.$inferSelect): CreditSummary {
  return {
    plan: wallet.plan,
    monthlyAllowance: wallet.monthlyAllowance,
    monthlyCreditsRemaining: wallet.monthlyCreditsRemaining,
    purchasedCreditsRemaining: wallet.balance,
    totalAvailable: wallet.monthlyCreditsRemaining + wallet.balance,
    cycleKey: wallet.monthlyCycleKey,
    subscriptionStatus: wallet.subscriptionStatus ?? null,
    subscriptionCurrentTermEnd: wallet.subscriptionCurrentTermEnd ?? null,
  };
}

function normalizedWalletState(wallet: typeof tokenBalances.$inferSelect, now: Date = new Date()) {
  const cycleKey = currentMonthlyCycleKey(now);
  const subscriptionActive = wallet.plan !== "free" && (wallet.subscriptionStatus === "active" || wallet.subscriptionStatus === "non_renewing") && Boolean(wallet.subscriptionCurrentTermEnd && wallet.subscriptionCurrentTermEnd > now);
  if (subscriptionActive) return { changed: false, patch: {} };
  if (wallet.plan !== "free") return {
    changed: true,
    patch: {
      plan: "free" as const,
      monthlyAllowance: FREE_MONTHLY_ALLOWANCE,
      monthlyCreditsRemaining: wallet.monthlyCycleKey === cycleKey ? wallet.monthlyCreditsRemaining : FREE_MONTHLY_ALLOWANCE,
      monthlyCycleKey: cycleKey,
      subscriptionStatus: "cancelled",
    },
  };
  if (wallet.monthlyCycleKey !== cycleKey) return {
    changed: true,
    patch: {
      monthlyAllowance: FREE_MONTHLY_ALLOWANCE,
      monthlyCreditsRemaining: FREE_MONTHLY_ALLOWANCE,
      monthlyCycleKey: cycleKey,
    },
  };
  return { changed: false, patch: {} };
}

export async function findUsersForTokenRecovery(query: string) {
  const db = await getDb(); if (!db) return [];
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  return db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(or(like(users.email, `%${normalized}%`), like(users.name, `%${normalized}%`))).orderBy(desc(users.lastSignedIn)).limit(15);
}

export async function listAdminTokenAdjustments(limit = 20) {
  const db = await getDb(); if (!db) return [];
  return db.select({ id: adminTokenAdjustments.id, recipientUserId: adminTokenAdjustments.recipientUserId, recipientName: users.name, recipientEmail: users.email, adminUserId: adminTokenAdjustments.adminUserId, role: adminTokenAdjustments.role, tokenCount: adminTokenAdjustments.tokenCount, caseReference: adminTokenAdjustments.caseReference, reason: adminTokenAdjustments.reason, createdAt: adminTokenAdjustments.createdAt }).from(adminTokenAdjustments).innerJoin(users, eq(adminTokenAdjustments.recipientUserId, users.id)).orderBy(desc(adminTokenAdjustments.createdAt)).limit(Math.max(1, Math.min(limit, 50)));
}

export async function grantAdminTokenAdjustment(adminUserId: number, input: { recipientUserId: number; role: WalletRole; tokenCount: number; caseReference: string; reason: string }) {
  if (!Number.isInteger(input.recipientUserId) || input.recipientUserId <= 0) throw new Error("Choose a valid user account");
  if (!Number.isInteger(input.tokenCount) || input.tokenCount < 1 || input.tokenCount > MAX_ADMIN_TOKEN_ADJUSTMENT) throw new Error(`Grant between 1 and ${MAX_ADMIN_TOKEN_ADJUSTMENT} tokens`);
  const caseReference = input.caseReference.trim(); const reason = input.reason.trim();
  if (caseReference.length < 4 || caseReference.length > 120) throw new Error("Add a support or payment reference of 4 to 120 characters");
  if (reason.length < 8 || reason.length > 500) throw new Error("Add a clear recovery reason of 8 to 500 characters");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const recipient = await tx.select({ id: users.id }).from(users).where(eq(users.id, input.recipientUserId)).limit(1);
    if (!recipient[0]) throw new Error("That user account no longer exists");
    const duplicate = await tx.select({ id: adminTokenAdjustments.id }).from(adminTokenAdjustments).where(and(eq(adminTokenAdjustments.recipientUserId, input.recipientUserId), eq(adminTokenAdjustments.role, input.role), eq(adminTokenAdjustments.caseReference, caseReference))).limit(1);
    if (duplicate[0]) throw new Error("A recovery grant already exists for this user, role, and support reference");
    const wallet = await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, input.recipientUserId), eq(tokenBalances.role, input.role))).limit(1);
    const newBalance = (wallet[0]?.balance ?? 0) + input.tokenCount;
    if (wallet[0]) await tx.update(tokenBalances).set({ balance: newBalance }).where(eq(tokenBalances.id, wallet[0].id));
    else await tx.insert(tokenBalances).values({ userId: input.recipientUserId, role: input.role, balance: newBalance, monthlyCreditsRemaining: FREE_MONTHLY_ALLOWANCE, monthlyAllowance: FREE_MONTHLY_ALLOWANCE, monthlyCycleKey: currentMonthlyCycleKey() });
    const adjustment = await tx.insert(adminTokenAdjustments).values({ recipientUserId: input.recipientUserId, adminUserId, role: input.role, tokenCount: input.tokenCount, caseReference, reason });
    await tx.insert(tokenTransactions).values({ userId: input.recipientUserId, role: input.role, tokenCount: input.tokenCount, kind: "admin_adjustment" });
    await tx.insert(notifications).values({ userId: input.recipientUserId, category: "system", title: "Token credit added", body: `${input.tokenCount} referral token${input.tokenCount === 1 ? " was" : "s were"} added after a support review.` });
    return { adjustmentId: Number(adjustment[0].insertId), recipientUserId: input.recipientUserId, role: input.role, tokenCount: input.tokenCount, newBalance };
  });
}

export async function ensureTokenWallet(userId: number, role: WalletRole) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, role))).limit(1);
  if (existing[0]) {
    const normalized = normalizedWalletState(existing[0]);
    if (normalized.changed) {
      await db.update(tokenBalances).set(normalized.patch).where(eq(tokenBalances.id, existing[0].id));
      return { ...existing[0], ...normalized.patch };
    }
    return existing[0];
  }
  await db.insert(tokenBalances).values({ userId, role, balance: 0, monthlyCreditsRemaining: FREE_MONTHLY_ALLOWANCE, monthlyAllowance: FREE_MONTHLY_ALLOWANCE, monthlyCycleKey: currentMonthlyCycleKey() });
  return (await db.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, role))).limit(1))[0];
}

export async function getTokenWallet(userId: number, role: WalletRole) {
  return creditSummaryFromWallet(await ensureTokenWallet(userId, role));
}

export async function getUserSubscription(userId: number, role: WalletRole) {
  const wallet = await ensureTokenWallet(userId, role);
  if (!wallet.subscriptionId || wallet.plan === "free" || (wallet.subscriptionStatus !== "active" && wallet.subscriptionStatus !== "non_renewing")) return undefined;
  return { subscriptionId: wallet.subscriptionId, status: wallet.subscriptionStatus, currentTermEnd: wallet.subscriptionCurrentTermEnd ?? undefined };
}

export async function markSubscriptionNonRenewing(userId: number, role: WalletRole, subscriptionId: string, currentTermEnd?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.update(tokenBalances).set({ subscriptionStatus: "non_renewing", subscriptionCurrentTermEnd: currentTermEnd ?? null }).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, role), eq(tokenBalances.subscriptionId, subscriptionId)));
  if (!result[0]?.affectedRows) throw new Error("Subscription ownership could not be confirmed");
  return { subscriptionId, status: "non_renewing" as const, currentTermEnd };
}

export async function spendToken(userId: number, role: WalletRole) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await ensureTokenWallet(userId, role);
  return db.transaction(async tx => {
    const current = await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, role))).limit(1);
    if (!current[0]) throw new Error("No referral credit available");
    const normalized = normalizedWalletState(current[0]);
    const effective = { ...current[0], ...normalized.patch };
    if (effective.monthlyCreditsRemaining + effective.balance < 1) throw new Error("You have used this month’s included credits. Add a credit pack or choose Pro or Max to send another referral.");
    const usesMonthlyCredit = effective.monthlyCreditsRemaining > 0;
    const nextMonthlyCredits = usesMonthlyCredit ? effective.monthlyCreditsRemaining - 1 : effective.monthlyCreditsRemaining;
    const nextBalance = usesMonthlyCredit ? effective.balance : effective.balance - 1;
    const patch = { ...normalized.patch, monthlyCreditsRemaining: nextMonthlyCredits, balance: nextBalance };
    await tx.update(tokenBalances).set(patch).where(eq(tokenBalances.id, current[0].id));
    await tx.insert(tokenTransactions).values({ userId, role, tokenCount: -1, kind: "direct_request" });
    return creditSummaryFromWallet({ ...effective, ...patch });
  });
}

export async function createChargebeePaymentIntent(input: { hostedPageId: string; checkoutIntentId: string; userId: number; role: WalletRole; tokenCount: number; amount: number; currency: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(paymentFulfillments).values({ provider: "chargebee", providerEventId: `pending:${input.hostedPageId}`, providerHostedPageId: input.hostedPageId, checkoutIntentId: input.checkoutIntentId, userId: input.userId, role: input.role, tokenCount: input.tokenCount, amount: input.amount, currency: input.currency });
  return { id: Number(result[0].insertId), hostedPageId: input.hostedPageId };
}

export async function listPendingChargebeePaymentIntents(limit = 25) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select({ hostedPageId: paymentFulfillments.providerHostedPageId }).from(paymentFulfillments).where(and(eq(paymentFulfillments.provider, "chargebee"), eq(paymentFulfillments.status, "pending"), like(paymentFulfillments.providerEventId, "pending:%"))).orderBy(desc(paymentFulfillments.createdAt)).limit(Math.max(1, Math.min(limit, 25)));
}

export async function getChargebeePaymentRecovery(userId: number, role: WalletRole, hostedPageId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const record = await db.select({ id: paymentFulfillments.id, status: paymentFulfillments.status, hostedPageId: paymentFulfillments.providerHostedPageId, checkoutIntentId: paymentFulfillments.checkoutIntentId, tokenCount: paymentFulfillments.tokenCount, amount: paymentFulfillments.amount, currency: paymentFulfillments.currency, reconciliationReason: paymentFulfillments.reconciliationReason }).from(paymentFulfillments).where(and(eq(paymentFulfillments.provider, "chargebee"), eq(paymentFulfillments.userId, userId), eq(paymentFulfillments.role, role), eq(paymentFulfillments.providerHostedPageId, hostedPageId))).limit(1);
  return record[0];
}

export async function markChargebeePaymentForReview(paymentId: number, reason: "provider_page_mismatch" | "provider_page_incomplete" | "reconciliation_rejected") {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(paymentFulfillments).set({ status: "requires_review", reconciliationReason: reason, lastCheckedAt: new Date() }).where(and(eq(paymentFulfillments.id, paymentId), eq(paymentFulfillments.status, "pending")));
}

export async function fulfillChargebeePayment(input: { eventId: string; hostedPageId?: string; invoiceId?: string; passThruContent?: string; amount: number; currency: string }) {
  if (!input.hostedPageId) return { status: "ignored" as const, reason: "missing_hosted_page" };
  if (!input.passThruContent) return { status: "ignored" as const, reason: "missing_checkout_intent" };
  const checkoutIntentId = input.passThruContent;
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const duplicate = await tx.select().from(paymentFulfillments).where(and(eq(paymentFulfillments.provider, "chargebee"), eq(paymentFulfillments.providerEventId, input.eventId))).limit(1);
    if (duplicate[0]) return { status: "duplicate" as const, tokenCount: duplicate[0].tokenCount };
    const intent = await tx.select().from(paymentFulfillments).where(and(eq(paymentFulfillments.provider, "chargebee"), eq(paymentFulfillments.providerEventId, `pending:${input.hostedPageId}`), eq(paymentFulfillments.checkoutIntentId, checkoutIntentId))).limit(1);
    if (!intent[0]) return { status: "ignored" as const, reason: "unknown_checkout" };
    if (intent[0].amount !== input.amount || intent[0].currency !== input.currency) return { status: "ignored" as const, reason: "checkout_amount_mismatch" };
    const creditedAt = new Date();
    const claimed = await tx.update(paymentFulfillments).set({ providerEventId: input.eventId, providerInvoiceId: input.invoiceId ?? null, status: "credited", reconciliationReason: null, lastCheckedAt: creditedAt, creditedAt }).where(and(eq(paymentFulfillments.id, intent[0].id), eq(paymentFulfillments.status, "pending"), eq(paymentFulfillments.providerEventId, `pending:${input.hostedPageId}`)));
    if (Number(claimed[0]?.affectedRows ?? 0) !== 1) {
      const current = await tx.select({ status: paymentFulfillments.status, tokenCount: paymentFulfillments.tokenCount }).from(paymentFulfillments).where(eq(paymentFulfillments.id, intent[0].id)).limit(1);
      if (current[0]?.status === "credited") return { status: "duplicate" as const, tokenCount: current[0].tokenCount };
      return { status: "ignored" as const, reason: "payment_already_reconciled" };
    }
    const wallet = await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, intent[0].userId), eq(tokenBalances.role, intent[0].role))).limit(1);
    if (wallet[0]) await tx.update(tokenBalances).set({ balance: sql`${tokenBalances.balance} + ${intent[0].tokenCount}` }).where(eq(tokenBalances.id, wallet[0].id));
    else await tx.insert(tokenBalances).values({ userId: intent[0].userId, role: intent[0].role, balance: intent[0].tokenCount, monthlyCreditsRemaining: FREE_MONTHLY_ALLOWANCE, monthlyAllowance: FREE_MONTHLY_ALLOWANCE, monthlyCycleKey: currentMonthlyCycleKey() });
    await tx.insert(tokenTransactions).values({ userId: intent[0].userId, role: intent[0].role, tokenCount: intent[0].tokenCount, kind: "purchase" });
    return { status: "credited" as const, tokenCount: intent[0].tokenCount, userId: intent[0].userId, role: intent[0].role };
  });
}

export async function createChargebeeSubscriptionIntent(input: { hostedPageId: string; checkoutIntentId: string; userId: number; role: WalletRole; plan: PaidSubscriptionPlan; itemPriceId: string; amount: number; currency: "INR" | "USD" }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(subscriptionCheckoutIntents).values({ ...input, status: "pending" });
  return { id: Number(result[0].insertId), hostedPageId: input.hostedPageId };
}

export async function applyChargebeeSubscriptionEvent(input: { eventId: string; eventType: string; hostedPageId?: string; passThruContent?: string; subscriptionId: string; plan?: PaidSubscriptionPlan; status: string; currency?: "INR" | "USD"; currentTermStart?: Date; currentTermEnd?: Date; resourceVersion?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const duplicate = await tx.select().from(subscriptionEvents).where(and(eq(subscriptionEvents.provider, "chargebee"), eq(subscriptionEvents.providerEventId, input.eventId))).limit(1);
    if (duplicate[0]) return { status: "duplicate" as const };

    const intent = input.hostedPageId && input.passThruContent
      ? (await tx.select().from(subscriptionCheckoutIntents).where(and(eq(subscriptionCheckoutIntents.hostedPageId, input.hostedPageId), eq(subscriptionCheckoutIntents.checkoutIntentId, input.passThruContent))).limit(1))[0]
      : undefined;
    const walletBySubscription = await tx.select().from(tokenBalances).where(eq(tokenBalances.subscriptionId, input.subscriptionId)).limit(1);
    const wallet = walletBySubscription[0];
    const expectedPlan = intent?.plan ?? input.plan ?? (wallet?.plan !== "free" ? wallet?.plan : undefined);
    if (!wallet && !intent) {
      await tx.insert(subscriptionEvents).values({ provider: "chargebee", providerEventId: input.eventId, subscriptionId: input.subscriptionId, resourceVersion: input.resourceVersion, eventType: input.eventType });
      return { status: "ignored" as const, reason: "unknown_subscription" };
    }
    if (intent && input.plan && input.plan !== intent.plan) {
      await tx.insert(subscriptionEvents).values({ provider: "chargebee", providerEventId: input.eventId, subscriptionId: input.subscriptionId, resourceVersion: input.resourceVersion, eventType: input.eventType });
      return { status: "ignored" as const, reason: "plan_mismatch" };
    }
    if (!expectedPlan || !isPaidSubscriptionPlan(expectedPlan)) {
      await tx.insert(subscriptionEvents).values({ provider: "chargebee", providerEventId: input.eventId, subscriptionId: input.subscriptionId, resourceVersion: input.resourceVersion, eventType: input.eventType });
      return { status: "ignored" as const, reason: "unsupported_plan" };
    }
    if (wallet?.subscriptionResourceVersion && input.resourceVersion && input.resourceVersion <= wallet.subscriptionResourceVersion) {
      await tx.insert(subscriptionEvents).values({ provider: "chargebee", providerEventId: input.eventId, subscriptionId: input.subscriptionId, resourceVersion: input.resourceVersion, eventType: input.eventType });
      return { status: "stale" as const };
    }

    const allowance = SUBSCRIPTION_PLANS[expectedPlan].monthlyAllowance;
    const retainsAccess = input.status === "active" || input.status === "non_renewing";
    const startsNewTerm = !wallet?.subscriptionCurrentTermStart || (input.currentTermStart && wallet.subscriptionCurrentTermStart.getTime() !== input.currentTermStart.getTime());
    const patch = retainsAccess
      ? {
          plan: expectedPlan,
          monthlyAllowance: allowance,
          monthlyCreditsRemaining: startsNewTerm ? allowance : (wallet?.monthlyCreditsRemaining ?? allowance),
          monthlyCycleKey: input.currentTermStart ? currentMonthlyCycleKey(input.currentTermStart) : currentMonthlyCycleKey(),
          subscriptionId: input.subscriptionId,
          subscriptionStatus: input.status,
          subscriptionCurrency: input.currency ?? wallet?.subscriptionCurrency ?? null,
          subscriptionCurrentTermStart: input.currentTermStart ?? wallet?.subscriptionCurrentTermStart ?? null,
          subscriptionCurrentTermEnd: input.currentTermEnd ?? wallet?.subscriptionCurrentTermEnd ?? null,
          subscriptionResourceVersion: input.resourceVersion ?? wallet?.subscriptionResourceVersion ?? null,
        }
      : {
          plan: "free" as const,
          monthlyAllowance: FREE_MONTHLY_ALLOWANCE,
          monthlyCreditsRemaining: Math.min(wallet?.monthlyCreditsRemaining ?? FREE_MONTHLY_ALLOWANCE, FREE_MONTHLY_ALLOWANCE),
          monthlyCycleKey: currentMonthlyCycleKey(),
          subscriptionId: input.subscriptionId,
          subscriptionStatus: input.status,
          subscriptionCurrency: input.currency ?? wallet?.subscriptionCurrency ?? null,
          subscriptionCurrentTermStart: input.currentTermStart ?? wallet?.subscriptionCurrentTermStart ?? null,
          subscriptionCurrentTermEnd: input.currentTermEnd ?? wallet?.subscriptionCurrentTermEnd ?? null,
          subscriptionResourceVersion: input.resourceVersion ?? wallet?.subscriptionResourceVersion ?? null,
        };
    const userId = wallet?.userId ?? intent!.userId;
    const role = wallet?.role ?? intent!.role;
    if (wallet) await tx.update(tokenBalances).set(patch).where(eq(tokenBalances.id, wallet.id));
    else await tx.insert(tokenBalances).values({ userId, role, balance: 0, ...patch });
    if (intent) await tx.update(subscriptionCheckoutIntents).set({ status: retainsAccess ? "activated" : "cancelled" }).where(eq(subscriptionCheckoutIntents.id, intent.id));
    await tx.insert(subscriptionEvents).values({ provider: "chargebee", providerEventId: input.eventId, subscriptionId: input.subscriptionId, resourceVersion: input.resourceVersion, eventType: input.eventType });
    return { status: "applied" as const, plan: patch.plan, userId, role, creditSummary: creditSummaryFromWallet({ ...(wallet ?? { userId, role, balance: 0, monthlyCreditsRemaining: allowance, monthlyAllowance: allowance, monthlyCycleKey: currentMonthlyCycleKey(), plan: expectedPlan, subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, stripeCustomerId: null, id: 0, updatedAt: new Date() }), ...patch }) };
  });
}
