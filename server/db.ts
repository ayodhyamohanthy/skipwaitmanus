import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { drizzle } from "drizzle-orm/mysql2";
import * as mysql from "mysql2/promise";
import { adminTokenAdjustments, companyCoverageInvitations, companyCoverageRewards, companyOpportunities, employerAccounts, partnerModules, paymentFulfillments, personalReferralInvites, personalReferralRewards, privacyRequests, userFollows, profileUnlocks, referralAvailabilitySlots, referralShareCards, referrerFastTrackLinks, referrerReviewEmailLinks, referrerSlackWebhooks, resumeUploadChunks, resumeUploadSessions, subscriptionCheckoutIntents, subscriptionEvents, tokenBalances, tokenTransactions, type PartnerModuleCategory, type InsertUser, jobs, messages, notifications, operationalActivityLogs, profiles, referralAttachments, referralRequests, savedRoles, users } from "../drizzle/schema";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { ENV } from "./_core/env";
import { databaseSslOptions } from "./_core/databaseSsl";
import { FREE_MONTHLY_ALLOWANCE, SUBSCRIPTION_PLANS, currentMonthlyCycleKey, isPaidSubscriptionPlan, type PaidSubscriptionPlan, type SubscriptionPlan } from "../shared/subscriptionPlans";
import { isPostApprovalReferralStatus, referralProgressUpdateStatuses, referralStatusLabels, type ReferralProgressUpdateStatus, type ReferralStatus } from "../shared/referral";
import { CONSUMER_EMAIL_DOMAINS } from "../shared/const";
import { normalizeTargetRoleUrl, registrableNameFromHost } from "../shared/referralUrl";
import { directEmployerDomainFromTargetUrl, employerCandidatesFromJobPageHtml, hostedEmployerCandidatesFromTargetUrl, isHostedJobPlatform, normalizedEmployerKey, officialEmployerDomainsFromJobPageHtml, publicEmployerPageUrls, verifiedEmployerDomainFromCandidates, verifiedEmployerDomainFromProtectedHostedListing } from "./employerRouting";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Azure Database for MySQL enforces TLS; URL query ssl params are not
      // honored by mysql2, so parse the URI and pass ssl explicitly.
      const parsed = new URL(process.env.DATABASE_URL);
      const connection = await mysql.createPool({
        host: parsed.hostname,
        port: Number(parsed.port || 3306),
        user: parsed.username,
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, "") || undefined,
        ssl: databaseSslOptions(),
      });
      _db = drizzle(connection) as unknown as ReturnType<typeof drizzle>;
    } catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

const durableAdministratorEmail = "ayodhya@skipwait.me";

/**
 * Sessions that assert their own email address rather than inheriting one an
 * external provider attested. The local dev sign-in takes the address straight
 * from the request body, so it can never be evidence of identity.
 */
const UNAUTHENTICATED_EMAIL_LOGIN_METHOD = "dev";

export function resolveSyncedUserRole(input: { openId: string; email?: string | null; requestedRole?: "user" | "admin"; existingRole?: "user" | "admin"; loginMethod?: string | null }) {
  const normalizedEmail = input.email?.trim().toLowerCase();
  const emailIsProviderVerified = input.loginMethod !== UNAUTHENTICATED_EMAIL_LOGIN_METHOD;
  // The administrator promotion is keyed on the email address, so it is only
  // safe when that address came from a provider that verified it. Otherwise a
  // self-asserted address would hand out administrator access to anyone.
  if (normalizedEmail === durableAdministratorEmail && emailIsProviderVerified) return "admin" as const;
  const ownerMatches = Boolean(ENV.ownerOpenId) && input.openId === ENV.ownerOpenId;
  return input.requestedRole ?? input.existingRole ?? (ownerMatches ? "admin" : "user");
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const current = await db.select({ role: users.role }).from(users).where(eq(users.openId, user.openId)).limit(1);
  const role = resolveSyncedUserRole({ openId: user.openId, email: user.email, requestedRole: user.role, existingRole: current[0]?.role, loginMethod: user.loginMethod });
  const values: InsertUser = { openId: user.openId, name: user.name ?? null, email: user.email ?? null, loginMethod: user.loginMethod ?? null, lastSignedIn: user.lastSignedIn ?? new Date(), role };
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: { name: values.name, email: values.email, loginMethod: values.loginMethod, lastSignedIn: values.lastSignedIn, role: values.role } });
}

export async function getUserByOpenId(openId: string) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1); return result[0]; }
export async function getProfileByUserId(userId: number) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1); return result[0]; }
export async function listUsersAdmin(limit = 100) {
  const db = await getDb(); if (!db) return [];
  return db.select({ id: users.id, email: users.email, name: users.name, role: users.role, accountType: profiles.accountType, company: profiles.company, workEmailVerifiedAt: profiles.workEmailVerifiedAt, suspended: users.suspended, createdAt: users.createdAt }).from(users).leftJoin(profiles, eq(profiles.userId, users.id)).orderBy(desc(users.createdAt)).limit(Math.min(200, Math.max(1, limit)));
}
export async function setUserSuspended(userId: number, suspended: boolean) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await db.update(users).set({ suspended }).where(eq(users.id, userId));
  return { userId, suspended };
}
export async function isUserSuspended(userId: number) {
  const db = await getDb(); if (!db) return false;
  const [row] = await db.select({ suspended: users.suspended }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(row?.suspended);
}

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
  const result = await db.update(resumeUploadSessions).set({ status: "completed", attachmentId }).where(and(eq(resumeUploadSessions.id, sessionId), eq(resumeUploadSessions.ownerId, ownerId), eq(resumeUploadSessions.status, "active")));
  // The guarded write matches only an "active" session. Ignoring affectedRows let
  // a double-submitted completion report success while writing nothing (and the
  // caller had already created a second attachment row).
  if (Number(result[0]?.affectedRows ?? 0) !== 1) throw new Error("This resume upload was already completed");
}

export async function exportUserData(userId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const [account, profile, requests, attachments, conversation, opportunities, wallet, transactions, privacy] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt, updatedAt: users.updatedAt }).from(users).where(eq(users.id, userId)).limit(1),
    db.select({ accountType: profiles.accountType, headline: profiles.headline, location: profiles.location, bio: profiles.bio, company: profiles.company, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt, currentTitle: profiles.currentTitle, skills: profiles.skills, experience: profiles.experience, expertise: profiles.expertise, createdAt: profiles.createdAt, updatedAt: profiles.updatedAt }).from(profiles).where(eq(profiles.userId, userId)).limit(1),
    db.select({ id: referralRequests.id, status: referralRequests.status, personalPitch: referralRequests.personalPitch, referrerMessage: referralRequests.referrerMessage, createdAt: referralRequests.createdAt, updatedAt: referralRequests.updatedAt, targetRoleUrl: jobs.targetRoleUrl, companyDomain: jobs.company }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(eq(referralRequests.jobSeekerId, userId)),
    db.select({ id: referralAttachments.id, fileName: referralAttachments.fileName, mimeType: referralAttachments.mimeType, fileSize: referralAttachments.fileSize, createdAt: referralAttachments.createdAt }).from(referralAttachments).where(eq(referralAttachments.ownerId, userId)),
    db.select({ id: messages.id, referralRequestId: messages.referralRequestId, senderId: messages.senderId, recipientId: messages.recipientId, body: messages.body, readAt: messages.readAt, createdAt: messages.createdAt }).from(messages).where(or(eq(messages.senderId, userId), eq(messages.recipientId, userId))),
    db.select({ id: companyOpportunities.id, companyDomain: companyOpportunities.companyDomain, kind: companyOpportunities.kind, roleTitle: companyOpportunities.roleTitle, targetRoleUrl: companyOpportunities.targetRoleUrl, location: companyOpportunities.location, compensation: companyOpportunities.compensation, walkInAt: companyOpportunities.walkInAt, walkInEndsAt: companyOpportunities.walkInEndsAt, isActive: companyOpportunities.isActive, createdAt: companyOpportunities.createdAt, updatedAt: companyOpportunities.updatedAt }).from(companyOpportunities).where(eq(companyOpportunities.ownerId, userId)).catch(() => db.select({ id: companyOpportunities.id, companyDomain: companyOpportunities.companyDomain, kind: companyOpportunities.kind, roleTitle: companyOpportunities.roleTitle, targetRoleUrl: companyOpportunities.targetRoleUrl, location: companyOpportunities.location, walkInAt: companyOpportunities.walkInAt, walkInEndsAt: companyOpportunities.walkInEndsAt, isActive: companyOpportunities.isActive, createdAt: companyOpportunities.createdAt, updatedAt: companyOpportunities.updatedAt }).from(companyOpportunities).where(eq(companyOpportunities.ownerId, userId))),
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
  const existing = await db.select({ id: privacyRequests.id, userId: privacyRequests.userId, kind: privacyRequests.kind, status: privacyRequests.status }).from(privacyRequests).where(eq(privacyRequests.id, requestId)).limit(1);
  if (!existing[0]) return undefined;
  // A resolved request is terminal: without this, a completed/declined erasure
  // could be moved back to in_review (reopening a closed GDPR request) and two
  // concurrent reviews would both report success.
  if (existing[0].status === "completed" || existing[0].status === "declined") throw new Error("This privacy request has already been resolved");
  const resolution = input.resolution?.trim().slice(0, 500) || null;
  const activeKey = input.status === "completed" || input.status === "declined" ? null : `${existing[0].kind}:${existing[0].userId}`;
  const updated = await db.update(privacyRequests).set({ status: input.status, activeKey, resolution, reviewedByUserId: adminUserId, reviewedAt: new Date() }).where(and(eq(privacyRequests.id, requestId), eq(privacyRequests.status, existing[0].status)));
  if (Number(updated[0]?.affectedRows ?? 0) !== 1) throw new Error("This privacy request changed while you were reviewing it");
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

export type ReferrerImpactSummary = { acceptedReferrals: number; pendingRequests: number; declinedRequests: number; unreadMessages: number; creditsRemaining: number; recentAccepted: Array<{ id: number; companyDomain: string; acceptedAt: string }> };

export async function getReferrerImpactSummary(userId: number): Promise<ReferrerImpactSummary> {
  const access = await getVerifiedWorkEmailAccess(userId);
  if (!access) throw new Error("Verify your company email to view your private impact");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const rows = await db.select({ id: referralRequests.id, status: referralRequests.status, companyDomain: jobs.company, updatedAt: referralRequests.updatedAt }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(eq(referralRequests.referrerId, userId));
  const acceptedStatuses = new Set<ReferralStatus>(["approved", "intro_made", "interview", "offer", "closed"]);
  const accepted = rows.filter(row => acceptedStatuses.has(row.status)).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const unreadRows = await db.select({ unreadMessageCount: count(messages.id) }).from(messages).where(and(eq(messages.recipientId, userId), isNull(messages.readAt)));
  const wallet = await ensureTokenWallet(userId, "referrer");
  return {
    acceptedReferrals: accepted.length,
    pendingRequests: rows.filter(row => row.status === "pending").length,
    declinedRequests: rows.filter(row => row.status === "declined").length,
    unreadMessages: Number(unreadRows[0]?.unreadMessageCount ?? 0),
    creditsRemaining: Math.max(0, wallet.monthlyCreditsRemaining + wallet.balance),
    recentAccepted: accepted.slice(0, 5).map(row => ({ id: row.id, companyDomain: row.companyDomain, acceptedAt: row.updatedAt.toISOString() })),
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

export async function getPublicReferrerFastTrackLink(linkCode: string): Promise<{ companyDomain: string; isActive: true; referrerUserId: number } | undefined> {
  const normalizedCode = linkCode.trim().slice(0, 64);
  if (!normalizedCode) return undefined;
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select({ companyDomain: referrerFastTrackLinks.companyDomain, isActive: referrerFastTrackLinks.isActive, referrerId: referrerFastTrackLinks.referrerId, accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt }).from(referrerFastTrackLinks).innerJoin(profiles, eq(referrerFastTrackLinks.referrerId, profiles.userId)).where(and(eq(referrerFastTrackLinks.linkCode, normalizedCode), eq(referrerFastTrackLinks.isActive, true))).limit(1);
  const link = result[0];
  if (!link || !isVerifiedEmployeeOfCompany(link, link.companyDomain)) return undefined;
  return { companyDomain: link.companyDomain, isActive: true, referrerUserId: link.referrerId };
}

export async function getPublicReferrerFastTrackVanityLink(companySlug: string, vanityAlias: string): Promise<{ companyDomain: string; isActive: true; referrerUserId: number } | undefined> {
  const normalizedSlug = companySlug.trim().toLowerCase();
  const normalizedAlias = vanityAlias.trim().toLowerCase();
  if (!normalizedSlug || !isSafeFastTrackAlias(normalizedAlias)) return undefined;
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select({ companyDomain: referrerFastTrackLinks.companyDomain, isActive: referrerFastTrackLinks.isActive, referrerId: referrerFastTrackLinks.referrerId, accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt }).from(referrerFastTrackLinks).innerJoin(profiles, eq(referrerFastTrackLinks.referrerId, profiles.userId)).where(and(eq(referrerFastTrackLinks.vanityAlias, normalizedAlias), eq(referrerFastTrackLinks.isActive, true))).limit(1);
  const link = result[0];
  if (!link || companySlugFromDomain(link.companyDomain) !== normalizedSlug || !isVerifiedEmployeeOfCompany(link, link.companyDomain)) return undefined;
  return { companyDomain: link.companyDomain, isActive: true, referrerUserId: link.referrerId };
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
  const isBoardDomain = (domain: string) => {
    try { return isHostedJobPlatform(new URL(`https://${domain}`).hostname); } catch { return false; }
  };
  const protectedHostedDomain = verifiedEmployerDomainFromProtectedHostedListing(normalizedTargetRoleUrl);
  if (protectedHostedDomain) return protectedHostedDomain;
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const verifiedDomains = await db.select({ domain: profiles.workEmailDomain }).from(profiles).where(and(eq(profiles.accountType, "referrer"), isNotNull(profiles.workEmailVerifiedAt)));
  const urlCandidates = hostedEmployerCandidatesFromTargetUrl(normalizedTargetRoleUrl);
  const matchedFromUrl = verifiedEmployerDomainFromCandidates(urlCandidates, verifiedDomains.map(row => row.domain));
  if (matchedFromUrl) return matchedFromUrl;
  const pageEvidence = await employerPageEvidence(normalizedTargetRoleUrl);
  if (pageEvidence.officialDomains.length === 1 && !isBoardDomain(pageEvidence.officialDomains[0])) return pageEvidence.officialDomains[0];
  const matchedFromPage = verifiedEmployerDomainFromCandidates([...urlCandidates, ...pageEvidence.candidates], verifiedDomains.map(row => row.domain));
  if (matchedFromPage) return matchedFromPage;
  // Aggregators like LinkedIn label jobs with a brand display name ("Ethos") whose
  // domain key ("ethos") can differ from the company's email domain ("ethoslife").
  // The company profile handle (linkedin.com/company/ethoslife) is the stronger
  // signal, so match it against the domain's registrable label with the public
  // suffix stripped: handle "ethoslife" matches ethoslife.com and ethoslife.co.in,
  // but never an unrelated longer name ("ethos" must not match "ethoslife").
  const handleCandidates = Array.from(new Set([...urlCandidates, ...pageEvidence.candidates]));
  if (handleCandidates.length > 0) {
    const handleMatches = verifiedDomains
      .map(row => row.domain?.trim().toLowerCase())
      .filter((domain): domain is string => Boolean(domain))
      .filter(domain => {
        const name = registrableNameFromHost(domain);
        if (!name) return false;
        const key = normalizedEmployerKey(name);
        return handleCandidates.some(handle => handle === name || handle === key);
      });
    const uniqueMatches = Array.from(new Set(handleMatches)).filter(domain => !isBoardDomain(domain));
    if (uniqueMatches.length === 1) return uniqueMatches[0];
  }
  return undefined;
}

const consumerEmailDomains = new Set<string>(CONSUMER_EMAIL_DOMAINS);
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

export type PublishCompanyOpportunityInput = { kind: "hiring_now" | "walk_in"; roleTitle: string; targetRoleUrl?: string; location?: string; compensation?: string; walkInAt?: Date; walkInEndsAt?: Date };

export async function publishCompanyOpportunity(userId: number, input: PublishCompanyOpportunityInput) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !profile.workEmailVerifiedAt) throw new Error("Verify your work email before publishing an opportunity");
  const roleTitle = input.roleTitle.trim();
  if (!roleTitle || roleTitle.length > 180) throw new Error("Add a role title before publishing");
  if (input.targetRoleUrl) {
    try { new URL(input.targetRoleUrl); } catch { throw new Error("Use a valid public job link or leave it blank"); }
  }
  if (input.compensation && input.compensation.trim().length > 80) throw new Error("Keep compensation under 80 characters");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const result = await db.insert(companyOpportunities).values({ ownerId: userId, companyDomain: profile.workEmailDomain, kind: input.kind, roleTitle, targetRoleUrl: input.targetRoleUrl?.trim() || null, location: input.location?.trim() || null, compensation: input.compensation?.trim() || null, walkInAt: input.walkInAt ?? null, walkInEndsAt: input.walkInEndsAt ?? null, isActive: true });
  return { id: Number(result[0].insertId), companyDomain: profile.workEmailDomain, kind: input.kind, roleTitle, compensation: input.compensation?.trim() || null };
}

export async function listPublicCompanyOpportunities() {
  const db = await getDb(); if (!db) return [];
  const base = { id: companyOpportunities.id, companyDomain: companyOpportunities.companyDomain, kind: companyOpportunities.kind, roleTitle: companyOpportunities.roleTitle, targetRoleUrl: companyOpportunities.targetRoleUrl, location: companyOpportunities.location, walkInAt: companyOpportunities.walkInAt, walkInEndsAt: companyOpportunities.walkInEndsAt, createdAt: companyOpportunities.createdAt };
  // compensation is a newer optional column; degrade gracefully if the live
  // DB has not yet been migrated, so the wall never 500s.
  try {
    return await db.select({ ...base, compensation: companyOpportunities.compensation }).from(companyOpportunities).where(eq(companyOpportunities.isActive, true)).orderBy(desc(companyOpportunities.createdAt)).limit(24);
  } catch {
    return db.select(base).from(companyOpportunities).where(eq(companyOpportunities.isActive, true)).orderBy(desc(companyOpportunities.createdAt)).limit(24);
  }
}

export async function listJobs(input: { query?: string; company?: string; location?: string; seniority?: string }) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select().from(jobs).orderBy(desc(jobs.publishedAt));
  const term = input.query?.trim().toLowerCase();
  return rows.filter(row => (!term || `${row.title} ${row.company} ${row.description}`.toLowerCase().includes(term)) && (!input.company || row.company === input.company) && (!input.location || row.location.includes(input.location)) && (!input.seniority || row.seniority === input.seniority));
}

export async function listReferrers(input: { query?: string; company?: string; role?: string }) {
  const db = await getDb(); if (!db) return [];
  // NOTE: deliberately does NOT select `users.email`. This feeds a public
  // (unauthenticated) tRPC directory via `community.listReferrers`, so returning
  // member email addresses would let anyone harvest every referrer's address for
  // phishing. `getAiWorkspaceContext` already strips `email` from this result, so
  // nothing downstream needs it.
  const rows = await db.select({ profileId: profiles.id, userId: users.id, name: users.name, company: profiles.company, title: profiles.currentTitle, location: profiles.location, expertise: profiles.expertise, capacity: profiles.referralCapacity, headline: profiles.headline }).from(profiles).innerJoin(users, eq(profiles.userId, users.id)).where(eq(profiles.accountType, "referrer"));
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
  return db.select({ id: referralRequests.id, jobId: jobs.id, jobTitle: jobs.title, company: jobs.company, jobLocation: jobs.location, compensation: jobs.compensation, jobSeekerId: referralRequests.jobSeekerId, referrerId: referralRequests.referrerId, personalPitch: referralRequests.personalPitch, status: referralRequests.status, referrerMessage: referralRequests.referrerMessage, createdAt: referralRequests.createdAt, updatedAt: referralRequests.updatedAt }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(or(eq(referralRequests.jobSeekerId, userId), eq(referralRequests.referrerId, userId))).orderBy(desc(referralRequests.updatedAt));
}

export async function createReferralRequest(userId: number, input: { jobId: number; referrerId: number; personalPitch: string; attachmentIds?: number[] }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const result = await db.insert(referralRequests).values({ jobId: input.jobId, jobSeekerId: userId, referrerId: input.referrerId, personalPitch: input.personalPitch });
  const requestId = Number(result[0].insertId);
  for (const attachmentId of input.attachmentIds ?? []) await db.update(referralAttachments).set({ referralRequestId: requestId }).where(and(eq(referralAttachments.id, attachmentId), eq(referralAttachments.ownerId, userId)));
  await db.insert(notifications).values({ userId: input.referrerId, category: "referral", title: "New Referral Request", body: "A Job Seeker has shared a Referral Request for your review." });
  return { id: requestId };
}

export async function createCompanyReferralRequest(userId: number, input: { targetRoleUrl: string; personalPitch: string; attachmentIds: number[]; compensation?: string; fastTrackCode?: string; fastTrackCompanySlug?: string; fastTrackAlias?: string }) {
  const companyDomain = await resolveEmployerDomainFromTargetUrl(input.targetRoleUrl);
  if (!companyDomain) throw new Error("We could not safely identify the employer behind this job link. Paste the employer’s careers-page link so we notify only the right employees.");
  const compensation = input.compensation?.trim().slice(0, 80) || null;
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (input.fastTrackCode && (input.fastTrackCompanySlug || input.fastTrackAlias)) throw new Error("Use one private referral link at a time");
  const fastTrackLink = input.fastTrackCode ? await getActiveReferrerFastTrackLink(input.fastTrackCode) : input.fastTrackCompanySlug && input.fastTrackAlias ? await getActiveReferrerFastTrackVanityLink(input.fastTrackCompanySlug, input.fastTrackAlias) : undefined;
  if ((input.fastTrackCode || input.fastTrackCompanySlug || input.fastTrackAlias) && !fastTrackLink) throw new Error("This private referral link is no longer active");
  if (fastTrackLink && !fastTrackLinkMatchesCompany(fastTrackLink.companyDomain, companyDomain)) throw new Error("Use a job link for the same company as this private referral link");
  const eligibleCandidates = fastTrackLink ? await db.select({ userId: profiles.userId, accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt, email: users.email }).from(profiles).innerJoin(users, eq(users.id, profiles.userId)).where(eq(profiles.userId, fastTrackLink.referrerId)) : await db.select({ userId: profiles.userId, accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt, email: users.email }).from(profiles).innerJoin(users, eq(users.id, profiles.userId)).where(and(eq(profiles.accountType, "referrer"), eq(profiles.workEmailDomain, companyDomain), isNotNull(profiles.workEmailVerifiedAt)));
  const eligible = eligibleCandidates.filter(profile => isVerifiedEmployeeOfCompany(profile, companyDomain));
  const coverageStatus = companyCoverageStatus(eligible.length);
  // A valid, private request always reserves one Job Seeker credit. Requests
  // without current coverage remain queued for manual administrator follow-up.
  const remaining = await spendToken(userId, "job_seeker");
  // spendToken commits its own transaction, and none of the writes below share
  // it, so a failure here would leave the Job Seeker charged for a request that
  // does not exist. Return the credit before surfacing the error.
  let jobId: number | undefined;
  let requestId: number | undefined;
  try {
    const jobResult = await db.insert(jobs).values({ title: "Role from shared job link", company: companyDomain, location: "Not specified", compensation, description: "Private referral request routed from a Target Role URL.", targetRoleUrl: input.targetRoleUrl, workMode: "Not specified", seniority: "Not specified", employmentType: "Not specified", publishedAt: new Date() });
    jobId = Number(jobResult[0].insertId);
    const isWaitingForCoverage = coverageStatus === "waiting_for_company_coverage";
    const requestResult = await db.insert(referralRequests).values({ jobId, jobSeekerId: userId, referrerId: fastTrackLink?.referrerId ?? null, personalPitch: input.personalPitch, status: "pending", waitingForCoverage: isWaitingForCoverage, coverageQueuedAt: isWaitingForCoverage ? new Date() : null });
    requestId = Number(requestResult[0].insertId);
    for (const attachmentId of input.attachmentIds) await db.update(referralAttachments).set({ referralRequestId: requestId }).where(and(eq(referralAttachments.id, attachmentId), eq(referralAttachments.ownerId, userId)));
    for (const employee of eligible) await db.insert(notifications).values({ userId: employee.userId, category: "referral", title: fastTrackLink ? "A Fast-Track referral request is ready" : "A private referral request is available", body: fastTrackLink ? `A Job Seeker used your private link for a role at ${companyDomain}. Review it only if you choose to help.` : `A Job Seeker shared a role at ${companyDomain}. Sign in to review and claim it.` });
    const coverageInvite = !fastTrackLink && coverageStatus === "waiting_for_company_coverage" ? await createCompanyCoverageInvitation(userId, companyDomain) : undefined;
    return { requestId, companyDomain, coverageStatus, coverageInviteCode: coverageInvite?.inviteCode, notifiedEmployees: eligible.length, remainingTokens: remaining.totalAvailable, creditSummary: remaining, fastTrack: Boolean(fastTrackLink) };
  } catch (error) {
    await refundUnspentReferralCredit(userId).catch(refundError => console.error("[Credits] failed to refund a referral credit after a failed request:", refundError));
    // The job row is only an orphan if the request row never landed; once the
    // request exists it owns the job, so leave it alone.
    if (jobId !== undefined && requestId === undefined) {
      await db.delete(jobs).where(eq(jobs.id, jobId)).catch(() => undefined);
    }
    throw error;
  }
}

/**
 * Compensating refund for a referral credit reserved by spendToken whose request
 * never completed. Mirrors withdrawCompanyReferralRequest's rule — the credit
 * returns to the monthly allowance when the cycle still matches and the
 * allowance is not full, otherwise to the pack balance — so a failed send does
 * not silently consume a paid credit.
 */
async function refundUnspentReferralCredit(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.transaction(async tx => {
    const wallet = await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, "job_seeker"))).limit(1).for("update");
    if (!wallet[0]) throw new Error("Your referral credit wallet is unavailable; contact support to restore this credit");
    const refundToMonthly = wallet[0].monthlyCycleKey === currentMonthlyCycleKey() && wallet[0].monthlyCreditsRemaining < FREE_MONTHLY_ALLOWANCE;
    const patch = refundToMonthly ? { monthlyCreditsRemaining: wallet[0].monthlyCreditsRemaining + 1 } : { balance: wallet[0].balance + 1 };
    await tx.update(tokenBalances).set(patch).where(eq(tokenBalances.id, wallet[0].id));
    await tx.insert(tokenTransactions).values({ userId, role: "job_seeker", tokenCount: 1, kind: "withdrawal_refund" });
  });
}

const reviewEmailLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const reviewLinkToken = () => randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 16);

export async function createReferrerReviewEmailLinks(requestId: number, recipients: Array<{ userId: number; email: string | null; companyDomain: string }>) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const expiresAt = new Date(Date.now() + reviewEmailLifetimeMs);
  const links: Array<{ referrerId: number; email: string; linkToken: string; companyDomain: string }> = [];
  for (const recipient of recipients) {
    const email = recipient.email?.trim().toLowerCase() || "";
    const domain = email.split("@")[1] || "";
    if (!email || domain !== recipient.companyDomain) continue;
    const linkToken = reviewLinkToken();
    await db.insert(referrerReviewEmailLinks).values({ referralRequestId: requestId, referrerId: recipient.userId, linkToken, expiresAt }).onDuplicateKeyUpdate({ set: { linkToken, expiresAt, consumedAt: null } });
    links.push({ referrerId: recipient.userId, email, linkToken, companyDomain: recipient.companyDomain });
  }
  return links;
}

// ---- Opt-in private Slack triage delivery (encrypted at rest) ----
function slackWebhookMasterKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  // Fail closed. This previously fell back to a literal committed to the repo,
  // which meant that on any deployment where JWT_SECRET was unset every stored
  // Slack webhook URL was encrypted under a publicly known key — anyone with
  // database read access could decrypt the URLs of private referral triage
  // channels and post into them.
  if (!secret) throw new Error("JWT_SECRET is required to encrypt referrer Slack webhook URLs");
  return createHash("sha256").update(`skipwait:slack-webhook:${secret}`).digest();
}
function encryptSlackWebhookUrl(url: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", slackWebhookMasterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(url, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${iv.toString("base64")}:${encrypted.toString("base64")}`;
}
function decryptSlackWebhookUrl(stored: string): string | undefined {
  try {
    const [ivPart, dataPart] = stored.split(":");
    if (!ivPart || !dataPart) return undefined;
    const decipher = createDecipheriv("aes-256-gcm", slackWebhookMasterKey(), Buffer.from(ivPart, "base64"));
    const payload = Buffer.from(dataPart, "base64");
    decipher.setAuthTag(payload.subarray(-16));
    return Buffer.concat([decipher.update(payload.subarray(0, -16)), decipher.final()]).toString("utf8");
  } catch { return undefined; }
}

export async function saveReferrerSlackWebhook(userId: number, webhookUrl: string) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const encrypted = encryptSlackWebhookUrl(webhookUrl);
  await db.insert(referrerSlackWebhooks).values({ referrerId: userId, webhookUrl: encrypted, isActive: true }).onDuplicateKeyUpdate({ set: { webhookUrl: encrypted, isActive: true, updatedAt: new Date() } });
  return { connected: true as const };
}

export async function getReferrerSlackWebhookStatus(userId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const rows = await db.select({ isActive: referrerSlackWebhooks.isActive, updatedAt: referrerSlackWebhooks.updatedAt }).from(referrerSlackWebhooks).where(eq(referrerSlackWebhooks.referrerId, userId)).limit(1);
  const row = rows[0];
  return row ? { connected: true, active: row.isActive, updatedAt: row.updatedAt } : { connected: false as const, active: false as const };
}

export async function deactivateReferrerSlackWebhook(userId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const updated = await db.update(referrerSlackWebhooks).set({ isActive: false, updatedAt: new Date() }).where(eq(referrerSlackWebhooks.referrerId, userId));
  return { deactivated: Number((updated as unknown as Array<{ affectedRows: number }>)[0]?.affectedRows ?? 0) > 0 };
}

export async function getActiveReferrerSlackWebhooks(referrerIds: number[]) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const safeIds = referrerIds.filter(id => Number.isInteger(id) && id > 0);
  if (safeIds.length === 0) return [];
  const rows = await db.select({ referrerId: referrerSlackWebhooks.referrerId, webhookUrl: referrerSlackWebhooks.webhookUrl }).from(referrerSlackWebhooks).where(and(eq(referrerSlackWebhooks.isActive, true), inArray(referrerSlackWebhooks.referrerId, safeIds)));
  const deliveries: Array<{ referrerId: number; webhookUrl: string }> = [];
  for (const row of rows) {
    const decrypted = decryptSlackWebhookUrl(row.webhookUrl);
    if (decrypted) deliveries.push({ referrerId: row.referrerId, webhookUrl: decrypted });
  }
  return deliveries;
}

export async function prepareReferrerReviewEmailNotifications(requestId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const request = await db.select({ companyDomain: jobs.company, status: referralRequests.status, referrerId: referralRequests.referrerId }).from(referralRequests).innerJoin(jobs, eq(jobs.id, referralRequests.jobId)).where(eq(referralRequests.id, requestId)).limit(1);
  const current = request[0]; if (!current || current.status !== "pending") return [];
  const recipients = await db.select({ userId: profiles.userId, email: users.email, workEmailDomain: profiles.workEmailDomain, accountType: profiles.accountType, workEmailVerifiedAt: profiles.workEmailVerifiedAt }).from(profiles).innerJoin(users, eq(users.id, profiles.userId)).where(and(eq(profiles.accountType, "referrer"), eq(profiles.workEmailDomain, current.companyDomain), isNotNull(profiles.workEmailVerifiedAt)));
  const eligible = recipients.filter(recipient => (!current.referrerId || recipient.userId === current.referrerId) && recipient.workEmailDomain === current.companyDomain && isVerifiedEmployeeOfCompany(recipient, current.companyDomain));
  return createReferrerReviewEmailLinks(requestId, eligible.map(recipient => ({ userId: recipient.userId, email: recipient.email, companyDomain: current.companyDomain })));
}

export async function resolveReferrerReviewEmailLink(userId: number, linkToken: string) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const link = await db.select({ referralRequestId: referrerReviewEmailLinks.referralRequestId, expiresAt: referrerReviewEmailLinks.expiresAt, consumedAt: referrerReviewEmailLinks.consumedAt, status: referralRequests.status, assignedReferrerId: referralRequests.referrerId }).from(referrerReviewEmailLinks).innerJoin(referralRequests, eq(referralRequests.id, referrerReviewEmailLinks.referralRequestId)).where(and(eq(referrerReviewEmailLinks.linkToken, linkToken), eq(referrerReviewEmailLinks.referrerId, userId))).limit(1);
  if (!link[0] || link[0].consumedAt || link[0].expiresAt.getTime() < Date.now() || link[0].status !== "pending" || (link[0].assignedReferrerId !== null && link[0].assignedReferrerId !== userId)) throw new Error("This private review link is unavailable");
  return { requestId: link[0].referralRequestId };
}

const oneClickDeclineMessages = {
  role_not_a_fit: "I do not think this role is the right fit for my referral.",
  cannot_support: "I cannot support a referral for this role right now.",
  timing: "I am not able to take this referral on right now.",
} as const;

export type OneClickDeclineReason = keyof typeof oneClickDeclineMessages;

export async function oneClickReviewReferralRequest(userId: number, input: { requestId: number; decision: "approved" | "declined"; declineReason?: OneClickDeclineReason }) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !profile.workEmailVerifiedAt) throw new Error("Verify your work email before reviewing referrals");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const request = await tx.select({ id: referralRequests.id, jobSeekerId: referralRequests.jobSeekerId, referrerId: referralRequests.referrerId, status: referralRequests.status, companyDomain: jobs.company }).from(referralRequests).innerJoin(jobs, eq(jobs.id, referralRequests.jobId)).where(eq(referralRequests.id, input.requestId)).limit(1);
    const current = request[0];
    if (!current || current.status !== "pending" || !isVerifiedEmployeeOfCompany(profile, current.companyDomain) || (current.referrerId !== null && current.referrerId !== userId)) throw new Error("This referral request is no longer available");
    if (current.referrerId === null) {
      const claimed = await tx.update(referralRequests).set({ referrerId: userId }).where(and(eq(referralRequests.id, input.requestId), isNull(referralRequests.referrerId), eq(referralRequests.status, "pending")));
      if (Number(claimed[0].affectedRows) !== 1) throw new Error("Another verified employee already claimed this request");
    }
    const message = input.decision === "declined" ? oneClickDeclineMessages[input.declineReason ?? "cannot_support"] : null;
    const updated = await tx.update(referralRequests).set({ status: input.decision, referrerMessage: message }).where(and(eq(referralRequests.id, input.requestId), eq(referralRequests.status, "pending"), eq(referralRequests.referrerId, userId)));
    if (Number(updated[0].affectedRows) !== 1) throw new Error("This referral request has already been reviewed");
    await tx.insert(notifications).values({ userId: current.jobSeekerId, category: "status", title: `Referral Request ${input.decision === "approved" ? "approved" : "declined"}`, body: message || "Your Referrer has reviewed your Referral Request." });
    if (input.decision === "approved") await grantPendingActionRewards(userId, "referrer");
    return { status: input.decision, companyDomain: current.companyDomain, jobSeekerId: current.jobSeekerId, declineReason: input.decision === "declined" ? input.declineReason ?? "cannot_support" : undefined };
  });
}

export async function consumeReferrerReviewEmailLink(userId: number, linkToken: string) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const consumed = await db.update(referrerReviewEmailLinks).set({ consumedAt: new Date() }).where(and(eq(referrerReviewEmailLinks.linkToken, linkToken), eq(referrerReviewEmailLinks.referrerId, userId), isNull(referrerReviewEmailLinks.consumedAt)));
  if (Number(consumed[0].affectedRows) !== 1) throw new Error("This private review link is unavailable");
}

export async function listCompanyReferralInbox(userId: number) {
  return listCompanyReferralInboxByState(userId, "new");
}

export type CompanyReferralInboxState = "new" | "saved" | "completed";

export async function listCompanyReferralInboxByState(userId: number, state: CompanyReferralInboxState) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !isVerifiedEmployeeOfCompany(profile, profile.workEmailDomain)) return [];
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ id: referralRequests.id, targetRoleUrl: jobs.targetRoleUrl, companyDomain: jobs.company, compensation: jobs.compensation, status: referralRequests.status, referrerId: referralRequests.referrerId, savedAt: referralRequests.savedAt, createdAt: referralRequests.createdAt, updatedAt: referralRequests.updatedAt, attachmentCount: count(referralAttachments.id), queueAllocationId: referralAvailabilitySlots.id }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).leftJoin(referralAvailabilitySlots, and(eq(referralAvailabilitySlots.referralRequestId, referralRequests.id), eq(referralAvailabilitySlots.status, "allocated"))).leftJoin(referralAttachments, eq(referralAttachments.referralRequestId, referralRequests.id)).where(eq(jobs.company, profile.workEmailDomain)).groupBy(referralRequests.id, jobs.targetRoleUrl, jobs.company, jobs.compensation, referralRequests.status, referralRequests.referrerId, referralRequests.savedAt, referralRequests.createdAt, referralRequests.updatedAt, referralAvailabilitySlots.id).orderBy(desc(referralRequests.updatedAt));
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
  // Re-assert the same conditions on the write: the read above is a snapshot, so a
  // concurrent claim could otherwise have savedAt stamped onto a claimed request.
  const updated = await db.update(referralRequests).set({ savedAt: saved ? new Date() : null }).where(and(eq(referralRequests.id, requestId), eq(referralRequests.status, "pending"), isNull(referralRequests.referrerId)));
  if (Number(updated[0]?.affectedRows ?? 0) !== 1) throw new Error("This private referral request is no longer available to save");
  return { requestId, saved };
}

export async function withdrawCompanyReferralRequest(userId: number, requestId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const request = await tx.select({ id: referralRequests.id, status: referralRequests.status, referrerId: referralRequests.referrerId }).from(referralRequests).where(and(eq(referralRequests.id, requestId), eq(referralRequests.jobSeekerId, userId))).limit(1);
    const current = request[0];
    if (!current) throw new Error("This referral request is not in your account");
    if (current.status !== "pending" || current.referrerId !== null) throw new Error("This request was already claimed by a verified employee and can no longer be withdrawn");
    // Lock the wallet row: the refund below writes an absolute balance derived
    // from this read, so an unlocked read lets a concurrent spendToken (which does
    // lock) be overwritten — leaving the user holding a credit they already spent.
    const wallet = await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, "job_seeker"))).limit(1).for("update");
    if (!wallet[0]) throw new Error("Your referral credit wallet is unavailable; contact support to restore this credit");
    // Credit timing rule: reserved at creation, refunded on withdraw. The refund
    // returns the monthly credit first (same cycle, under the free allowance);
    // a rolled cycle or a full monthly allowance refunds to the pack balance.
    const refundToMonthly = wallet[0].monthlyCycleKey === currentMonthlyCycleKey() && wallet[0].monthlyCreditsRemaining < FREE_MONTHLY_ALLOWANCE;
    const patch = refundToMonthly ? { monthlyCreditsRemaining: wallet[0].monthlyCreditsRemaining + 1 } : { balance: wallet[0].balance + 1 };
    await tx.update(tokenBalances).set(patch).where(eq(tokenBalances.id, wallet[0].id));
    await tx.insert(tokenTransactions).values({ userId, role: "job_seeker", tokenCount: 1, kind: "withdrawal_refund" });
    const updated = await tx.update(referralRequests).set({ status: "withdrawn" }).where(and(eq(referralRequests.id, requestId), eq(referralRequests.status, "pending"), isNull(referralRequests.referrerId)));
    if (Number(updated[0]?.affectedRows ?? 0) !== 1) throw new Error("This request was already claimed by a verified employee and can no longer be withdrawn");
    return { withdrawn: true as const, requestId, status: "withdrawn" as const, creditSummary: creditSummaryFromWallet({ ...wallet[0], ...patch }) };
  });
}

export async function listJobSeekerCompanyReferrals(userId: number) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ id: referralRequests.id, targetRoleUrl: jobs.targetRoleUrl, companyDomain: jobs.company, compensation: jobs.compensation, status: referralRequests.status, referrerId: referralRequests.referrerId, waitingForCoverage: referralRequests.waitingForCoverage, referrerMessage: referralRequests.referrerMessage, createdAt: referralRequests.createdAt, updatedAt: referralRequests.updatedAt, attachmentCount: count(referralAttachments.id) }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).leftJoin(referralAttachments, eq(referralAttachments.referralRequestId, referralRequests.id)).where(eq(referralRequests.jobSeekerId, userId)).groupBy(referralRequests.id, jobs.targetRoleUrl, jobs.company, jobs.compensation, referralRequests.status, referralRequests.referrerId, referralRequests.waitingForCoverage, referralRequests.referrerMessage, referralRequests.createdAt, referralRequests.updatedAt).orderBy(desc(referralRequests.updatedAt));
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

export async function getSlotOpenedAlertRecipients(referrerId: number, requestIds: number[]) {
  const eligibleRequestIds = Array.from(new Set(requestIds.filter(id => Number.isInteger(id) && id > 0)));
  if (!eligibleRequestIds.length) return [];
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const rows = await db.select({ requestId: referralRequests.id, jobSeekerId: referralRequests.jobSeekerId, email: users.email, companyDomain: jobs.company }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).innerJoin(users, eq(users.id, referralRequests.jobSeekerId)).where(and(inArray(referralRequests.id, eligibleRequestIds), eq(referralRequests.referrerId, referrerId), eq(referralRequests.status, "pending"), eq(referralRequests.waitingForCoverage, false)));
  return rows.filter(row => typeof row.email === "string" && row.email.includes("@"));
}

export type PublicReferralImpact = { acceptedReferrals: number };

export async function getPublicReferralImpact(): Promise<PublicReferralImpact> {
  const db = await getDb(); if (!db) return { acceptedReferrals: 0 };
  const result = await db.select({ acceptedReferrals: count(referralRequests.id) }).from(referralRequests).where(or(eq(referralRequests.status, "approved"), eq(referralRequests.status, "intro_made"), eq(referralRequests.status, "interview"), eq(referralRequests.status, "offer"), eq(referralRequests.status, "closed")));
  return { acceptedReferrals: Number(result[0]?.acceptedReferrals ?? 0) };
}

export async function getReferralFlowHealth() {
  const db = await getDb();
  if (!db) return { funnel: { requestsCreated: 0, requestsClaimed: 0, decisionsRecorded: 0, waitingForCoverage: 0 }, coverageGaps: [], instrumentation: { uploadedDocuments: 0, recordedFailures: 0 } };
  const [requests, verifiedProfiles, activities] = await Promise.all([
    db.select({ companyDomain: jobs.company, status: referralRequests.status, referrerId: referralRequests.referrerId }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)),
    // Only verified referrers count as coverage. `accountType` is self-selected via
    // saveProfile, so counting unverified profiles hid real coverage gaps.
    db.select({ workEmailDomain: profiles.workEmailDomain }).from(profiles).where(and(eq(profiles.accountType, "referrer"), isNotNull(profiles.workEmailVerifiedAt))),
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
  const update = await db.update(referralRequests).set({ referrerId: userId }).where(and(eq(referralRequests.id, requestId), eq(referralRequests.status, "pending"), isNull(referralRequests.referrerId)));
  if (Number(update[0].affectedRows) !== 1) throw new Error("Another verified employee already claimed this request");
  await db.insert(notifications).values({ userId: request[0].jobSeekerId, category: "status", title: "Your referral request was claimed", body: "A verified employee at the target company is reviewing your request." });
  return { requestId, claimed: true, jobSeekerId: request[0].jobSeekerId, companyDomain: request[0].company };
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
  // Guard the write on the same condition the read validated. Without it, two
  // concurrent reviews (or a race with oneClickReviewReferralRequest /
  // resolveAdminApproval) both matched by id, so both landed — the second
  // overwrote the first (an approved request could be flipped to declined).
  const updated = await db.update(referralRequests).set({ status: input.decision, referrerMessage: input.message ?? null }).where(and(eq(referralRequests.id, input.requestId), eq(referralRequests.referrerId, userId), eq(referralRequests.status, "pending")));
  if (Number(updated[0]?.affectedRows ?? 0) !== 1) throw new Error("This Referral Request has already been reviewed");
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
  // Optimistic guard on the status the ordering was validated against. Without it
  // the UPDATE matched by id alone, so a concurrent write could regress the
  // milestone, and a request closed concurrently was silently reopened by a stale
  // "intro_made" write — while still reporting changed: true.
  const updated = await db.update(referralRequests).set({ status: input.status }).where(and(eq(referralRequests.id, input.requestId), eq(referralRequests.status, existing.status)));
  if (Number(updated[0]?.affectedRows ?? 0) !== 1) throw new Error("This referral request changed while you were updating it. Reload and try again.");
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


export type FollowSummary = { followers: number; followingCount: number; isFollowingViewer: boolean; isFollowingTarget: boolean; isMutual: boolean; joinedMonthYear: string };
export type FollowGraphEntry = { userId: number; label: string; followedAt: Date };

export async function followUser(followerUserId: number, targetUserId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await db.insert(userFollows).values({ followerUserId, followingUserId: targetUserId }).onDuplicateKeyUpdate({ set: { followerUserId } });
}

export async function unfollowUser(followerUserId: number, targetUserId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await db.delete(userFollows).where(and(eq(userFollows.followerUserId, followerUserId), eq(userFollows.followingUserId, targetUserId)));
}

export async function isMutualFollow(userA: number, userB: number) {
  const db = await getDb(); if (!db) return false;
  const rows = await db.select({ followerUserId: userFollows.followerUserId, followingUserId: userFollows.followingUserId }).from(userFollows).where(and(inArray(userFollows.followerUserId, [userA, userB]), inArray(userFollows.followingUserId, [userA, userB])));
  const aFollowsB = rows.some(row => row.followerUserId === userA && row.followingUserId === userB);
  const bFollowsA = rows.some(row => row.followerUserId === userB && row.followingUserId === userA);
  return aFollowsB && bFollowsA;
}

export async function followState(viewerUserId: number | undefined, targetUserId: number): Promise<FollowSummary> {
  const db = await getDb();
  const empty = { followers: 0, followingCount: 0, isFollowingViewer: false, isFollowingTarget: false, isMutual: false, joinedMonthYear: "" };
  if (!db) return empty;
  const [followersRows, followingRows, targetRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(userFollows).where(eq(userFollows.followingUserId, targetUserId)),
    db.select({ count: sql<number>`count(*)` }).from(userFollows).where(eq(userFollows.followerUserId, targetUserId)),
    db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, targetUserId)).limit(1),
  ]);
  const followers = Number(followersRows[0]?.count ?? 0);
  const followingCount = Number(followingRows[0]?.count ?? 0);
  let isFollowingViewer = false; let isFollowingTarget = false;
  if (viewerUserId && viewerUserId !== targetUserId) {
    const pairRows = await db.select({ followerUserId: userFollows.followerUserId, followingUserId: userFollows.followingUserId }).from(userFollows).where(and(inArray(userFollows.followerUserId, [viewerUserId, targetUserId]), inArray(userFollows.followingUserId, [viewerUserId, targetUserId])));
    isFollowingViewer = pairRows.some(row => row.followerUserId === viewerUserId && row.followingUserId === targetUserId);
    isFollowingTarget = pairRows.some(row => row.followerUserId === targetUserId && row.followingUserId === viewerUserId);
  }
  const joined = targetRows[0]?.createdAt;
  const joinedMonthYear = joined ? joined.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : "";
  return { followers, followingCount, isFollowingViewer, isFollowingTarget, isMutual: isFollowingViewer && isFollowingTarget, joinedMonthYear };
}

export async function listFollowers(userId: number): Promise<FollowGraphEntry[]> {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ userId: userFollows.followerUserId, followedAt: userFollows.createdAt, companyDomain: referrerFastTrackLinks.companyDomain }).from(userFollows).leftJoin(referrerFastTrackLinks, and(eq(referrerFastTrackLinks.referrerId, userFollows.followerUserId), eq(referrerFastTrackLinks.isActive, true))).where(eq(userFollows.followingUserId, userId)).orderBy(desc(userFollows.createdAt)).limit(100);
  return rows.map(row => ({ userId: row.userId, label: row.companyDomain ? `Referrer · ${row.companyDomain}` : "Member", followedAt: row.followedAt }));
}

export async function listFollowing(userId: number): Promise<FollowGraphEntry[]> {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ userId: userFollows.followingUserId, followedAt: userFollows.createdAt, companyDomain: referrerFastTrackLinks.companyDomain }).from(userFollows).leftJoin(referrerFastTrackLinks, and(eq(referrerFastTrackLinks.referrerId, userFollows.followingUserId), eq(referrerFastTrackLinks.isActive, true))).where(eq(userFollows.followerUserId, userId)).orderBy(desc(userFollows.createdAt)).limit(100);
  return rows.map(row => ({ userId: row.userId, label: row.companyDomain ? `Referrer · ${row.companyDomain}` : "Member", followedAt: row.followedAt }));
}

export type DmThreadSummary = { counterpartUserId: number; counterpartLabel: string; lastMessageBody: string; lastMessageIsMine: boolean; lastMessageAt: Date; unreadCount: number };
export type DmThreadMessage = { id: number; body: string; createdAt: Date; isMine: boolean };

export async function dmCounterpartLabel(counterpartUserId: number) {
  const db = await getDb(); if (!db) return "Member";
  const rows = await db.select({ companyDomain: referrerFastTrackLinks.companyDomain }).from(referrerFastTrackLinks).where(and(eq(referrerFastTrackLinks.referrerId, counterpartUserId), eq(referrerFastTrackLinks.isActive, true))).limit(1);
  return rows[0] ? `Referrer · ${rows[0].companyDomain}` : "Member";
}

export async function hasActivePremiumSubscription(userId: number, now: Date = new Date()) {
  const db = await getDb(); if (!db) return false;
  const wallets = await db.select({ plan: tokenBalances.plan, subscriptionStatus: tokenBalances.subscriptionStatus, subscriptionCurrentTermEnd: tokenBalances.subscriptionCurrentTermEnd }).from(tokenBalances).where(eq(tokenBalances.userId, userId));
  return wallets.some(wallet => wallet.plan !== "free" && (wallet.subscriptionStatus === "active" || wallet.subscriptionStatus === "non_renewing") && Boolean(wallet.subscriptionCurrentTermEnd && wallet.subscriptionCurrentTermEnd > now));
}

export async function dmThreadExists(userId: number, counterpartUserId: number) {
  const db = await getDb(); if (!db) return false;
  const rows = await db.select({ id: messages.id }).from(messages).where(and(isNull(messages.referralRequestId), or(and(eq(messages.senderId, userId), eq(messages.recipientId, counterpartUserId)), and(eq(messages.senderId, counterpartUserId), eq(messages.recipientId, userId))))).limit(1);
  return rows.length > 0;
}

export async function dmRecipientExists(userId: number) {
  const db = await getDb(); if (!db) return false;
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  return rows.length > 0;
}

export async function listDmThreads(userId: number): Promise<DmThreadSummary[]> {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ id: messages.id, body: messages.body, createdAt: messages.createdAt, senderId: messages.senderId, recipientId: messages.recipientId, readAt: messages.readAt }).from(messages).where(and(isNull(messages.referralRequestId), or(eq(messages.senderId, userId), eq(messages.recipientId, userId)))).orderBy(desc(messages.createdAt), desc(messages.id));
  const threads = new Map<number, DmThreadSummary>();
  for (const row of rows) {
    const counterpartUserId = row.senderId === userId ? row.recipientId : row.senderId;
    const existing = threads.get(counterpartUserId);
    if (existing) { if (row.recipientId === userId && !row.readAt) existing.unreadCount += 1; continue; }
    threads.set(counterpartUserId, { counterpartUserId, counterpartLabel: "Member", lastMessageBody: row.body.slice(0, 120), lastMessageIsMine: row.senderId === userId, lastMessageAt: row.createdAt, unreadCount: row.recipientId === userId && !row.readAt ? 1 : 0 });
  }
  await Promise.all(Array.from(threads.keys()).map(async counterpartUserId => {
    const thread = threads.get(counterpartUserId);
    if (thread) thread.counterpartLabel = await dmCounterpartLabel(counterpartUserId);
  }));
  return Array.from(threads.values());
}

export async function listDmThread(userId: number, counterpartUserId: number): Promise<{ counterpartUserId: number; counterpartLabel: string; messages: DmThreadMessage[] } | undefined> {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select({ id: messages.id, body: messages.body, createdAt: messages.createdAt, senderId: messages.senderId }).from(messages).where(and(isNull(messages.referralRequestId), or(and(eq(messages.senderId, userId), eq(messages.recipientId, counterpartUserId)), and(eq(messages.senderId, counterpartUserId), eq(messages.recipientId, userId))))).orderBy(asc(messages.createdAt), asc(messages.id));
  if (!rows.length) return undefined;
  await db.update(messages).set({ readAt: new Date() }).where(and(isNull(messages.referralRequestId), eq(messages.recipientId, userId), eq(messages.senderId, counterpartUserId), isNull(messages.readAt)));
  return { counterpartUserId, counterpartLabel: await dmCounterpartLabel(counterpartUserId), messages: rows.map(row => ({ id: row.id, body: row.body, createdAt: row.createdAt, isMine: row.senderId === userId })) };
}

export async function sendDirectMessage(userId: number, recipientId: number, body: string) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const result = await db.insert(messages).values({ senderId: userId, recipientId, body: body.slice(0, 3000), referralRequestId: null });
  await db.insert(notifications).values({ userId: recipientId, category: "message", title: "New direct message", body: "You have a new message from a member." });
  return { id: Number(result[0].insertId) };
}


export async function listMessages(userId: number) { const db = await getDb(); if (!db) return []; return db.select().from(messages).where(or(eq(messages.senderId, userId), eq(messages.recipientId, userId))).orderBy(desc(messages.createdAt)); }
export async function sendMessage(userId: number, input: { recipientId: number; body: string; referralRequestId?: number }) { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const result = await db.insert(messages).values({ senderId: userId, recipientId: input.recipientId, body: input.body, referralRequestId: input.referralRequestId }); await db.insert(notifications).values({ userId: input.recipientId, category: "message", title: "New message", body: "You have a new message in Bridge." }); return { id: Number(result[0].insertId) }; }
export async function listNotifications(userId: number) { const db = await getDb(); if (!db) return []; return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)); }
export async function markNotificationRead(userId: number, notificationId: number) { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId))); return { success: true }; }
export async function countRecentMessagesBySender(userId: number, since: Date) {
  const db = await getDb(); if (!db) return 0;
  const [rows] = await db.select({ count: sql<number>`count(*)` }).from(messages).where(and(eq(messages.senderId, userId), gt(messages.createdAt, since)));
  return Number(rows?.count ?? 0);
}
export async function getUserEmailById(userId: number) {
  const db = await getDb(); if (!db) return null;
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.email ?? null;
}
export async function createNotification(userId: number, category: "referral" | "message" | "status" | "system", title: string, body: string) {
  const db = await getDb(); if (!db) return;
  await db.insert(notifications).values({ userId, category, title, body });
}

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
    // Action-gated: no credits for verifying alone. Both sides earn when the
    // invited referrer actually accepts a request, or the seeker sends one.
    await tx.insert(tokenTransactions).values([{ userId: invitation.inviterUserId, role: "job_seeker", tokenCount: COMPANY_COVERAGE_REWARD_TOKENS, kind: "invite_reward_pending" }, { userId: joinerUserId, role: "referrer", tokenCount: COMPANY_COVERAGE_REWARD_TOKENS, kind: "invite_reward_pending" }]);
    await tx.insert(notifications).values([{ userId: invitation.inviterUserId, category: "system", title: "Company coverage pending reward", body: "A matching employee verified their work email. One referral credit unlocks after your next referral action." }, { userId: joinerUserId, category: "system", title: "Coverage credit pending", body: "Welcome to private company coverage. One referral credit unlocks after you accept your first private referral request." }]);
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
      // Action-gated: credits are recorded as pending and unlock only after the
      // recipient performs a real referral action (send request / accept one).
      await tx.insert(tokenTransactions).values([
        { userId: invitation.inviterUserId, role: "job_seeker", tokenCount: PERSONAL_REFERRAL_REWARD_TOKENS, kind: "invite_reward_pending" },
        { userId: joinerUserId, role: "job_seeker", tokenCount: PERSONAL_REFERRAL_REWARD_TOKENS, kind: "invite_reward_pending" },
      ]);
      await tx.insert(notifications).values([
        { userId: invitation.inviterUserId, category: "system", title: "Invite reward pending", body: "A friend joined with your link. One extra referral credit unlocks after your next referral action." },
        { userId: joinerUserId, category: "system", title: "Invite credit pending", body: "You joined with an invite. One extra referral credit unlocks after you send or accept your first private referral request." },
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
    // Locked: newBalance is computed here and written as an absolute value, so a
    // concurrent spend could otherwise be undone by this stale write.
    const wallet = await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, input.recipientUserId), eq(tokenBalances.role, input.role))).limit(1).for("update");
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

// ---- Action-gated viral rewards ----
// Credits from invites (personal or company coverage) are earned only when the
// recipient performs a real action: a Job Seeker sends a private referral
// request; a Referrer claims and accepts a referral request. Joining grants
// nothing, which removes the incentive to farm sign-ups.
export async function grantPendingActionRewards(userId: number, role: WalletRole) {
  const db = await getDb(); if (!db) return;
  try {
    await db.transaction(async tx => {
      const pending = await tx.select().from(tokenTransactions).where(and(eq(tokenTransactions.userId, userId), eq(tokenTransactions.kind, "invite_reward_pending")));
      if (pending.length === 0) return;
      // Locked for the same reason as spendToken: the balance is written back as
      // an absolute value, so a concurrent write would be lost.
      const wallet = await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, role))).limit(1).for("update");
      const total = pending.reduce((sum, row) => sum + Number(row.tokenCount), 0);
      if (wallet[0]) await tx.update(tokenBalances).set({ balance: wallet[0].balance + total }).where(eq(tokenBalances.id, wallet[0].id));
      else await tx.insert(tokenBalances).values({ userId, role, balance: total, monthlyCreditsRemaining: FREE_MONTHLY_ALLOWANCE, monthlyAllowance: FREE_MONTHLY_ALLOWANCE, monthlyCycleKey: currentMonthlyCycleKey() });
      for (const row of pending) {
        await tx.update(tokenTransactions).set({ kind: "invite_reward_granted" }).where(eq(tokenTransactions.id, row.id));
      }
      await tx.insert(notifications).values({ userId, category: "system", title: "Referral credits unlocked", body: `Your ${total} invite credit${total === 1 ? "" : "s"} were added after your first referral action. Keep going!` });
    });
  } catch (error) {
    console.warn("[Credits] Failed to grant pending action rewards:", error);
  }
}

export async function spendToken(userId: number, role: WalletRole) {
  await grantPendingActionRewards(userId, role);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await ensureTokenWallet(userId, role);
  return db.transaction(async tx => {
    // FOR UPDATE, not a plain read: the update below writes an absolute value
    // computed here, so two concurrent spends (a double-tapped send button is
    // enough) would both read the same balance, both compute the same decrement,
    // and both write it — deducting one credit for two referral requests. The
    // row lock makes the second transaction wait and re-read the fresh value.
    // The employer equivalents (spendEmployerUnlockCredit, sponsorCompanyOpportunity)
    // already lock for this reason.
    const current = await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, role))).limit(1).for("update");
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

// Read-only correlation for direct-gateway webhook deliveries (Razorpay/PayPal):
// reports whether an event's checkoutIntentId matches a Chargebee-initiated
// fulfillment row. Never writes and never credits — Chargebee remains the
// billing source of truth; this only makes webhook acks honest about matching.
export async function recordGatewayPaymentEvent(input: { provider: "razorpay" | "paypal"; eventId: string; eventType: string; checkoutIntentId?: string }) {
  if (!input.checkoutIntentId) return { matched: false };
  const db = await getDb();
  if (!db) return { matched: false };
  const row = await db.select({ id: paymentFulfillments.id }).from(paymentFulfillments).where(and(eq(paymentFulfillments.provider, "chargebee"), eq(paymentFulfillments.checkoutIntentId, input.checkoutIntentId))).limit(1);
  return { matched: row.length > 0 };
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

export async function listRequiresReviewPayments(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: paymentFulfillments.id, provider: paymentFulfillments.provider, providerHostedPageId: paymentFulfillments.providerHostedPageId, checkoutIntentId: paymentFulfillments.checkoutIntentId, userId: paymentFulfillments.userId, role: paymentFulfillments.role, tokenCount: paymentFulfillments.tokenCount, amount: paymentFulfillments.amount, currency: paymentFulfillments.currency, reconciliationReason: paymentFulfillments.reconciliationReason, createdAt: paymentFulfillments.createdAt, userEmail: users.email }).from(paymentFulfillments).innerJoin(users, eq(paymentFulfillments.userId, users.id)).where(eq(paymentFulfillments.status, "requires_review")).orderBy(desc(paymentFulfillments.createdAt)).limit(Math.max(1, Math.min(limit, 250)));
}

export async function resolveRequiresReviewPayment(adminUserId: number, paymentId: number, decision: "credited" | "rejected", note?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    // FOR UPDATE so two concurrent admin decisions (a double-submitted review,
    // or two admins) cannot both pass the requires_review check below. The
    // wallet credit is an atomic `balance + tokenCount` increment, so without
    // the lock both increments would land and the user would be credited twice
    // for one payment.
    const rows = await tx.select().from(paymentFulfillments).where(eq(paymentFulfillments.id, paymentId)).limit(1).for("update");
    const row = rows[0];
    if (!row) throw new Error("This payment record does not exist");
    if (row.status !== "requires_review") throw new Error("This payment was already resolved");
    if (decision === "credited") {
      // Mirror fulfillChargebeePayment's wallet update: balance increment when a
      // wallet row exists, otherwise create the wallet with the credited tokens.
      const wallet = await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, row.userId), eq(tokenBalances.role, row.role))).limit(1);
      if (wallet[0]) await tx.update(tokenBalances).set({ balance: sql`${tokenBalances.balance} + ${row.tokenCount}` }).where(eq(tokenBalances.id, wallet[0].id));
      else await tx.insert(tokenBalances).values({ userId: row.userId, role: row.role, balance: row.tokenCount, monthlyCreditsRemaining: FREE_MONTHLY_ALLOWANCE, monthlyAllowance: FREE_MONTHLY_ALLOWANCE, monthlyCycleKey: currentMonthlyCycleKey() });
      await tx.insert(tokenTransactions).values({ userId: row.userId, role: row.role, tokenCount: row.tokenCount, kind: "purchase" });
    }
    const statusUpdate = await tx.update(paymentFulfillments).set({ status: decision, creditedAt: decision === "credited" ? new Date() : null, lastCheckedAt: new Date() }).where(and(eq(paymentFulfillments.id, paymentId), eq(paymentFulfillments.status, "requires_review")));
    // Belt and braces with the row lock above: if this decision lost the race,
    // abort so the transaction rolls the wallet credit back rather than leaving
    // a credit with no recorded decision.
    if (Number((statusUpdate as unknown as Array<{ affectedRows: number }>)[0]?.affectedRows ?? 0) !== 1) {
      throw new Error("This payment was already resolved");
    }
    const metadata = { provider: row.provider, tokenCount: row.tokenCount, amount: row.amount, currency: row.currency, note: typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null };
    await tx.insert(operationalActivityLogs).values({ actorUserId: adminUserId, action: `payment.review_${decision}`, outcome: "success", resourceType: "payment_fulfillment", resourceId: String(paymentId), metadata: JSON.stringify(metadata) });
    return { paymentId, decision, tokenCount: row.tokenCount, userId: row.userId, role: row.role };
  });
}

export async function listRecentPayments(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: paymentFulfillments.id, status: paymentFulfillments.status, provider: paymentFulfillments.provider, providerHostedPageId: paymentFulfillments.providerHostedPageId, checkoutIntentId: paymentFulfillments.checkoutIntentId, userId: paymentFulfillments.userId, role: paymentFulfillments.role, tokenCount: paymentFulfillments.tokenCount, amount: paymentFulfillments.amount, currency: paymentFulfillments.currency, reconciliationReason: paymentFulfillments.reconciliationReason, createdAt: paymentFulfillments.createdAt, userEmail: users.email }).from(paymentFulfillments).innerJoin(users, eq(paymentFulfillments.userId, users.id)).where(inArray(paymentFulfillments.status, ["credited", "refunded"])).orderBy(desc(paymentFulfillments.createdAt)).limit(Math.max(1, Math.min(limit, 250)));
}
export async function refundCreditedPayment(adminUserId: number, paymentId: number, note?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const rows = await tx.select().from(paymentFulfillments).where(and(eq(paymentFulfillments.id, paymentId), inArray(paymentFulfillments.provider, ["chargebee", "razorpay", "paypal"]), eq(paymentFulfillments.status, "credited"))).limit(1);
    const row = rows[0];
    if (!row) throw new Error("This payment cannot be refunded");
    // Locked: the debit is an absolute value derived from this read, so a
    // concurrent credit would otherwise be lost by the stale write below.
    const wallet = await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, row.userId), eq(tokenBalances.role, row.role))).limit(1).for("update");
    if (wallet[0]) await tx.update(tokenBalances).set({ balance: Math.max(0, wallet[0].balance - row.tokenCount) }).where(eq(tokenBalances.id, wallet[0].id));
    await tx.insert(tokenTransactions).values({ userId: row.userId, role: row.role, tokenCount: -row.tokenCount, kind: "admin_adjustment" });
    const updated = await tx.update(paymentFulfillments).set({ status: "refunded", lastCheckedAt: new Date() }).where(and(eq(paymentFulfillments.id, paymentId), eq(paymentFulfillments.status, "credited")));
    if (Number(updated[0]?.affectedRows ?? 0) !== 1) throw new Error("This payment cannot be refunded");
    const metadata = { provider: row.provider, amount: row.amount, currency: row.currency, tokenCount: row.tokenCount, note: typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null };
    await tx.insert(operationalActivityLogs).values({ actorUserId: adminUserId, action: "payment.refunded", outcome: "success", resourceType: "payment_fulfillment", resourceId: String(paymentId), metadata: JSON.stringify(metadata) });
    return { paymentId, refunded: true, tokenCount: row.tokenCount, userId: row.userId, role: row.role, provider: row.provider, amount: row.amount, currency: row.currency };
  });
}
export async function getRevenueSummary() {
  const db = await getDb();
  if (!db) return { byProvider: [], totalsByCurrency: [], refundedTotalByCurrency: [], recordedAt: new Date() };
  const credited = await db.select({ provider: paymentFulfillments.provider, currency: paymentFulfillments.currency, totalAmount: sql<number>`sum(${paymentFulfillments.amount})`, count: count() }).from(paymentFulfillments).where(eq(paymentFulfillments.status, "credited")).groupBy(paymentFulfillments.provider, paymentFulfillments.currency);
  const refunded = await db.select({ currency: paymentFulfillments.currency, totalAmount: sql<number>`sum(${paymentFulfillments.amount})`, count: count() }).from(paymentFulfillments).where(eq(paymentFulfillments.status, "refunded")).groupBy(paymentFulfillments.currency);
  const byCurrency = new Map<string, { currency: string; totalAmount: number; count: number }>();
  for (const row of credited) {
    const agg = byCurrency.get(row.currency) ?? { currency: row.currency, totalAmount: 0, count: 0 };
    agg.totalAmount += Number(row.totalAmount ?? 0); agg.count += Number(row.count ?? 0); byCurrency.set(row.currency, agg);
  }
  return { byProvider: credited.map(row => ({ provider: row.provider, currency: row.currency, totalAmount: Number(row.totalAmount ?? 0), count: Number(row.count ?? 0) })), totalsByCurrency: Array.from(byCurrency.values()), refundedTotalByCurrency: refunded.map(row => ({ currency: row.currency, totalAmount: Number(row.totalAmount ?? 0), count: Number(row.count ?? 0) })), recordedAt: new Date() };
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
    return { status: "applied" as const, plan: patch.plan, userId, role, creditSummary: creditSummaryFromWallet({ ...(wallet ?? { userId, role, balance: 0, monthlyCreditsRemaining: allowance, monthlyAllowance: allowance, monthlyCycleKey: currentMonthlyCycleKey(), plan: expectedPlan, subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, id: 0, updatedAt: new Date() }), ...patch }) };
  });
}

// ---- Unified admin approval queue (seeker requests, referrer enrollments, payments) ----

export type AdminApprovalQueueKind = "referral_request" | "referrer_enrollment" | "payment";
export type AdminApprovalQueueStatus = "pending" | "under_review" | "approved" | "declined" | "requires_review";
export type AdminApprovalQueueItem = {
  kind: AdminApprovalQueueKind;
  id: number;
  status: AdminApprovalQueueStatus;
  companyDomain: string;
  provider?: string | null;
  amount?: number | null;
  currency?: string | null;
  createdAt: Date;
  updatedAt: Date;
  summary: string;
  meta: {
    claimTime?: Date | null;
    otpTime?: Date | null;
    tokenCount?: number | null;
    reason?: string | null;
    seekerName?: string | null;
    seekerEmail?: string | null;
    referrerName?: string | null;
    referrerEmail?: string | null;
    roleTitle?: string | null;
    targetRoleUrl?: string | null;
    pitch?: string | null;
    role?: string | null;
    userEmail?: string | null;
    waitingForCoverage?: boolean | null;
    creditReserved?: boolean | null;
    approvalNote?: string | null;
  };
};

/**
 * Verified referrers who have never taken a referral action (claimed, reviewed,
 * or accepted a request). The enrollment itself is enrolled the moment a work
 * email OTP verifies; the admin triage item is the non-action state.
 */
export async function listReferrerEnrollmentsAwaitingAction() {
  const db = await getDb(); if (!db) return [];
  const verified = await db.select({ userId: profiles.userId, name: users.name, email: users.email, companyDomain: profiles.workEmailDomain, verifiedAt: profiles.workEmailVerifiedAt, createdAt: profiles.createdAt, updatedAt: profiles.updatedAt }).from(profiles).innerJoin(users, eq(profiles.userId, users.id)).where(and(eq(profiles.accountType, "referrer"), isNotNull(profiles.workEmailVerifiedAt)));
  const acted = await db.select({ referrerId: referralRequests.referrerId }).from(referralRequests).where(isNotNull(referralRequests.referrerId));
  const actedUserIds = new Set(acted.map(row => row.referrerId));
  return verified.filter(row => !actedUserIds.has(row.userId)).map(row => ({ ...row, companyDomain: row.companyDomain ?? "" }));
}

function adminApprovalStatusFromActivity(action: string): AdminApprovalQueueStatus | undefined {
  if (action === "admin.approval_approved") return "approved";
  if (action === "admin.approval_rejected") return "declined";
  return undefined;
}

export async function listAdminApprovalQueue(limit: number = 100) {
  const db = await getDb(); if (!db) return [];
  const safeLimit = Math.max(1, Math.min(250, Math.floor(limit)));
  const referrerUser = alias(users, "referrerUser");
  const [requests, payments, enrollments, enrollmentDecisions] = await Promise.all([
    db.select({ id: referralRequests.id, status: referralRequests.status, companyDomain: jobs.company, referrerId: referralRequests.referrerId, waitingForCoverage: referralRequests.waitingForCoverage, personalPitch: referralRequests.personalPitch, createdAt: referralRequests.createdAt, updatedAt: referralRequests.updatedAt, roleTitle: jobs.title, targetRoleUrl: jobs.targetRoleUrl, seekerName: users.name, seekerEmail: users.email, referrerName: referrerUser.name, referrerEmail: referrerUser.email }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).innerJoin(users, eq(referralRequests.jobSeekerId, users.id)).leftJoin(referrerUser, eq(referralRequests.referrerId, referrerUser.id)).where(inArray(referralRequests.status, ["pending", "approved", "declined"])).orderBy(desc(referralRequests.updatedAt)).limit(safeLimit),
    db.select({ id: paymentFulfillments.id, provider: paymentFulfillments.provider, amount: paymentFulfillments.amount, currency: paymentFulfillments.currency, tokenCount: paymentFulfillments.tokenCount, status: paymentFulfillments.status, reconciliationReason: paymentFulfillments.reconciliationReason, role: paymentFulfillments.role, createdAt: paymentFulfillments.createdAt, lastCheckedAt: paymentFulfillments.lastCheckedAt, creditedAt: paymentFulfillments.creditedAt, userEmail: users.email }).from(paymentFulfillments).innerJoin(users, eq(paymentFulfillments.userId, users.id)).where(inArray(paymentFulfillments.status, ["requires_review", "credited", "rejected"])).orderBy(desc(paymentFulfillments.lastCheckedAt), desc(paymentFulfillments.createdAt)).limit(safeLimit),
    listReferrerEnrollmentsAwaitingAction(),
    db.select({ resourceId: operationalActivityLogs.resourceId, action: operationalActivityLogs.action, metadata: operationalActivityLogs.metadata, createdAt: operationalActivityLogs.createdAt }).from(operationalActivityLogs).where(and(eq(operationalActivityLogs.resourceType, "referrer_enrollment"), like(operationalActivityLogs.action, "admin.approval_%"))).orderBy(desc(operationalActivityLogs.createdAt)).limit(safeLimit),
  ]);
  const enrollmentDecisionById = new Map<string, { status: AdminApprovalQueueStatus; note?: string | null }>();
  for (const decision of enrollmentDecisions) {
    if (!decision.resourceId || enrollmentDecisionById.has(decision.resourceId)) continue;
    const status = adminApprovalStatusFromActivity(decision.action); if (!status) continue;
    let note: string | null = null;
    try { note = (JSON.parse(decision.metadata ?? "{}") as { note?: string | null }).note ?? null; } catch { note = null; }
    enrollmentDecisionById.set(decision.resourceId, { status, note });
  }
  const items: AdminApprovalQueueItem[] = [];
  for (const request of requests) {
    const status: AdminApprovalQueueStatus = request.status === "pending" ? request.referrerId ? "under_review" : "pending" : request.status === "approved" ? "approved" : "declined";
    const pitch = (request.personalPitch ?? "").trim();
    items.push({
      kind: "referral_request", id: request.id, status, companyDomain: request.companyDomain, createdAt: request.createdAt, updatedAt: request.updatedAt,
      summary: request.status === "pending" && !request.referrerId && request.waitingForCoverage ? "Waiting for company coverage — no verified employee has claimed this yet" : (pitch ? pitch.slice(0, 220) : "Private referral request awaiting a decision"),
      meta: { claimTime: request.referrerId ? request.updatedAt : null, tokenCount: 1, creditReserved: true, waitingForCoverage: request.waitingForCoverage, seekerName: request.seekerName, seekerEmail: request.seekerEmail, referrerName: request.referrerName, referrerEmail: request.referrerEmail, roleTitle: request.roleTitle, targetRoleUrl: request.targetRoleUrl, pitch },
    });
  }
  for (const payment of payments) {
    const status: AdminApprovalQueueStatus = payment.status === "requires_review" ? "requires_review" : payment.status === "credited" ? "approved" : "declined";
    items.push({
      kind: "payment", id: payment.id, status, companyDomain: "", provider: payment.provider, amount: payment.amount, currency: payment.currency, createdAt: payment.createdAt, updatedAt: payment.lastCheckedAt ?? payment.creditedAt ?? payment.createdAt,
      summary: payment.reconciliationReason ?? "Credit-pack payment flagged for manual reconciliation",
      meta: { tokenCount: payment.tokenCount, reason: payment.reconciliationReason, role: payment.role, userEmail: payment.userEmail },
    });
  }
  for (const enrollment of enrollments) {
    const decision = enrollmentDecisionById.get(String(enrollment.userId));
    items.push({
      kind: "referrer_enrollment", id: enrollment.userId, status: decision?.status ?? "under_review", companyDomain: enrollment.companyDomain, createdAt: enrollment.createdAt, updatedAt: enrollment.updatedAt,
      summary: decision?.status === "approved" ? "Enrollment approved by an administrator" : decision?.status === "declined" ? "Enrollment rejected by an administrator" : "Work email verified · awaiting a first referral action",
      meta: { otpTime: enrollment.verifiedAt, referrerName: enrollment.name, referrerEmail: enrollment.email, approvalNote: decision?.note ?? null },
    });
  }
  return items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, safeLimit);
}

export async function resolveAdminApproval(adminUserId: number, itemKind: AdminApprovalQueueKind, itemId: number, decision: "approved" | "rejected", note?: string) {
  const trimmedNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null;
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (itemKind === "referrer_enrollment") {
    // Enrollments have no clean status column, so the decision lives on the
    // audit trail only (metadata carries the admin note).
    const row = await db.select({ id: profiles.id, companyDomain: profiles.workEmailDomain }).from(profiles).where(and(eq(profiles.userId, itemId), eq(profiles.accountType, "referrer"), isNotNull(profiles.workEmailVerifiedAt))).limit(1);
    if (!row[0]) throw new Error("This enrollment record could not be found");
    await db.insert(operationalActivityLogs).values({ actorUserId: adminUserId, action: `admin.approval_${decision}`, outcome: "success", resourceType: "referrer_enrollment", resourceId: String(itemId), companyDomain: row[0].companyDomain ?? undefined, metadata: JSON.stringify(trimmedNote ? { note: trimmedNote } : {}) });
    return { kind: itemKind, id: itemId, status: decision === "approved" ? "approved" as const : "declined" as const, note: trimmedNote };
  }
  if (itemKind === "payment") {
    // Approving a credit pack credits the tokens, mirroring the payment review
    // workflow; the row's own audit entry is written by the resolver.
    const result = await resolveRequiresReviewPayment(adminUserId, itemId, decision === "approved" ? "credited" : "rejected", trimmedNote ?? undefined);
    return { kind: itemKind, id: itemId, status: decision === "approved" ? "approved" as const : "declined" as const, tokenCount: result.tokenCount };
  }
  return db.transaction(async tx => {
    const rows = await tx.select({ id: referralRequests.id, status: referralRequests.status, companyDomain: jobs.company }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(eq(referralRequests.id, itemId)).limit(1);
    const row = rows[0];
    if (!row) throw new Error("This referral request could not be found");
    if (row.status !== "pending") throw new Error("This record was already resolved");
    const nextStatus = decision === "approved" ? "approved" : "declined";
    const updated = await tx.update(referralRequests).set({ status: nextStatus }).where(and(eq(referralRequests.id, itemId), eq(referralRequests.status, "pending")));
    if (Number(updated[0]?.affectedRows ?? 0) !== 1) throw new Error("This record was already resolved");
    await tx.insert(operationalActivityLogs).values({ actorUserId: adminUserId, action: `admin.approval_${decision}`, outcome: "success", resourceType: "referral_request", resourceId: String(itemId), companyDomain: row.companyDomain, metadata: JSON.stringify(trimmedNote ? { status: nextStatus, note: trimmedNote } : { status: nextStatus }) });
    return { kind: itemKind, id: itemId, status: nextStatus as AdminApprovalQueueStatus };
  });
}

// ---- B2B monetization (employer accounts, unlock credits, sponsored roles, partners) ----

// One unlock costs 5 employer credits; sponsorships price per tier below.
export const EMPLOYER_UNLOCK_CREDIT_COST = 5;
export const SPONSOR_TIERS = {
  featured: { days: 7, cost: 10 },
  spotlight: { days: 30, cost: 25 },
} as const;
export type SponsorTier = keyof typeof SPONSOR_TIERS;
export const UNLOCK_CREDIT_PACKS = {
  starter: { credits: 10, amountInPaise: 2900 },
  growth: { credits: 50, amountInPaise: 12900 },
  scale: { credits: 200, amountInPaise: 39900 },
} as const;
export type UnlockCreditPackId = keyof typeof UNLOCK_CREDIT_PACKS;

const talentDisplayRef = (userId: number) => `Talent-${String(userId).padStart(4, "0")}`;
const firstSkillKeywords = (skills: string | null) => (skills ?? "").split(/[,;|]/).map(skill => skill.trim()).filter(Boolean).slice(0, 5);

export async function ensureEmployerAccount(userId: number, companyName: string, billingEmail: string) {
  const name = companyName.trim().slice(0, 160);
  const email = billingEmail.trim().toLowerCase().slice(0, 320);
  if (!name) throw new Error("Add your company name to open an employer account");
  if (!email || !email.includes("@")) throw new Error("Add a billing email for your employer account");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const existing = await db.select().from(employerAccounts).where(eq(employerAccounts.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(profiles).values({ userId, accountType: "employer", company: name, isOnboarded: true }).onDuplicateKeyUpdate({ set: { accountType: "employer", company: name } });
  try {
    await db.insert(employerAccounts).values({ userId, companyName: name, billingEmail: email });
  } catch (error) {
    if ((error as { code?: string }).code !== "ER_DUP_ENTRY") throw error;
  }
  return (await db.select().from(employerAccounts).where(eq(employerAccounts.userId, userId)).limit(1))[0];
}

export async function getEmployerAccount(userId: number) {
  const db = await getDb(); if (!db) return undefined;
  return (await db.select().from(employerAccounts).where(eq(employerAccounts.userId, userId)).limit(1))[0];
}

// Self-serve = employer role. ensureEmployerAccount flips the profile to
// accountType "employer" (no work-email verification required per PRD).
export async function isEmployer(userId: number) {
  const profile = await getProfileByUserId(userId);
  return profile?.accountType === "employer";
}

export async function spendEmployerUnlockCredit(employerUserId: number, seekerUserId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const account = (await tx.select().from(employerAccounts).where(eq(employerAccounts.userId, employerUserId)).limit(1).for("update"))[0];
    if (!account) return { ok: false as const, reason: "no_employer_account" as const, credits: 0 };
    if (account.credits < EMPLOYER_UNLOCK_CREDIT_COST) return { ok: false as const, reason: "insufficient_credits" as const, credits: account.credits };
    const alreadyUnlocked = await tx.select({ id: profileUnlocks.id }).from(profileUnlocks).where(and(eq(profileUnlocks.employerUserId, employerUserId), eq(profileUnlocks.seekerProfileUserId, seekerUserId))).limit(1);
    if (alreadyUnlocked[0]) return { ok: true as const, remaining: account.credits, alreadyUnlocked: true as const };
    const credits = account.credits - EMPLOYER_UNLOCK_CREDIT_COST;
    await tx.update(employerAccounts).set({ credits }).where(eq(employerAccounts.id, account.id));
    await tx.insert(profileUnlocks).values({ employerUserId, seekerProfileUserId: seekerUserId, creditsSpent: EMPLOYER_UNLOCK_CREDIT_COST });
    return { ok: true as const, remaining: credits };
  });
}

// Anonymized talent discovery. HARD invariant: never selects name, email,
// resumeUrl, phone, or any users column beyond the join key.
export type AnonymizedSeekerProfile = { userId: number; displayRef: string; headline: string | null; location: string | null; skills: string[]; isUnlocked: boolean };

export async function listAnonymizedSeekerProfiles(employerUserId: number, input: { query?: string; location?: string } = {}) {
  const db = await getDb(); if (!db) return [] as AnonymizedSeekerProfile[];
  const rows = await db.select({ userId: profiles.userId, headline: profiles.headline, location: profiles.location, skills: profiles.skills, experience: profiles.experience }).from(profiles).where(and(eq(profiles.accountType, "job_seeker"), eq(profiles.anonymityOptIn, true), eq(profiles.isOnboarded, true)));
  const unlocked = new Set((await db.select({ seekerId: profileUnlocks.seekerProfileUserId }).from(profileUnlocks).where(eq(profileUnlocks.employerUserId, employerUserId))).map(row => row.seekerId));
  const term = input.query?.trim().toLowerCase();
  const locationTerm = input.location?.trim().toLowerCase();
  return rows
    .filter(row => (!term || `${row.headline ?? ""} ${row.skills ?? ""} ${row.experience ?? ""}`.toLowerCase().includes(term)) && (!locationTerm || (row.location ?? "").toLowerCase().includes(locationTerm)))
    .slice(0, 60)
    .map(row => ({ userId: row.userId, displayRef: talentDisplayRef(row.userId), headline: row.headline, location: row.location, skills: firstSkillKeywords(row.skills), isUnlocked: unlocked.has(row.userId) }));
}

// Fuller profile for an unlocked pair — still never email, name, or resume.
export async function getUnlockedProfile(employerUserId: number, seekerUserId: number) {
  const db = await getDb(); if (!db) return undefined;
  const unlocked = await db.select({ id: profileUnlocks.id, unlockedAt: profileUnlocks.unlockedAt }).from(profileUnlocks).where(and(eq(profileUnlocks.employerUserId, employerUserId), eq(profileUnlocks.seekerProfileUserId, seekerUserId))).limit(1);
  if (!unlocked[0]) return undefined;
  const profile = await db.select({ headline: profiles.headline, location: profiles.location, skills: profiles.skills, experience: profiles.experience, expertise: profiles.expertise }).from(profiles).where(and(eq(profiles.userId, seekerUserId), eq(profiles.accountType, "job_seeker"))).limit(1);
  if (!profile[0]) return undefined;
  return { displayRef: talentDisplayRef(seekerUserId), headline: profile[0].headline, location: profile[0].location, skills: firstSkillKeywords(profile[0].skills), experience: profile[0].experience, expertise: profile[0].expertise, unlockedAt: unlocked[0].unlockedAt };
}

export async function sponsorCompanyOpportunity(userId: number, opportunityId: number, input: { tier: SponsorTier; isAdmin?: boolean }) {
  const tierCost = SPONSOR_TIERS[input.tier];
  if (!tierCost) throw new Error("Choose a featured or spotlight sponsorship tier");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const opportunity = (await tx.select({ id: companyOpportunities.id, ownerId: companyOpportunities.ownerId, companyDomain: companyOpportunities.companyDomain, roleTitle: companyOpportunities.roleTitle }).from(companyOpportunities).where(eq(companyOpportunities.id, opportunityId)).limit(1))[0];
    if (!opportunity) throw new Error("This opportunity could not be found");
    if (!input.isAdmin && opportunity.ownerId !== userId) throw new Error("Only the opportunity owner or an administrator can sponsor this role");
    const account = (await tx.select().from(employerAccounts).where(eq(employerAccounts.userId, userId)).limit(1).for("update"))[0];
    if (!account) throw new Error("Open an employer account before sponsoring a role");
    if (account.credits < tierCost.cost) throw new Error(`Sponsoring costs ${tierCost.cost} unlock credits; you have ${account.credits}`);
    const sponsoredUntil = new Date(Date.now() + tierCost.days * 24 * 60 * 60 * 1000);
    await tx.update(companyOpportunities).set({ sponsoredUntil, sponsoredTier: input.tier }).where(eq(companyOpportunities.id, opportunityId));
    const credits = account.credits - tierCost.cost;
    await tx.update(employerAccounts).set({ credits }).where(eq(employerAccounts.id, account.id));
    const metadata: Record<string, string | number> = { tier: input.tier, days: tierCost.days, creditsSpent: tierCost.cost, creditsRemaining: credits };
    await tx.insert(operationalActivityLogs).values({ actorUserId: userId, action: "employer.opportunity_sponsored", outcome: "success", resourceType: "opportunity", resourceId: String(opportunityId), companyDomain: opportunity.companyDomain, metadata: JSON.stringify(metadata) });
    return { opportunityId, tier: input.tier, sponsoredUntil, creditsSpent: tierCost.cost, credits };
  });
}

export async function endCompanyOpportunitySponsorship(adminUserId: number, opportunityId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const updated = await db.update(companyOpportunities).set({ sponsoredUntil: null, sponsoredTier: null }).where(and(eq(companyOpportunities.id, opportunityId), isNotNull(companyOpportunities.sponsoredUntil)));
  await db.insert(operationalActivityLogs).values({ actorUserId: adminUserId, action: "admin.sponsorship_ended", outcome: Number(updated[0]?.affectedRows ?? 0) === 1 ? "success" : "failure", resourceType: "opportunity", resourceId: String(opportunityId) });
  if (Number(updated[0]?.affectedRows ?? 0) !== 1) throw new Error("This opportunity is not currently sponsored");
  return { opportunityId, ended: true as const };
}

export async function listSponsoredCompanyOpportunities(limit = 50) {
  const db = await getDb(); if (!db) return [];
  return db.select({ id: companyOpportunities.id, companyDomain: companyOpportunities.companyDomain, roleTitle: companyOpportunities.roleTitle, sponsoredTier: companyOpportunities.sponsoredTier, sponsoredUntil: companyOpportunities.sponsoredUntil }).from(companyOpportunities).where(and(eq(companyOpportunities.isActive, true), isNotNull(companyOpportunities.sponsoredUntil))).orderBy(desc(companyOpportunities.sponsoredUntil)).limit(Math.max(1, Math.min(limit, 100)));
}

export async function listEmployerOpportunities(userId: number) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ id: companyOpportunities.id, companyDomain: companyOpportunities.companyDomain, kind: companyOpportunities.kind, roleTitle: companyOpportunities.roleTitle, location: companyOpportunities.location, compensation: companyOpportunities.compensation, isActive: companyOpportunities.isActive, sponsoredTier: companyOpportunities.sponsoredTier, sponsoredUntil: companyOpportunities.sponsoredUntil, createdAt: companyOpportunities.createdAt }).from(companyOpportunities).where(eq(companyOpportunities.ownerId, userId)).orderBy(desc(companyOpportunities.createdAt)).limit(50);
  const now = Date.now();
  return rows.map(row => ({ ...row, isSponsored: Boolean(row.sponsoredUntil && row.sponsoredUntil.getTime() > now) }));
}

// Sponsored-first ordering: active sponsorships (longest window first), then
// organic by recency. Pure so the ordering contract is testable without a DB.
export function orderOpportunitiesSponsoredFirst<T extends { createdAt?: Date | string; sponsoredUntil?: Date | string | null }>(rows: T[]): T[] {
  const now = Date.now();
  const time = (value?: Date | string | null) => (value ? new Date(value).getTime() : 0);
  return [...rows].sort((a, b) => {
    const aSponsored = a.sponsoredUntil ? time(a.sponsoredUntil) > now : false;
    const bSponsored = b.sponsoredUntil ? time(b.sponsoredUntil) > now : false;
    if (aSponsored !== bSponsored) return aSponsored ? -1 : 1;
    if (aSponsored && bSponsored && time(a.sponsoredUntil) !== time(b.sponsoredUntil)) return time(b.sponsoredUntil) - time(a.sponsoredUntil);
    return time(b.createdAt) - time(a.createdAt);
  });
}

export async function listPublicCompanyOpportunitiesWithSponsorship() {
  const db = await getDb(); if (!db) return [];
  const base = { id: companyOpportunities.id, companyDomain: companyOpportunities.companyDomain, kind: companyOpportunities.kind, roleTitle: companyOpportunities.roleTitle, targetRoleUrl: companyOpportunities.targetRoleUrl, location: companyOpportunities.location, walkInAt: companyOpportunities.walkInAt, walkInEndsAt: companyOpportunities.walkInEndsAt, createdAt: companyOpportunities.createdAt };
  const attempt = async () => db.select({ ...base, compensation: companyOpportunities.compensation, sponsoredUntil: companyOpportunities.sponsoredUntil, sponsoredTier: companyOpportunities.sponsoredTier }).from(companyOpportunities).where(eq(companyOpportunities.isActive, true)).orderBy(desc(companyOpportunities.createdAt)).limit(24);
  try {
    const rows = await attempt();
    const now = Date.now();
    return orderOpportunitiesSponsoredFirst(rows).map(row => ({ ...row, isSponsored: Boolean(row.sponsoredUntil && new Date(row.sponsoredUntil).getTime() > now) }));
  } catch {
    // Pre-migration fallback mirrors the organic list with sponsor flags off.
    return (await listPublicCompanyOpportunities()).map(row => ({ ...row, sponsoredUntil: null as Date | null, sponsoredTier: null as "featured" | "spotlight" | null, isSponsored: false }));
  }
}

export async function listPartnerModules(input: { category?: PartnerModuleCategory; roleKeywords?: string[]; limit?: number } = {}) {
  const db = await getDb(); if (!db) return [];
  const safeLimit = Math.max(1, Math.min(input.limit ?? 3, 12));
  // The partner modules table can lag a fresh boot (self-heal applies it async);
  // degrade to "no recommendations" instead of surfacing an error on the wall.
  let rows: Array<typeof partnerModules.$inferSelect>;
  try {
    rows = await db.select().from(partnerModules).where(eq(partnerModules.isActive, true)).orderBy(desc(partnerModules.createdAt)).limit(60);
  } catch { return []; }
  const keywords = (input.roleKeywords ?? []).map(word => word.trim().toLowerCase()).filter(word => word.length >= 3);
  const matchesRole = (module: typeof rows[number]) => {
    if (!keywords.length) return true;
    const haystack = `${module.targetRoles ?? ""} ${module.headline}`.toLowerCase();
    return keywords.some(keyword => haystack.includes(keyword));
  };
  const categoryMatched = input.category ? rows.filter(module => module.category === input.category) : rows;
  const roleMatched = categoryMatched.filter(matchesRole);
  // Contextual first (keyword hits), then recent general modules; never repeat.
  const ordered = [...roleMatched, ...categoryMatched.filter(module => !roleMatched.includes(module))];
  return ordered.slice(0, safeLimit);
}

export async function listAllPartnerModules() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(partnerModules).orderBy(desc(partnerModules.createdAt)).limit(100);
}

export async function createPartnerModule(input: { partnerName: string; category: PartnerModuleCategory; headline: string; description?: string; targetRoles?: string; ctaLabel: string; ctaUrl: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  try { new URL(input.ctaUrl); } catch { throw new Error("Use a valid https CTA link for the partner module"); }
  const result = await db.insert(partnerModules).values({ partnerName: input.partnerName.trim().slice(0, 120), category: input.category, headline: input.headline.trim().slice(0, 180), description: input.description?.trim().slice(0, 600) || null, targetRoles: input.targetRoles?.trim().slice(0, 600) || null, ctaLabel: input.ctaLabel.trim().slice(0, 80), ctaUrl: input.ctaUrl.trim().slice(0, 2048) });
  return { id: Number(result[0].insertId) };
}

export async function updatePartnerModule(moduleId: number, patch: { partnerName?: string; category?: PartnerModuleCategory; headline?: string; description?: string | null; targetRoles?: string | null; ctaLabel?: string; ctaUrl?: string; isActive?: boolean }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const clean: Record<string, unknown> = {};
  if (patch.partnerName !== undefined) clean.partnerName = patch.partnerName.trim().slice(0, 120);
  if (patch.category !== undefined) clean.category = patch.category;
  if (patch.headline !== undefined) clean.headline = patch.headline.trim().slice(0, 180);
  if (patch.description !== undefined) clean.description = patch.description === null ? null : patch.description.trim().slice(0, 600) || null;
  if (patch.targetRoles !== undefined) clean.targetRoles = patch.targetRoles === null ? null : patch.targetRoles.trim().slice(0, 600) || null;
  if (patch.ctaLabel !== undefined) clean.ctaLabel = patch.ctaLabel.trim().slice(0, 80);
  if (patch.ctaUrl !== undefined) { try { new URL(patch.ctaUrl); } catch { throw new Error("Use a valid https CTA link for the partner module"); } clean.ctaUrl = patch.ctaUrl.trim().slice(0, 2048); }
  if (patch.isActive !== undefined) clean.isActive = patch.isActive;
  if (!Object.keys(clean).length) return { id: moduleId, updated: false };
  const result = await db.update(partnerModules).set(clean).where(eq(partnerModules.id, moduleId));
  return { id: moduleId, updated: Number(result[0]?.affectedRows ?? 0) === 1 };
}

export async function recordPartnerImpression(moduleId: number) {
  const db = await getDb(); if (!db) return;
  await db.update(partnerModules).set({ impressions: sql`${partnerModules.impressions} + 1` }).where(eq(partnerModules.id, moduleId));
}

export async function recordPartnerClick(moduleId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const result = await db.update(partnerModules).set({ clicks: sql`${partnerModules.clicks} + 1` }).where(eq(partnerModules.id, moduleId));
  return { recorded: Number(result[0]?.affectedRows ?? 0) === 1 };
}

// Razorpay unlock-credit purchase: credit the employer wallet on verified
// capture. Idempotent per provider event via operationalActivityLogs key.
export async function fulfillUnlockCreditPurchase(input: { eventId: string; userId: number; pack: UnlockCreditPackId; amount?: number }) {
  const pack = UNLOCK_CREDIT_PACKS[input.pack];
  if (!pack) return { status: "ignored" as const, reason: "unknown_pack" };
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    // Lock the employer row FIRST, then re-check for a duplicate delivery under
    // that lock. Doing the duplicate check before taking the lock left a window
    // where two concurrent deliveries of the same event both saw no log row and
    // both credited the pack; and because the balance is written as an absolute
    // value, a concurrent spendEmployerUnlockCredit (which does lock) could be
    // overwritten, granting a free unlock. Serialising here closes both.
    const account = (await tx.select().from(employerAccounts).where(eq(employerAccounts.userId, input.userId)).limit(1).for("update"))[0];
    if (!account) return { status: "ignored" as const, reason: "no_employer_account" };
    const duplicate = await tx.select({ id: operationalActivityLogs.id }).from(operationalActivityLogs).where(and(eq(operationalActivityLogs.action, "employer.unlock_credits_fulfilled"), eq(operationalActivityLogs.resourceId, input.eventId))).limit(1);
    if (duplicate[0]) return { status: "duplicate" as const, credits: account.credits };
    if (input.amount !== undefined && input.amount !== pack.amountInPaise) return { status: "ignored" as const, reason: "checkout_amount_mismatch" };
    const credits = account.credits + pack.credits;
    await tx.update(employerAccounts).set({ credits }).where(eq(employerAccounts.id, account.id));
    const metadata: Record<string, string | number> = { pack: input.pack, creditsAdded: pack.credits, credits };
    await tx.insert(operationalActivityLogs).values({ actorUserId: input.userId, action: "employer.unlock_credits_fulfilled", outcome: "success", resourceType: "employer_unlock_purchase", resourceId: input.eventId, metadata: JSON.stringify(metadata) });
    return { status: "credited" as const, credits, creditsAdded: pack.credits };
  });
}

// Open employer unlock-credit purchases against the operational-activity
// ledger (intent written at order creation, fulfilled by the webhook above).
export async function listEmployerSpendHistory(userId: number, limit = 50) {
  const db = await getDb(); if (!db) return [];
  const [unlocks, sponsorships, purchases] = await Promise.all([
    db.select({ kind: sql<string>`'profile_unlock'`, creditsSpent: profileUnlocks.creditsSpent, seekerProfileUserId: profileUnlocks.seekerProfileUserId, createdAt: profileUnlocks.unlockedAt }).from(profileUnlocks).where(eq(profileUnlocks.employerUserId, userId)).orderBy(desc(profileUnlocks.unlockedAt)).limit(limit),
    db.select({ action: operationalActivityLogs.action, resourceId: operationalActivityLogs.resourceId, metadata: operationalActivityLogs.metadata, createdAt: operationalActivityLogs.createdAt }).from(operationalActivityLogs).where(and(eq(operationalActivityLogs.actorUserId, userId), inArray(operationalActivityLogs.action, ["employer.opportunity_sponsored", "employer.unlock_credits_fulfilled"]))).orderBy(desc(operationalActivityLogs.createdAt)).limit(limit),
    (async () => [] as Array<{ kind: string; creditsSpent: number; seekerProfileUserId: number | null; createdAt: Date }>)(),
  ]);
  const sponsorRows = sponsorships.filter(row => row.action === "employer.opportunity_sponsored").map(row => {
    let tier = "featured"; let cost: number = SPONSOR_TIERS.featured.cost;
    try { const meta = JSON.parse(row.metadata ?? "{}") as { tier?: string; creditsSpent?: number }; tier = meta.tier ?? tier; cost = meta.creditsSpent ?? cost; } catch { /* keep defaults */ }
    return { kind: "sponsorship" as const, creditsSpent: cost, opportunityId: row.resourceId ? Number(row.resourceId) : null, tier, createdAt: row.createdAt };
  });
  const creditRows = sponsorships.filter(row => row.action === "employer.unlock_credits_fulfilled").map(row => {
    let creditsAdded = 0; let pack: string | null = null;
    try { const meta = JSON.parse(row.metadata ?? "{}") as { creditsAdded?: number; pack?: string }; creditsAdded = meta.creditsAdded ?? 0; pack = meta.pack ?? null; } catch { /* keep zeros */ }
    return { kind: "credit_purchase" as const, creditsAdded, pack, createdAt: row.createdAt };
  });
  const unlockRows = unlocks.map(row => ({ kind: "profile_unlock" as const, creditsSpent: row.creditsSpent, displayRef: talentDisplayRef(row.seekerProfileUserId), createdAt: row.createdAt }));
  return [...sponsorRows, ...creditRows, ...unlockRows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
}
