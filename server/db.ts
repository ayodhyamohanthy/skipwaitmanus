import { enqueueBillingReviewTx } from "./billingReviewOutbox";
import { buildReferrerHome, monthStartUtc } from "./referrerHome";
import { enrichInboxRow } from "./inboxEnrichment";
import { transitionNotificationKind } from "./notificationKinds";
import { buildEvidenceRows, cleanNote as cleanModerationNote, groupEvents as groupModerationEvents, groupEvidence, reportSeverity, reviewDueAt } from "./moderationCase";
import { checkPostingAllowance, opportunityLimits } from "./opportunityLimits";
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, like, lt, ne, notInArray, or, sql } from "drizzle-orm";
import { workEmailStorageKeys } from "./workEmailKey";
import { publicDisplayName } from "../shared/publicDisplayName";
import { passReasonSeekerLabel } from "../shared/passReasons";
import { CREDIT_ENDED_CAVEAT } from "../shared/moneyCopy";
import { alias } from "drizzle-orm/mysql-core";
import { drizzle } from "drizzle-orm/mysql2";
import * as mysql from "mysql2/promise";
import { accountPreferences, askCosts, askInviteLinks, seekerLevels, askWorkItems, moderationEvents, moderationEvidence, adminTokenAdjustments, canonicalPeople, verifiedLoginAliases, identityLinkAudits, companyCoverageInvitations, companyCoverageRewards, companyOpportunities, employerAccounts, employerPaymentFulfillments, employerPaymentRefunds, employerTalentIntroRequests, employerTalentRefs, partnerModules, paymentFulfillments, personalReferralInvites, personalReferralRewards, privacyRequests, planCreditGrants, promoCreditGrants, userFollows, profileUnlocks, referralAvailabilitySlots, safetyReports, companySuggestions, seekerAlerts, assistantConnections, assistantTokens, developerApps, assistantApprovals, referralRequestSaves, referralRequestPasses, referralTransitionEvents, referralDocumentAccessGrants, referralShareCards, referrerFastTrackLinks, referrerReviewEmailLinks, referralReviewDeliveries, referralReviewGrantRotations, referrerSlackWebhooks, resumeUploadChunks, resumeUploadSessions, subscriptionCheckoutIntents, subscriptionEvents, giftSubscriptionFulfillments, tokenBalances, tokenTransactions, workEmailOtpReceipts, workItems, talentDiscoveryConsents, type PartnerModuleCategory, type InsertUser, jobs, landedJourney, messages, directMessageQuotaWindows, directMessageNotificationOutbox, notifications, operationalActivityLogs, opportunitySponsorshipPurchases, profiles, referralAttachments, referralRequests, savedRoles, userBlocks, users } from "../drizzle/schema";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { ENV } from "./_core/env";
import { canAddAlert, normalizeAlertDomain } from "../shared/alerts";
import {
  assistantAccessFrom,
  DEVELOPER_APP_SCOPES,
  getApprovalExpiresAtMs,
  isApprovalExpired,
  normalizeAppKind,
  normalizeAssistantProvider,
  normalizeScopes,
  validateAppName,
  validateApprovalNote,
  validateDescription,
  validateRedirectUrls,
  validateUrl,
  type AssistantAccess,
  type AssistantApproval,
  type AssistantConnection,
  type AssistantToken,
  type DeveloperApp,
} from "../shared/assistant";
import { FREE_MONTHLY_ALLOWANCE, currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { isBillablePlanId, isRetiredPlanId, isRetiredPlanItemPrice, type BillablePlanId, type BillingPeriod, type RetiredPlanId, type WalletPlanId } from "../shared/billingCatalog";
import { PLAN_RETIRED_CODE } from "../shared/subscriptionManagement";
import { ASK_TTL_MS, COVERAGE_WAIT_DAYS, COVERAGE_WAIT_MS, getAskShelfLifeEndsAtMs, isAskExpired, isPostApprovalReferralStatus, referralProgressUpdateStatuses, referralStatusLabels, referredDueAtMs, referredReminderAtMs, referredExtensionOperationKey, REFERRED_DEADLINE_ENABLED, REFERRED_REMINDER_DAYS, claimLapseAtMs, allocationLapseAtMs, reminderAtMs, MAX_ACTIVE_CLAIMS, type ReferralProgressUpdateStatus, type ReferralStatus } from "../shared/referral";
import { firstLookUntilFrom, isOpportunityExpired, ownerOpportunityPostSchema, publicOpportunityPostSchema, OPPORTUNITY_TTL_MS, type OpportunityPoster, type OwnerOpportunityPost, type PublicOpportunityPost } from "../shared/companyOpportunities";
import { isCorporateEmailDomain } from "../shared/const";
import { isValidTargetRoleUrl, normalizeTargetRoleUrl } from "../shared/referralUrl";
import { JOB_LEVELS, REFERRER_AREAS, jobFunctionSchema, parseJobFunction, type JobFunction } from "../shared/jobFunctions";
import { PAY_FORWARD_CHOICES, THANK_YOU_MAX_LENGTH, type LandedJourneyRequest, type LandedJourneyState, type ReferrerThankYouWall } from "../shared/landedJourney";
import { resolveAskJobFunction } from "../shared/jobFunctionClassifier";
import { buildDomainIntegrityReport, type StoredDomainRow } from "./domainIntegrity";
import { isPaidPlanActive, resolvePlanEntitlements, planEntitlementsFor, type PlanEntitlements } from "../shared/planEntitlements";
import { openAskSlots, type OpenAskSlots } from "../shared/openAskSlots";
import { askWorkItemIdsSchema, dedupeAskWorkItemIds, type AskWorkItem } from "../shared/askWorkItems";
import { AssistantPlanRequiredError, CompanyCapReachedError, OpenAskSlotCapError, openAskCondition, PlanLimitError, showcaseLimitViolation } from "./planGates";
import { MAX_OPEN_ASKS_PER_COMPANY } from "../shared/planCatalog";
import { HELD_ASK_RECONCILE_LIMIT, isHeldCandidate, isPastAskWindow, listHeldForReferrerIds, listStaleHeldForViewer, readQueueAllocationTx, recordHeldAskReleaseTx, selectStaleHeldAsks, type UnclaimedAssignmentKind, type UnclaimedAssignments } from "./heldAsk";
import { BlockedPersonalLinkError, PERSONAL_LINK_UNAVAILABLE, blockedCounterpartsFailOpen } from "./blockedPairs";
import { DEFAULT_REFERRAL_CAPACITY, isOpenReferrer, isVerifiedEmployeeOfCompany, referralCapacityRemaining } from "./referrerAvailability";
import { COVERAGE_ATTEMPTS_PER_SLOT, COVERAGE_TARGET_SCAN_LIMIT, COVERAGE_WITHDRAWN_NOTICE, askDeliveryKey, coverageDeliveredEventKey, coverageDeliveredNotice, coverageHeldEventKey, coverageHeldNotice, coverageReferrerEventKey, coverageReferrerNotice, coverageWaitExpiredNotice, isAwaitingCoverageActionAllowed, type CoverageDeliveryOutcome, type CoverageHandoffSummary } from "./coverageDelivery";
import { askInviteActiveRequestKey } from "../shared/askInvites";
// Re-exported for every existing caller (tests and companyDirectory.ts import
// these from ./db); the definitions live in server/referrerAvailability.ts.
export { DEFAULT_REFERRAL_CAPACITY, isOpenReferrer, isVerifiedEmployeeOfCompany, referralCapacityRemaining } from "./referrerAvailability";
import { CreditSpendConflictError, InsufficientCreditsError, creditsLedgerTx, freshWalletCycle, isDuplicateKey, readGrantsTx, spendAlreadyRecordedTx, spendCreditsTx, type CyclePatch, type GrantRow, type LedgerTx, type PromoHolding } from "./creditLedger";
import { assignJobLevel, creditsForLevel } from "../shared/jobLevel";
import { freeCreditsRequireCardValidation } from "./billingSettings";
import { grantFreeCycleOnValidationTx, openCycleTx, reconcileSeekerWalletTx, rollCycleTx, seekerCycleDue, termOpeningCycle } from "./creditCycles";
import { BUCKET_SOURCES, HIDDEN_LEDGER_KINDS, creditLedgerEntrySchema, type CreditLedgerEntry, type CreditsLedger } from "../shared/creditLedger";
import { bucketOfLedgerRow } from "../shared/creditSpend";
import { fetchPublicJobLink } from "./jobLinkPreview";
import { captureServerError } from "./sentry";
import { PaymentReviewRefusedError, closeRefundedPaymentReviewTx } from "./paymentRefundReview";
import { PAYMENT_REVIEW_NOTE_MAX, paymentReviewKind, paymentReviewRefusal, type PaymentReviewDecision, type PaymentReviewOutcome, type RefundReviewReason } from "../shared/paymentReview";
import { recordPaidEvidenceTx, recordedRefundsCoverPaymentTx, refundEventRecordedTx, settleRefundOfNonCreditedPaymentTx, summariseRecordedRefunds } from "./paymentRefundEvents";
import { validateOpportunityTargetUrl } from "./opportunityTargetUrl";
import { publicDisplayNameOf, publicFirstNameOf } from "./publicName";
import { assertReferrerDmGateOpen, loadReferrerDmGate } from "./dmReferrerGate";
import { DM_FOLLOW_REQUIRED, DM_FOLLOW_REQUIRED_ERROR } from "../shared/directMessages";
import { decideAdminReferralApproval } from "./adminReferralApproval";
import { REFERRER_DOCUMENT_ACCESS_STATUSES, actorAcceptanceEventOn, grantFromJoin, isAcceptingReferrer, isReferrerDocumentAccessActive, isReferrerDocumentAccessStatus, openAcceptanceDocumentGrantTx } from "./referrerDocumentAccess";
import { directEmployerDomainFromTargetUrl, employerCandidatesFromJobPageHtml, hostedEmployerCandidatesFromTargetUrl, isHostedJobPlatform, officialEmployerDomainsFromJobPageHtml, publicEmployerPageUrls, verifiedEmployerDomainFromCandidates, verifiedEmployerDomainFromProtectedHostedListing, verifiedRedirectEmployerDomain } from "./employerRouting";

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
        ssl: { rejectUnauthorized: false },
        // Keep idle connections alive so a page's burst of calls does not each pay a fresh TLS handshake on a small CPU.
        enableKeepAlive: true,
        keepAliveInitialDelay: 10_000,
        connectionLimit: 10,
        maxIdle: 10,
        idleTimeout: 10 * 60_000,
      });
      // Warm a few connections in the background (best effort, never blocks or fails startup).
      for (let i = 0; i < 4; i += 1) { try { void Promise.resolve(connection.query?.("SELECT 1")).catch(() => undefined); } catch { /* warm-up is best effort */ } }
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

export function resolveSyncedUserRole(input: { openId: string; email?: string | null; requestedRole?: "user" | "admin"; existingRole?: "user" | "admin"; loginMethod?: string | null; emailVerified?: boolean }) {
  const normalizedEmail = input.email?.trim().toLowerCase();
  const emailIsProviderVerified = input.emailVerified ?? input.loginMethod !== UNAUTHENTICATED_EMAIL_LOGIN_METHOD;
  // The administrator promotion is keyed on the email address, so it is only
  // safe when that address came from a provider that verified it. Otherwise a
  // self-asserted address would hand out administrator access to anyone.
  if (normalizedEmail === durableAdministratorEmail && emailIsProviderVerified) return "admin" as const;
  const ownerMatches = Boolean(ENV.ownerOpenId) && input.openId === ENV.ownerOpenId;
  return input.requestedRole ?? input.existingRole ?? (ownerMatches ? "admin" : "user");
}

export function normalizeVerifiedEmail(email: string) { return email.trim().normalize("NFKC").toLowerCase(); }

/** Resolve a login subject to a canonical account. Provider+subject aliases win.
 * A verified email may claim an existing unique account. Unverified email never
 * participates in linking and is retained only on the isolated account row. */
/** WorkOS user ids (provider subjects) linked to this canonical account, used to end hosted sessions at sign-out. */
export async function listWorkosSubjectsForUser(userId: number): Promise<string[]> {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ subject: verifiedLoginAliases.subject }).from(verifiedLoginAliases).where(and(eq(verifiedLoginAliases.provider, "workos"), eq(verifiedLoginAliases.canonicalUserId, userId)));
  return rows.map(row => row.subject).filter(subject => /^user_[A-Za-z0-9]+$/.test(subject));
}

/** `name` is stored only when a new account is created; null leaves it unnamed (never derived from the email). */
export async function resolveLoginIdentity(input: { provider: string; subject: string; openId: string; email: string; emailVerified: boolean; name: string | null; loginMethod: string }) {
  const email = normalizeVerifiedEmail(input.email);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // Returning sign-ins already hold a verified provider alias. Resolve them with
  // plain reads so every callback/bearer request does not take row locks; only
  // first-time linking below needs the serialized, locking transaction.
  const knownAlias = (await db.select().from(verifiedLoginAliases)
    .where(and(eq(verifiedLoginAliases.provider, input.provider), eq(verifiedLoginAliases.subject, input.subject)))
    .limit(1))[0];
  if (knownAlias) {
    const account = (await db.select().from(users).where(eq(users.id, knownAlias.canonicalUserId)).limit(1))[0];
    const person = (await db.select().from(canonicalPeople).where(eq(canonicalPeople.id, knownAlias.canonicalPersonId)).limit(1))[0];
    if (!account || !person || account.suspended || person.suspended) throw new Error(person?.reviewReason ? "IDENTITY_REVIEW_REQUIRED" : "ACCOUNT_NOT_ACTIVE");
    return { ...account, suspended: false, sessionsValidAfter: person.sessionsValidAfter > account.sessionsValidAfter ? person.sessionsValidAfter : account.sessionsValidAfter };
  }
  const result = await db.transaction(async tx => {
    // Provider subject is the strongest key. It always resolves before email.
    const aliasRow = (await tx.select().from(verifiedLoginAliases)
      .where(and(eq(verifiedLoginAliases.provider, input.provider), eq(verifiedLoginAliases.subject, input.subject)))
      .limit(1).for("update"))[0];
    if (aliasRow) {
      const account = (await tx.select().from(users).where(eq(users.id, aliasRow.canonicalUserId)).limit(1))[0];
      const person = (await tx.select().from(canonicalPeople).where(eq(canonicalPeople.id, aliasRow.canonicalPersonId)).limit(1))[0];
      if (!account || !person || account.suspended || person.suspended) return { blocked: "ACCOUNT_NOT_ACTIVE" as const };
      return { account: { ...account, suspended: account.suspended || person.suspended, sessionsValidAfter: person.sessionsValidAfter > account.sessionsValidAfter ? person.sessionsValidAfter : account.sessionsValidAfter } };
    }

    // A verified email owns exactly one locked person row. INSERT...ON DUPLICATE
    // plus FOR UPDATE serializes simultaneous WorkOS and OTP first sign-in.
    let personId: number;
    if (input.emailVerified) {
      await tx.insert(canonicalPeople).values({ normalizedVerifiedEmail: email }).onDuplicateKeyUpdate({ set: { normalizedVerifiedEmail: email } });
      const person = (await tx.select().from(canonicalPeople).where(eq(canonicalPeople.normalizedVerifiedEmail, email)).limit(1).for("update"))[0];
      if (!person) throw new Error("Canonical identity allocation failed");
      if (person.suspended || person.reviewReason) return { blocked: person.reviewReason ? "IDENTITY_REVIEW_REQUIRED" as const : "ACCOUNT_NOT_ACTIVE" as const };
      personId = person.id;
    } else {
      const inserted = await tx.insert(canonicalPeople).values({ normalizedVerifiedEmail: null });
      personId = Number(inserted[0].insertId);
    }

    // Recheck after the canonical-person lock. A concurrent first sign-in may
    // have inserted this provider alias while this transaction was waiting.
    const racedAlias = (await tx.select().from(verifiedLoginAliases)
      .where(and(eq(verifiedLoginAliases.provider, input.provider), eq(verifiedLoginAliases.subject, input.subject)))
      .limit(1).for("update"))[0];
    if (racedAlias) {
      if (racedAlias.canonicalPersonId !== personId) {
        const now = new Date();
        await tx.update(canonicalPeople).set({ suspended: true, reviewReason: "provider_subject_conflict", sessionsValidAfter: now }).where(inArray(canonicalPeople.id, [personId, racedAlias.canonicalPersonId]));
        await tx.insert(identityLinkAudits).values({ canonicalPersonId: personId, provider: input.provider, subject: input.subject, action: "provider_subject_conflict_frozen" });
        return { blocked: "IDENTITY_REVIEW_REQUIRED" as const };
      }
      const racedAccount = (await tx.select().from(users).where(eq(users.id, racedAlias.canonicalUserId)).limit(1))[0];
      if (!racedAccount || racedAccount.suspended) return { blocked: "ACCOUNT_NOT_ACTIVE" as const };
      return { account: racedAccount };
    }

    let canonical = (await tx.select().from(users).where(eq(users.canonicalPersonId, personId)).limit(2).for("update"));
    if (canonical.length > 1) {
      const now = new Date();
      await tx.update(canonicalPeople).set({ suspended: true, reviewReason: "multiple_canonical_users", sessionsValidAfter: now }).where(eq(canonicalPeople.id, personId));
      await tx.update(users).set({ suspended: true, sessionsValidAfter: now }).where(inArray(users.id, canonical.map(row => row.id)));
      await tx.insert(identityLinkAudits).values({ canonicalPersonId: personId, provider: input.provider, subject: input.subject, action: "multiple_canonical_users_frozen" });
      return { blocked: "IDENTITY_REVIEW_REQUIRED" as const };
    }
    let account = canonical[0];
    if (!account) {
      // Exact legacy provider ID is safe even without verified email. Verified
      // email additionally finds the one old email-keyed row. Distinct hits are
      // an ambiguous historic split and remain frozen for operator review.
      const exactCandidates = await tx.select().from(users).where(and(isNull(users.canonicalPersonId), eq(users.openId, input.openId))).for("update");
      const emailCandidates = input.emailVerified && exactCandidates.length === 0
        ? await tx.select().from(users).where(and(isNull(users.canonicalPersonId), eq(sql`LOWER(TRIM(${users.email}))`, email))).for("update")
        : [];
      // The current provider has attested this email. One historic account is
      // therefore a unique canonical claim regardless of its old loginMethod;
      // only multiple historic rows are ambiguous and must be frozen.
      const candidates = exactCandidates.length ? exactCandidates : emailCandidates;
      if (candidates.length > 1) {
        const now = new Date();
        await tx.update(canonicalPeople).set({ suspended: true, reviewReason: "ambiguous_historic_verified_email", sessionsValidAfter: now }).where(eq(canonicalPeople.id, personId));
        for (const row of candidates) await tx.update(users).set({ suspended: true, sessionsValidAfter: now }).where(eq(users.id, row.id));
        await tx.insert(identityLinkAudits).values({ canonicalPersonId: personId, provider: input.provider, subject: input.subject, action: "ambiguous_verified_email_frozen", evidence: JSON.stringify({ candidateUserIds: candidates.map(row => row.id), emailHash: createHash("sha256").update(email).digest("hex") }) });
        return { blocked: "IDENTITY_REVIEW_REQUIRED" as const };
      }
      account = candidates[0];
      if (account) { await tx.update(users).set({ canonicalPersonId: personId }).where(eq(users.id, account.id)); account = { ...account, canonicalPersonId: personId }; }
    }
    if (account?.suspended) return { blocked: "ACCOUNT_NOT_ACTIVE" as const };
    if (!account) {
      const role = resolveSyncedUserRole({ openId: input.openId, email, loginMethod: input.loginMethod, emailVerified: input.emailVerified });
      const insertedUser = await tx.insert(users).values({ openId: input.openId, canonicalPersonId: personId, name: input.name, email, loginMethod: input.loginMethod, lastSignedIn: new Date(), role });
      account = (await tx.select().from(users).where(eq(users.id, Number(insertedUser[0].insertId))).limit(1))[0];
    }
    await tx.insert(verifiedLoginAliases).values({ provider: input.provider, subject: input.subject, openId: input.openId, canonicalPersonId: personId, canonicalUserId: account!.id, normalizedVerifiedEmail: input.emailVerified ? email : null, verifiedAt: new Date() });
    await tx.insert(identityLinkAudits).values({ canonicalPersonId: personId, canonicalUserId: account!.id, provider: input.provider, subject: input.subject, action: input.emailVerified ? "verified_alias_linked" : "unverified_alias_isolated", evidence: input.emailVerified ? JSON.stringify({ emailHash: createHash("sha256").update(email).digest("hex") }) : null });
    return { account: account! };
  });
  if ("blocked" in result) throw new Error(result.blocked);
  return result.account;
}

export async function upsertUser(user: InsertUser): Promise<void> {if(!user.openId)throw new Error("User openId is required for upsert");const db=await getDb();if(!db)return;const current=await db.select({role:users.role}).from(users).where(eq(users.openId,user.openId)).limit(1);const role=resolveSyncedUserRole({openId:user.openId,email:user.email,requestedRole:user.role,existingRole:current[0]?.role,loginMethod:user.loginMethod});await db.insert(users).values({...user,role,lastSignedIn:user.lastSignedIn??new Date()}).onDuplicateKeyUpdate({set:{name:user.name??null,email:user.email??null,loginMethod:user.loginMethod??null,lastSignedIn:user.lastSignedIn??new Date(),role}});}

export async function provisionWorkEmailIdentity(emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  const domain = email.split("@")[1];
  if (!domain || !isWorkEmailDomain(domain)) throw new Error("A verified work email is required");
  const openId = `workemail_${email}`;
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const current = await tx.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.openId, openId)).limit(1);
    const role = resolveSyncedUserRole({ openId, email, existingRole: current[0]?.role, loginMethod: "otp_work_email" });
    await tx.insert(users).values({ openId, name: current[0]?.name ?? email.split("@")[0], email, loginMethod: "otp_work_email", lastSignedIn: new Date(), role }).onDuplicateKeyUpdate({ set: { email, loginMethod: "otp_work_email", lastSignedIn: new Date(), role } });
    const account = (await tx.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
    if (!account) throw new Error("Work email account could not be provisioned");
    await tx.insert(profiles).values({ userId: account.id, accountType: "referrer", company: domain, workEmailDomain: domain, workEmailVerifiedAt: new Date(), isOnboarded: true }).onDuplicateKeyUpdate({ set: { accountType: "referrer", company: domain, workEmailDomain: domain, workEmailVerifiedAt: new Date(), isOnboarded: true } });
    return account;
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb(); if (!db) return undefined;
  // An alias is the verified binding and must win over a legacy direct row.
  const aliasRow = (await db.select({ userId: verifiedLoginAliases.canonicalUserId }).from(verifiedLoginAliases).where(eq(verifiedLoginAliases.openId, openId)).limit(1))[0];
  let account = aliasRow ? (await db.select().from(users).where(eq(users.id, aliasRow.userId)).limit(1))[0] : undefined;
  if (!account) account = (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
  if (!account?.canonicalPersonId) return account;
  const person = (await db.select().from(canonicalPeople).where(eq(canonicalPeople.id, account.canonicalPersonId)).limit(1))[0];
  if (!person) return account;
  return { ...account, suspended: account.suspended || person.suspended, sessionsValidAfter: person.sessionsValidAfter > account.sessionsValidAfter ? person.sessionsValidAfter : account.sessionsValidAfter };
}
export async function revokeUserSessions(openId: string): Promise<void> { const db = await getDb(); if (!db) return; const account=await getUserByOpenId(openId);if(!account)return;const now=new Date();await db.update(users).set({sessionsValidAfter:now}).where(eq(users.id,account.id));if(account.canonicalPersonId)await db.update(canonicalPeople).set({sessionsValidAfter:now}).where(eq(canonicalPeople.id,account.canonicalPersonId)); }
export async function getSeekerLevel(userId: number): Promise<number | null> { const db = await getDb(); if (!db) return null; const r = await db.select({ level: seekerLevels.level }).from(seekerLevels).where(eq(seekerLevels.userId, userId)).limit(1); return r[0]?.level ?? null; }
/** D-148: the seeker's own pick (1-10). Display only. */
export async function setSeekerLevel(userId: number, level: number | null): Promise<number | null> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (level === null) { await db.delete(seekerLevels).where(eq(seekerLevels.userId, userId)); return null; }
  if (!Number.isInteger(level) || level < 1 || level > 10) throw new Error("Level must be 1 to 10");
  await db.insert(seekerLevels).values({ userId, level }).onDuplicateKeyUpdate({ set: { level } });
  return level;
}
export async function getProfileByUserId(userId: number) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1); return result[0]; }

const RESERVED_HANDLES = new Set(["admin", "api", "app", "ask", "alerts", "billing", "explore", "help", "inbox", "invite", "jobs", "landed", "messages", "notifications", "onboarding", "plans", "premium", "pricing", "privacy", "profile", "queue", "referrer", "report", "requests", "settings", "share", "sign-in", "start", "support", "terms", "thread", "verify", "wall", "work", "p", "developers", "employer", "request"]);
export function normalizeProfileHandle(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const handle = raw.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(handle) || RESERVED_HANDLES.has(handle)) return undefined;
  return handle;
}
const PROFILE_VISIBILITIES = ["public", "link", "private"] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];
export const WORK_ITEM_KINDS = ["case_study", "project", "article", "code", "other"] as const;

export async function getMyProfile(userId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const account = (await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!account) throw new Error("User not found");
  const profile = await getProfileByUserId(userId);
  const items = await db.select().from(workItems).where(eq(workItems.userId, userId)).orderBy(desc(workItems.pinned), desc(workItems.updatedAt));
  return { displayName: account.name, profile: profile ?? null, workItems: items };
}

export async function updateMyProfile(userId: number, input: { headline?: string; currentTitle?: string; location?: string; bio?: string; skills?: string; openTo?: unknown; handle?: string | null; profileVisibility?: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const patch: Record<string, unknown> = {};
  for (const key of ["headline", "currentTitle", "location", "bio", "skills"] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "string") throw new Error("Profile text must be a string");
    const value = (input[key] as string).trim().slice(0, key === "bio" ? 2000 : key === "skills" ? 1000 : 180);
    patch[key] = value || null;
  }
  if (input.profileVisibility !== undefined) {
    if (!(PROFILE_VISIBILITIES as readonly string[]).includes(input.profileVisibility)) throw new Error("Choose public, link-only, or private visibility");
    patch.profileVisibility = input.profileVisibility;
  }
  if (input.openTo !== undefined) {
    if (!Array.isArray(input.openTo)) throw new Error("List the roles you are open to as an array");
    const roles = input.openTo.filter((role): role is string => typeof role === "string" && role.trim().length > 0 && role.trim().length <= 60).map(role => role.trim());
    if (roles.length > 5) throw new Error("List up to 5 roles you are open to");
    patch.openTo = JSON.stringify(roles);
  }
  if (input.handle !== undefined) {
    if (input.handle === null || input.handle === "") patch.handle = null;
    else {
      const handle = normalizeProfileHandle(input.handle);
      if (!handle) throw new Error("Handles use 3-40 lowercase letters, numbers, or dashes, and cannot be a reserved word");
      const clash = (await db.select({ userId: profiles.userId }).from(profiles).where(eq(profiles.handle, handle)).limit(1))[0];
      if (clash && clash.userId !== userId) throw new Error("That handle is already taken");
      patch.handle = handle;
    }
  }
  if (Object.keys(patch).length === 0) return getMyProfile(userId);
  const existing = await getProfileByUserId(userId);
  if (existing) await db.update(profiles).set({ ...patch, updatedAt: new Date() }).where(eq(profiles.userId, userId));
  else await db.insert(profiles).values({ userId, ...(patch as { headline?: string | null }) });
  return getMyProfile(userId);
}

function validateWorkItemInput(input: { title?: unknown; kind?: unknown; source?: unknown; url?: unknown; pinned?: unknown; visibleOnProfile?: unknown }) {
  const out: Record<string, unknown> = {};
  if (input.title !== undefined) {
    if (typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 160) throw new Error("Give each work item a title up to 160 characters");
    out.title = input.title.trim();
  }
  if (input.kind !== undefined) {
    if (!(WORK_ITEM_KINDS as readonly string[]).includes(input.kind as string)) throw new Error("Choose a real work kind");
    out.kind = input.kind;
  }
  if (input.source !== undefined) {
    if (typeof input.source !== "string") throw new Error("Work source must be a string");
    out.source = input.source.trim().slice(0, 80) || null;
  }
  if (input.url !== undefined) {
    if (input.url === null || input.url === "") out.url = null;
    else if (typeof input.url !== "string" || !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(input.url.trim()) || input.url.trim().length > 2048) throw new Error("Work links must start with http:// or https://");
    else out.url = input.url.trim();
  }
  if (input.pinned !== undefined) out.pinned = Boolean(input.pinned);
  if (input.visibleOnProfile !== undefined) out.visibleOnProfile = Boolean(input.visibleOnProfile);
  return out;
}

// Referrer job areas and levels come from the shared taxonomy (shared/jobFunctions.ts).
export const PREFER_AREA_OPTIONS = REFERRER_AREAS;
export const PREFER_LEVEL_OPTIONS = JOB_LEVELS;

function parseOptionList(raw: unknown, options: readonly string[]): string[] {
  let items: string[] = [];
  try { const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw; if (Array.isArray(parsed)) items = parsed.filter((item): item is string => typeof item === "string"); } catch { items = []; }
  return items.filter(item => (options as readonly string[]).includes(item));
}

export async function getReferrerPreferences(userId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const profile = await getProfileByUserId(userId);
  return {
    referralCapacity: profile?.referralCapacity ?? 3,
    preferAreas: parseOptionList(profile?.preferAreas, PREFER_AREA_OPTIONS),
    preferLevels: parseOptionList((profile as { preferLevels?: unknown } | undefined)?.preferLevels, PREFER_LEVEL_OPTIONS),
    referrerVisibility: profile?.referrerVisibility === "named" ? "named" : "anon",
    notifyNewAsk: profile?.notifyNewAsk ?? true,
    notifyDigest: profile?.notifyDigest ?? false,
    paused: profile?.paused ?? false,
  };
}

export async function updateReferrerPreferences(userId: number, input: { referralCapacity?: unknown; preferAreas?: unknown; preferLevels?: unknown; referrerVisibility?: unknown; notifyNewAsk?: unknown; notifyDigest?: unknown; paused?: unknown }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const patch: Record<string, unknown> = {};
  if (input.referralCapacity !== undefined) {
    const capacity = Number(input.referralCapacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 15) throw new Error("Capacity is 1 to 15 asks");
    patch.referralCapacity = capacity;
  }
  if (input.preferAreas !== undefined) {
    if (!Array.isArray(input.preferAreas)) throw new Error("Choose job areas from the list");
    const areas = input.preferAreas.filter((area): area is string => typeof area === "string" && (PREFER_AREA_OPTIONS as readonly string[]).includes(area));
    if (areas.length > 9) throw new Error("Choose up to 9 job areas");
    patch.preferAreas = JSON.stringify(areas);
  }
  if (input.preferLevels !== undefined) {
    if (!Array.isArray(input.preferLevels)) throw new Error("Choose levels from the list");
    const levels = input.preferLevels.filter((level): level is string => typeof level === "string" && (PREFER_LEVEL_OPTIONS as readonly string[]).includes(level));
    if (levels.length > 5) throw new Error("Choose up to 5 levels");
    patch.preferLevels = JSON.stringify(levels);
  }
  if (input.referrerVisibility !== undefined) {
    if (input.referrerVisibility !== "anon" && input.referrerVisibility !== "named") throw new Error("Choose anonymous or named visibility");
    patch.referrerVisibility = input.referrerVisibility;
  }
  if (input.notifyNewAsk !== undefined) patch.notifyNewAsk = Boolean(input.notifyNewAsk);
  if (input.notifyDigest !== undefined) patch.notifyDigest = Boolean(input.notifyDigest);
  if (input.paused !== undefined) patch.paused = Boolean(input.paused);
  if (Object.keys(patch).length === 0) return getReferrerPreferences(userId);
  const existing = await getProfileByUserId(userId);
  if (existing) await db.update(profiles).set({ ...patch, updatedAt: new Date() }).where(eq(profiles.userId, userId));
  else await db.insert(profiles).values({ userId, ...(patch as { referralCapacity?: number }) });
  return getReferrerPreferences(userId);
}

export async function listMyWorkItems(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(workItems).where(eq(workItems.userId, userId)).orderBy(desc(workItems.pinned), desc(workItems.updatedAt));
}

/**
 * Saved job alerts. A seeker watches a company; the first verified referrer
 * there notifies each unpaused watcher exactly once (eventKey dedup), then
 * the alert is stamped notifiedAt. The cap is the plan entitlement's
 * savedAlerts: Free keeps 3, paid plans are unlimited.
 */
export async function listSeekerAlerts(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select({ id: seekerAlerts.id, companyDomain: seekerAlerts.companyDomain, paused: seekerAlerts.paused, notifiedAt: seekerAlerts.notifiedAt, createdAt: seekerAlerts.createdAt }).from(seekerAlerts).where(eq(seekerAlerts.userId, userId)).orderBy(desc(seekerAlerts.createdAt));
}

export async function createSeekerAlert(userId: number, input: { companyDomain?: unknown }) {
  const domain = normalizeAlertDomain(input.companyDomain);
  if (!domain) throw new Error("Enter a valid company domain, like acme.com");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const existing = await db.select({ id: seekerAlerts.id }).from(seekerAlerts).where(eq(seekerAlerts.userId, userId));
  const { savedAlerts } = await getSeekerEntitlements(userId);
  if (!canAddAlert({ existingCount: existing.length, cap: savedAlerts })) throw new Error(`Free accounts keep ${savedAlerts} alerts. Upgrade for unlimited alerts.`);
  try {
    const inserted = await db.insert(seekerAlerts).values({ userId, companyDomain: domain });
    const id = Number(inserted[0].insertId);
    return (await db.select().from(seekerAlerts).where(eq(seekerAlerts.id, id)).limit(1))[0];
  } catch (error) {
    if (isDuplicateKey(error)) throw new Error(`You already watch ${domain}`);
    throw error instanceof Error ? error : new Error("We could not save this alert");
  }
}

export async function setSeekerAlertPaused(userId: number, alertId: number, paused: boolean) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const current = (await db.select().from(seekerAlerts).where(and(eq(seekerAlerts.id, alertId), eq(seekerAlerts.userId, userId))).limit(1))[0];
  if (!current) throw new Error("This alert is not in your account");
  await db.update(seekerAlerts).set({ paused }).where(eq(seekerAlerts.id, alertId));
  return { ...(current as object), paused };
}

export async function deleteSeekerAlert(userId: number, alertId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const current = (await db.select({ id: seekerAlerts.id }).from(seekerAlerts).where(and(eq(seekerAlerts.id, alertId), eq(seekerAlerts.userId, userId))).limit(1))[0];
  if (!current) throw new Error("This alert is not in your account");
  await db.delete(seekerAlerts).where(eq(seekerAlerts.id, alertId));
  return { deleted: true as const, id: alertId };
}

/**
 * `company` (from the company directory, server/companyDirectory.ts) widens
 * the watch to every domain of the company that owns `companyDomain` and
 * names it in the copy; without it only that domain's watchers are notified.
 */
export async function notifySeekerAlertsForCompany(companyDomain: string, now: Date = new Date(), company?: { name: string; domains: readonly string[] }) {
  const domain = normalizeAlertDomain(companyDomain);
  const db = await getDb(); if (!db || !domain) return { notified: 0 };
  const watched = Array.from(new Set([domain, ...(company?.domains ?? []).map(normalizeAlertDomain).filter((value): value is string => Boolean(value))]));
  const label = company?.name.trim() || domain;
  const watchers = await db.select({ id: seekerAlerts.id, userId: seekerAlerts.userId }).from(seekerAlerts).where(and(watched.length === 1 ? eq(seekerAlerts.companyDomain, domain) : inArray(seekerAlerts.companyDomain, watched), eq(seekerAlerts.paused, false), isNull(seekerAlerts.notifiedAt)));
  let notified = 0;
  for (const watcher of watchers) {
    try {
      // Claim the alert first: concurrent runs race here, exactly one wins.
      const stamped = await db.update(seekerAlerts).set({ notifiedAt: now }).where(and(eq(seekerAlerts.id, watcher.id), isNull(seekerAlerts.notifiedAt)));
      if (Number(stamped[0]?.affectedRows) !== 1) continue;
      await db.insert(notifications).values({ kind: "slot_open", userId: watcher.userId, category: "status", title: `Someone inside ${label} can refer`, body: `A verified employee at ${label} is now open to referral requests. Send your ask while the door is open.`, eventKey: `alert-coverage:${watcher.id}` }).onDuplicateKeyUpdate({ set: { eventKey: `alert-coverage:${watcher.id}` } });
      notified += 1;
    } catch { /* fail open per watcher: a missed alert never breaks verification */ }
  }
  return { notified };
}

/**
 * Assistant access (kit screens 22 / 23 / 24 / 26).
 * Connections are the revocable consent record an OAuth/MCP
 * handshake completes. Tokens are stored sha256-hashed and
 * shown exactly once. Developer apps register third-party
 * clients (test mode until reviewed). Approvals queue
 * assistant actions for the user's explicit decision and
 * expire 24 hours after creation, computed in JavaScript.
 */
function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The seeker's plan entitlement (shared/planEntitlements.ts) from the job_seeker
 * wallet. A missing wallet or database reads as Free, so every gate fails closed.
 */
export async function getSeekerEntitlements(userId: number, now: Date = new Date()): Promise<PlanEntitlements> {
  const db = await getDb(); if (!db) return resolvePlanEntitlements(null, now);
  const wallet = (await db.select({ plan: tokenBalances.plan, subscriptionStatus: tokenBalances.subscriptionStatus, subscriptionCurrentTermEnd: tokenBalances.subscriptionCurrentTermEnd, trialEndsAt: tokenBalances.trialEndsAt }).from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, "job_seeker"))).limit(1))[0];
  return resolvePlanEntitlements(wallet ?? null, now);
}

/** GET /api/assistants/access: the Land tier only (a wallet still marked max reads as Free, D-067). */
export async function getAssistantAccess(userId: number): Promise<AssistantAccess> {
  return assistantAccessFrom(await getSeekerEntitlements(userId));
}

async function assertAssistantAccess(userId: number) {
  if (!(await getSeekerEntitlements(userId)).assistants) throw new AssistantPlanRequiredError();
}

export async function listAssistantConnections(userId: number): Promise<AssistantConnection[]> {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select().from(assistantConnections).where(eq(assistantConnections.userId, userId)).orderBy(desc(assistantConnections.createdAt));
  return rows.map(row => ({ id: row.id, provider: row.provider, appName: row.appName, scopes: parseJsonArray(row.scopes), status: row.status, lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null, connectedAt: row.connectedAt.toISOString() }));
}

export async function connectAssistant(userId: number, input: { provider?: unknown; appName?: unknown; scopes?: unknown }) {
  const provider = normalizeAssistantProvider(input.provider);
  if (!provider) throw new Error("Choose ChatGPT, Claude, or another assistant");
  const appName = validateAppName(input.appName) ?? (provider === "chatgpt" ? "ChatGPT" : provider === "claude" ? "Claude" : "Assistant");
  const scopes = normalizeScopes(input.scopes, ["read", "draft", "send", "credits"]) ?? ["read", "draft"];
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await assertAssistantAccess(userId);
  const current = await db.select({ id: assistantConnections.id, status: assistantConnections.status }).from(assistantConnections).where(and(eq(assistantConnections.userId, userId), eq(assistantConnections.provider, provider)));
  const active = current.filter(row => row.status === "connected");
  if (active.length > 0) throw new Error(`${appName} is already connected`);
  const inserted = await db.insert(assistantConnections).values({ userId, provider, appName, scopes: JSON.stringify(scopes) });
  const id = Number(inserted[0].insertId);
  return (await listAssistantConnections(userId)).find(connection => connection.id === id) ?? null;
}

export async function disconnectAssistant(userId: number, connectionId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const current = (await db.select().from(assistantConnections).where(and(eq(assistantConnections.id, connectionId), eq(assistantConnections.userId, userId))).limit(1))[0];
  if (!current) throw new Error("This assistant is not connected to your account");
  await db.update(assistantConnections).set({ status: "revoked", revokedAt: new Date() }).where(eq(assistantConnections.id, connectionId));
  return { revoked: true as const, id: connectionId };
}

export async function listAssistantTokens(userId: number): Promise<AssistantToken[]> {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ id: assistantTokens.id, name: assistantTokens.name, prefix: assistantTokens.prefix, lastUsedAt: assistantTokens.lastUsedAt, createdAt: assistantTokens.createdAt }).from(assistantTokens).where(eq(assistantTokens.userId, userId)).orderBy(desc(assistantTokens.createdAt));
  return rows.map(row => ({ id: row.id, name: row.name, prefix: row.prefix, lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null, createdAt: row.createdAt.toISOString() }));
}

export async function createAssistantToken(userId: number, input: { name?: unknown }) {
  const name = validateAppName(input.name);
  if (!name) throw new Error("Give the token a name, like “Notion tracker”");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await assertAssistantAccess(userId);
  const plaintext = `sw_${randomBytes(24).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(plaintext).digest("hex");
  const prefix = plaintext.slice(0, 10);
  try {
    const inserted = await db.insert(assistantTokens).values({ userId, name, tokenHash, prefix });
    const id = Number(inserted[0].insertId);
    return { id, name, prefix, token: plaintext, createdAt: new Date().toISOString() };
  } catch (error) {
    if (isDuplicateKey(error)) throw new Error(`You already have a token named “${name}”`);
    throw error instanceof Error ? error : new Error("We could not create this token");
  }
}

/** Resolves a bearer token hash to its owner. Revoked or unknown tokens return null. */
export async function verifyAssistantBearer(tokenHash: string): Promise<{ userId: number; tokenId: number } | null> {
  const db = await getDb(); if (!db) return null;
  const row = (await db.select({ id: assistantTokens.id, userId: assistantTokens.userId }).from(assistantTokens).where(and(eq(assistantTokens.tokenHash, tokenHash), isNull(assistantTokens.revokedAt))).limit(1))[0];
  if (!row) return null;
  await db.update(assistantTokens).set({ lastUsedAt: new Date() }).where(eq(assistantTokens.id, row.id)).catch(() => undefined);
  return { userId: row.userId, tokenId: row.id };
}

/** True when the owner's plan still includes assistants (the Land tier). Fails closed. */
export async function hasAssistantAccess(userId: number): Promise<boolean> {
  try { return (await getSeekerEntitlements(userId)).assistants; } catch { return false; }
}

export async function revokeAssistantToken(userId: number, tokenId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const current = (await db.select({ id: assistantTokens.id }).from(assistantTokens).where(and(eq(assistantTokens.id, tokenId), eq(assistantTokens.userId, userId))).limit(1))[0];
  if (!current) throw new Error("This token is not in your account");
  await db.update(assistantTokens).set({ revokedAt: new Date() }).where(eq(assistantTokens.id, tokenId));
  return { revoked: true as const, id: tokenId };
}

export async function listAssistantApprovals(userId: number): Promise<AssistantApproval[]> {
  const db = await getDb(); if (!db) return [];
  const now = new Date();
  await db.update(assistantApprovals).set({ status: "expired", decidedAt: now }).where(and(eq(assistantApprovals.userId, userId), eq(assistantApprovals.status, "pending"), lt(assistantApprovals.expiresAt, now)));
  const rows = await db.select().from(assistantApprovals).where(eq(assistantApprovals.userId, userId)).orderBy(desc(assistantApprovals.createdAt)).limit(50);
  return rows.map(row => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    provider: row.provider,
    companyDomain: row.companyDomain,
    role: row.role,
    note: row.note,
    creditCount: row.creditCount,
    slotCount: row.slotCount,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  }));
}

export async function createAssistantApproval(userId: number, input: {
  kind?: unknown; provider?: unknown; connectionId?: unknown;
  companyDomain?: unknown; role?: unknown; note?: unknown;
  creditCount?: unknown; slotCount?: unknown;
}) {
  const kind = input.kind === "ask_send" || input.kind === "credit_spend" ? input.kind : null;
  if (!kind) throw new Error("Approvals cover an ask or a credit spend");
  const provider = typeof input.provider === "string" && input.provider.trim() ? input.provider.trim().slice(0, 80) : "assistant";
  const companyDomain = typeof input.companyDomain === "string" && input.companyDomain.trim() ? input.companyDomain.trim().toLowerCase().slice(0, 255) : null;
  const role = typeof input.role === "string" && input.role.trim() ? input.role.trim().slice(0, 180) : null;
  const note = input.note === undefined || input.note === null ? null : validateApprovalNote(input.note);
  const creditCount = typeof input.creditCount === "number" && Number.isInteger(input.creditCount) && input.creditCount > 0 ? input.creditCount : null;
  const slotCount = typeof input.slotCount === "number" && Number.isInteger(input.slotCount) && input.slotCount >= 0 ? input.slotCount : null;
  const connectionId = typeof input.connectionId === "number" && Number.isInteger(input.connectionId) && input.connectionId > 0 ? input.connectionId : null;
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const expiresAt = new Date(getApprovalExpiresAtMs(Date.now()));
  const inserted = await db.insert(assistantApprovals).values({ userId, connectionId, kind, provider, companyDomain, role, note, creditCount, slotCount, expiresAt });
  const id = Number(inserted[0].insertId);
  const created = (await db.select().from(assistantApprovals).where(eq(assistantApprovals.id, id)).limit(1))[0];
  return { id: created.id, kind: created.kind, status: created.status, provider: created.provider, companyDomain: created.companyDomain, role: created.role, note: created.note, creditCount: created.creditCount, slotCount: created.slotCount, createdAt: created.createdAt.toISOString(), expiresAt: created.expiresAt.toISOString() };
}

export async function editAssistantApproval(userId: number, approvalId: number, input: { note?: unknown }) {
  const note = validateApprovalNote(input.note);
  if (!note) throw new Error("Enter the ask note you want to send");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const current = (await db.select().from(assistantApprovals).where(and(eq(assistantApprovals.id, approvalId), eq(assistantApprovals.userId, userId))).limit(1))[0];
  if (!current) throw new Error("This approval is not in your account");
  if (current.status !== "pending") throw new Error("This approval was already handled");
  if (isApprovalExpired(current.expiresAt.getTime())) throw new Error("This approval expired");
  await db.update(assistantApprovals).set({ note }).where(eq(assistantApprovals.id, approvalId));
  return { id: approvalId, note };
}

/** One credit is what the existing ask path spends (monthly allowance first, then purchased credits). */
export const ASSISTANT_ASK_CREDIT_COST = 1;
const MAX_PENDING_ASSISTANT_ASKS = 5;

/** Keeps the saved profile resume out of ask drafts and draft cleanup: it belongs to /onboarding, not to one ask. */
const notProfileResume = (userId: number) => sql`${referralAttachments.id} NOT IN (SELECT ${profiles.defaultResumeAttachmentId} FROM ${profiles} WHERE ${profiles.userId} = ${userId} AND ${profiles.defaultResumeAttachmentId} IS NOT NULL)`;

/** The member's own resume documents that are not attached to a request yet. Ids and names only. */
export async function listMyUnattachedResumes(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select({ id: referralAttachments.id, fileName: referralAttachments.fileName, createdAt: referralAttachments.createdAt }).from(referralAttachments).where(and(eq(referralAttachments.ownerId, userId), isNull(referralAttachments.referralRequestId), notProfileResume(userId))).orderBy(desc(referralAttachments.createdAt)).limit(25);
}

/**
 * An assistant proposes an ask. This ONLY creates a pending approval carrying the full payload.
 * Nothing is sent and no credit moves until the owner approves it in the app. The cost is fixed
 * here by the server; nothing the assistant supplies sets it. The referrer is never chosen by the assistant:
 * the request goes through the normal company routing when (and only if) the owner approves.
 */
export async function proposeAssistantAsk(userId: number, input: { targetRoleUrl?: unknown; attachmentIds?: unknown; message?: unknown; provider?: unknown }) {
  const rawUrl = typeof input.targetRoleUrl === "string" ? input.targetRoleUrl.trim() : "";
  if (!rawUrl || rawUrl.length > 2048 || !isValidTargetRoleUrl(rawUrl)) throw new Error("Add a complete public job link for the role");
  const ids = Array.isArray(input.attachmentIds) ? Array.from(new Set(input.attachmentIds.filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v > 0))) : [];
  if (ids.length === 0 || ids.length > 5) throw new Error("Choose one to five of the member's own resume documents");
  const message = typeof input.message === "string" && input.message.trim() ? validateApprovalNote(input.message) : null;
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const owned = await db.select({ id: referralAttachments.id }).from(referralAttachments).where(and(inArray(referralAttachments.id, ids), eq(referralAttachments.ownerId, userId), isNull(referralAttachments.referralRequestId)));
  if (owned.length !== ids.length) throw new Error("One or more resume documents are unavailable");
  const now = new Date();
  const pending = await db.select({ id: assistantApprovals.id }).from(assistantApprovals).where(and(eq(assistantApprovals.userId, userId), eq(assistantApprovals.status, "pending"), gt(assistantApprovals.expiresAt, now))).limit(MAX_PENDING_ASSISTANT_ASKS + 1);
  if (pending.length >= MAX_PENDING_ASSISTANT_ASKS) throw new Error("The member already has several asks waiting for approval. Ask them to review those first");
  const targetRoleUrl = normalizeTargetRoleUrl(rawUrl);
  const companyDomain = directEmployerDomainFromTargetUrl(targetRoleUrl) ?? null;
  const provider = typeof input.provider === "string" && input.provider.trim() ? input.provider.trim().slice(0, 80) : "assistant";
  const inserted = await db.insert(assistantApprovals).values({
    userId, connectionId: null, kind: "ask_send", provider, companyDomain, role: null, note: message,
    creditCount: ASSISTANT_ASK_CREDIT_COST, slotCount: null, targetRoleUrl, attachmentIds: JSON.stringify(ids),
    idempotencyKey: randomBytes(24).toString("base64url").slice(0, 40), expiresAt: new Date(getApprovalExpiresAtMs(now.getTime())),
  });
  return { id: Number(inserted[0].insertId), status: "pending" as const, creditCost: ASSISTANT_ASK_CREDIT_COST, expiresAt: new Date(getApprovalExpiresAtMs(now.getTime())).toISOString() };
}

export async function decideAssistantApproval(userId: number, approvalId: number, decision: "approved" | "declined") {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const current = (await db.select().from(assistantApprovals).where(and(eq(assistantApprovals.id, approvalId), eq(assistantApprovals.userId, userId))).limit(1))[0];
  if (!current) throw new Error("This approval is not in your account");
  if (current.status !== "pending") throw new Error("This approval was already handled");
  if (isApprovalExpired(current.expiresAt.getTime())) {
    await db.update(assistantApprovals).set({ status: "expired", decidedAt: new Date() }).where(eq(assistantApprovals.id, approvalId));
    throw new Error("This approval expired");
  }
  const result = await db.update(assistantApprovals).set({ status: decision, decidedAt: new Date() }).where(and(eq(assistantApprovals.id, approvalId), eq(assistantApprovals.status, "pending")));
  if (Number(result[0]?.affectedRows) !== 1) throw new Error("This approval was already handled");
  // An assistant-proposed ask carries its payload. It runs only here, after the owner approved it
  // themselves, through the same path as the in-app ask form (which spends the credit). The key is fixed
  // on the approval so a retry can never send twice. If it cannot run (for example, no credits),
  // the approval goes back to pending and the owner sees why.
  if (decision === "approved" && current.kind === "ask_send" && current.targetRoleUrl && current.idempotencyKey) {
    let attachmentIds: number[] = [];
    try { const parsed = JSON.parse(current.attachmentIds ?? "[]"); if (Array.isArray(parsed)) attachmentIds = parsed.filter((v: unknown): v is number => typeof v === "number"); } catch { /* handled below */ }
    try {
      const created = await createCompanyReferralRequest(userId, { targetRoleUrl: current.targetRoleUrl, personalPitch: current.note?.trim() || "No personal note was included with this referral request.", attachmentIds, idempotencyKey: current.idempotencyKey });
      await db.update(assistantApprovals).set({ executedRequestId: created.requestId }).where(eq(assistantApprovals.id, approvalId));
      return { id: approvalId, status: "approved" as const, requestId: created.requestId };
    } catch (error) {
      await db.update(assistantApprovals).set({ status: "pending", decidedAt: null }).where(and(eq(assistantApprovals.id, approvalId), eq(assistantApprovals.status, "approved")));
      throw error;
    }
  }
  return { id: approvalId, status: decision };
}

export async function listAssistantActivity(userId: number) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ action: operationalActivityLogs.action, outcome: operationalActivityLogs.outcome, resourceType: operationalActivityLogs.resourceType, metadata: operationalActivityLogs.metadata, createdAt: operationalActivityLogs.createdAt }).from(operationalActivityLogs).where(and(eq(operationalActivityLogs.actorUserId, userId), like(operationalActivityLogs.action, "assistant.%"))).orderBy(desc(operationalActivityLogs.createdAt)).limit(50);
  return rows.map(row => {
    let metadata: Record<string, unknown> = {};
    try { metadata = row.metadata ? JSON.parse(row.metadata) : {}; } catch { /* keep empty */ }
    return { action: row.action, outcome: row.outcome, resourceType: row.resourceType, metadata, createdAt: row.createdAt.toISOString() };
  });
}

export async function listDeveloperApps(userId: number): Promise<DeveloperApp[]> {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select().from(developerApps).where(eq(developerApps.userId, userId)).orderBy(desc(developerApps.createdAt));
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    description: row.description,
    website: row.website,
    redirectUrls: parseJsonArray(row.redirectUrls),
    scopes: parseJsonArray(row.scopes),
    status: row.status,
    rejectReasons: parseJsonArray(row.rejectReasons),
    webhookUrl: row.webhookUrl,
    clientId: row.clientId,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createDeveloperApp(userId: number, input: {
  name?: unknown; kind?: unknown; description?: unknown;
  website?: unknown; redirectUrls?: unknown; scopes?: unknown;
  agreeToTerms?: unknown;
}) {
  const name = validateAppName(input.name);
  if (!name) throw new Error("Give your app a name (2–80 characters)");
  const kind = normalizeAppKind(input.kind);
  if (!kind) throw new Error("Choose what you are building");
  const description = validateDescription(input.description);
  if (!description) throw new Error("Describe what your app does for job seekers");
  const website = input.website === undefined || input.website === null || input.website === "" ? null : validateUrl(input.website);
  if (website === null && input.website !== undefined && input.website !== null && input.website !== "") throw new Error("Enter a valid website URL");
  const redirectUrls = validateRedirectUrls(input.redirectUrls);
  if (!redirectUrls) throw new Error("Enter 1–10 valid redirect URLs");
  const scopes = normalizeScopes(input.scopes, DEVELOPER_APP_SCOPES);
  if (!scopes) throw new Error("Choose only the listed permissions");
  if (input.agreeToTerms !== true) throw new Error("Agree to the developer terms to register an app");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await assertAssistantAccess(userId);
  const tryInsert = (clientId: string) => db.insert(developerApps).values({ userId, name, kind, description, website, redirectUrls: JSON.stringify(redirectUrls), scopes: JSON.stringify(scopes), clientId });
  let inserted: Awaited<ReturnType<typeof tryInsert>> | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const clientId = `sw_app_${randomBytes(8).toString("hex")}`;
    try {
      inserted = await tryInsert(clientId);
      break;
    } catch (error) {
      if (isDuplicateKey(error) && attempt < 2) continue;
      throw error instanceof Error ? error : new Error("We could not register this app");
    }
  }
  if (!inserted) throw new Error("We could not register this app");
  const id = Number(inserted[0].insertId);
  return (await listDeveloperApps(userId)).find(app => app.id === id) ?? null;
}

export async function getDeveloperApp(userId: number, appId: number): Promise<DeveloperApp | null> {
  const db = await getDb(); if (!db) return null;
  const row = (await db.select().from(developerApps).where(and(eq(developerApps.id, appId), eq(developerApps.userId, userId))).limit(1))[0];
  if (!row) return null;
  return { id: row.id, name: row.name, kind: row.kind, description: row.description, website: row.website, redirectUrls: parseJsonArray(row.redirectUrls), scopes: parseJsonArray(row.scopes), status: row.status, rejectReasons: parseJsonArray(row.rejectReasons), webhookUrl: row.webhookUrl, clientId: row.clientId, createdAt: row.createdAt.toISOString() };
}

export async function updateDeveloperAppWebhook(userId: number, appId: number, input: { webhookUrl?: unknown }) {
  const webhookUrl = input.webhookUrl === undefined || input.webhookUrl === null || input.webhookUrl === "" ? null : validateUrl(input.webhookUrl);
  if (webhookUrl === null && input.webhookUrl !== undefined && input.webhookUrl !== null && input.webhookUrl !== "") throw new Error("Enter a valid webhook URL");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const current = (await db.select({ id: developerApps.id }).from(developerApps).where(and(eq(developerApps.id, appId), eq(developerApps.userId, userId))).limit(1))[0];
  if (!current) throw new Error("This app is not in your console");
  await db.update(developerApps).set({ webhookUrl }).where(eq(developerApps.id, appId));
  return { id: appId, webhookUrl };
}

export async function submitDeveloperAppForReview(userId: number, appId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const current = (await db.select({ id: developerApps.id, status: developerApps.status }).from(developerApps).where(and(eq(developerApps.id, appId), eq(developerApps.userId, userId))).limit(1))[0];
  if (!current) throw new Error("This app is not in your console");
  if (current.status !== "test" && current.status !== "rejected") throw new Error("Only test apps can be submitted for review");
  await db.update(developerApps).set({ status: "in_review" }).where(eq(developerApps.id, appId));
  return { id: appId, status: "in_review" as const };
}

/**
 * Showcase limits come from the plan entitlement (pieces, pins). The owner's
 * users row is the per-owner lock, so concurrent adds or pins cannot pass the
 * cap together. Over-limit pieces kept from a richer plan are never removed.
 */
export async function createWorkItem(userId: number, input: { title?: unknown; kind?: unknown; source?: unknown; url?: unknown; pinned?: unknown; visibleOnProfile?: unknown }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const patch = validateWorkItemInput(input);
  if (!patch.title) throw new Error("Give each work item a title up to 160 characters");
  const entitlements = await getSeekerEntitlements(userId);
  return db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1).for("update");
    const owned = await tx.select({ id: workItems.id, pinned: workItems.pinned }).from(workItems).where(eq(workItems.userId, userId));
    const violation = showcaseLimitViolation(entitlements, owned, { adding: true, pinning: patch.pinned === true });
    if (violation) throw violation;
    const inserted = await tx.insert(workItems).values({ userId, ...(patch as { title: string }) });
    const id = Number(inserted[0].insertId);
    return (await tx.select().from(workItems).where(eq(workItems.id, id)).limit(1))[0];
  });
}

export async function updateWorkItem(userId: number, itemId: number, input: { title?: unknown; kind?: unknown; source?: unknown; url?: unknown; pinned?: unknown; visibleOnProfile?: unknown }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const current = (await db.select().from(workItems).where(eq(workItems.id, itemId)).limit(1))[0];
  if (!current || current.userId !== userId) throw new Error("This work item is not in your account");
  const patch = validateWorkItemInput(input);
  if (Object.keys(patch).length === 0) return current;
  if (patch.pinned === true && !current.pinned) {
    const entitlements = await getSeekerEntitlements(userId);
    return db.transaction(async tx => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1).for("update");
      const owned = await tx.select({ id: workItems.id, pinned: workItems.pinned }).from(workItems).where(eq(workItems.userId, userId));
      const violation = showcaseLimitViolation(entitlements, owned.filter(item => item.id !== itemId), { adding: false, pinning: true });
      if (violation) throw violation;
      await tx.update(workItems).set({ ...patch, updatedAt: new Date() }).where(and(eq(workItems.id, itemId), eq(workItems.userId, userId)));
      return (await tx.select().from(workItems).where(eq(workItems.id, itemId)).limit(1))[0];
    });
  }
  await db.update(workItems).set({ ...patch, updatedAt: new Date() }).where(eq(workItems.id, itemId));
  return (await db.select().from(workItems).where(eq(workItems.id, itemId)).limit(1))[0];
}

export async function deleteWorkItem(userId: number, itemId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const current = (await db.select({ id: workItems.id, userId: workItems.userId }).from(workItems).where(eq(workItems.id, itemId)).limit(1))[0];
  if (!current || current.userId !== userId) throw new Error("This work item is not in your account");
  await db.delete(workItems).where(eq(workItems.id, itemId));
  return { deleted: true as const, id: itemId };
}

// Pure visibility decision for /api/p/:handle. A missing or "private" value
// hides everything from anyone but the owner; items are listed only when the
// owner marked them visible. Only what the kit public profile renders is sent:
// currentTitle, bio and skills stay off this payload (data minimisation).
function parseProfileOpenTo(raw: unknown): string[] {
  try {
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((role): role is string => typeof role === "string" && role.trim().length > 0 && role.trim().length <= 60).map(role => role.trim()).slice(0, 5);
  } catch { return []; }
}

export function shapePublicProfile(
  owner: { id: number; name: string | null; email: string | null },
  profile: NonNullable<Awaited<ReturnType<typeof getProfileByUserId>>>,
  allItems: Awaited<ReturnType<typeof listMyWorkItems>>,
  viewerUserId?: number,
) {
  const visibility = (profile.profileVisibility ?? "private") as ProfileVisibility;
  const isOwner = viewerUserId === owner.id;
  if (visibility === "private" && !isOwner) return { visible: false as const, visibility };
  const items = allItems.filter(item => isOwner || item.visibleOnProfile);
  return {
    visible: true as const,
    visibility,
    isOwner,
    // Beside "Verified at {domain}" a name taken from the email rebuilds the work email, so a
    // verified page withholds it (the owner's preview too); the email itself never leaves here.
    displayName: profile.workEmailVerifiedAt ? publicDisplayNameOf(owner.name, owner.email) : owner.name,
    headline: profile.headline,
    location: profile.location,
    openTo: parseProfileOpenTo((profile as { openTo?: unknown }).openTo),
    company: profile.company,
    verifiedWork: profile.workEmailVerifiedAt ? { domain: profile.workEmailDomain, verifiedAt: profile.workEmailVerifiedAt } : null,
    handle: profile.handle,
    workItems: items.map(item => ({ id: item.id, title: item.title, kind: item.kind, source: item.source, url: item.url, pinned: item.pinned, visibleOnProfile: item.visibleOnProfile })),
  };
}

export async function getPublicProfileByHandle(handle: string, viewerUserId?: number) {
  const db = await getDb(); if (!db) return undefined;
  const normalized = normalizeProfileHandle(handle);
  if (!normalized) return undefined;
  const owner = (await db.select({ id: users.id, name: users.name, email: users.email }).from(users).innerJoin(profiles, eq(profiles.userId, users.id)).where(eq(profiles.handle, normalized)).limit(1))[0];
  if (!owner) return undefined;
  const profile = await getProfileByUserId(owner.id);
  if (!profile) return undefined;
  return shapePublicProfile(owner, profile, await listMyWorkItems(owner.id), viewerUserId);
}
export const SAFETY_REPORT_REASONS = [
  "Asked for or offered money",
  "Harassment or inappropriate messages",
  "Fake job or scam",
  "Pretending to work at a company",
  "Spam or repeated asks",
  "Something else",
] as const;

export async function createSafetyReport(userId: number, input: { reason?: unknown; details?: unknown; referralRequestId?: unknown; reportedUserId?: unknown; urgent?: unknown }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (typeof input.reason !== "string" || !(SAFETY_REPORT_REASONS as readonly string[]).includes(input.reason)) throw new Error("Choose the reason that fits best");
  const details = typeof input.details === "string" ? input.details.trim().slice(0, 2000) : "";
  let requestId: number | null = null;
  if (input.referralRequestId !== undefined && input.referralRequestId !== null) {
    requestId = Number(input.referralRequestId);
    if (!Number.isInteger(requestId) || requestId <= 0) throw new Error("Invalid referral reference");
    const target = (await db.select({ id: referralRequests.id, jobSeekerId: referralRequests.jobSeekerId, referrerId: referralRequests.referrerId }).from(referralRequests).where(eq(referralRequests.id, requestId)).limit(1))[0];
    if (!target) throw new Error("Invalid referral reference");
    if (target.jobSeekerId !== userId && target.referrerId !== userId) throw new Error("You can only report conversations you are part of");
  }
  let reportedId: number | null = null;
  if (input.reportedUserId !== undefined && input.reportedUserId !== null) {
    reportedId = Number(input.reportedUserId);
    if (!Number.isInteger(reportedId) || reportedId <= 0) throw new Error("Invalid reported account");
    const account = (await db.select({ id: users.id }).from(users).where(eq(users.id, reportedId)).limit(1))[0];
    if (!account) throw new Error("Invalid reported account");
    if (reportedId === userId) throw new Error("You cannot report yourself");
  }
  const dayAgo = new Date(Date.now() - 86400000);
  const today = (await db.select({ id: safetyReports.id }).from(safetyReports).where(and(eq(safetyReports.reporterUserId, userId), gt(safetyReports.createdAt, dayAgo))).limit(21)).length;
  if (today >= 20) throw new Error("You have filed several reports today. Contact support directly for anything urgent.");
  const urgent = Boolean(input.urgent), filedAt = Date.now();
  const inserted = await db.insert(safetyReports).values({ reporterUserId: userId, reason: input.reason, details: details || null, referralRequestId: requestId, reportedUserId: reportedId, urgent, severity: reportSeverity(urgent), dueAt: reviewDueAt(filedAt, urgent) });
  const id = Number(inserted[0].insertId);
  // The case file is best-effort: a failure here never blocks the report itself.
  try { await db.insert(moderationEvents).values(urgent ? [{ reportId: id, actorKind: "reporter", actorUserId: userId, kind: "opened" }, { reportId: id, actorKind: "reporter", actorUserId: userId, kind: "flagged_urgent" }] : [{ reportId: id, actorKind: "reporter", actorUserId: userId, kind: "opened" }]); } catch (error) { console.warn("[moderation] could not record opening event", { reportId: id, name: error instanceof Error ? error.name : "unknown" }); }
  // Evidence snapshot: only messages the reporter sent or received in this approved request thread, copied once, best-effort.
  if (requestId !== null) {
    try {
      const target = (await db.select({ jobSeekerId: referralRequests.jobSeekerId, referrerId: referralRequests.referrerId }).from(referralRequests).where(eq(referralRequests.id, requestId)).limit(1))[0];
      const otherId = target ? (target.jobSeekerId === userId ? target.referrerId : target.jobSeekerId) : null;
      if (target && otherId !== null && otherId !== undefined) {
        const thread = await db.select({ id: messages.id, senderId: messages.senderId, body: messages.body, createdAt: messages.createdAt }).from(messages).where(and(eq(messages.referralRequestId, requestId), or(and(eq(messages.senderId, userId), eq(messages.recipientId, otherId)), and(eq(messages.senderId, otherId), eq(messages.recipientId, userId))))).orderBy(desc(messages.createdAt), desc(messages.id)).limit(50);
        const rows = buildEvidenceRows(id, userId, thread);
        if (rows.length) await db.insert(moderationEvidence).values(rows);
      }
    } catch (error) { console.warn("[moderation] could not record evidence snapshot", { reportId: id, name: error instanceof Error ? error.name : "unknown" }); }
  }
  return { id, reference: `R-${1000 + id}`, urgent: Boolean(input.urgent) };
}

export async function listMySafetyReports(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select({ id: safetyReports.id, reason: safetyReports.reason, status: safetyReports.status, urgent: safetyReports.urgent, createdAt: safetyReports.createdAt }).from(safetyReports).where(eq(safetyReports.reporterUserId, userId)).orderBy(desc(safetyReports.createdAt)).limit(50);
}

export type CompanyDemandVote = { id: number; companyName: string; jobFunction: JobFunction | null; alreadyRecorded: boolean };

/**
 * One seeker's vote for one company they want on SkipWait. Votes are per person:
 * a second seeker naming the same company adds their own row, and the distinct
 * seekers behind a name are the demand signal. The same seeker asking twice gets
 * their live row back, not an error, and spends none of the three-a-day
 * allowance; only a suggestion a reviewer dismissed can be voted on again.
 */
export async function createCompanySuggestion(userId: number, input: { companyName?: unknown; website?: unknown; role?: unknown; jobFunction?: unknown }): Promise<CompanyDemandVote> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (typeof input.companyName !== "string" || input.companyName.trim().length < 2 || input.companyName.trim().length > 160) throw new Error("Name the company you want to see");
  const name = input.companyName.trim();
  const role = input.role === "employee" ? "employee" : "seeker";
  const parsedFunction = jobFunctionSchema.nullish().safeParse(input.jobFunction);
  if (!parsedFunction.success) throw new Error("Choose a work function from the list");
  const jobFunction = parsedFunction.data ?? null;
  let website: string | null = null;
  if (input.website !== undefined && input.website !== null && String(input.website).trim() !== "") {
    website = String(input.website).trim();
    if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(website) || website.length > 512) throw new Error("Company websites must start with http:// or https://");
  }
  const mine = (await db.select({ id: companySuggestions.id, companyName: companySuggestions.companyName, jobFunction: companySuggestions.jobFunction }).from(companySuggestions).where(and(eq(companySuggestions.submitterUserId, userId), ne(companySuggestions.status, "dismissed"), sql`LOWER(${companySuggestions.companyName}) = ${name.toLowerCase()}`)).limit(1))[0];
  if (mine) {
    // A later vote can still add the function the first one left unset.
    if (jobFunction && !parseJobFunction(mine.jobFunction)) await db.update(companySuggestions).set({ jobFunction }).where(eq(companySuggestions.id, mine.id));
    return { id: mine.id, companyName: mine.companyName, jobFunction: jobFunction ?? parseJobFunction(mine.jobFunction), alreadyRecorded: true };
  }
  const dayAgo = new Date(Date.now() - 86400000);
  const today = (await db.select({ id: companySuggestions.id }).from(companySuggestions).where(and(eq(companySuggestions.submitterUserId, userId), gt(companySuggestions.createdAt, dayAgo))).limit(4)).length;
  if (today >= 3) throw new Error("You can suggest up to 3 companies a day");
  const inserted = await db.insert(companySuggestions).values({ submitterUserId: userId, companyName: name, website, role, jobFunction });
  return { id: Number(inserted[0].insertId), companyName: name, jobFunction, alreadyRecorded: false };
}

export async function listMyCompanySuggestions(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select({ id: companySuggestions.id, companyName: companySuggestions.companyName, jobFunction: companySuggestions.jobFunction, status: companySuggestions.status, createdAt: companySuggestions.createdAt }).from(companySuggestions).where(eq(companySuggestions.submitterUserId, userId)).orderBy(desc(companySuggestions.createdAt)).limit(50);
}

export async function listSafetyReportsAdmin(limit = 100) {
  const db = await getDb(); if (!db) return [];
  const reports = await db.select({ id: safetyReports.id, severity: safetyReports.severity, dueAt: safetyReports.dueAt, reporterUserId: safetyReports.reporterUserId, reason: safetyReports.reason, details: safetyReports.details, referralRequestId: safetyReports.referralRequestId, reportedUserId: safetyReports.reportedUserId, urgent: safetyReports.urgent, status: safetyReports.status, createdAt: safetyReports.createdAt, updatedAt: safetyReports.updatedAt }).from(safetyReports).orderBy(desc(safetyReports.urgent), desc(safetyReports.createdAt)).limit(Math.min(250, Math.max(1, limit)));
  if (!reports.length) return reports.map(report => ({ ...report, events: [] as Array<{ actor: string; kind: string; note: string | null; createdAt: string }> }));
  let events = new Map() as ReturnType<typeof groupModerationEvents>;
  try { events = groupModerationEvents(await db.select({ reportId: moderationEvents.reportId, actorKind: moderationEvents.actorKind, kind: moderationEvents.kind, note: moderationEvents.note, createdAt: moderationEvents.createdAt }).from(moderationEvents).where(inArray(moderationEvents.reportId, reports.map(report => report.id))) as never); } catch (error) { console.warn("[moderation] could not load events", { name: error instanceof Error ? error.name : "unknown" }); }
  let evidence = new Map() as ReturnType<typeof groupEvidence>;
  try { evidence = groupEvidence(await db.select({ reportId: moderationEvidence.reportId, seq: moderationEvidence.seq, sender: moderationEvidence.sender, body: moderationEvidence.body, sentAt: moderationEvidence.sentAt }).from(moderationEvidence).where(inArray(moderationEvidence.reportId, reports.map(report => report.id)))); } catch (error) { console.warn("[moderation] could not load evidence", { name: error instanceof Error ? error.name : "unknown" }); }
  return reports.map(report => ({ ...report, events: events.get(report.id) ?? [], evidence: evidence.get(report.id) ?? [] }));
}

export async function reviewSafetyReport(adminId: number, reportId: number, input: { status?: unknown; note?: unknown }, notify?: (userId: number, title: string, body: string) => Promise<unknown>) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (input.status !== "resolved" && input.status !== "dismissed" && input.status !== "under_review") throw new Error("Choose under review, resolved, or dismissed");
  if (typeof input.note !== "string" || !input.note.trim()) throw new Error("A reviewer note is required");
  const current = (await db.select().from(safetyReports).where(eq(safetyReports.id, reportId)).limit(1))[0];
  if (!current) throw new Error("This report could not be found");
  if (current.status === "resolved" || current.status === "dismissed") throw new Error("This report was already resolved");
  await db.update(safetyReports).set({ status: input.status, updatedAt: new Date() }).where(eq(safetyReports.id, reportId));
  try { await db.insert(moderationEvents).values({ reportId, actorKind: "reviewer", actorUserId: adminId, kind: input.status, note: cleanModerationNote(input.note) }); } catch (error) { console.warn("[moderation] could not record decision event", { reportId, name: error instanceof Error ? error.name : "unknown" }); }
  if ((input.status === "resolved" || input.status === "dismissed") && notify) {
    await notify(current.reporterUserId, "Update on your report", input.status === "resolved" ? "Our safety team reviewed your report and took action. Thank you for flagging it." : "Our safety team reviewed your report and closed it with no violation found.").catch(() => undefined);
  }
  return { id: reportId, status: input.status, reviewerId: adminId };
}

/**
 * Demand per company, keyed by the trimmed lower-cased name: how many distinct
 * seekers asked. Rows are per seeker, but a seeker whose suggestion a reviewer
 * dismissed may vote again, so rows are counted by person, not by row.
 */
export function countCompanyDemand(rows: ReadonlyArray<{ companyName: string; submitterUserId: number }>): Map<string, number> {
  const counted = new Set<string>();
  const votes = new Map<string, number>();
  for (const row of rows) {
    const key = row.companyName.trim().toLowerCase();
    if (!key) continue;
    const seeker = `${key} ${row.submitterUserId}`;
    if (counted.has(seeker)) continue;
    counted.add(seeker);
    votes.set(key, (votes.get(key) ?? 0) + 1);
  }
  return votes;
}

export async function listCompanySuggestionsAdmin(limit = 100) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ id: companySuggestions.id, submitterUserId: companySuggestions.submitterUserId, companyName: companySuggestions.companyName, website: companySuggestions.website, jobFunction: companySuggestions.jobFunction, role: companySuggestions.role, status: companySuggestions.status, createdAt: companySuggestions.createdAt }).from(companySuggestions).orderBy(desc(companySuggestions.createdAt)).limit(Math.min(250, Math.max(1, limit)));
  // Demand counts every seeker, including ones older than this page, so the rows
  // are read again unbounded; the table is reviewer-sized, not user-sized.
  const votes = countCompanyDemand(await db.select({ companyName: companySuggestions.companyName, submitterUserId: companySuggestions.submitterUserId }).from(companySuggestions));
  return rows.map(row => ({ ...row, jobFunction: parseJobFunction(row.jobFunction), votes: votes.get(row.companyName.trim().toLowerCase()) ?? 0 }));
}

export async function reviewCompanySuggestion(adminId: number, suggestionId: number, input: { status?: unknown; note?: unknown }, notify?: (userId: number, title: string, body: string) => Promise<unknown>) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (input.status !== "approved" && input.status !== "dismissed" && input.status !== "under_review") throw new Error("Choose under review, approved, or dismissed");
  if (typeof input.note !== "string" || !input.note.trim()) throw new Error("A reviewer note is required");
  const current = (await db.select().from(companySuggestions).where(eq(companySuggestions.id, suggestionId)).limit(1))[0];
  if (!current) throw new Error("This suggestion could not be found");
  if (current.status === "approved" || current.status === "dismissed") throw new Error("This suggestion was already resolved");
  await db.update(companySuggestions).set({ status: input.status }).where(eq(companySuggestions.id, suggestionId));
  if ((input.status === "approved" || input.status === "dismissed") && notify) {
    await notify(current.submitterUserId, "Update on your company suggestion", input.status === "approved" ? `Thanks — ${current.companyName} is approved for listing.` : `Thanks for suggesting ${current.companyName}; we can't list it right now.`).catch(() => undefined);
  }
  return { id: suggestionId, status: input.status, reviewerId: adminId };
}

export async function listUsersAdmin(limit = 100) {
  const db = await getDb(); if (!db) return [];
  return db.select({ id: users.id, email: users.email, name: users.name, role: users.role, accountType: profiles.accountType, company: profiles.company, workEmailVerifiedAt: profiles.workEmailVerifiedAt, suspended: users.suspended, createdAt: users.createdAt }).from(users).leftJoin(profiles, eq(profiles.userId, users.id)).orderBy(desc(users.createdAt)).limit(Math.min(200, Math.max(1, limit)));
}
export async function setUserSuspended(userId: number, suspended: boolean) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const account=(await db.select().from(users).where(eq(users.id,userId)).limit(1))[0];if(!account)throw new Error("User not found");const now=new Date();if(account.canonicalPersonId){// An explicit admin unsuspend IS the operator review the freeze was
    // waiting for: clear the identity-review reason so sign-in works again.
    // Suspending never touches the reason.
    await db.update(canonicalPeople).set(suspended?{suspended,sessionsValidAfter:now}:{suspended,reviewReason:null,sessionsValidAfter:now}).where(eq(canonicalPeople.id,account.canonicalPersonId));const aliases=await db.select({userId:verifiedLoginAliases.canonicalUserId}).from(verifiedLoginAliases).where(eq(verifiedLoginAliases.canonicalPersonId,account.canonicalPersonId));await db.update(users).set({suspended,sessionsValidAfter:now}).where(inArray(users.id,[account.id,...aliases.map(a=>a.userId)]));}else await db.update(users).set({suspended,sessionsValidAfter:now}).where(eq(users.id,userId));return {userId,suspended};
}
export async function isUserSuspended(userId: number) {
  const db = await getDb(); if (!db) return false;
  const [row] = await db.select({ suspended: users.suspended }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(row?.suspended);
}

// WorkOS webhook support: resolve a WorkOS user_xxx subject to the local
// canonical account via the verified alias the AuthKit callback upserts
// (provider "workos"). Unknown subjects resolve to undefined so deletions of
// never-seen users stay a quiet 200 instead of a retry-driving 500.
export async function findUserByWorkosId(workosUserId: string): Promise<{ userId: number; openId: string } | undefined> {
  const db = await getDb(); if (!db) return undefined;
  const alias = (await db.select({ userId: verifiedLoginAliases.canonicalUserId, openId: verifiedLoginAliases.openId }).from(verifiedLoginAliases).where(and(eq(verifiedLoginAliases.provider, "workos"), eq(verifiedLoginAliases.subject, workosUserId))).limit(1))[0];
  return alias ? { userId: alias.userId, openId: alias.openId } : undefined;
}

export async function suspendUserByWorkosId(workosUserId: string): Promise<{ userId: number } | undefined> {
  const match = await findUserByWorkosId(workosUserId);
  if (!match) return undefined;
  await setUserSuspended(match.userId, true);
  await revokeUserSessions(match.openId);
  return { userId: match.userId };
}

export async function updateUserProfileByWorkosId(workosUserId: string, profile: { name?: string; email?: string }): Promise<{ userId: number } | undefined> {
  const db = await getDb(); if (!db) return undefined;
  const match = await findUserByWorkosId(workosUserId);
  if (!match) return undefined;
  const patch: { name?: string; email?: string } = {};
  if (typeof profile.name === "string" && profile.name.trim()) patch.name = profile.name.trim().slice(0, 120);
  if (typeof profile.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(profile.email.trim()) && profile.email.trim().length <= 320) patch.email = profile.email.trim().toLowerCase();
  if (Object.keys(patch).length === 0) return { userId: match.userId };
  await db.update(users).set(patch).where(eq(users.id, match.userId));
  return { userId: match.userId };
}

export async function createResumeUploadSession(ownerId: number, input: { sessionId?: string; fileName: string; mimeType: string; expectedSize: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const id = randomUUID(); const clientUploadId = input.sessionId;
  await db.insert(resumeUploadSessions).values({ id, ownerId, clientUploadId, fileName: input.fileName, mimeType: input.mimeType, expectedSize: input.expectedSize }).onDuplicateKeyUpdate({ set: { clientUploadId } });
  const selected = clientUploadId ? await db.select({ id: resumeUploadSessions.id }).from(resumeUploadSessions).where(and(eq(resumeUploadSessions.ownerId, ownerId), eq(resumeUploadSessions.clientUploadId, clientUploadId))).limit(1) : [{ id }];
  const existing = await getResumeUploadSession(ownerId, selected[0]?.id || id);
  if (!existing || existing.fileName !== input.fileName || existing.mimeType !== input.mimeType || existing.expectedSize !== input.expectedSize) throw new Error("Upload identity is already in use");
  return existing;
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

export async function claimResumeUploadFinalization(ownerId: number, sessionId: string, finalizationOwner: string) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const leaseUntil = new Date(Date.now() + 2 * 60 * 1000);
  const result = await db.update(resumeUploadSessions).set({ status: "finalizing", finalizationOwner, finalizationLeaseUntil: leaseUntil })
    .where(and(eq(resumeUploadSessions.id, sessionId), eq(resumeUploadSessions.ownerId, ownerId), or(eq(resumeUploadSessions.status, "active"), and(eq(resumeUploadSessions.status, "finalizing"), or(isNull(resumeUploadSessions.finalizationLeaseUntil), sql`${resumeUploadSessions.finalizationLeaseUntil} < NOW()`)))));
  const session = await getResumeUploadSession(ownerId, sessionId);
  if (!session) return { outcome: "missing" as const };
  if (session.status === "completed" && session.attachmentId) return { outcome: "completed" as const, session };
  if (Number(result[0].affectedRows) === 1 && session.finalizationOwner === finalizationOwner) return { outcome: "claimed" as const, session };
  return { outcome: "finalizing" as const, session };
}

export async function completeResumeUploadSession(ownerId: number, sessionId: string, finalizationOwner: string, input: { fileName: string; fileKey: string; mimeType: string; fileSize: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    await tx.insert(referralAttachments).values({ ownerId, uploadSessionId: sessionId, ...input }).onDuplicateKeyUpdate({ set: { uploadSessionId: sessionId } });
    const rows = await tx.select({ id: referralAttachments.id, fileName: referralAttachments.fileName, fileKey: referralAttachments.fileKey, mimeType: referralAttachments.mimeType, fileSize: referralAttachments.fileSize }).from(referralAttachments).where(eq(referralAttachments.uploadSessionId, sessionId)).limit(1);
    const attachment = rows[0]; if (!attachment) throw new Error("Finalized attachment could not be bound");
    const result = await tx.update(resumeUploadSessions).set({ status: "completed", attachmentId: attachment.id, permanentStorageKey: input.fileKey, finalizationOwner: null, finalizationLeaseUntil: null }).where(and(eq(resumeUploadSessions.id, sessionId), eq(resumeUploadSessions.ownerId, ownerId), eq(resumeUploadSessions.status, "finalizing"), eq(resumeUploadSessions.finalizationOwner, finalizationOwner)));
    if (Number(result[0].affectedRows) !== 1) {
      const current = await tx.select({ attachmentId: resumeUploadSessions.attachmentId }).from(resumeUploadSessions).where(and(eq(resumeUploadSessions.id, sessionId), eq(resumeUploadSessions.ownerId, ownerId))).limit(1);
      if (current[0]?.attachmentId !== attachment.id) throw new Error("Resume upload finalization lease changed; retry completion");
    }
    await tx.delete(resumeUploadChunks).where(eq(resumeUploadChunks.sessionId, sessionId));
    return attachment;
  });
}

export async function clearUnattachedResumeUploads(ownerId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const attachments = await tx.select({ id: referralAttachments.id, fileKey: referralAttachments.fileKey }).from(referralAttachments).where(and(eq(referralAttachments.ownerId, ownerId), isNull(referralAttachments.referralRequestId), notProfileResume(ownerId)));
    if (attachments.length) await tx.delete(referralAttachments).where(and(eq(referralAttachments.ownerId, ownerId), isNull(referralAttachments.referralRequestId), notProfileResume(ownerId)));
    await tx.delete(resumeUploadSessions).where(eq(resumeUploadSessions.ownerId, ownerId));
    return { cleared: attachments.length, fileKeys: attachments.map(item => item.fileKey) };
  });
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

export async function reviewPrivacyRequest(adminUserId: number, requestId: number, input: { status: "in_review"; resolution?: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const existing = await db.select({ id: privacyRequests.id, userId: privacyRequests.userId, kind: privacyRequests.kind }).from(privacyRequests).where(eq(privacyRequests.id, requestId)).limit(1);
  if (!existing[0]) return undefined;
  const resolution = input.resolution?.trim().slice(0, 500) || "Blocked: awaiting verified erasure inventory and per-resource evidence.";
  const activeKey = `${existing[0].kind}:${existing[0].userId}`;
  await db.update(privacyRequests).set({ status: "in_review", activeKey, resolution, reviewedByUserId: adminUserId, reviewedAt: new Date() }).where(and(eq(privacyRequests.id, requestId), inArray(privacyRequests.status, ["requested", "in_review"])));
  return { id: requestId, status: "in_review" as const, resolution };
}

export async function getVerifiedWorkEmailAccess(userId: number) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !isVerifiedEmployeeOfCompany(profile, profile.workEmailDomain)) return undefined;
  return { workEmailDomain: profile.workEmailDomain };
}

export type PrivateReferrerImpactSummary = { reviewed: number; approved: number; introductions: number; interviews: number; offers: number; repliedWithin3DaysPct: number | null };

export async function getPrivateReferrerImpactSummary(userId: number): Promise<PrivateReferrerImpactSummary> {
  const access = await getVerifiedWorkEmailAccess(userId);
  if (!access) throw new Error("Verify your company email to view your private impact");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const rows = await db.select({ status: referralRequests.status }).from(referralRequests).where(eq(referralRequests.referrerId, userId));
  const statusCount = (status: ReferralStatus) => rows.filter(row => row.status === status).length;
  // Reply latency from the append-only transition log: claim instant vs the
  // referrer's first decision (approve, review, or pass) on the same ask.
  // Computed in JS from stored timestamps; null when nothing decided yet.
  const DECISION_ACTIONS = new Set(["approve", "review", "pass"]);
  const trail = await db.select({ requestId: referralTransitionEvents.referralRequestId, action: referralTransitionEvents.action, at: referralTransitionEvents.createdAt }).from(referralTransitionEvents).where(eq(referralTransitionEvents.actorUserId, userId));
  const claimedAt = new Map<number, number>();
  const decidedAt = new Map<number, number>();
  for (const event of trail) {
    const at = event.at instanceof Date ? event.at.getTime() : new Date(event.at).getTime();
    if (!Number.isFinite(at)) continue;
    if (event.action === "claim") claimedAt.set(event.requestId, Math.min(claimedAt.get(event.requestId) ?? Infinity, at));
    else if (DECISION_ACTIONS.has(event.action)) decidedAt.set(event.requestId, Math.min(decidedAt.get(event.requestId) ?? Infinity, at));
  }
  let decided = 0;
  let within3Days = 0;
  for (const [requestId, decidedMs] of Array.from(decidedAt)) {
    const claimMs = claimedAt.get(requestId);
    if (claimMs === undefined || decidedMs < claimMs) continue;
    decided += 1;
    if (decidedMs - claimMs <= 3 * 24 * 60 * 60 * 1000) within3Days += 1;
  }
  return {
    reviewed: rows.length,
    approved: statusCount("approved") + statusCount("intro_made") + statusCount("interview") + statusCount("offer"),
    introductions: statusCount("intro_made") + statusCount("interview") + statusCount("offer"),
    interviews: statusCount("interview") + statusCount("offer"),
    offers: statusCount("offer"),
    repliedWithin3DaysPct: decided === 0 ? null : Math.round((within3Days / decided) * 100),
  };
}

export type ReferrerImpactSummary = { acceptedReferrals: number; introductions: number; activeConversations: number; outcomesShared: number; pendingRequests: number; declinedRequests: number; unreadMessages: number; creditsRemaining: number; recentAccepted: Array<{ id: number; companyDomain: string; acceptedAt: string }> };

export type ReferrerImpactSource = {
  requests: Array<{ id: number; status: ReferralStatus; companyDomain: string; updatedAt: Date }>;
  /** The append-only milestone history of those asks; statuses collapse, this does not. */
  milestones: Array<{ referralRequestId: number; resultingStatus: string }>;
  /** Ask ids with at least one message exchanged with the seeker. */
  threadedRequestIds: number[];
  unreadMessageCount: number;
  creditsRemaining: number;
};

const ACCEPTED_STATUSES = new Set<ReferralStatus>(["approved", "intro_made", "interview", "offer", "closed"]);
// A conversation is live only while the referral itself is running: a closed or
// withdrawn ask is a finished one, so a message in it is not an active thread.
const OPEN_ACCEPTED_STATUSES = new Set<ReferralStatus>(["approved", "intro_made", "interview", "offer"]);
// Kit impact labels. Each counts a recorded transition, so an ask that reached
// "interview" and later closed still counts — the referrer's history is real.
const INTRODUCTION_MILESTONES = new Set<string>(["intro_made", "interview", "offer"]);
const SHARED_OUTCOME_MILESTONES = new Set<string>(["interview", "offer"]);

export function summarizeReferrerImpact(source: ReferrerImpactSource): ReferrerImpactSummary {
  const accepted = [...source.requests].filter(row => ACCEPTED_STATUSES.has(row.status)).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const openAcceptedIds = new Set(source.requests.filter(row => OPEN_ACCEPTED_STATUSES.has(row.status)).map(row => row.id));
  const requestsWithMilestone = (allowed: Set<string>) => new Set(source.milestones.filter(event => allowed.has(event.resultingStatus)).map(event => event.referralRequestId)).size;
  return {
    acceptedReferrals: accepted.length,
    introductions: requestsWithMilestone(INTRODUCTION_MILESTONES),
    activeConversations: new Set(source.threadedRequestIds.filter(id => openAcceptedIds.has(id))).size,
    outcomesShared: requestsWithMilestone(SHARED_OUTCOME_MILESTONES),
    pendingRequests: source.requests.filter(row => row.status === "pending").length,
    declinedRequests: source.requests.filter(row => row.status === "declined").length,
    unreadMessages: source.unreadMessageCount,
    creditsRemaining: source.creditsRemaining,
    recentAccepted: accepted.slice(0, 5).map(row => ({ id: row.id, companyDomain: row.companyDomain, acceptedAt: row.updatedAt.toISOString() })),
  };
}

export async function getReferrerImpactSummary(userId: number): Promise<ReferrerImpactSummary> {
  const access = await getVerifiedWorkEmailAccess(userId);
  if (!access) throw new Error("Verify your company email to view your private impact");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const requests = await db.select({ id: referralRequests.id, status: referralRequests.status, companyDomain: jobs.company, updatedAt: referralRequests.updatedAt }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(eq(referralRequests.referrerId, userId));
  const unreadRows = await db.select({ unreadMessageCount: count(messages.id) }).from(messages).where(and(eq(messages.recipientId, userId), isNull(messages.readAt)));
  const wallet = await ensureTokenWallet(userId, "referrer");
  const requestIds = requests.map(row => row.id);
  const milestones = requestIds.length === 0 ? [] : await db.select({ referralRequestId: referralTransitionEvents.referralRequestId, resultingStatus: referralTransitionEvents.resultingStatus }).from(referralTransitionEvents).where(inArray(referralTransitionEvents.referralRequestId, requestIds));
  const messageRows = requestIds.length === 0 ? [] : await db.select({ referralRequestId: messages.referralRequestId }).from(messages).where(inArray(messages.referralRequestId, requestIds));
  const milestoneEvents = milestones.filter((event): event is { referralRequestId: number; resultingStatus: string } => event.referralRequestId !== null);
  return summarizeReferrerImpact({
    requests,
    milestones: milestoneEvents,
    threadedRequestIds: messageRows.map(row => row.referralRequestId).filter((id): id is number => id !== null),
    unreadMessageCount: Number(unreadRows[0]?.unreadMessageCount ?? 0),
    creditsRemaining: Math.max(0, wallet.monthlyCreditsRemaining + wallet.balance),
  });
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
  if (!profile?.workEmailDomain || !isVerifiedEmployeeOfCompany(profile, profile.workEmailDomain)) throw new Error("Verify your company email before creating your link");
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
  throw new Error("We could not create your link");
}

export async function getPublicReferrerFastTrackLink(linkCode: string): Promise<{ companyDomain: string; isActive: true } | undefined> {
  const normalizedCode = linkCode.trim().slice(0, 64);
  if (!normalizedCode) return undefined;
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select({ companyDomain: referrerFastTrackLinks.companyDomain, isActive: referrerFastTrackLinks.isActive, referrerId: referrerFastTrackLinks.referrerId, accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt }).from(referrerFastTrackLinks).innerJoin(profiles, eq(referrerFastTrackLinks.referrerId, profiles.userId)).where(and(eq(referrerFastTrackLinks.linkCode, normalizedCode), eq(referrerFastTrackLinks.isActive, true))).limit(1);
  const link = result[0];
  if (!link || !isVerifiedEmployeeOfCompany(link, link.companyDomain)) return undefined;
  return { companyDomain: link.companyDomain, isActive: true };
}

export async function getPublicReferrerFastTrackVanityLink(companySlug: string, vanityAlias: string): Promise<{ companyDomain: string; isActive: true } | undefined> {
  const normalizedSlug = companySlug.trim().toLowerCase();
  const normalizedAlias = vanityAlias.trim().toLowerCase();
  if (!normalizedSlug || !isSafeFastTrackAlias(normalizedAlias)) return undefined;
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select({ companyDomain: referrerFastTrackLinks.companyDomain, isActive: referrerFastTrackLinks.isActive, referrerId: referrerFastTrackLinks.referrerId, accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt }).from(referrerFastTrackLinks).innerJoin(profiles, eq(referrerFastTrackLinks.referrerId, profiles.userId)).where(and(eq(referrerFastTrackLinks.vanityAlias, normalizedAlias), eq(referrerFastTrackLinks.isActive, true))).limit(1);
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
export async function listMyUploadStarts(userId: number, since: Date) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ sessionId: operationalActivityLogs.resourceId, metadata: operationalActivityLogs.metadata, createdAt: operationalActivityLogs.createdAt }).from(operationalActivityLogs).where(and(eq(operationalActivityLogs.actorUserId, userId), eq(operationalActivityLogs.action, "document.upload_started"), gt(operationalActivityLogs.createdAt, since))).orderBy(desc(operationalActivityLogs.createdAt)).limit(30);
  return rows.map(row => { let metadata: Record<string, unknown> = {}; try { metadata = row.metadata ? JSON.parse(row.metadata) : {}; } catch {} return { sessionId: row.sessionId, clientUploadId: typeof metadata.clientUploadId === "string" ? metadata.clientUploadId : null, fileName: typeof metadata.fileName === "string" ? metadata.fileName : null, createdAt: row.createdAt }; });
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
      const { canonicalUrl, body: html } = await fetchPublicJobLink(pageUrl);
      const redirectDomain = verifiedRedirectEmployerDomain(targetRoleUrl, canonicalUrl);
      return { candidates: employerCandidatesFromJobPageHtml(html), officialDomains: [...officialEmployerDomainsFromJobPageHtml(html), ...(redirectDomain ? [redirectDomain] : [])] };
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
  // Approximate/brand-prefix evidence is suggestion-only. Routing requires an exact normalized label match.
  return undefined;
}

export function isWorkEmailDomain(domain: string): boolean { return isCorporateEmailDomain(domain); }

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

export async function completeWorkEmailOtpEnrollment(input: { receipt: string; email: string; userId: number; inviteCode?: string }) {
  const email = input.email.trim().toLowerCase(); const domain = email.split("@")[1];
  if (!domain || !isWorkEmailDomain(domain) || !Number.isInteger(input.userId) || input.userId <= 0) throw new Error("A verified work email is required");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const result = await db.transaction(async tx => {
    const receiptHash = createHash("sha256").update(input.receipt).digest("hex");
    const receipts = await tx.select().from(workEmailOtpReceipts).where(and(eq(workEmailOtpReceipts.receiptHash, receiptHash), inArray(workEmailOtpReceipts.email, workEmailStorageKeys(email).read), eq(workEmailOtpReceipts.userId, input.userId), eq(workEmailOtpReceipts.purpose, "work_email_enrollment"), gt(workEmailOtpReceipts.expiresAt, new Date()))).limit(1).for("update");
    const receipt = receipts[0];
    if (!receipt) throw new Error("OTP_RECEIPT_INVALID");
    // A replay after a lost response is safe and returns the already-completed
    // enrollment only for this exact account/email/purpose.
    if (receipt.usedAt) {
      const profile = (await tx.select({ workEmailDomain: profiles.workEmailDomain }).from(profiles).where(eq(profiles.userId, input.userId)).limit(1))[0];
      if (profile?.workEmailDomain === domain) return { workEmailDomain: domain, reward: { rewarded: false as const, reason: "replayed" as const }, replayed: true };
      throw new Error("OTP_RECEIPT_USED");
    }
    const consumed = await tx.update(workEmailOtpReceipts).set({ usedAt: new Date() }).where(and(eq(workEmailOtpReceipts.id, receipt.id), isNull(workEmailOtpReceipts.usedAt)));
    if (Number(consumed[0]?.affectedRows ?? 0) !== 1) throw new Error("OTP_RECEIPT_USED");
    await tx.insert(profiles).values({ userId: input.userId, accountType: "referrer", company: domain, workEmailDomain: domain, workEmailVerifiedAt: new Date(), isOnboarded: true }).onDuplicateKeyUpdate({ set: { accountType: "referrer", company: domain, workEmailDomain: domain, workEmailVerifiedAt: new Date(), isOnboarded: true } });
    let reward: { rewarded: boolean; tokenCount?: number; reason?: string } = { rewarded: false };
    const inviteCode = input.inviteCode?.trim();
    if (inviteCode) {
      const invitation = (await tx.select().from(companyCoverageInvitations).where(eq(companyCoverageInvitations.inviteCode, inviteCode)).limit(1).for("update"))[0];
      if (invitation?.status === "active" && invitation.inviterUserId !== input.userId && invitation.companyDomain === domain) {
        const priorForInviter = await tx.select({ id: companyCoverageRewards.id }).from(companyCoverageRewards).where(eq(companyCoverageRewards.inviterUserId, invitation.inviterUserId)).limit(1);
        const priorForJoiner = await tx.select({ id: companyCoverageRewards.id }).from(companyCoverageRewards).where(eq(companyCoverageRewards.joinerUserId, input.userId)).limit(1);
        if (!priorForInviter[0] && !priorForJoiner[0]) {
          await tx.insert(companyCoverageRewards).values({ invitationId: invitation.id, inviterUserId: invitation.inviterUserId, joinerUserId: input.userId, tokenCount: COMPANY_COVERAGE_REWARD_TOKENS });
          // D-055: the inviting seeker's pending credit stays; the joining referrer's (unlocked by accepting an ask) is off.
          await tx.insert(tokenTransactions).values([{ userId: invitation.inviterUserId, role: "job_seeker", tokenCount: COMPANY_COVERAGE_REWARD_TOKENS, kind: "invite_reward_pending", rewardStatus: "pending" }, ...(REFERRER_ACCEPT_REWARDS_ENABLED ? [{ userId: input.userId, role: "referrer" as const, tokenCount: COMPANY_COVERAGE_REWARD_TOKENS, kind: "invite_reward_pending" as const, rewardStatus: "pending" as const }] : [])]);
          await tx.insert(notifications).values([{ userId: invitation.inviterUserId, category: "system", title: "Company coverage pending reward", body: "A matching employee verified their work email. One referral credit unlocks after your next referral action." }, ...(REFERRER_ACCEPT_REWARDS_ENABLED ? [{ userId: input.userId, category: "system" as const, title: "Coverage credit pending", body: "Welcome to private company coverage. One referral credit unlocks after you accept your first private referral request." }] : [])]);
          await tx.update(companyCoverageInvitations).set({ status: "completed", joinerUserId: input.userId, completedAt: new Date() }).where(and(eq(companyCoverageInvitations.id, invitation.id), eq(companyCoverageInvitations.status, "active")));
          reward = { rewarded: true, tokenCount: COMPANY_COVERAGE_REWARD_TOKENS };
        }
      }
    }
    return { workEmailDomain: domain, reward, replayed: false };
  });
  if (!result.replayed) {
    // D-062: the freshly verified employee takes over their company's waiting and held asks, oldest first,
    // up to their remaining capacity; each delivery spends its seeker's credit at first visibility (D-034)
    // and a creditless ask stays held (D-047). Runs after this enrollment's own transaction commits and is
    // fail-soft: the hourly coverage-delivery-retry sweep recovers whatever this attempt misses, and a
    // replay after a lost response must not hand the same asks over twice (the delivery re-checks under
    // the ask's row lock, so it is idempotent even then).
    try { await deliverWaitingAsksToReferrer(input.userId, result.workEmailDomain); }
    catch (error) { console.warn("[coverage] enrollment hand-off skipped", { name: error instanceof Error ? error.name : "unknown" }); captureServerError(error, { area: "coverage_enrollment_handoff" }); }
  }
  return result;
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
    // D-062: a newly verified employee takes over their company's waiting and held asks, oldest first, up to
    // their remaining capacity; each delivery spends its seeker's credit at first visibility (D-034) under the
    // ask's row lock, and a creditless ask stays held (D-047). Fail-soft: the verification itself must never
    // fail on this, and the hourly coverage-delivery-retry sweep recovers whatever this attempt misses.
    try { await deliverWaitingAsksToReferrer(userId, domain); }
    catch (error) { console.warn("[coverage] enrollment hand-off skipped", { name: error instanceof Error ? error.name : "unknown" }); captureServerError(error, { area: "coverage_enrollment_handoff" }); }
  }
  return getProfileByUserId(userId);
}

export async function saveProfile(userId: number, input: { accountType: "job_seeker" | "referrer"; headline?: string; location?: string; bio?: string; company?: string; currentTitle?: string; resumeUrl?: string; skills?: string; experience?: string; expertise?: string; referralCapacity?: number; }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await db.insert(profiles).values({ userId, ...input, isOnboarded: true }).onDuplicateKeyUpdate({ set: { ...input, isOnboarded: true } });
  return getProfileByUserId(userId);
}

export type PublishCompanyOpportunityInput = { kind: "hiring_now" | "walk_in"; roleTitle: string; targetRoleUrl?: string; location?: string; compensation?: string; walkInAt?: Date; walkInEndsAt?: Date; showPosterFirstName?: boolean };

// One liveness clock for every read and the posting caps: the D-022 expiresAt
// column (a walk-in ends with its event, a hiring post with its window). Rows
// from before 0094 (null) stay live — the schemaReconcile fail-open rule.
const liveOpportunityCondition = () => and(
  eq(companyOpportunities.isActive, true),
  or(isNull(companyOpportunities.expiresAt), gt(companyOpportunities.expiresAt, new Date())),
);

/** When a fresh hiring window opened now lapses (env TTL, default 30 days). */
const opportunityWindowEnd = (nowMs: number) => new Date(nowMs + opportunityLimits().hiringNowTtlDays * 86_400_000);

export async function publishCompanyOpportunity(userId: number, input: PublishCompanyOpportunityInput) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !profile.workEmailVerifiedAt) throw new Error("Verify your work email before publishing an opportunity");
  const roleTitle = input.roleTitle.trim();
  if (!roleTitle || roleTitle.length > 180) throw new Error("Add a role title before publishing");
  const targetRoleUrl = input.targetRoleUrl?.trim() ? await validateOpportunityTargetUrl(input.targetRoleUrl, profile.workEmailDomain, resolveEmployerDomainFromTargetUrl) : null;
  const location = input.location?.trim().slice(0, 180) || null;
  if (input.kind === "hiring_now" && !targetRoleUrl) throw new Error("Hiring-now opportunities require a verified role link");
  if (input.kind === "walk_in") {
    if (targetRoleUrl) throw new Error("Walk-ins should use the validated time and location instead of a role link");
    if (!location || !input.walkInAt || !input.walkInEndsAt || input.walkInEndsAt <= input.walkInAt) throw new Error("Walk-ins require a complete location and valid start and end time");
  }
  if (input.compensation && input.compensation.trim().length > 80) throw new Error("Keep compensation under 80 characters");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const [openRow] = await db.select({ n: count() }).from(companyOpportunities).where(and(eq(companyOpportunities.ownerId, userId), liveOpportunityCondition()));
  const [dayRow] = await db.select({ n: count() }).from(companyOpportunities).where(and(eq(companyOpportunities.ownerId, userId), gt(companyOpportunities.createdAt, new Date(Date.now() - 86_400_000))));
  const blocked = checkPostingAllowance({ openCount: Number(openRow?.n ?? 0), lastDayCount: Number(dayRow?.n ?? 0) });
  if (blocked) throw new Error(blocked);
  // D-022: the post lands with its own expiry on the one column every read uses —
  // a walk-in ends with its event, a hiring post opens the TTL window.
  const expiresAt = input.kind === "walk_in" && input.walkInEndsAt ? input.walkInEndsAt : opportunityWindowEnd(Date.now());
  const result = await db.insert(companyOpportunities).values({ ownerId: userId, companyDomain: profile.workEmailDomain, kind: input.kind, roleTitle, targetRoleUrl, location, compensation: input.compensation?.trim() || null, walkInAt: input.walkInAt ?? null, walkInEndsAt: input.walkInEndsAt ?? null, isActive: true, showPosterFirstName: input.showPosterFirstName === true, expiresAt });
  return { id: Number(result[0].insertId), companyDomain: profile.workEmailDomain, kind: input.kind, roleTitle, compensation: input.compensation?.trim() || null };
}

export async function listPublicCompanyOpportunities() {
  const db = await getDb(); if (!db) return [];
  const base = { id: companyOpportunities.id, companyDomain: companyOpportunities.companyDomain, kind: companyOpportunities.kind, roleTitle: companyOpportunities.roleTitle, targetRoleUrl: companyOpportunities.targetRoleUrl, location: companyOpportunities.location, walkInAt: companyOpportunities.walkInAt, walkInEndsAt: companyOpportunities.walkInEndsAt, expiresAt: companyOpportunities.expiresAt, createdAt: companyOpportunities.createdAt };
  // compensation is a newer optional column; degrade gracefully if the live
  // DB has not yet been migrated, so the wall never 500s.
  try {
    return await db.select({ ...base, compensation: companyOpportunities.compensation }).from(companyOpportunities).where(liveOpportunityCondition()).orderBy(desc(companyOpportunities.createdAt)).limit(24);
  } catch {
    return await db.select(base).from(companyOpportunities).where(liveOpportunityCondition()).orderBy(desc(companyOpportunities.createdAt)).limit(24);
  }
}

// ---- D-022 referrer-posted roles: projections, the company page list and the
// poster's own controls (docs/KIT_V4_BUILD_PLAN.md section 3c). ----

type OpportunityRow = {
  id: number; companyDomain: string; kind: "hiring_now" | "walk_in"; roleTitle: string; targetRoleUrl: string | null;
  location: string | null; compensation: string | null; walkInAt: Date | null; walkInEndsAt: Date | null;
  createdAt: Date; expiresAt: Date | null; isActive: boolean; showPosterFirstName: boolean; ownerName: string | null;
  /** Read only to keep a name taken from it off the card; the public contract never carries it. */
  ownerEmail: string | null;
};

const opportunitySelect = { id: companyOpportunities.id, companyDomain: companyOpportunities.companyDomain, kind: companyOpportunities.kind, roleTitle: companyOpportunities.roleTitle, targetRoleUrl: companyOpportunities.targetRoleUrl, location: companyOpportunities.location, compensation: companyOpportunities.compensation, walkInAt: companyOpportunities.walkInAt, walkInEndsAt: companyOpportunities.walkInEndsAt, createdAt: companyOpportunities.createdAt, expiresAt: companyOpportunities.expiresAt, isActive: companyOpportunities.isActive, showPosterFirstName: companyOpportunities.showPosterFirstName, ownerName: users.name, ownerEmail: users.email };

/**
 * The poster's public face. A chosen first name is the first word only, never the last name,
 * and never one that would rebuild the poster's work email next to the company (server/publicName.ts).
 */
export function opportunityPosterOf(row: Pick<OpportunityRow, "showPosterFirstName" | "ownerName" | "ownerEmail">): OpportunityPoster {
  const firstName = row.showPosterFirstName ? publicFirstNameOf(row.ownerName, row.ownerEmail) : null;
  return firstName ? { kind: "firstName", firstName } : { kind: "anonymous" };
}

/** The single resolved expiry clock for a post, whether or not the column carried a value. */
function opportunityExpiresAtOf(row: Pick<OpportunityRow, "createdAt" | "expiresAt">): Date {
  return row.expiresAt ?? new Date(row.createdAt.getTime() + OPPORTUNITY_TTL_MS);
}

/**
 * The one public projection for a post. Parses through the shared contract, so
 * an owner id, email or work-email evidence can never leave the server; a row
 * that fails the contract is left out, never guessed (house rule for public reads).
 */
export function toPublicOpportunityPost(row: OpportunityRow): PublicOpportunityPost | null {
  const candidate = publicOpportunityPostSchema.safeParse({
    id: row.id, companyDomain: row.companyDomain, kind: row.kind, roleTitle: row.roleTitle,
    targetRoleUrl: row.targetRoleUrl, location: row.location, compensation: row.compensation,
    walkInAt: row.walkInAt?.toISOString() ?? null, walkInEndsAt: row.walkInEndsAt?.toISOString() ?? null,
    postedAt: row.createdAt.toISOString(), expiresAt: opportunityExpiresAtOf(row).toISOString(), poster: opportunityPosterOf(row),
  });
  return candidate.success ? candidate.data : null;
}

/** The poster's own row: the public shape plus the facts their controls need. */
export function toOwnerOpportunityPost(row: OpportunityRow, nowMs: number): OwnerOpportunityPost | null {
  const base = toPublicOpportunityPost(row);
  if (!base) return null;
  const expired = isOpportunityExpired(base.expiresAt, nowMs);
  const candidate = ownerOpportunityPostSchema.safeParse({ ...base, isActive: row.isActive, expired, renewable: expired || !row.isActive });
  return candidate.success ? candidate.data : null;
}

/** A company's live posts (careers page / company page): active and not lapsed, newest first. */
export async function listCompanyOpportunityPosts(domains: readonly string[], nowMs: number = Date.now()) {
  const wanted = Array.from(new Set(domains.map(domain => domain.trim().toLowerCase()).filter(Boolean)));
  if (wanted.length === 0) return [];
  const db = await getDb(); if (!db) return [];
  const rows = await db.select(opportunitySelect).from(companyOpportunities).innerJoin(users, eq(users.id, companyOpportunities.ownerId)).where(and(eq(companyOpportunities.isActive, true), inArray(companyOpportunities.companyDomain, wanted))).orderBy(desc(companyOpportunities.createdAt)).limit(60);
  const posts: PublicOpportunityPost[] = [];
  for (const row of rows) {
    if (isOpportunityExpired(row.expiresAt, nowMs)) continue;
    const post = toPublicOpportunityPost(row);
    if (post) posts.push(post);
    if (posts.length >= 24) break;
  }
  return posts;
}

/** The poster's own posts, expired and closed included, newest first. */
export async function listMyCompanyOpportunities(userId: number, nowMs: number = Date.now()) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select(opportunitySelect).from(companyOpportunities).innerJoin(users, eq(users.id, companyOpportunities.ownerId)).where(eq(companyOpportunities.ownerId, userId)).orderBy(desc(companyOpportunities.createdAt)).limit(60);
  const posts: OwnerOpportunityPost[] = [];
  for (const row of rows) {
    const post = toOwnerOpportunityPost(row, nowMs);
    if (post) posts.push(post);
  }
  return posts;
}

/**
 * The 48-hour first look: true when this ask is still inside its poster's head
 * start and the viewer is someone else. Missing or unparsable data never hides
 * an ask (fail open), and the poster always sees their own ask.
 */
export function firstLookExcludesViewer(input: { firstLookReferrerId: number | null; firstLookUntil: Date | string | null | undefined }, viewerId: number, nowMs: number): boolean {
  if (input.firstLookReferrerId === null || input.firstLookReferrerId === viewerId) return false;
  if (!input.firstLookUntil) return false;
  const ms = input.firstLookUntil instanceof Date ? input.firstLookUntil.getTime() : Date.parse(input.firstLookUntil);
  return Number.isFinite(ms) && ms > nowMs;
}

/**
 * Whether the poster of a post keeps the ask for 48 hours: they must still be an
 * open referrer of the post's company (the same D-062 availability rule the
 * public directory and coverage delivery use), and someone other than the
 * asker. Returns the referrer id and the first-look end, or null so the ask
 * simply opens to the whole company.
 */
async function resolveAskFirstLookTx(tx: any, input: { posterUserId: number; seekerUserId: number; companyDomain: string; nowMs: number }) {
  if (input.posterUserId === input.seekerUserId) return null;
  const rows = await tx.select({ userId: profiles.userId, accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt, paused: profiles.paused, referralCapacity: profiles.referralCapacity, userSuspended: users.suspended, personSuspended: canonicalPeople.suspended })
    .from(profiles).innerJoin(users, eq(users.id, profiles.userId)).leftJoin(canonicalPeople, eq(canonicalPeople.id, users.canonicalPersonId)).where(eq(profiles.userId, input.posterUserId)).limit(1);
  const poster = rows[0];
  if (!poster) return null;
  const allocated = Number((await tx.select({ allocated: count() }).from(referralAvailabilitySlots).where(and(eq(referralAvailabilitySlots.referrerId, input.posterUserId), eq(referralAvailabilitySlots.status, "allocated"))))[0]?.allocated ?? 0);
  if (!isOpenReferrer(poster, input.companyDomain, allocated)) return null;
  return { referrerId: input.posterUserId, until: firstLookUntilFrom(new Date(input.nowMs)) };
}

export const isPrivateReferralJob = (row: { title?: string | null; description?: string | null }) =>
  row.title === "Role from shared job link" || row.description === "Private referral request routed from a Target Role URL.";

// ---- D-022 referrer-posted roles: the poster's write controls, deliberately
// outside the read-only region above (the public-read guard proves that region
// stays side-effect-free). ----

/**
 * Renew in one tap: the post opens a fresh 30-day window from now. Read then
 * update (not affected-rows-driven) because MySQL reports 0 affected rows for a
 * no-change update, and a missing or foreign post is undefined so the route
 * answers 404 without revealing that the post exists.
 */
export async function renewCompanyOpportunity(userId: number, opportunityId: number, nowMs: number = Date.now()) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const owned = await db.select({ id: companyOpportunities.id }).from(companyOpportunities).where(and(eq(companyOpportunities.id, opportunityId), eq(companyOpportunities.ownerId, userId))).limit(1);
  if (!owned[0]) return undefined;
  const expiresAt = opportunityWindowEnd(nowMs);
  await db.update(companyOpportunities).set({ expiresAt, isActive: true }).where(and(eq(companyOpportunities.id, opportunityId), eq(companyOpportunities.ownerId, userId)));
  return { id: opportunityId, renewed: true as const, expiresAt };
}

/** Close the post without deleting anything; the row and its audit stay. */
export async function closeCompanyOpportunity(userId: number, opportunityId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const owned = await db.select({ id: companyOpportunities.id }).from(companyOpportunities).where(and(eq(companyOpportunities.id, opportunityId), eq(companyOpportunities.ownerId, userId))).limit(1);
  if (!owned[0]) return undefined;
  await db.update(companyOpportunities).set({ isActive: false }).where(and(eq(companyOpportunities.id, opportunityId), eq(companyOpportunities.ownerId, userId)));
  return { id: opportunityId, closed: true as const };
}

export async function listJobs(input: { query?: string; company?: string; location?: string; seniority?: string }) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select().from(jobs).orderBy(desc(jobs.publishedAt));
  const term = input.query?.trim().toLowerCase();
  // Private referral targets currently share the jobs table with the public
  // catalog. Keep both legacy and newly-created sentinel rows out of every
  // public listing until catalog visibility is a first-class schema field.
  return rows.filter(row => !isPrivateReferralJob(row) && (!term || `${row.title} ${row.company} ${row.description}`.toLowerCase().includes(term)) && (!input.company || row.company === input.company) && (!input.location || row.location.includes(input.location)) && (!input.seniority || row.seniority === input.seniority));
}

export async function listReferrers(input: { query?: string; company?: string; role?: string }) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ userId: users.id, name: users.name, company: profiles.company, title: profiles.currentTitle, location: profiles.location, expertise: profiles.expertise, capacity: profiles.referralCapacity, headline: profiles.headline }).from(profiles).innerJoin(users, eq(profiles.userId, users.id)).where(eq(profiles.accountType, "referrer"));
  const term = input.query?.trim().toLowerCase();
  return rows.filter(row => (!term || `${row.name ?? ""} ${row.company ?? ""} ${row.title ?? ""} ${row.expertise ?? ""}`.toLowerCase().includes(term)) && (!input.company || row.company === input.company) && (!input.role || (row.title ?? "").toLowerCase().includes(input.role.toLowerCase())));
}

export async function listSavedRoles(userId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select({ savedId: savedRoles.id, createdAt: savedRoles.createdAt, jobId: jobs.id, title: jobs.title, company: jobs.company, location: jobs.location, seniority: jobs.seniority, workMode: jobs.workMode }).from(savedRoles).innerJoin(jobs, eq(savedRoles.jobId, jobs.id)).where(eq(savedRoles.jobSeekerId, userId)).orderBy(desc(savedRoles.createdAt));
}

export async function setSavedRole(userId: number, jobId: number, saved: boolean) {
  const db=await getDb();if(!db)throw new Error("Database unavailable");
  return db.transaction(async tx=>{
    const job=(await tx.select({id:jobs.id,title:jobs.title,description:jobs.description,publishedAt:jobs.publishedAt}).from(jobs).where(eq(jobs.id,jobId)).limit(1).for("update"))[0];
    if(!job||!job.publishedAt||job.title==="Role from shared job link"||job.description==="Private referral request routed from a Target Role URL.")throw new Error("This role is unavailable");
    if(saved)await tx.insert(savedRoles).values({jobSeekerId:userId,jobId}).onDuplicateKeyUpdate({set:{jobId}});else await tx.delete(savedRoles).where(and(eq(savedRoles.jobSeekerId,userId),eq(savedRoles.jobId,jobId)));
    const stored=(await tx.select({id:savedRoles.id}).from(savedRoles).where(and(eq(savedRoles.jobSeekerId,userId),eq(savedRoles.jobId,jobId))).limit(1))[0];
    return {saved:Boolean(stored)};
  });
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
  await db.insert(notifications).values({ kind: "ask_new", userId: input.referrerId, category: "referral", title: "New Referral Request", body: "A Job Seeker has shared a Referral Request for your review." });
  return { id: requestId };
}

export type CreateCompanyReferralInput = { selectedCompany?: { name: string; domains: string[] }; targetRoleUrl: string; personalPitch: string; attachmentIds: number[]; idempotencyKey: string; confirmedCompanyDomain?: string; compensation?: string; fastTrackCode?: string; fastTrackCompanySlug?: string; fastTrackAlias?: string; jobFunction?: JobFunction; submittedTargetRoleUrl?: string; opportunityId?: number; workItemIds?: number[] };
/**
 * The private `jobs` row behind a company ask. Its function is the seeker's
 * explicit choice ("seeker") or the shared classifier's guess from the job
 * link ("inferred", possibly null); a guess never blocks the ask. The guess
 * reads the link as submitted (`roleLinkUrl`) because normalization drops the
 * role words from some links (LinkedIn keeps only the job id).
 */
export function companyAskJobRow(input: { companyDomain: string; targetRoleUrl: string; roleLinkUrl?: string; compensation: string | null; jobFunction?: JobFunction; publishedAt: Date }) {
  const decided = resolveAskJobFunction({ explicit: input.jobFunction, targetRoleUrl: input.roleLinkUrl ?? input.targetRoleUrl });
  return { title: "Role from shared job link", company: input.companyDomain, location: "Not specified", compensation: input.compensation, description: "Private referral request routed from a Target Role URL.", targetRoleUrl: input.targetRoleUrl, workMode: "Not specified", seniority: "Not specified", employmentType: "Not specified", jobFunction: decided.jobFunction, jobFunctionSource: decided.source, publishedAt: input.publishedAt };
}
export class CompanyLinkMismatchError extends Error { constructor(companyName: string) { super(`This job link is not from ${companyName}. Paste a job link from ${companyName}’s own careers page.`); this.name="CompanyLinkMismatchError"; } }
/** Task 13: an id that is not one of the caller's own showcase pieces, or vanished while the ask was being written. */
export class AskWorkItemNotInShowcaseError extends Error { constructor() { super("That work is no longer in your showcase. Add it again, or choose a piece you still have."); this.name="AskWorkItemNotInShowcaseError"; } }
export class ReferralIdempotencyConflictError extends Error { constructor() { super("This submission key was already used for a different referral request"); this.name="ReferralIdempotencyConflictError"; } }
/** Idempotency fingerprint. An explicit job function is part of it only when sent, so retries from before 0077 still match. A post selection is part of it only when sent, so a retry that drops it can never silently become a different ask. Pinned work follows the same rule (0095), deduplicated so an order-only or repeated-id retry replays instead of conflicting. */
export function companyReferralFingerprint(input: CreateCompanyReferralInput, companyDomain: string) {
  const canonical={targetRoleUrl:normalizeTargetRoleUrl(input.targetRoleUrl),attachmentIds:Array.from(new Set(input.attachmentIds)).sort((a,b)=>a-b),pitchHash:createHash("sha256").update(input.personalPitch).digest("hex"),companyDomain,confirmedCompanyDomain:input.confirmedCompanyDomain?.trim().toLowerCase()||null,compensation:input.compensation?.trim().slice(0,80)||null,fastTrackCode:input.fastTrackCode||null,fastTrackCompanySlug:input.fastTrackCompanySlug||null,fastTrackAlias:input.fastTrackAlias||null,...(input.jobFunction?{jobFunction:input.jobFunction}:{}),...(input.opportunityId?{opportunityId:input.opportunityId}:{}),...(input.workItemIds?.length?{workItemIds:dedupeAskWorkItemIds(input.workItemIds)}:{})};
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export async function createCompanyReferralRequest(userId: number, input: CreateCompanyReferralInput) {
  const resolvedDomain=await resolveEmployerDomainFromTargetUrl(input.targetRoleUrl);
  const confirmedDomain=input.confirmedCompanyDomain?directEmployerDomainFromTargetUrl(`https://${input.confirmedCompanyDomain.trim()}`):undefined;
  if(resolvedDomain&&confirmedDomain&&resolvedDomain!==confirmedDomain)throw new Error("The confirmed company domain does not match this job link.");
  if(input.selectedCompany){const allowed=input.selectedCompany.domains.map(domain=>domain.trim().toLowerCase());const matches=(domain:string|undefined)=>Boolean(domain)&&allowed.includes(domain!.toLowerCase());
    // The link has to resolve to this company. A confirmed domain only helps when the link names no employer, and it must be one of the company's own.
    if(resolvedDomain?!matches(resolvedDomain):!matches(confirmedDomain))throw new CompanyLinkMismatchError(input.selectedCompany.name);}
  const companyDomain=resolvedDomain??confirmedDomain;if(!companyDomain)throw new Error("We could not safely identify the employer behind this job link. Paste the employer’s careers-page link so we notify only the right employees.");
  const compensation=input.compensation?.trim().slice(0,80)||null;const fingerprint=companyReferralFingerprint(input,companyDomain);
  const db=await getDb();if(!db)throw new Error("Database unavailable");
  if(input.opportunityId&&(input.fastTrackCode||input.fastTrackCompanySlug||input.fastTrackAlias))throw new Error("Use one private referral link at a time");
  if(input.fastTrackCode&&(input.fastTrackCompanySlug||input.fastTrackAlias))throw new Error("Use one private referral link at a time");
  const fastTrackLink=input.fastTrackCode?await getActiveReferrerFastTrackLink(input.fastTrackCode):input.fastTrackCompanySlug&&input.fastTrackAlias?await getActiveReferrerFastTrackVanityLink(input.fastTrackCompanySlug,input.fastTrackAlias):undefined;
  if((input.fastTrackCode||input.fastTrackCompanySlug||input.fastTrackAlias)&&!fastTrackLink)throw new Error(PERSONAL_LINK_UNAVAILABLE);
  if(fastTrackLink&&!fastTrackLinkMatchesCompany(fastTrackLink.companyDomain,companyDomain))throw new Error("Use a job link for the same company as this private referral link");
  await ensureTokenWallet(userId,"job_seeker");
  return db.transaction(async tx=>{
    // The wallet lock is the per-seeker serialization point for both same-key
    // replay and different-key credit races.
    const lockedWallet=(await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId,userId),eq(tokenBalances.role,"job_seeker"))).limit(1).for("update"))[0];if(!lockedWallet)throw new Error("No referral credit available");
    // Open-ask slots (kit pricing). Every ask is created here under this wallet lock, so
    // concurrent creates for one seeker are serialized. The lock above is this transaction's
    // first statement, so this plain read's snapshot starts after it and sees every ask a
    // previous lock holder committed. It is deliberately not a locking read: withdraw and
    // expiry lock the ask row before the wallet, and the reverse order here could deadlock.
    const nowMs=Date.now();const entitlements=resolvePlanEntitlements(lockedWallet,new Date(nowMs));
    const openAsks=Number((await tx.select({open:count()}).from(referralRequests).where(openAskCondition(userId,nowMs)))[0]?.open??0);
    const duplicate=await tx.select({id:referralRequests.id,fingerprint:referralRequests.requestFingerprint,companyDomain:jobs.company,jobFunction:jobs.jobFunction,waiting:referralRequests.waitingForCoverage,referrerId:referralRequests.referrerId,opportunityId:referralRequests.opportunityId,firstLookReferrerId:referralRequests.firstLookReferrerId}).from(referralRequests).innerJoin(jobs,eq(jobs.id,referralRequests.jobId)).where(and(eq(referralRequests.jobSeekerId,userId),eq(referralRequests.idempotencyKey,input.idempotencyKey))).limit(1).for("update");
    if(duplicate[0]){if(duplicate[0].fingerprint!==fingerprint)throw new ReferralIdempotencyConflictError();const wallet=lockedWallet;const invite=(await tx.select({inviteCode:companyCoverageInvitations.inviteCode}).from(companyCoverageInvitations).where(eq(companyCoverageInvitations.referralRequestId,duplicate[0].id)).limit(1))[0];return{requestId:duplicate[0].id,companyDomain:duplicate[0].companyDomain,jobFunction:parseJobFunction(duplicate[0].jobFunction),coverageStatus:duplicate[0].waiting?"waiting_for_company_coverage" as const:"covered" as const,coverageInviteCode:invite?.inviteCode,notifiedEmployees:0,remainingTokens:wallet?creditSummaryFromWallet(wallet).totalAvailable:0,creditSummary:wallet?creditSummaryFromWallet(wallet):undefined,slots:openAskSlots(entitlements,openAsks),fastTrack:Boolean(duplicate[0].referrerId),fromPost:duplicate[0].opportunityId!==null,firstLook:duplicate[0].firstLookReferrerId!==null,replayed:true as const};}
    // D-022: the post behind this ask is locked and re-validated here, so a
    // concurrent close or lapse cannot slip between the read and the insert,
    // and the post must be the same company the link resolved to.
    let opportunity:{id:number;ownerId:number;companyDomain:string;isActive:boolean;expiresAt:Date|null}|undefined;
    if(input.opportunityId){
      opportunity=(await tx.select({id:companyOpportunities.id,ownerId:companyOpportunities.ownerId,companyDomain:companyOpportunities.companyDomain,isActive:companyOpportunities.isActive,expiresAt:companyOpportunities.expiresAt}).from(companyOpportunities).where(eq(companyOpportunities.id,input.opportunityId)).limit(1).for("update"))[0];
      if(!opportunity||!opportunity.isActive||isOpportunityExpired(opportunity.expiresAt,nowMs)||opportunity.companyDomain.trim().toLowerCase()!==companyDomain.trim().toLowerCase())throw new Error("This opening is no longer available. Refresh the company page and choose again.");
    }
    const eligibleCandidates=fastTrackLink?await tx.select({userId:profiles.userId,accountType:profiles.accountType,workEmailDomain:profiles.workEmailDomain,workEmailVerifiedAt:profiles.workEmailVerifiedAt,paused:profiles.paused,referralCapacity:profiles.referralCapacity,userSuspended:users.suspended,personSuspended:canonicalPeople.suspended,email:users.email}).from(profiles).innerJoin(users,eq(users.id,profiles.userId)).leftJoin(canonicalPeople,eq(canonicalPeople.id,users.canonicalPersonId)).where(eq(profiles.userId,fastTrackLink.referrerId)):await tx.select({userId:profiles.userId,accountType:profiles.accountType,workEmailDomain:profiles.workEmailDomain,workEmailVerifiedAt:profiles.workEmailVerifiedAt,paused:profiles.paused,referralCapacity:profiles.referralCapacity,userSuspended:users.suspended,personSuspended:canonicalPeople.suspended,email:users.email}).from(profiles).innerJoin(users,eq(users.id,profiles.userId)).leftJoin(canonicalPeople,eq(canonicalPeople.id,users.canonicalPersonId)).where(and(eq(profiles.accountType,"referrer"),eq(profiles.workEmailDomain,companyDomain),isNotNull(profiles.workEmailVerifiedAt)));
    const eligible=eligibleCandidates.filter(profile=>isVerifiedEmployeeOfCompany(profile,companyDomain));
    // D-034/D-062: coverage means an *available* referrer (verified, unpaused, under monthly
    // capacity — the directory's own predicate), never merely a verified employee. A personal
    // link is covered by its owner alone and keeps today's single-step lifecycle.
    const allocatedByReferrer=fastTrackLink?new Map<number,number>():await readAllocatedSlotCountsTx(tx,eligible.map(profile=>profile.userId));
    const available=fastTrackLink?eligible:eligible.filter(profile=>isOpenReferrer(profile,companyDomain,allocatedByReferrer.get(profile.userId)??0));
    const coverageStatus=companyCoverageStatus(available.length);const isWaiting=coverageStatus==="waiting_for_company_coverage";
    // D-061: a waiting ask uses no open slot and bypasses the cap until it can reach a referrer.
    // The cap refusal stays ahead of the attachment read, as before, so it needs no document lock.
    if(!isWaiting&&entitlements.openRequests!==null&&openAsks>=entitlements.openRequests)throw new OpenAskSlotCapError(openAskSlots(entitlements,openAsks));
    // D-006 fairness, on every plan: at most MAX_OPEN_ASKS_PER_COMPANY open asks at one company.
    // Same room rules as the plan slots: waiting asks hold none (D-061), a replay returns above.
    // Counted under the wallet lock with the same predicate as the plan cap, joined to the ask's company.
    const openAtCompany=Number((await tx.select({open:count()}).from(referralRequests).innerJoin(jobs,eq(jobs.id,referralRequests.jobId)).where(and(openAskCondition(userId,nowMs),eq(jobs.company,companyDomain.trim().toLowerCase()))))[0]?.open??0);
    if(openAtCompany>=MAX_OPEN_ASKS_PER_COMPANY)throw new CompanyCapReachedError(companyDomain,openAtCompany);
    const uniqueAttachmentIds=Array.from(new Set(input.attachmentIds));
    const owned=await tx.select({id:referralAttachments.id}).from(referralAttachments).where(and(inArray(referralAttachments.id,uniqueAttachmentIds),eq(referralAttachments.ownerId,userId),isNull(referralAttachments.referralRequestId))).for("update");
    if(owned.length!==uniqueAttachmentIds.length)throw new Error("One or more resume documents are unavailable or already attached");
    // Task 13 (0105): the showcase pieces pinned to this ask. How many ride
    // along is the plan's existing pin entitlement, so no new limit is sold.
    // The read is deliberately not locked: withdraw and expiry take the ask row
    // before the wallet, and the reverse order here could deadlock. A piece
    // deleted between this read and the send still snapshots honestly, because
    // only rows owned by this seeker were ever selected.
    const workItemIds=dedupeAskWorkItemIds(askWorkItemIdsSchema.parse(input.workItemIds??[]));
    const pins=entitlements.showcase.pins;
    if(workItemIds.length>pins)throw new PlanLimitError("showcase_pins",pins,`Your ${entitlements.planLabel} plan puts ${pins} ${pins===1?"piece":"pieces"} of work in front of a referrer. Choose the ${pins===1?"one":"ones"} that best proves this role.`);
    let pinnedWork:Array<{id:number}&AskWorkItem>=[];
    if(workItemIds.length){
      const found=await tx.select({id:workItems.id,title:workItems.title,kind:workItems.kind,source:workItems.source,url:workItems.url}).from(workItems).where(and(inArray(workItems.id,workItemIds),eq(workItems.userId,userId)));
      if(found.length!==workItemIds.length)throw new AskWorkItemNotInShowcaseError();
      const byId=new Map(found.map(item=>[item.id,item]));
      pinnedWork=workItemIds.map(id=>byId.get(id)).filter((item):item is {id:number}&AskWorkItem=>item!==undefined);
    }
    // P0-block-delivery: one lookup over everyone this ask could reach (fail-open, server/blockedPairs.ts). A personal
    // link whose owner is blocked with the seeker (either way) is refused here, before any write or credit, with the
    // inactive-link words. Anyone else blocked is never told and gets no review link; a blocked poster gets no first
    // look. Coverage still counts every eligible employee, so the ask's status never reveals a block.
    const blockedWithSeeker=await blockedCounterpartsFailOpen(tx,userId,[...eligible.map(employee=>employee.userId),...(fastTrackLink?[fastTrackLink.referrerId]:[])],"ask_create_delivery");
    if(fastTrackLink&&blockedWithSeeker.has(fastTrackLink.referrerId))throw new BlockedPersonalLinkError();
    const reachable=eligible.filter(employee=>!blockedWithSeeker.has(employee.userId));
    // D-022: an ask written from a post goes to the poster alone for 48 hours
    // while they still count as an open referrer; otherwise it opens to the team.
    const firstLookCandidate=opportunity?await resolveAskFirstLookTx(tx,{posterUserId:opportunity.ownerId,seekerUserId:userId,companyDomain,nowMs}):null;
    const firstLook=firstLookCandidate?reachable.find(employee=>employee.userId===firstLookCandidate.referrerId)??null:null;
    const firstLookUntil=firstLook&&firstLookCandidate?firstLookCandidate.until:null;
    const jobRow=companyAskJobRow({companyDomain,targetRoleUrl:input.targetRoleUrl,roleLinkUrl:input.submittedTargetRoleUrl,compensation,jobFunction:input.jobFunction,publishedAt:new Date()});const jobResult=await tx.insert(jobs).values(jobRow);const jobId=Number(jobResult[0].insertId);
    const requestResult=await tx.insert(referralRequests).values({jobId,jobSeekerId:userId,referrerId:fastTrackLink?.referrerId??null,personalPitch:input.personalPitch,status:"pending",waitingForCoverage:isWaiting,coverageQueuedAt:isWaiting?new Date():null,coverageVisibleAt:isWaiting?null:new Date(nowMs),coverageHeldAt:null,idempotencyKey:input.idempotencyKey,requestFingerprint:fingerprint,opportunityId:opportunity?.id??null,firstLookReferrerId:firstLook?.userId??null,firstLookUntil});const requestId=Number(requestResult[0].insertId);
    // 1 credit = 1 request, spent when the ask first reaches an available referrer (D-034): a covered ask pays
    // here, in this transaction and under the wallet lock, through the credit ledger (soonest-expiring bucket
    // first, whole spend or nothing). A waiting ask pays nothing now — the delivery transaction spends it at
    // first visibility (D-047; one idempotent key per ask, the hourly retry as backstop). Withdraw before
    // pickup and the 7-day expiry from first visibility return it to the same bucket (refundLedgerSpendTx);
    // pickup and decline never do. An insufficient balance for a covered ask throws here, which rolls the
    // whole ask back, so no ask exists without its credit.
    const summaryNow=new Date(nowMs);const reconciled=await reconcileWalletTx(tx,lockedWallet,summaryNow);const promoState=await promoStateForTx(tx,userId,"job_seeker",summaryNow);
    let remaining:CreditSummary;
    if(isWaiting){
      remaining=await creditSummaryTx(tx,{wallet:reconciled.wallet,grants:reconciled.grants,promo:promoState,now:summaryNow});
    }else{
      const askCost=askCreditCost({title:jobRow.title,description:jobRow.description,url:jobRow.targetRoleUrl});
      const spent=await spendCreditsTx(tx,{wallet:reconciled.wallet,grants:reconciled.grants,promo:promoGrantsEnabled()?promoHolding(promoState.grant):null,credits:askCost,meta:{idempotencyKey:input.idempotencyKey,referenceType:"referral_request",referenceId:String(requestId)},now:summaryNow}).catch(error=>{if(error instanceof InsufficientCreditsError)throw new Error(askLevelCostEnabled()?`This ask costs ${askCost} credit${askCost===1?"":"s"} and your balance is lower. Add credits in Plans & credits to send it now, or wait for your included credits to renew.`:"You have no referral credits left. Add a credit pack or choose a plan in Plans & credits to send this ask now, or wait for your included credits to renew.");throw error;});
      const debitRow=(await tx.select({id:tokenTransactions.id}).from(tokenTransactions).where(and(eq(tokenTransactions.userId,userId),eq(tokenTransactions.role,"job_seeker"),eq(tokenTransactions.idempotencyKey,`${input.idempotencyKey}#1`))).limit(1))[0];if(!debitRow)throw new Error("The referral credit debit was not recorded");
      await tx.update(referralRequests).set({debitTransactionId:debitRow.id}).where(eq(referralRequests.id,requestId));
      const promoAfter=promoState.grant&&spent.promoRemaining!==null?{grant:{...promoState.grant,creditsRemaining:spent.promoRemaining},status:spent.promoRemaining>0?promoState.status:"exhausted" as const}:promoState;
      remaining=await creditSummaryTx(tx,{wallet:spent.wallet,grants:spent.grants,promo:promoAfter,now:summaryNow});
    }
    const bound=await tx.update(referralAttachments).set({referralRequestId:requestId}).where(and(inArray(referralAttachments.id,uniqueAttachmentIds),eq(referralAttachments.ownerId,userId),isNull(referralAttachments.referralRequestId)));if(Number(bound[0]?.affectedRows??0)!==uniqueAttachmentIds.length)throw new Error("One or more resume documents changed during submission");
    // Task 13 (0105): the pinned-work snapshot, copied once at the send instant so
    // a later showcase edit or delete never rewrites what a referrer was shown.
    // D-132 audit item 2 (0106): with ASK_LEVEL_COST on, the level and cost this ask was priced at are stored once, here. Flag off writes nothing.
    if(askLevelCostEnabled()){const price=askPriceAtCreate({title:jobRow.title,description:jobRow.description,url:jobRow.targetRoleUrl});await tx.insert(askCosts).values({referralRequestId:requestId,jobLevel:price.jobLevel,creditCost:price.creditCost,source:"classified_at_create"});}
    for(let index=0;index<pinnedWork.length;index++){const item=pinnedWork[index];await tx.insert(askWorkItems).values({referralRequestId:requestId,workItemId:item.id,title:item.title,kind:item.kind,source:item.source,url:item.url,position:index});}
    // Invite rewards never fund this request. They unlock only after its separately funded, durable creation is
    // complete inside this transaction; a waiting ask has not gone out yet, so its rewards unlock at delivery (see
    // deliverWaitingAskTx).
    if(!isWaiting)await grantPendingActionRewardsTx(tx,userId,"job_seeker","referral_request",String(requestId));
    // D-022 first look: only the poster is told while their 48 hours run; every
    // other eligible employee is told when the first look lapses (the sweep).
    // A waiting ask reaches no one yet, so it writes no referrer notice and no review link (delivery writes them).
    const notified=isWaiting?[]:firstLook?[firstLook]:reachable;
    for(const employee of notified){
      await tx.insert(notifications).values({ kind: "ask_new",userId:employee.userId,category:"referral",title:firstLook?"A candidate asked from your post":fastTrackLink?"A referral request from your link is ready":"A private referral request is available",body:firstLook?`A Job Seeker asked for a referral at ${companyDomain} after seeing your opening. You have the first look for 48 hours; if you cannot take it, it opens to other verified employees.`:fastTrackLink?`A Job Seeker used your private link for a role at ${companyDomain}. Review it only if you choose to help.`:`A Job Seeker shared a role at ${companyDomain}. Sign in to review and claim it.`});
      const email=employee.email?.trim().toLowerCase()||"";if(email&&email.split("@")[1]===companyDomain){const token=reviewLinkToken();const expiresAt=new Date(Date.now()+reviewEmailLifetimeMs);await tx.insert(referrerReviewEmailLinks).values({referralRequestId:requestId,referrerId:employee.userId,linkToken:token,expiresAt});await tx.insert(referralReviewDeliveries).values({referralRequestId:requestId,referrerId:employee.userId,channel:"email",grantVersion:1,status:"pending"});}
    }
    let inviteCode:string|undefined;if(!fastTrackLink&&isWaiting){inviteCode=randomUUID().replace(/-/g,"");await tx.insert(companyCoverageInvitations).values({inviteCode,inviterUserId:userId,companyDomain:companyDomain.trim().toLowerCase(),referralRequestId:requestId});}
    // A waiting ask has not gone out and holds no open slot (D-061): the count stays as read. A covered ask
    // adds one. `remaining` was computed in the matching branch above, under the same wallet lock.
    return{requestId,companyDomain,jobFunction:jobRow.jobFunction,coverageStatus,coverageInviteCode:inviteCode,notifiedEmployees:notified.length,remainingTokens:remaining.totalAvailable,creditSummary:remaining,slots:openAskSlots(entitlements,isWaiting?openAsks:openAsks+1),fastTrack:Boolean(fastTrackLink),fromPost:Boolean(opportunity),firstLook:Boolean(firstLook),replayed:false as const};
  });
}

const reviewEmailLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const reviewLinkToken = () => randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 16);

export async function createReferrerReviewEmailLinks(requestId: number, recipients: Array<{ userId: number; email: string | null; companyDomain: string }>) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const links: Array<{ referrerId: number; email: string; linkToken: string; companyDomain: string }> = [];
  for (const recipient of recipients) {
    const email = recipient.email?.trim().toLowerCase() || "";
    if (!email || email.split("@")[1] !== recipient.companyDomain) continue;
    const existing = (await db.select().from(referrerReviewEmailLinks).where(and(eq(referrerReviewEmailLinks.referralRequestId,requestId),eq(referrerReviewEmailLinks.referrerId,recipient.userId))).limit(1))[0];
    if (!existing) continue; // grants are created only with the request transaction
    await db.insert(referralReviewDeliveries).values({referralRequestId:requestId,referrerId:recipient.userId,channel:"email",grantVersion:1,status:"pending"}).onDuplicateKeyUpdate({set:{referrerId:recipient.userId}});
    links.push({referrerId:recipient.userId,email,linkToken:existing.linkToken,companyDomain:recipient.companyDomain});
  }
  return links;
}

export async function claimReferralReviewDelivery(requestId:number,referrerId:number,channel:"email"|"slack",leaseOwner:string){const db=await getDb();if(!db)throw new Error("Database unavailable");const grant=(await db.select({version:referrerReviewEmailLinks.grantVersion}).from(referrerReviewEmailLinks).where(and(eq(referrerReviewEmailLinks.referralRequestId,requestId),eq(referrerReviewEmailLinks.referrerId,referrerId))).limit(1))[0];if(!grant)return undefined;if(channel==="slack")await db.insert(referralReviewDeliveries).values({referralRequestId:requestId,referrerId,channel,grantVersion:grant.version,status:"pending"}).onDuplicateKeyUpdate({set:{referrerId}});const now=new Date(),leaseExpiresAt=new Date(now.getTime()+60_000);const row=(await db.select().from(referralReviewDeliveries).where(and(eq(referralReviewDeliveries.referralRequestId,requestId),eq(referralReviewDeliveries.referrerId,referrerId),eq(referralReviewDeliveries.channel,channel),eq(referralReviewDeliveries.grantVersion,grant.version))).limit(1))[0];if(!row||row.status==="sent"||row.status==="revoked"||row.attemptCount>=5||row.nextAttemptAt&&row.nextAttemptAt>now)return undefined;const claimed=await db.update(referralReviewDeliveries).set({status:"leased",leaseOwner,leaseExpiresAt,attemptCount:row.attemptCount+1}).where(and(eq(referralReviewDeliveries.id,row.id),or(eq(referralReviewDeliveries.status,"pending"),eq(referralReviewDeliveries.status,"failed"),eq(referralReviewDeliveries.status,"unknown"),and(eq(referralReviewDeliveries.status,"leased"),sql`${referralReviewDeliveries.leaseExpiresAt} < ${now}`))));return Number(claimed[0]?.affectedRows??0)===1?{...row,leaseOwner,leaseExpiresAt}:undefined;}
export async function completeReferralReviewDelivery(id:number,leaseOwner:string,result:{status:"sent"|"failed"|"unknown";providerMessageId?:string;error?:string}){const db=await getDb();if(!db)throw new Error("Database unavailable");const current=(await db.select().from(referralReviewDeliveries).where(and(eq(referralReviewDeliveries.id,id),eq(referralReviewDeliveries.status,"leased"),eq(referralReviewDeliveries.leaseOwner,leaseOwner))).limit(1))[0];if(!current)return{recorded:false};const delay=Math.min(3600_000,30_000*2**Math.min(current.attemptCount,6));const updated=await db.update(referralReviewDeliveries).set({status:result.status,providerMessageId:result.providerMessageId??null,lastError:result.error?.slice(0,255)??null,sentAt:result.status==="sent"?new Date():null,nextAttemptAt:result.status==="sent"?null:new Date(Date.now()+delay),leaseOwner:null,leaseExpiresAt:null}).where(and(eq(referralReviewDeliveries.id,id),eq(referralReviewDeliveries.status,"leased"),eq(referralReviewDeliveries.leaseOwner,leaseOwner)));return{recorded:Number(updated[0]?.affectedRows??0)===1};}

/** Explicit operator action only: atomically revoke the old token, advance the
 * grant version, audit why, and queue replacement channels. Creation replay
 * never calls this. */
export async function rotateReferralReviewGrant(actorUserId:number,requestId:number,referrerId:number,reason:string){const db=await getDb();if(!db)throw new Error("Database unavailable");if(!reason.trim())throw new Error("A rotation reason is required");return db.transaction(async tx=>{const grant=(await tx.select().from(referrerReviewEmailLinks).where(and(eq(referrerReviewEmailLinks.referralRequestId,requestId),eq(referrerReviewEmailLinks.referrerId,referrerId))).limit(1).for("update"))[0];if(!grant)throw new Error("Review grant not found");const fromVersion=grant.grantVersion,toVersion=fromVersion+1,linkToken=reviewLinkToken(),expiresAt=new Date(Date.now()+reviewEmailLifetimeMs);await tx.update(referralReviewDeliveries).set({status:"revoked",leaseOwner:null,leaseExpiresAt:null}).where(and(eq(referralReviewDeliveries.referralRequestId,requestId),eq(referralReviewDeliveries.referrerId,referrerId),eq(referralReviewDeliveries.grantVersion,fromVersion)));await tx.update(referrerReviewEmailLinks).set({linkToken,expiresAt,consumedAt:null,grantVersion:toVersion,rotatedAt:new Date()}).where(and(eq(referrerReviewEmailLinks.id,grant.id),eq(referrerReviewEmailLinks.grantVersion,fromVersion)));await tx.insert(referralReviewGrantRotations).values({referralRequestId:requestId,referrerId,actorUserId,fromVersion,toVersion,reason:reason.trim().slice(0,255)});await tx.insert(referralReviewDeliveries).values({referralRequestId:requestId,referrerId,channel:"email",grantVersion:toVersion,status:"pending"});return{requestId,referrerId,grantVersion:toVersion,linkToken,expiresAt};});}

// ---- Opt-in private Slack triage delivery (encrypted at rest) ----
function slackWebhookMasterKey(): Buffer {
  const secret = process.env.JWT_SECRET || "skipwait-local-development-secret";
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
  const request = await db.select({ companyDomain: jobs.company, status: referralRequests.status, waitingForCoverage: referralRequests.waitingForCoverage, jobSeekerId: referralRequests.jobSeekerId, referrerId: referralRequests.referrerId, firstLookReferrerId: referralRequests.firstLookReferrerId, firstLookUntil: referralRequests.firstLookUntil }).from(referralRequests).innerJoin(jobs, eq(jobs.id, referralRequests.jobId)).where(eq(referralRequests.id, requestId)).limit(1);
  const current = request[0]; if (!current || current.status !== "pending") return [];
  // D-061: a waiting or held ask has reached no referrer, so it has no email, Slack or review link to prepare;
  // delivery (deliverWaitingAskTx) writes the referrer notice and the links the day the ask becomes visible.
  if (current.waitingForCoverage) return [];
  const recipients = await db.select({ userId: profiles.userId, email: users.email, workEmailDomain: profiles.workEmailDomain, accountType: profiles.accountType, workEmailVerifiedAt: profiles.workEmailVerifiedAt, paused: profiles.paused, notifyNewAsk: profiles.notifyNewAsk }).from(profiles).innerJoin(users, eq(users.id, profiles.userId)).where(and(eq(profiles.accountType, "referrer"), eq(profiles.workEmailDomain, current.companyDomain), isNotNull(profiles.workEmailVerifiedAt)));
  const passes = await db.select({ referrerId: referralRequestPasses.referrerId }).from(referralRequestPasses).where(eq(referralRequestPasses.referralRequestId, requestId));
  const passed = new Set(passes.map(row => row.referrerId));
  // D-022: while the poster's 48-hour first look runs, no one else is emailed or Slacked.
  const prepNowMs = Date.now();
  const eligible = recipients.filter(recipient => !recipient.paused && recipient.notifyNewAsk !== false && !passed.has(recipient.userId) && !firstLookExcludesViewer(current, recipient.userId, prepNowMs) && (!current.referrerId || recipient.userId === current.referrerId) && recipient.workEmailDomain === current.companyDomain && isVerifiedEmployeeOfCompany(recipient, current.companyDomain));
  // P0-block-delivery: no link, delivery row, email or Slack for an employee blocked with the seeker (either way); fail-open (server/blockedPairs.ts).
  const blockedWithSeeker = await blockedCounterpartsFailOpen(db, current.jobSeekerId, eligible.map(recipient => recipient.userId), "review_email_delivery");
  const links=await createReferrerReviewEmailLinks(requestId, eligible.filter(recipient => !blockedWithSeeker.has(recipient.userId)).map(recipient => ({ userId: recipient.userId, email: recipient.email, companyDomain: current.companyDomain })));
  const pending=await db.select({referrerId:referralReviewDeliveries.referrerId,status:referralReviewDeliveries.status}).from(referralReviewDeliveries).where(and(eq(referralReviewDeliveries.referralRequestId,requestId),eq(referralReviewDeliveries.channel,"email"),eq(referralReviewDeliveries.grantVersion,1)));
  const deliverable=new Set(pending.filter(row=>row.status!=="sent"&&row.status!=="revoked").map(row=>row.referrerId));return links.filter(link=>deliverable.has(link.referrerId));
}

export async function resolveReferrerReviewEmailLink(userId: number, linkToken: string) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const link = await db.select({ referralRequestId: referrerReviewEmailLinks.referralRequestId, expiresAt: referrerReviewEmailLinks.expiresAt, consumedAt: referrerReviewEmailLinks.consumedAt, status: referralRequests.status, assignedReferrerId: referralRequests.referrerId }).from(referrerReviewEmailLinks).innerJoin(referralRequests, eq(referralRequests.id, referrerReviewEmailLinks.referralRequestId)).leftJoin(referralRequestPasses,and(eq(referralRequestPasses.referralRequestId,referralRequests.id),eq(referralRequestPasses.referrerId,userId))).where(and(eq(referrerReviewEmailLinks.linkToken, linkToken), eq(referrerReviewEmailLinks.referrerId, userId),isNull(referralRequestPasses.id))).limit(1);
  if (!link[0] || link[0].consumedAt || link[0].expiresAt.getTime() < Date.now() || link[0].status !== "pending" || (link[0].assignedReferrerId !== null && link[0].assignedReferrerId !== userId)) throw new Error("This private review link is unavailable");
  return { requestId: link[0].referralRequestId };
}

const oneClickDeclineMessages = {
  role_not_a_fit: "I do not think this role is the right fit for my referral.",
  cannot_support: "I cannot support a referral for this role right now.",
  timing: "I am not able to take this referral on right now.",
} as const;

export type OneClickDeclineReason = keyof typeof oneClickDeclineMessages;

export async function oneClickReviewReferralRequest(userId: number, input: { requestId: number; decision: "approved" | "declined"; declineReason?: OneClickDeclineReason; passReason?: string | null; reviewLinkToken?: string }) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !profile.workEmailVerifiedAt) throw new Error("Verify your work email before reviewing referrals");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const current = (await tx.select({ request: referralRequests, companyDomain: jobs.company }).from(referralRequests).innerJoin(jobs, eq(jobs.id, referralRequests.jobId)).where(eq(referralRequests.id, input.requestId)).limit(1).for("update"))[0];
    if (!current || !isVerifiedEmployeeOfCompany(profile, current.companyDomain) || (current.request.referrerId !== null && current.request.referrerId !== userId)) throw new ReferralTransitionConflict("This referral request is no longer available", { status: current?.request.status ?? "missing", revision: current?.request.revision ?? -1 });
    // D-022: while the poster's first look runs, nobody else can decide on the ask;
    // the poster's own approve/pass ends the first look with the decision.
    if (firstLookExcludesViewer(current.request, userId, Date.now())) throw new ReferralTransitionConflict("This referral request is still in its poster's first look", { status: current.request.status, revision: current.request.revision });
    const operationKey = input.decision === "approved" ? `one-click:${userId}:approved` : `one-click:${userId}:declined:${input.declineReason ?? "cannot_support"}`;
    const prior = (await tx.select().from(referralTransitionEvents).where(and(eq(referralTransitionEvents.referralRequestId,input.requestId),eq(referralTransitionEvents.operationKey,operationKey))).limit(1))[0];
    if (!prior && current.request.status !== "pending") throw new ReferralTransitionConflict("This referral request is no longer available", { status: current.request.status, revision: current.request.revision });
    if (input.decision === "declined") {
      const reason = input.declineReason ?? "cannot_support";
      // D-021: declining reopens the ask for the rest of the company, whether or
      // not this employee had claimed it. The pass, the claim release and the
      // seeker's notice are one transition.
      const result = await passReferralRequestTx(tx, { requestId: input.requestId, actorUserId: userId, companyDomain: current.companyDomain, jobSeekerId: current.request.jobSeekerId, reason, reasonCode: input.passReason ?? null, operationKey, reviewLinkToken: input.reviewLinkToken, releasedClaim: current.request.referrerId === userId });
      return { ...result, status: "passed" as const, companyDomain: current.companyDomain, declineReason: reason, jobSeekerId: current.request.jobSeekerId };
    }
    const result = await transitionReferralRequestTx(tx, { requestId: input.requestId, actorUserId: userId, action: "approve", operationKey, toStatus: "approved", allowedFrom: ["pending"], authorize: row => { if (row.referrerId !== null && row.referrerId !== userId) throw new Error("Another verified employee already claimed this request"); }, patch: { referrerId: userId, referrerMessage: null, firstLookReferrerId: null, firstLookUntil: null }, notification: { userId: current.request.jobSeekerId, title: "Referral Request approved", body: "A verified employee accepted your private referral request." }, beforeCommit: async tx => { if (input.reviewLinkToken) { const consumed = await tx.update(referrerReviewEmailLinks).set({ consumedAt: new Date() }).where(and(eq(referrerReviewEmailLinks.linkToken,input.reviewLinkToken),eq(referrerReviewEmailLinks.referrerId,userId),isNull(referrerReviewEmailLinks.consumedAt))); if (Number(consumed[0]?.affectedRows ?? 0) !== 1) throw new Error("This private review link is unavailable"); } const previousPass = await tx.select({ id: referralRequestPasses.id }).from(referralRequestPasses).where(and(eq(referralRequestPasses.referralRequestId, input.requestId), eq(referralRequestPasses.referrerId, userId))).limit(1); if (previousPass[0]) throw new Error("You already passed on this referral request"); /* D-055: accepting an ask pays the referrer nothing. */ if (REFERRER_ACCEPT_REWARDS_ENABLED) await grantPendingActionRewardsTx(tx, userId, "referrer", "referral_approval", String(input.requestId)); } });
    return { ...result, status: "approved" as const, companyDomain: current.companyDomain, jobSeekerId: current.request.jobSeekerId };
  });
}

/**
 * The pass transition (D-021): a verified employee declines an ask and the ask
 * stays open to the rest of that company until it expires. The private pass
 * excludes this employee for good, and a claim is released with it — the claim
 * itself, the claimed ask's document grant, the actor's saved row, their private
 * review link and any queue allocation all end in the same transaction, while
 * the seeker is told in plain words that the ask is open again. Idempotent
 * through operationKey; the caller owns the preconditions (verified employee,
 * pending ask, not claimed by someone else).
 */
async function passReferralRequestTx(tx: any, input: { requestId: number; actorUserId: number; companyDomain: string; jobSeekerId: number; reason: string; reasonCode: string | null; operationKey: string; reviewLinkToken?: string; releasedClaim: boolean }) {
  const reasonLabel = passReasonSeekerLabel(input.reasonCode);
  const result = await transitionReferralRequestTx(tx, { requestId: input.requestId, actorUserId: input.actorUserId, action: "pass", operationKey: input.operationKey, toStatus: "pending", allowedFrom: ["pending"], authorize: row => { if (row.referrerId !== null && row.referrerId !== input.actorUserId) throw new Error("Another verified employee already claimed this request"); }, patch: { referrerId: null, referrerMessage: null, firstLookReferrerId: null, firstLookUntil: null }, notification: { userId: input.jobSeekerId, title: `Update on your referral request — ${input.companyDomain}`, body: input.releasedClaim ? `The employee who was reviewing your request can't take it on${reasonLabel ? ` (${reasonLabel})` : ""}. Your ask is open again to other verified employees at ${input.companyDomain}.` : `The employee can't help right now${reasonLabel ? ` (${reasonLabel})` : ""}. Your request stays active for other employees.` }, beforeCommit: async tx => { if (input.reviewLinkToken) { const consumed = await tx.update(referrerReviewEmailLinks).set({ consumedAt: new Date() }).where(and(eq(referrerReviewEmailLinks.linkToken,input.reviewLinkToken),eq(referrerReviewEmailLinks.referrerId,input.actorUserId),isNull(referrerReviewEmailLinks.consumedAt))); if (Number(consumed[0]?.affectedRows ?? 0) !== 1) throw new Error("This private review link is unavailable"); } await tx.insert(referralRequestPasses).values({ referralRequestId: input.requestId, referrerId: input.actorUserId, reason: input.reason, reasonCode: input.reasonCode }).onDuplicateKeyUpdate({ set: { reason: input.reason, reasonCode: input.reasonCode } }); await tx.update(referralDocumentAccessGrants).set({ revokedAt: new Date(), revokeReason: "passed" }).where(and(eq(referralDocumentAccessGrants.referralRequestId,input.requestId),eq(referralDocumentAccessGrants.referrerId,input.actorUserId),isNull(referralDocumentAccessGrants.revokedAt))); await tx.delete(referralRequestSaves).where(and(eq(referralRequestSaves.referralRequestId,input.requestId),eq(referralRequestSaves.referrerId,input.actorUserId))); await tx.update(referrerReviewEmailLinks).set({consumedAt:new Date()}).where(and(eq(referrerReviewEmailLinks.referralRequestId,input.requestId),eq(referrerReviewEmailLinks.referrerId,input.actorUserId),isNull(referrerReviewEmailLinks.consumedAt))); await tx.update(referralAvailabilitySlots).set({status:"released",releasedAt:new Date()}).where(and(eq(referralAvailabilitySlots.referralRequestId,input.requestId),eq(referralAvailabilitySlots.referrerId,input.actorUserId),eq(referralAvailabilitySlots.status,"allocated"))); } });
  return { ...result, reopened: input.releasedClaim && !result.replayed };
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
  const rows = await db.select({ id: referralRequests.id, targetRoleUrl: jobs.targetRoleUrl, companyDomain: jobs.company, jobFunction: jobs.jobFunction, compensation: jobs.compensation, status: referralRequests.status, referrerId: referralRequests.referrerId, waitingForCoverage: referralRequests.waitingForCoverage, coverageVisibleAt: referralRequests.coverageVisibleAt, coverageHeldAt: referralRequests.coverageHeldAt, savedAt: referralRequests.savedAt, firstLookReferrerId: referralRequests.firstLookReferrerId, firstLookUntil: referralRequests.firstLookUntil, createdAt: referralRequests.createdAt, updatedAt: referralRequests.updatedAt, attachmentCount: count(referralAttachments.id), queueAllocationId: referralAvailabilitySlots.id, savedByYouAt: referralRequestSaves.createdAt }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).leftJoin(referralAvailabilitySlots, and(eq(referralAvailabilitySlots.referralRequestId, referralRequests.id), eq(referralAvailabilitySlots.status, "allocated"))).leftJoin(referralAttachments, eq(referralAttachments.referralRequestId, referralRequests.id)).leftJoin(referralRequestPasses, and(eq(referralRequestPasses.referralRequestId, referralRequests.id), eq(referralRequestPasses.referrerId, userId))).leftJoin(referralRequestSaves, and(eq(referralRequestSaves.referralRequestId, referralRequests.id), eq(referralRequestSaves.referrerId, userId))).where(and(eq(jobs.company, profile.workEmailDomain), isNull(referralRequestPasses.id))).groupBy(referralRequests.id, jobs.targetRoleUrl, jobs.company, jobs.jobFunction, jobs.compensation, referralRequests.status, referralRequests.referrerId, referralRequests.waitingForCoverage, referralRequests.coverageVisibleAt, referralRequests.coverageHeldAt, referralRequests.savedAt, referralRequests.firstLookReferrerId, referralRequests.firstLookUntil, referralRequests.createdAt, referralRequests.updatedAt, referralAvailabilitySlots.id, referralRequestSaves.createdAt).orderBy(desc(referralRequests.updatedAt));
  const scopeNowMs = Date.now();
  // D-050 / P0-allocated-ask-stuck: an assigned ask its employee never claimed (a personal-link ask or a queue allocation) is
  // unclaimed, so past its window it leaves that employee's inbox like any stale unclaimed ask. Fail-soft and reported: the
  // list never depends on it, and claim re-decides under the row lock.
  let staleHeld = new Set<number>();
  try { staleHeld = await listStaleHeldForViewer(db, rows, userId, scopeNowMs); }
  catch (error) { console.warn("[inbox] stale held check skipped", { name: error instanceof Error ? error.name : "unknown" }); captureServerError(error, { area: "referrer_inbox_stale_held" }); }
  const scopedRows = rows.filter(row => {
    // D-061: a waiting or held ask has reached no referrer; it never appears in any referrer inbox state.
    if (row.waitingForCoverage) return false;
    const isQueueAllocationForYou = row.queueAllocationId !== null && row.referrerId === userId;
    const staleUnclaimed = row.status === "pending" && (isAskExpired({ status: "pending", referrerId: row.referrerId, createdAt: row.createdAt, coverageVisibleAt: row.coverageVisibleAt, waitingForCoverage: row.waitingForCoverage }, scopeNowMs) || staleHeld.has(row.id));
    // D-022: while the poster's first look runs, the ask is theirs alone in the inbox.
    const firstLookHides = firstLookExcludesViewer(row, userId, scopeNowMs);
    if (state === "new") return row.status === "pending" && !row.savedByYouAt && !staleUnclaimed && !firstLookHides && (!row.referrerId || row.referrerId === userId || isQueueAllocationForYou);
    if (state === "saved") return row.status === "pending" && Boolean(row.savedByYouAt) && !staleUnclaimed && !firstLookHides && (!row.referrerId || row.referrerId === userId);
    return row.referrerId === userId && row.status !== "pending";
  });
  const unreadRows = await db.select({ requestId: messages.referralRequestId, unreadMessageCount: count(messages.id) }).from(messages).where(and(eq(messages.recipientId, userId), isNull(messages.readAt))).groupBy(messages.referralRequestId);
  const unreadByRequestId = new Map(unreadRows.map(row => [row.requestId, Number(row.unreadMessageCount)]));
  // Read-only enrichment from fields the referrer already sees in the preview. Fail-soft: the list never depends on it.
  const extra = new Map<number, { title: string | null; pitch: string | null }>();
  if (scopedRows.length) {
    try {
      const detail = await db.select({ id: referralRequests.id, title: jobs.title, pitch: referralRequests.personalPitch }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(inArray(referralRequests.id, scopedRows.map(row => row.id)));
      for (const item of detail) extra.set(item.id, { title: item.title, pitch: item.pitch });
    } catch (error) { console.warn("[inbox] enrichment skipped", { name: error instanceof Error ? error.name : "unknown" }); }
  }
  // D-038-A (§4.10): the viewer's own claimed or allocated pending ask says when their decision is due.
  // Fail-soft: the list never depends on it, and every lapse re-decides under its own row lock.
  const decisionDueAtByRequest = new Map<number, string>();
  const ownPending = scopedRows.filter(row => row.status === "pending" && row.referrerId === userId);
  if (ownPending.length) {
    try {
      const events = await db.select({ id: referralTransitionEvents.id, requestId: referralTransitionEvents.referralRequestId, action: referralTransitionEvents.action, createdAt: referralTransitionEvents.createdAt }).from(referralTransitionEvents)
        .where(and(inArray(referralTransitionEvents.referralRequestId, ownPending.map(row => row.id)), inArray(referralTransitionEvents.action, [...PICKUP_OR_RELEASE_ACTIONS])));
      const latestByRequest = new Map<number, { id: number; action: string; createdAt: Date | string }>();
      for (const event of events) {
        const previous = latestByRequest.get(event.requestId);
        if (!previous || Number(event.id) > previous.id) latestByRequest.set(event.requestId, { id: Number(event.id), action: event.action, createdAt: event.createdAt });
      }
      for (const row of ownPending) {
        const latest = latestByRequest.get(row.id);
        if (latest?.action === "claim") {
          const claimedAt = latest.createdAt instanceof Date ? latest.createdAt.getTime() : Date.parse(String(latest.createdAt));
          if (Number.isFinite(claimedAt)) decisionDueAtByRequest.set(row.id, new Date(claimLapseAtMs(claimedAt)).toISOString());
          continue;
        }
        // A recorded release ends this viewer's turn: nothing is due from them.
        if (latest || row.queueAllocationId === null) continue;
        const visibleAt = row.coverageVisibleAt instanceof Date ? row.coverageVisibleAt.getTime() : row.coverageVisibleAt ? Date.parse(String(row.coverageVisibleAt)) : null;
        decisionDueAtByRequest.set(row.id, new Date(allocationLapseAtMs(visibleAt !== null && Number.isFinite(visibleAt) ? visibleAt : null)).toISOString());
      }
    } catch (error) { console.warn("[inbox] decision deadline skipped", { name: error instanceof Error ? error.name : "unknown" }); }
  }
  return scopedRows.map(({ firstLookReferrerId: _firstLookReferrerId, firstLookUntil: _firstLookUntil, ...row }) => {
    // D-061: the shown deadline follows the ask's own window (7 days from first visibility).
    const expiresAtMs = getAskShelfLifeEndsAtMs(row);
    const detail = extra.get(row.id);
    const enrichment = detail ? enrichInboxRow({ title: detail.title, pitch: detail.pitch, targetRoleUrl: row.targetRoleUrl, attachmentCount: row.attachmentCount }) : {};
    return { ...row, ...enrichment, inboxState: state, isClaimedByYou: row.referrerId === userId, isQueueOpenAllocation: row.queueAllocationId !== null && row.referrerId === userId, expiresAt: expiresAtMs === null ? null : new Date(expiresAtMs).toISOString(), decisionDueAt: decisionDueAtByRequest.get(row.id) ?? null, unreadMessageCount: unreadByRequestId.get(row.id) ?? 0 };
  });
}

export async function getUnclaimedCompanyReferralPreview(userId: number, requestId: number) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !isVerifiedEmployeeOfCompany(profile, profile.workEmailDomain)) return undefined;
  const db = await getDb(); if (!db) return undefined;
  // One captured instant for both sides of the lapsed check below.
  const freshNow = new Date();
  const request = await db.select({ id: referralRequests.id, title: jobs.title, targetRoleUrl: jobs.targetRoleUrl, companyDomain: jobs.company, jobFunction: jobs.jobFunction, candidateMessage: referralRequests.personalPitch }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).leftJoin(referralRequestPasses,and(eq(referralRequestPasses.referralRequestId,referralRequests.id),eq(referralRequestPasses.referrerId,userId))).where(and(eq(referralRequests.id, requestId), eq(referralRequests.status, "pending"), eq(referralRequests.waitingForCoverage, false), or(isNull(referralRequests.referrerId), eq(referralRequests.referrerId, userId)), eq(jobs.company, profile.workEmailDomain),isNull(referralRequestPasses.id),
    // D-022 first look: only the poster may preview during their 48 hours (or anyone after it lapses).
    // Lapsed = firstLookUntil <= now, kept as lt-or-eq so every row-lock fixture in this repo can evaluate it.
    or(isNull(referralRequests.firstLookReferrerId), isNull(referralRequests.firstLookUntil), lt(referralRequests.firstLookUntil, freshNow), eq(referralRequests.firstLookUntil, freshNow), eq(referralRequests.firstLookReferrerId, userId)))).limit(1);
  if (!request[0]) return undefined;
  const attachments = await db.select({ id: referralAttachments.id, fileName: referralAttachments.fileName, fileKey: referralAttachments.fileKey, mimeType: referralAttachments.mimeType, fileSize: referralAttachments.fileSize }).from(referralAttachments).where(eq(referralAttachments.referralRequestId, requestId));
  // Task 13 (0095): the work pinned at send time, in the order the seeker chose.
  // Title, kind, source and link only — no showcase row ids, no seeker identity.
  const pinnedWork = await db.select({ title: askWorkItems.title, kind: askWorkItems.kind, source: askWorkItems.source, url: askWorkItems.url }).from(askWorkItems).where(eq(askWorkItems.referralRequestId, requestId)).orderBy(asc(askWorkItems.position));
  return { ...request[0], attachments, workItems: pinnedWork };
}

export async function saveCompanyReferralRequest(userId: number, requestId: number, saved: boolean) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !profile.workEmailVerifiedAt) throw new Error("Verify your work email before saving referrals");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const request = await tx.select({ id: referralRequests.id, status: referralRequests.status, referrerId: referralRequests.referrerId, waitingForCoverage: referralRequests.waitingForCoverage, companyDomain: jobs.company, passedByYou: referralRequestPasses.id, firstLookReferrerId: referralRequests.firstLookReferrerId, firstLookUntil: referralRequests.firstLookUntil }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).leftJoin(referralRequestPasses, and(eq(referralRequestPasses.referralRequestId, referralRequests.id), eq(referralRequestPasses.referrerId, userId))).where(eq(referralRequests.id, requestId)).limit(1).for("update");
    const current = request[0];
    if (!current || current.companyDomain !== profile.workEmailDomain || current.status !== "pending" || current.waitingForCoverage || (current.referrerId !== null && current.referrerId !== userId) || current.passedByYou || firstLookExcludesViewer(current, userId, Date.now())) throw new Error("This private referral request is no longer available to save");
    if (saved) await tx.insert(referralRequestSaves).values({ referralRequestId: requestId, referrerId: userId }).onDuplicateKeyUpdate({ set: { referrerId: userId } });
    else await tx.delete(referralRequestSaves).where(and(eq(referralRequestSaves.referralRequestId, requestId), eq(referralRequestSaves.referrerId, userId)));
    return { requestId, saved };
  });
}
/**
 * The referrer a pending assigned ask is still an unclaimed assignment for, and its kind, or null.
 * Caller holds the request row lock. Unclaimed = assigned with no claim recorded (the locking read
 * above), created after claims became recorded events (server/heldAsk.ts). The kind comes from the
 * allocation locking read: an allocated slot (D-034 delivery or "Open referral capacity") is a
 * queue allocation, not a pickup (P0-allocated-ask-stuck); no slot is a personal link (D-050).
 */
async function heldForReferrerTx(tx: LedgerTx, row: { id: number; status: string; referrerId: number | null; createdAt: Date }): Promise<{ referrerId: number; kind: UnclaimedAssignmentKind } | null> {
  if (!isHeldCandidate(row)) return null;
  if (await referralWasClaimedTx(tx, row.id)) return null;
  const kind: UnclaimedAssignmentKind = await readQueueAllocationTx(tx, row.id) ? "queue_allocation" : "personal_link";
  return { referrerId: row.referrerId, kind };
}

const WITHDRAW_REFUSED = "This request was already claimed by a verified employee and can no longer be withdrawn";

/** Close every open link or live reservation only after its ask row is locked; preserve a delivery to its claimer. */
async function closeAskInviteForTerminalStateTx(tx: LedgerTx, requestId: number, actorUserId: number, outcome: "ask_withdrawn" | "ask_expired", closedAt: Date, ask: { waitingForCoverage: boolean; referrerId: number | null }): Promise<void> {
  // A stale claimed reservation and a fresh active link can coexist, so close all of them:
  // closing one unordered row could leave an activeRequestKey live past the ask.
  const links = await tx.select({ id: askInviteLinks.id, status: askInviteLinks.status, claimedByUserId: askInviteLinks.claimedByUserId }).from(askInviteLinks).where(and(eq(askInviteLinks.referralRequestId, requestId), inArray(askInviteLinks.status, ["active", "claimed"]))).for("update");
  for (const link of links) {
    if (link.status === "claimed" && link.claimedByUserId !== null && !ask.waitingForCoverage && ask.referrerId === link.claimedByUserId) continue;
    const updated = await tx.update(askInviteLinks).set({ status: "expired", activeRequestKey: null, reservationExpiresAt: null, closedAt }).where(and(eq(askInviteLinks.id, link.id), inArray(askInviteLinks.status, ["active", "claimed"])));
    if (Number(updated[0]?.affectedRows ?? 0) !== 1) continue;
    if (link.status === "claimed" && link.claimedByUserId !== null) {
      const eventKey = `ask-invite:${link.id}:${outcome === "ask_withdrawn" ? "ask-withdrawn" : "ask-expired"}:claimer`;
      await tx.insert(notifications).values({ userId: link.claimedByUserId, category: "status", kind: "ask_invite_expired", title: "Your reserved ask is no longer available", body: outcome === "ask_withdrawn" ? "The seeker withdrew the ask, so this invite can no longer be used." : "The ask expired before this reservation was completed, so the invite can no longer be used.", eventKey, refId: requestId }).onDuplicateKeyUpdate({ set: { eventKey } });
    }
    await tx.insert(operationalActivityLogs).values({ actorUserId, action: "ask_invite.expired", outcome: "success", resourceType: "ask_invite", resourceId: String(link.id), metadata: JSON.stringify({ requestId, linkId: link.id, outcome }) });
  }
}

export async function withdrawCompanyReferralRequest(userId: number, requestId: number) {
  const db=await getDb();if(!db)throw new Error("Database unavailable");
  return db.transaction(async tx=>{
    const current=(await tx.select({id:referralRequests.id,status:referralRequests.status,referrerId:referralRequests.referrerId,debitTransactionId:referralRequests.debitTransactionId,waitingForCoverage:referralRequests.waitingForCoverage,coverageHeldAt:referralRequests.coverageHeldAt,createdAt:referralRequests.createdAt}).from(referralRequests).where(and(eq(referralRequests.id,requestId),eq(referralRequests.jobSeekerId,userId))).limit(1).for("update"))[0];
    if(!current)throw new Error("This referral request is not in your account");if(current.status==="withdrawn"){const wallet=(await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId,userId),eq(tokenBalances.role,"job_seeker"))).limit(1))[0];return{withdrawn:true as const,creditRefunded:false,requestId,status:"withdrawn" as const,creditSummary:wallet?creditSummaryFromWallet(wallet):undefined};}
    if(current.status!=="pending")throw new Error(current.status==="closed"?"This ask has already closed, so it can no longer be withdrawn":WITHDRAW_REFUSED);
    // D-050 / P0-allocated-ask-stuck: an assigned ask its employee has not claimed (a personal-link ask or a queue
    // allocation) is still unclaimed; any other assigned ask was picked up.
    const heldFor=current.referrerId===null?null:await heldForReferrerTx(tx,current);
    if(current.referrerId!==null&&heldFor===null)throw new Error(WITHDRAW_REFUSED);
    await closeAskInviteForTerminalStateTx(tx, requestId, userId, "ask_withdrawn", new Date(), { waitingForCoverage: current.waitingForCoverage === true, referrerId: current.referrerId });
    // Each transition re-checks the locked row. Releasing an unclaimed assignment clears its referrer in the same write, so
    // the withdrawn ask never reads as assigned or reveals who held it; the release audit row keeps that, in this transaction.
    const heldReferrerId=heldFor?.referrerId??null;
    const authorize:ReferralTransitionInput["authorize"]=row=>{if(row.jobSeekerId!==userId||row.referrerId!==heldReferrerId)throw new Error(WITHDRAW_REFUSED);};
    const release=heldFor===null?undefined:{referrerId:null};
    const released=async<T extends {creditRefunded:boolean}>(result:T):Promise<T>=>{if(heldFor!==null)await recordHeldAskReleaseTx(tx,{requestId,referrerId:heldFor.referrerId,kind:heldFor.kind,reason:"withdrawn",creditReturned:result.creditRefunded});return result;};
    if(heldFor===null&&await referralWasClaimedTx(tx,requestId)){
      const transition=await transitionReferralRequestTx(tx,{
        requestId,actorUserId:userId,action:"withdraw",operationKey:`withdraw:${userId}`,
        toStatus:"withdrawn",allowedFrom:["pending"],
        notification:{userId,title:"Your ask was withdrawn",body:current.debitTransactionId!==null?"Your ask was withdrawn and its open slot is free again. A verified employee previously picked it up, so its credit stays spent.":"Your ask was withdrawn and its open slot is free again."},
        authorize,
      });
      const wallet=(await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId,userId),eq(tokenBalances.role,"job_seeker"))).limit(1))[0];
      return{withdrawn:true as const,creditRefunded:false,requestId,status:"withdrawn" as const,revision:transition.revision,creditSummary:wallet?creditSummaryFromWallet(wallet):undefined};
    }
    // A free ask (no reserved credit) only frees its slot; an ask that reserved a credit before asks became free refunds it below.
    // D-061: an ask still awaiting coverage never reached an employee — its withdraw clears the waiting/held flags (so no surface
    // ever reads it as waiting again) and its notice says plainly that no credit was used.
    if(current.debitTransactionId===null){const awaiting=current.waitingForCoverage===true;const transition=await transitionReferralRequestTx(tx,{requestId,actorUserId:userId,action:"withdraw",operationKey:`withdraw:${userId}`,toStatus:"withdrawn",allowedFrom:["pending"],authorize,patch:awaiting?{...(release??{}),waitingForCoverage:false,coverageQueuedAt:null,coverageHeldAt:null}:release,notification:awaiting?{userId,...COVERAGE_WITHDRAWN_NOTICE}:undefined});const wallet=(await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId,userId),eq(tokenBalances.role,"job_seeker"))).limit(1))[0];return released({withdrawn:true as const,creditRefunded:false,requestId,status:"withdrawn" as const,revision:transition.revision,creditSummary:wallet?creditSummaryFromWallet(wallet):undefined});}
    const spendRow=(await tx.select().from(tokenTransactions).where(and(eq(tokenTransactions.id,current.debitTransactionId),eq(tokenTransactions.userId,userId))).limit(1).for("update"))[0];
    if(spendRow&&spendRow.kind!=="direct_request"){
      // Ledger-spent ask (credit spent at send): hand back exactly what it took, once, then withdraw.
      if(spendRow.kind!=="credit_spend"&&spendRow.kind!=="promo_spend")throw new Error("The original referral credit debit is unavailable; contact support before withdrawing");
      const lockedWallet=(await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId,userId),eq(tokenBalances.role,"job_seeker"))).limit(1).for("update"))[0];if(!lockedWallet)throw new Error("Your referral credit wallet is unavailable; contact support to restore this credit");
      const refundNow=new Date();const refunded=await refundLedgerSpendTx(tx,{userId,requestId,kind:"withdrawal_refund",wallet:lockedWallet,now:refundNow});
      const transition=await transitionReferralRequestTx(tx,{requestId,actorUserId:userId,action:"withdraw",operationKey:`withdraw:${userId}`,toStatus:"withdrawn",allowedFrom:["pending"],authorize,patch:release});
      return released({withdrawn:true as const,creditRefunded:refunded.returned>0,requestId,status:"withdrawn" as const,revision:transition.revision,creditSummary:await creditSummaryAfterRefundTx(tx,refunded.wallet,refundNow)});
    }
    const debit=spendRow;if(!debit||!debit.source)throw new Error("The original referral credit debit is unavailable; contact support before withdrawing");
    const existing=(await tx.select({id:tokenTransactions.id}).from(tokenTransactions).where(eq(tokenTransactions.reversesTransactionId,debit.id)).limit(1))[0];
    const wallet=(await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId,userId),eq(tokenBalances.role,"job_seeker"))).limit(1).for("update"))[0];if(!wallet)throw new Error("Your referral credit wallet is unavailable; contact support to restore this credit");
    if(existing){const transition=await transitionReferralRequestTx(tx,{requestId,actorUserId:userId,action:"withdraw",operationKey:`withdraw:${userId}`,toStatus:"withdrawn",allowedFrom:["pending"],authorize,patch:release});return released({withdrawn:true as const,creditRefunded:false,requestId,status:"withdrawn" as const,revision:transition.revision,creditSummary:creditSummaryFromWallet(wallet)});}
    const patch=await refundReferralDebitTx(tx,{userId,requestId,debit,wallet,kind:"withdrawal_refund"});
    const transition=await transitionReferralRequestTx(tx,{requestId,actorUserId:userId,action:"withdraw",operationKey:`withdraw:${userId}`,toStatus:"withdrawn",allowedFrom:["pending"],authorize,patch:release});
    return released({withdrawn:true as const,creditRefunded:patch.balance>wallet.balance||patch.monthlyCreditsRemaining>wallet.monthlyCreditsRemaining,requestId,status:"withdrawn" as const,revision:transition.revision,creditSummary:creditSummaryFromWallet({...wallet,...patch})});
  });
}

/**
 * Returns a reserved referral credit to its bucket. Identical math to a
 * withdraw (purchased balance +1; same-cycle monthly allowance +1 capped;
 * old-cycle monthly converts to nothing) — only the ledger kind differs so
 * the cause stays auditable. The reversal row records the credits that
 * actually came back, so a full allowance logs 0 like an ended cycle. Throws
 * when the wallet is missing while a debit exists, exactly like a withdraw.
 */
async function refundReferralDebitTx(tx: any, input: { userId: number; requestId: number; debit: { id: number; source: string | null; sourceCycleKey: string | null }; wallet: { id: number; balance: number; monthlyCreditsRemaining: number; monthlyAllowance: number; monthlyCycleKey: string | null }; kind: "withdrawal_refund" | "expiry_refund" }) {
  const { userId, requestId, debit, wallet, kind } = input;
  const patch: { balance: number; monthlyCreditsRemaining: number } = { balance: wallet.balance, monthlyCreditsRemaining: wallet.monthlyCreditsRemaining };
  if (debit.source === "purchased_balance") patch.balance += 1;
  else if (debit.source === "monthly_allowance" && debit.sourceCycleKey === wallet.monthlyCycleKey) patch.monthlyCreditsRemaining = Math.min(wallet.monthlyAllowance, patch.monthlyCreditsRemaining + 1);
  const returned = patch.balance - wallet.balance + (patch.monthlyCreditsRemaining - wallet.monthlyCreditsRemaining);
  await tx.update(tokenBalances).set(patch).where(eq(tokenBalances.id, wallet.id));
  await tx.insert(tokenTransactions).values({ userId, role: "job_seeker", tokenCount: returned, kind, source: debit.source, sourceCycleKey: debit.sourceCycleKey, referenceType: "referral_request", referenceId: String(requestId), reversesTransactionId: debit.id, balanceAfter: patch.balance, monthlyCreditsAfter: patch.monthlyCreditsRemaining });
  return patch;
}

/**
 * Returns the credit a ledger-spent ask took (create spends through spendCreditsTx) to the bucket it came
 * from. One reversal row per spend row (reversesTransactionId, unique), so a replay changes nothing. A bucket
 * that can no longer take the credit back (monthly cycle rolled, grant or promo expired, revoked) logs a
 * 0-credit row instead: the credit is never moved into a bucket that outlives the one it left.
 */
export async function refundLedgerSpendTx(tx: any, input: { userId: number; requestId: number; kind: "withdrawal_refund" | "expiry_refund"; wallet: WalletRow; now: Date }): Promise<{ wallet: WalletRow; returned: number }> {
  const { userId, requestId, kind, now } = input;
  let monthly = input.wallet.monthlyCreditsRemaining;
  let balance = input.wallet.balance;
  let returned = 0;
  const spends = await tx.select().from(tokenTransactions).where(and(eq(tokenTransactions.userId, userId), eq(tokenTransactions.role, "job_seeker"), eq(tokenTransactions.referenceType, "referral_request"), inArray(tokenTransactions.referenceId, Array.from({ length: 32 }, (_, n) => `${requestId}#${n + 1}`)), inArray(tokenTransactions.kind, ["credit_spend", "promo_spend"]))).orderBy(asc(tokenTransactions.id));
  for (const spend of spends) {
    if (spend.tokenCount >= 0) continue;
    const reversed = (await tx.select({ id: tokenTransactions.id }).from(tokenTransactions).where(eq(tokenTransactions.reversesTransactionId, spend.id)).limit(1))[0];
    if (reversed) continue;
    const credits = -spend.tokenCount;
    let restored = 0;
    let grantId: number | null = null;
    if (spend.source === BUCKET_SOURCES.purchased) { balance += credits; restored = credits; }
    else if (spend.source === BUCKET_SOURCES.cycle) {
      if (spend.sourceCycleKey === input.wallet.monthlyCycleKey) { const next = Math.min(input.wallet.monthlyAllowance, monthly + credits); restored = next - monthly; monthly = next; }
    } else if (spend.source === BUCKET_SOURCES.promo) {
      const promo = (await tx.select().from(promoCreditGrants).where(and(eq(promoCreditGrants.userId, userId), eq(promoCreditGrants.role, "job_seeker"))).limit(1).for("update"))[0];
      if (promo && (promo.status === "active" || promo.status === "exhausted") && promo.expiresAt.getTime() > now.getTime() && promo.creditsRemaining + credits <= promo.tokenCount) {
        await tx.update(promoCreditGrants).set({ creditsRemaining: promo.creditsRemaining + credits, status: "active", consumedAt: null }).where(eq(promoCreditGrants.id, promo.id));
        restored = credits;
      }
    } else if (spend.creditGrantId != null) {
      grantId = spend.creditGrantId;
      const grant = (await tx.select().from(planCreditGrants).where(and(eq(planCreditGrants.id, spend.creditGrantId), eq(planCreditGrants.userId, userId))).limit(1).for("update"))[0];
      if (grant && (grant.status === "active" || grant.status === "exhausted") && (!grant.expiresAt || grant.expiresAt.getTime() > now.getTime()) && grant.creditsRemaining + credits <= grant.tokenCount) {
        await tx.update(planCreditGrants).set({ creditsRemaining: grant.creditsRemaining + credits, status: "active", closedAt: null }).where(eq(planCreditGrants.id, grant.id));
        restored = credits;
      }
    }
    returned += restored;
    // One reversal row per spend row. The debit-reference unique index
    // (userId, role, kind, referenceType, referenceId) needs a per-spend
    // suffix once an ask costs more than one credit and the spend drew from
    // several buckets (level-scaled asks, D-110/D-132); a 1-credit spend
    // keeps its historical `${requestId}#refund#1` shape.
    const spendSuffix = typeof spend.referenceId === "string" && spend.referenceId.includes("#") ? spend.referenceId.slice(spend.referenceId.lastIndexOf("#")) : `#${spend.id}`;
    await tx.insert(tokenTransactions).values({ userId, role: "job_seeker", tokenCount: restored, kind, source: spend.source, sourceCycleKey: spend.sourceCycleKey, referenceType: "referral_request", referenceId: `${requestId}#refund${spendSuffix}`, reversesTransactionId: spend.id, creditGrantId: grantId, balanceAfter: balance, monthlyCreditsAfter: monthly });
  }
  let wallet = input.wallet;
  if (monthly !== input.wallet.monthlyCreditsRemaining || balance !== input.wallet.balance) {
    await tx.update(tokenBalances).set({ monthlyCreditsRemaining: monthly, balance }).where(eq(tokenBalances.id, input.wallet.id));
    wallet = { ...input.wallet, monthlyCreditsRemaining: monthly, balance };
  }
  return { wallet, returned };
}

/** The full credit summary for a wallet after a refund (every bucket, like the spend path). */
async function creditSummaryAfterRefundTx(tx: any, wallet: WalletRow, now: Date): Promise<CreditSummary> {
  const grants = await readGrantsTx(tx, wallet.userId, wallet.role, false);
  const promo = await promoStateForTx(tx, wallet.userId, wallet.role, now);
  return creditSummaryTx(tx, { wallet, grants, promo, now });
}

/** What a pre-ledger reserved credit did on expiry: nothing to settle now (a free ask, or a debit already reversed), back on the balance, or kept out by an ended monthly cycle or a full monthly allowance. */
type LegacyExpiryRefund = "none" | "returned" | "cycle_ended" | "allowance_full";

/** The seeker's notice for an expired ask on the pre-ledger path. It names only what moved; every expired ask frees its slot. */
function legacyExpiryNotice(lead: string, refund: LegacyExpiryRefund): { title: string; body: string } {
  switch (refund) {
    case "returned": return { title: "Your ask expired — credit returned", body: `${lead} Your reserved credit is back on your balance; send a fresh ask anytime.` };
    case "cycle_ended": return { title: "Your ask expired", body: `${lead} The credit came from a bucket that has since ended, so it could not be returned; send a fresh ask anytime.` };
    case "allowance_full": return { title: "Your ask expired", body: `${lead} Your monthly credits are already full, so this one could not be added back; send a fresh ask anytime.` };
    case "none": return { title: "Your ask expired — slot freed", body: `${lead} Its open slot is free again; send a fresh ask anytime.` };
  }
}

/**
 * Expires one stale ask: unclaimed pending past ASK_TTL_DAYS transitions to
 * "closed", freeing its open slot; an ask that reserved a credit before asks
 * became free gets it refunded with a "credit returned" notification, so early
 * seekers are never left hanging on a dead ask. An assigned ask its employee
 * never claimed (a personal-link ask, D-050, or a queue allocation,
 * P0-allocated-ask-stuck) expires the same way and drops its referrer.
 * Idempotent via the transition operationKey plus the reversal-uniqueness
 * check; concurrency-safe through row locking and revision CAS.
 */
export async function expireStalePendingReferralRequest(userId: number, requestId: number, nowMs: number = Date.now()) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const current = (await tx.select({ id: referralRequests.id, status: referralRequests.status, referrerId: referralRequests.referrerId, debitTransactionId: referralRequests.debitTransactionId, waitingForCoverage: referralRequests.waitingForCoverage, coverageVisibleAt: referralRequests.coverageVisibleAt, createdAt: referralRequests.createdAt, companyDomain: jobs.company }).from(referralRequests).innerJoin(jobs, eq(jobs.id, referralRequests.jobId)).where(and(eq(referralRequests.id, requestId), eq(referralRequests.jobSeekerId, userId))).limit(1).for("update"))[0];
    if (!current) throw new Error("This referral request is not in your account");
    if (current.status !== "pending") return { expired: false as const, requestId, status: current.status };
    // D-061: the shelf life is window-aware — waiting asks close 90 days after creation at no cost, every other
    // ask 7 days after its first visibility (coverageVisibleAt; pre-0095 rows: creation).
    const expiresAt = getAskShelfLifeEndsAtMs(current);
    if (expiresAt === null || nowMs < expiresAt) return { expired: false as const, requestId, status: current.status };
    // D-050 / P0-allocated-ask-stuck: an assigned ask its employee never claimed (a personal-link ask or a queue allocation)
    // expires like an unclaimed one; any other assigned ask is left alone.
    const heldFor = current.referrerId === null ? null : await heldForReferrerTx(tx, current);
    if (current.referrerId !== null && heldFor === null) return { expired: false as const, requestId, status: current.status };
    await closeAskInviteForTerminalStateTx(tx, requestId, userId, "ask_expired", new Date(nowMs), { waitingForCoverage: current.waitingForCoverage === true, referrerId: current.referrerId });
    const heldReferrerId = heldFor?.referrerId ?? null;
    const authorize: ReferralTransitionInput["authorize"] = row => { if (row.jobSeekerId !== userId || row.referrerId !== heldReferrerId) throw new Error("This request is already in conversation and cannot expire"); };
    const release = heldFor === null ? undefined : { referrerId: null };
    const lead = current.waitingForCoverage ? `No verified employee at ${current.companyDomain} became available within ${COVERAGE_WAIT_DAYS} days.` : heldFor?.kind === "personal_link" ? "The employee whose link you used didn't respond within 7 days." : "No verified employee claimed it within 7 days.";
    const released = async <T,>(result: T, creditReturned: boolean): Promise<T> => { if (heldFor !== null) await recordHeldAskReleaseTx(tx, { requestId, referrerId: heldFor.referrerId, kind: heldFor.kind, reason: "expired", creditReturned }); return result; };
    if (heldFor === null && await referralWasClaimedTx(tx, requestId)) {
      const transition = await transitionReferralRequestTx(tx, {
        requestId, actorUserId: userId, action: "expire", operationKey: `expire:${requestId}`,
        toStatus: "closed", allowedFrom: ["pending"],
        authorize,
        notification: { userId, title: "Your ask expired", body: current.debitTransactionId !== null ? `Your ask expired. A verified employee previously picked it up, so its credit stays spent; its open slot is free again.` : `Your ask expired and its open slot is free again.` },
      });
      return { expired: true as const, requestId, status: transition.status, revision: transition.revision };
    }
    // D-061: an ask that waited out its 90 days without ever being charged simply closes — nothing was ever
    // reserved, so no money moves; its waiting flags clear and the notice says no credit was used.
    if (current.waitingForCoverage && current.debitTransactionId === null) {
      const transition = await transitionReferralRequestTx(tx, { requestId, actorUserId: userId, action: "expire", operationKey: `expire:${requestId}`, toStatus: "closed", allowedFrom: ["pending"], authorize, patch: { waitingForCoverage: false, coverageQueuedAt: null, coverageHeldAt: null }, notification: { userId, ...coverageWaitExpiredNotice(current.companyDomain) } });
      const wallet = (await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, "job_seeker"))).limit(1))[0];
      return { expired: true as const, requestId, status: transition.status, revision: transition.revision, creditSummary: wallet ? creditSummaryFromWallet(wallet) : undefined };
    }
    const spendRow = current.debitTransactionId ? (await tx.select().from(tokenTransactions).where(and(eq(tokenTransactions.id, current.debitTransactionId), eq(tokenTransactions.userId, userId))).limit(1).for("update"))[0] : undefined;
    if (spendRow && (spendRow.kind === "credit_spend" || spendRow.kind === "promo_spend")) {
      // Ledger-spent ask: the unclaimed ask expires and its credit goes back to the bucket it came from, once.
      const lockedWallet = (await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, "job_seeker"))).limit(1).for("update"))[0];
      if (!lockedWallet) throw new Error("Your referral credit wallet is unavailable; contact support to restore this credit");
      const refundNow = new Date(nowMs); const refunded = await refundLedgerSpendTx(tx, { userId, requestId, kind: "expiry_refund", wallet: lockedWallet, now: refundNow });
      const notification = refunded.returned > 0 ? { userId, title: "Your ask expired — credit returned", body: `${lead} Your credit is back on your balance; send a fresh ask anytime.` } : { userId, title: "Your ask expired", body: `${lead} The credit came from a bucket that has since ended, so it could not be returned; send a fresh ask anytime.` };
      const transition = await transitionReferralRequestTx(tx, { requestId, actorUserId: userId, action: "expire", operationKey: `expire:${requestId}`, toStatus: "closed", allowedFrom: ["pending"], authorize, patch: release, notification });
      return released({ expired: true as const, requestId, status: transition.status, revision: transition.revision, creditSummary: await creditSummaryAfterRefundTx(tx, refunded.wallet, refundNow) }, refunded.returned > 0);
    }
    const debit = spendRow && spendRow.kind === "direct_request" ? spendRow : undefined;
    const wallet = (await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, "job_seeker"))).limit(1).for("update"))[0];
    if (debit?.source && !wallet) throw new Error("Your referral credit wallet is unavailable; contact support to restore this credit");
    const existing = debit ? (await tx.select({ id: tokenTransactions.id }).from(tokenTransactions).where(eq(tokenTransactions.reversesTransactionId, debit.id)).limit(1))[0] : undefined;
    let creditSummary;
    let refund: LegacyExpiryRefund = "none";
    if (debit?.source && wallet && !existing) {
      const patch = await refundReferralDebitTx(tx, { userId, requestId, debit, wallet, kind: "expiry_refund" });
      creditSummary = creditSummaryFromWallet({ ...wallet, ...patch });
      refund = patch.balance > wallet.balance || patch.monthlyCreditsRemaining > wallet.monthlyCreditsRemaining ? "returned" : debit.source === "monthly_allowance" && debit.sourceCycleKey === wallet.monthlyCycleKey ? "allowance_full" : "cycle_ended";
    } else if (wallet) creditSummary = creditSummaryFromWallet(wallet);
    const notification = { userId, ...legacyExpiryNotice(lead, refund) };
    const transition = await transitionReferralRequestTx(tx, { requestId, actorUserId: userId, action: "expire", operationKey: `expire:${requestId}`, toStatus: "closed", allowedFrom: ["pending"], authorize, patch: release, notification });
    return released({ expired: true as const, requestId, status: transition.status, revision: transition.revision, creditSummary }, refund === "returned");
  });
}

/**
 * D-022 first-look release: after the poster's 48 hours lapse without a
 * decision, the ask opens to the rest of the company. Runs under the ask's row
 * lock and re-checks every precondition, so a claim, a decision or a repeated
 * sweep can never release twice or overwrite a decision; each colleague is
 * notified in-app exactly once by eventKey (email for a released first look is
 * deliberately out of scope). Returns released=false when there was nothing to
 * do: already decided, claimed, released, or the ask itself is past its own
 * 7-day shelf life (the ask-expiry sweep owns that case).
 */
export async function releaseFirstLookForRequest(requestId: number, nowMs: number = Date.now()) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const current = (await tx.select({ request: referralRequests, companyDomain: jobs.company }).from(referralRequests).innerJoin(jobs, eq(jobs.id, referralRequests.jobId)).where(eq(referralRequests.id, requestId)).limit(1).for("update"))[0];
    const request = current?.request;
    if (!current || !request || request.status !== "pending" || request.referrerId !== null || request.firstLookReferrerId === null || !request.firstLookUntil
      || request.firstLookUntil.getTime() > nowMs
      || isAskExpired({ status: request.status, referrerId: request.referrerId, createdAt: request.createdAt, coverageVisibleAt: request.coverageVisibleAt, waitingForCoverage: request.waitingForCoverage }, nowMs)) return { released: false as const, notified: 0 };
    const posterId = request.firstLookReferrerId;
    const cleared = await tx.update(referralRequests).set({ firstLookReferrerId: null, firstLookUntil: null }).where(eq(referralRequests.id, requestId));
    if (Number(cleared[0]?.affectedRows ?? 0) !== 1) throw new Error("The first look could not be released");
    // Mirror creation's eligible set minus the poster and anyone who already passed on the ask.
    const employees = await tx.select({ userId: profiles.userId, email: users.email, accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt, passedByYou: referralRequestPasses.id }).from(profiles).innerJoin(users, eq(users.id, profiles.userId)).leftJoin(referralRequestPasses, and(eq(referralRequestPasses.referralRequestId, requestId), eq(referralRequestPasses.referrerId, profiles.userId))).where(and(eq(profiles.accountType, "referrer"), eq(profiles.workEmailDomain, current.companyDomain), isNotNull(profiles.workEmailVerifiedAt)));
    const colleagues = employees.filter(employee => isVerifiedEmployeeOfCompany(employee, current.companyDomain) && employee.userId !== posterId && !employee.passedByYou);
    // P0-block-delivery: nobody blocked with the seeker (either way) is told; fail-open (server/blockedPairs.ts).
    const blockedWithSeeker = await blockedCounterpartsFailOpen(tx, request.jobSeekerId, colleagues.map(employee => employee.userId), "first_look_release");
    const recipients = colleagues.filter(employee => !blockedWithSeeker.has(employee.userId));
    for (const employee of recipients) {
      const eventKey = `first_look_released:${requestId}:${employee.userId}`.slice(0, 120);
      await tx.insert(notifications).values({ kind: "ask_new", userId: employee.userId, category: "referral", title: `A referral request is open at ${current.companyDomain}`, body: "The poster's 48-hour head start on this request lapsed. Review it only if you choose to help.", eventKey }).onDuplicateKeyUpdate({ set: { eventKey } });
    }
    await tx.insert(operationalActivityLogs).values({ action: "first_look.released", outcome: "success", resourceType: "referral_request", resourceId: String(requestId).slice(0, 120), companyDomain: current.companyDomain.toLowerCase().slice(0, 255), metadata: JSON.stringify({ notified: recipients.length }) });
    return { released: true as const, notified: recipients.length };
  });
}

/**
 * Reconcile-on-read for the seeker home: expires every stale unclaimed ask,
 * including an assigned ask its employee never claimed (a personal-link ask,
 * D-050, or a queue allocation, P0-allocated-ask-stuck).
 * Fail-open per request — a failed expiry never blocks listing; the next
 * read retries. Returns the ids that transitioned so the route can report
 * them honestly.
 */
export async function reconcileExpiredPendingReferrals(userId: number, nowMs: number = Date.now()) {
  const db = await getDb(); if (!db) return { expiredRequestIds: [] as number[] };
  const cutoff = new Date(nowMs - ASK_TTL_MS);
  const waitingCutoff = new Date(nowMs - COVERAGE_WAIT_MS);
  // D-061: two windows — a visible ask is stale 7 days after first visibility (pre-0095 rows: creation), a waiting or
  // held ask 90 days after creation. An ask is only handed to the expiry transaction once it is past its own window,
  // so a young waiting ask is never locked or retried on every read.
  const stale = await db.select({ id: referralRequests.id }).from(referralRequests).where(and(
    eq(referralRequests.jobSeekerId, userId), eq(referralRequests.status, "pending"), isNull(referralRequests.referrerId),
    or(
      and(eq(referralRequests.waitingForCoverage, true), lt(referralRequests.createdAt, waitingCutoff)),
      and(eq(referralRequests.waitingForCoverage, false), or(
        and(isNotNull(referralRequests.coverageVisibleAt), lt(referralRequests.coverageVisibleAt, cutoff)),
        and(isNull(referralRequests.coverageVisibleAt), lt(referralRequests.createdAt, cutoff)),
      )),
    ),
  ));
  const held = await selectStaleHeldAsks(db, { visibleBefore: cutoff, heldBefore: cutoff, limit: HELD_ASK_RECONCILE_LIMIT, jobSeekerId: userId });
  const expiredRequestIds: number[] = [];
  for (const row of [...stale, ...held]) {
    try {
      const result = await expireStalePendingReferralRequest(userId, row.id, nowMs);
      if (result.expired) expiredRequestIds.push(row.id);
    } catch { /* fail open: stays listed, retried on next read */ }
  }
  return { expiredRequestIds };
}

/** The caller's open-ask slots: their own pending, unexpired asks against the plan cap. */
export async function getOpenAskSlots(userId: number, nowMs: number = Date.now()): Promise<OpenAskSlots> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const entitlements = await getSeekerEntitlements(userId, new Date(nowMs));
  const [row] = await db.select({ open: count() }).from(referralRequests).where(openAskCondition(userId, nowMs));
  return openAskSlots(entitlements, Number(row?.open ?? 0));
}

const REFERRER_REVEALED_STATUSES: string[] = ["approved", "intro_made", "interview", "offer", "closed"];

export async function listJobSeekerCompanyReferrals(userId: number) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ id: referralRequests.id, title: jobs.title, pitch: referralRequests.personalPitch, targetRoleUrl: jobs.targetRoleUrl, companyDomain: jobs.company, jobFunction: jobs.jobFunction, compensation: jobs.compensation, status: referralRequests.status, referrerId: referralRequests.referrerId, waitingForCoverage: referralRequests.waitingForCoverage, coverageVisibleAt: referralRequests.coverageVisibleAt, coverageHeldAt: referralRequests.coverageHeldAt, referrerMessage: referralRequests.referrerMessage, createdAt: referralRequests.createdAt, updatedAt: referralRequests.updatedAt, attachmentCount: count(referralAttachments.id) }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).leftJoin(referralAttachments, eq(referralAttachments.referralRequestId, referralRequests.id)).where(eq(referralRequests.jobSeekerId, userId)).groupBy(referralRequests.id, jobs.title, referralRequests.personalPitch, jobs.targetRoleUrl, jobs.company, jobs.jobFunction, jobs.compensation, referralRequests.status, referralRequests.referrerId, referralRequests.waitingForCoverage, referralRequests.coverageVisibleAt, referralRequests.coverageHeldAt, referralRequests.referrerMessage, referralRequests.createdAt, referralRequests.updatedAt).orderBy(desc(referralRequests.updatedAt));
  const unreadRows = await db.select({ requestId: messages.referralRequestId, unreadMessageCount: count(messages.id) }).from(messages).where(and(eq(messages.recipientId, userId), isNull(messages.readAt))).groupBy(messages.referralRequestId);
  const unreadByRequestId = new Map(unreadRows.map(row => [row.requestId, Number(row.unreadMessageCount)]));
  // Identity reveal (queue task 14): once a referrer has accepted, the seeker sees their name and title.
  const revealIds = Array.from(new Set(rows.filter(row => row.referrerId !== null && REFERRER_REVEALED_STATUSES.includes(row.status)).map(row => row.referrerId as number)));
  const revealed = new Map<number, { name: string | null; title: string | null }>();
  if (revealIds.length) {
    const people = await db.select({ id: users.id, name: users.name, email: users.email, title: profiles.currentTitle }).from(users).leftJoin(profiles, eq(profiles.userId, users.id)).where(inArray(users.id, revealIds));
    for (const person of people) revealed.set(person.id, { name: publicDisplayName(person.name, person.email), title: person.title ?? null });
  }
  // D-050: a personal-link ask its employee has not acted on still counts as unclaimed (heldForReferrer: Withdraw, expiry
  // countdown). P0-allocated-ask-stuck: so does a queue allocation nobody claimed; unclaimedAssignment covers both kinds
  // (Withdraw). Fail-soft and reported: the flags only add that entry point; withdraw and expiry re-decide under the row lock.
  let held: UnclaimedAssignments = { personalLink: new Set<number>(), queueAllocation: new Set<number>() };
  try { held = await listHeldForReferrerIds(db, rows); }
  catch (error) { console.warn("[requests] held flag skipped", { name: error instanceof Error ? error.name : "unknown" }); captureServerError(error, { area: "seeker_requests_held_flag" }); }
  return rows.map(row => ({ ...row, heldForReferrer: held.personalLink.has(row.id), unclaimedAssignment: held.personalLink.has(row.id) || held.queueAllocation.has(row.id), referrerName: row.referrerId !== null && REFERRER_REVEALED_STATUSES.includes(row.status) ? revealed.get(row.referrerId)?.name ?? null : null, referrerTitle: row.referrerId !== null && REFERRER_REVEALED_STATUSES.includes(row.status) ? revealed.get(row.referrerId)?.title ?? null : null, queueStatus: row.referrerId && row.status === "pending" ? "available_for_review" as const : row.waitingForCoverage ? (row.coverageHeldAt !== null ? "held_for_credit" as const : "waiting_for_coverage" as const) : null, unreadMessageCount: unreadByRequestId.get(row.id) ?? 0 }));
}

/**
 * Sample-filled empty states (owner override, Oct 21 11:35 PM): durable "has
 * this seeker EVER sent an ask" - true even when every ask expired or was
 * withdrawn, so a returning user never sees first-timer sample rows. Fails
 * CLOSED (true) when the DB is unreachable: never show fake content on doubt.
 */
export async function hasEverCreatedReferralRequest(userId: number): Promise<boolean> {
  const db = await getDb(); if (!db) return true;
  const row = await db.select({ id: referralRequests.id }).from(referralRequests).where(eq(referralRequests.jobSeekerId, userId)).limit(1);
  return row.length > 0;
}

/**
 * Sample-filled empty states (owner override, Oct 21 11:35 PM): durable "has
 * this referrer EVER acted on an ask" - claimed (referralRequests.referrerId)
 * or passed (referralRequestPasses), so a returning referrer whose queue is
 * simply empty never sees first-timer sample rows. Fails CLOSED (true) when
 * the DB is unreachable: never show fake content on doubt.
 */
export async function hasEverReviewedReferral(userId: number): Promise<boolean> {
  const db = await getDb(); if (!db) return true;
  const claimed = await db.select({ id: referralRequests.id }).from(referralRequests).where(eq(referralRequests.referrerId, userId)).limit(1);
  if (claimed.length > 0) return true;
  const passed = await db.select({ id: referralRequestPasses.id }).from(referralRequestPasses).where(eq(referralRequestPasses.referrerId, userId)).limit(1);
  return passed.length > 0;
}

/**
 * D-034/D-047/D-061/D-062 coverage delivery. A waiting ask (created while no
 * available referrer existed) gets its first visibility here: the credit is
 * spent under one idempotent key per ask (ask-delivery:<id>), the ask is
 * assigned to a specific referrer, its availability slot is allocated, its
 * 7-day clock starts (coverageVisibleAt) and both sides get their in-app
 * notice — all in the caller's transaction, under the ask row lock and the
 * target's profile lock. With no credit the ask stays held (D-047): nothing
 * allocated, hidden from every referrer, the seeker told once. A legacy
 * waiting ask (pre-0095, its credit was already spent at create) is flipped
 * without a second spend.
 */

/** Allocated (unreleased) availability slots per referrer. Plain advisory read for create-time coverage and candidate ranking; delivery re-counts under its own locking read. */
async function readAllocatedSlotCountsTx(tx: LedgerTx, referrerIds: readonly number[]): Promise<Map<number, number>> {
  const ids = Array.from(new Set(referrerIds.filter(id => Number.isInteger(id) && id > 0)));
  const counts = new Map<number, number>();
  if (!ids.length) return counts;
  const rows = await tx.select({ referrerId: referralAvailabilitySlots.referrerId }).from(referralAvailabilitySlots).where(and(inArray(referralAvailabilitySlots.referrerId, ids), eq(referralAvailabilitySlots.status, "allocated")));
  for (const row of rows) counts.set(row.referrerId, (counts.get(row.referrerId) ?? 0) + 1);
  return counts;
}

/**
 * The capacity half of the delivery lock: the target's allocated slot rows,
 * locked, counted in JS (never a SQL count, so a concurrent delivery to the
 * same referrer cannot make this read miss its own lock's rows).
 */
async function readAllocatedSlotsForUpdateTx(tx: LedgerTx, referrerId: number): Promise<number> {
  const rows = await tx.select({ id: referralAvailabilitySlots.id }).from(referralAvailabilitySlots)
    .where(and(eq(referralAvailabilitySlots.referrerId, referrerId), eq(referralAvailabilitySlots.status, "allocated"))).for("update");
  return rows.length;
}

type DeliveryCandidate = { userId: number; accountType: string | null; workEmailDomain: string | null; workEmailVerifiedAt: Date | null; paused: boolean | null; referralCapacity: number | null; userSuspended: boolean | null; personSuspended: boolean | null };

/**
 * D-062: employees of `companyDomain` who can take an ask right now, most
 * remaining capacity first (then lowest id). The ask's own seeker is never a
 * candidate, and only the top COVERAGE_TARGET_SCAN_LIMIT are considered — a
 * blocked or full race falls through to the next candidate.
 */
async function selectDeliveryCandidatesTx(tx: LedgerTx, input: { companyDomain: string; seekerUserId: number }): Promise<DeliveryCandidate[]> {
  const rows = await tx.select({ userId: profiles.userId, accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt, paused: profiles.paused, referralCapacity: profiles.referralCapacity, userSuspended: users.suspended, personSuspended: canonicalPeople.suspended })
    .from(profiles).innerJoin(users, eq(users.id, profiles.userId)).leftJoin(canonicalPeople, eq(canonicalPeople.id, users.canonicalPersonId))
    .where(and(eq(profiles.accountType, "referrer"), eq(profiles.workEmailDomain, input.companyDomain), isNotNull(profiles.workEmailVerifiedAt)));
  const available = rows.filter(row => row.userId !== input.seekerUserId && isVerifiedEmployeeOfCompany(row, input.companyDomain) && !row.paused && !row.userSuspended && row.personSuspended !== true);
  const allocated = await readAllocatedSlotCountsTx(tx, available.map(row => row.userId));
  return available
    .map(row => ({ row, remaining: referralCapacityRemaining(row, allocated.get(row.userId) ?? 0) }))
    .filter(item => item.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining || a.row.userId - b.row.userId)
    .slice(0, COVERAGE_TARGET_SCAN_LIMIT)
    .map(item => item.row);
}

/**
 * One deliver-or-hold attempt: the asks's row lock, then the target's profile
 * lock, then the target's slot rows, then the seeker's wallet — the same lock
 * order every credit path uses. Outcomes: delivered (flip + slot + notices,
 * `creditSpent` false only for a legacy pre-0095 ask), held (D-047, once-only
 * notice, nothing allocated), blocked (this pair is blocked; the caller tries
 * the next referrer), waiting (the target cannot take it right now) or settled
 * (the ask is no longer waiting: claimed, withdrawn, closed or already
 * delivered).
 */
async function deliverWaitingAskTx(tx: LedgerTx, input: { requestId: number; referrerId: number; nowMs: number }): Promise<CoverageDeliveryOutcome> {
  const locked = (await tx.select({ request: referralRequests, companyDomain: jobs.company }).from(referralRequests).innerJoin(jobs, eq(jobs.id, referralRequests.jobId)).where(eq(referralRequests.id, input.requestId)).limit(1).for("update"))[0];
  const request = locked?.request;
  if (!locked || !request || request.status !== "pending" || !request.waitingForCoverage) return { outcome: "settled", requestId: input.requestId };
  if (request.jobSeekerId === input.referrerId) return { outcome: "waiting", requestId: input.requestId, returnedToWaiting: false };
  // Ask → invite → profile is the BYOR lock order. A live reservation is a
  // hard delivery target, not a hint: another employee must leave it waiting.
  const invite = (await tx.select({ id: askInviteLinks.id, status: askInviteLinks.status, claimedByUserId: askInviteLinks.claimedByUserId, reservationExpiresAt: askInviteLinks.reservationExpiresAt })
    .from(askInviteLinks).where(and(eq(askInviteLinks.referralRequestId, input.requestId), inArray(askInviteLinks.status, ["active", "claimed"])))
    .orderBy(desc(askInviteLinks.id)).limit(1).for("update"))[0];
  const hasLiveReservation = invite?.status === "claimed" && invite.reservationExpiresAt !== null && new Date(invite.reservationExpiresAt).getTime() > input.nowMs;
  if (hasLiveReservation && invite.claimedByUserId !== input.referrerId) return { outcome: "waiting", requestId: input.requestId, returnedToWaiting: false };
  const companyDomain = locked.companyDomain;
  const referrer = (await tx.select({ userId: profiles.userId, accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt, paused: profiles.paused, referralCapacity: profiles.referralCapacity, userSuspended: users.suspended, personSuspended: canonicalPeople.suspended })
    .from(profiles).innerJoin(users, eq(users.id, profiles.userId)).leftJoin(canonicalPeople, eq(canonicalPeople.id, users.canonicalPersonId)).where(eq(profiles.userId, input.referrerId)).limit(1).for("update"))[0];
  if (!referrer) return { outcome: "waiting", requestId: input.requestId, returnedToWaiting: false };
  if (!isOpenReferrer(referrer, companyDomain, await readAllocatedSlotsForUpdateTx(tx, input.referrerId))) return { outcome: "waiting", requestId: input.requestId, returnedToWaiting: false };
  // P0-block-delivery: a blocked pair never receives the ask, either way; fail-open and reported (server/blockedPairs.ts).
  if ((await blockedCounterpartsFailOpen(tx, input.referrerId, [request.jobSeekerId], "coverage_delivery")).has(request.jobSeekerId)) return { outcome: "blocked", requestId: input.requestId };
  const now = new Date(input.nowMs);
  let debitTransactionId = request.debitTransactionId;
  if (debitTransactionId === null) {
    const lockedWallet = (await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, request.jobSeekerId), eq(tokenBalances.role, "job_seeker"))).limit(1).for("update"))[0];
    if (!lockedWallet) return { outcome: "held", requestId: input.requestId, seekerUserId: request.jobSeekerId, companyDomain };
    const reconciled = await reconcileWalletTx(tx, lockedWallet, now);
    const promo = await promoStateForTx(tx, request.jobSeekerId, "job_seeker", now);
    // D-110/D-132: the waiting ask pays the same level cost the covered ask
    // paid at creation, classified from the same stored job row.
    const deliveryJob = (await tx.select({ title: jobs.title, description: jobs.description, url: jobs.targetRoleUrl }).from(jobs).where(eq(jobs.id, request.jobId)).limit(1))[0];
    // D-132 audit item 2: read the cost stored at creation; only an ask with no stored row (made with the flag off) is priced again.
    const storedCost = (await tx.select({ creditCost: askCosts.creditCost }).from(askCosts).where(eq(askCosts.referralRequestId, input.requestId)).limit(1))[0];
    const deliveryCost = storedCost ? storedCost.creditCost : askCreditCost({ title: deliveryJob?.title, description: deliveryJob?.description, url: deliveryJob?.url });
    try {
      await spendCreditsTx(tx, { wallet: reconciled.wallet, grants: reconciled.grants, promo: promoGrantsEnabled() ? promoHolding(promo.grant) : null, credits: deliveryCost, meta: { idempotencyKey: askDeliveryKey(input.requestId), referenceType: "referral_request", referenceId: String(input.requestId) }, now });
    } catch (error) {
      if (!(error instanceof InsufficientCreditsError)) throw error;
      // D-047: no credit at first visibility — hold the ask. Nothing is allocated, no referrer is told, and the
      // seeker learns once that a credit will send it. Never delivered free, never billed later.
      await tx.update(referralRequests).set({ coverageHeldAt: now }).where(and(eq(referralRequests.id, input.requestId), eq(referralRequests.waitingForCoverage, true), isNull(referralRequests.coverageHeldAt)));
      const heldNotice = coverageHeldNotice(companyDomain);
      await tx.insert(notifications).values({ userId: request.jobSeekerId, category: "status", kind: "coverage_held", refId: input.requestId, title: heldNotice.title, body: heldNotice.body, eventKey: coverageHeldEventKey(input.requestId) }).onDuplicateKeyUpdate({ set: { eventKey: coverageHeldEventKey(input.requestId) } });
      return { outcome: "held", requestId: input.requestId, seekerUserId: request.jobSeekerId, companyDomain };
    }
    const debitRow = (await tx.select({ id: tokenTransactions.id }).from(tokenTransactions).where(and(eq(tokenTransactions.userId, request.jobSeekerId), eq(tokenTransactions.role, "job_seeker"), eq(tokenTransactions.idempotencyKey, `${askDeliveryKey(input.requestId)}#1`))).limit(1))[0];
    if (!debitRow) throw new Error("The referral credit debit was not recorded");
    debitTransactionId = debitRow.id;
  }
  // The credit is committed: flip the ask to visible and assigned, allocate the slot, and tell both sides, in this
  // transaction. The conditional update re-checks the flip under the row lock already held above.
  const flipped = await tx.update(referralRequests).set({ referrerId: input.referrerId, waitingForCoverage: false, coverageQueuedAt: null, coverageVisibleAt: now, coverageHeldAt: null, debitTransactionId }).where(and(eq(referralRequests.id, input.requestId), eq(referralRequests.waitingForCoverage, true)));
  if (Number(flipped[0]?.affectedRows ?? 0) !== 1) throw new Error("The coverage delivery lost a stale-write race");
  if (invite?.status === "active") {
    await tx.update(askInviteLinks).set({ status: "expired", activeRequestKey: null, closedAt: now }).where(and(eq(askInviteLinks.id, invite.id), eq(askInviteLinks.status, "active"), eq(askInviteLinks.activeRequestKey, askInviteActiveRequestKey(input.requestId))));
    await tx.insert(operationalActivityLogs).values({ actorUserId: input.referrerId, action: "ask_invite.expired", outcome: "success", resourceType: "ask_invite", resourceId: String(invite.id), companyDomain: companyDomain.toLowerCase().slice(0, 255), metadata: JSON.stringify({ requestId: input.requestId, linkId: invite.id, outcome: "coverage_delivered" }) });
  } else if (invite?.status === "claimed" && hasLiveReservation && invite.claimedByUserId === input.referrerId) {
    await tx.update(askInviteLinks).set({ status: "delivered", reservationExpiresAt: null, activeRequestKey: null, closedAt: now }).where(and(eq(askInviteLinks.id, invite.id), eq(askInviteLinks.status, "claimed"), eq(askInviteLinks.claimedByUserId, input.referrerId)));
    await tx.insert(operationalActivityLogs).values({ actorUserId: input.referrerId, action: "ask_invite.delivered", outcome: "success", resourceType: "ask_invite", resourceId: String(invite.id), companyDomain: companyDomain.toLowerCase().slice(0, 255), metadata: JSON.stringify({ requestId: input.requestId, linkId: invite.id, outcome: "delivered" }) });
  }
  await tx.insert(referralAvailabilitySlots).values({ referrerId: input.referrerId, companyDomain, referralRequestId: input.requestId, status: "allocated", activeRequestKey: `request:${input.requestId}` });
  const deliveredNotice = coverageDeliveredNotice(companyDomain);
  await tx.insert(notifications).values({ userId: request.jobSeekerId, category: "status", kind: "coverage_delivered", refId: input.requestId, title: deliveredNotice.title, body: deliveredNotice.body, eventKey: coverageDeliveredEventKey(input.requestId) }).onDuplicateKeyUpdate({ set: { eventKey: coverageDeliveredEventKey(input.requestId) } });
  const referrerNotice = coverageReferrerNotice(companyDomain);
  await tx.insert(notifications).values({ userId: input.referrerId, category: "referral", kind: "ask_new", refId: input.requestId, title: referrerNotice.title, body: referrerNotice.body, eventKey: coverageReferrerEventKey(input.requestId, input.referrerId) }).onDuplicateKeyUpdate({ set: { eventKey: coverageReferrerEventKey(input.requestId, input.referrerId) } });
  const creditSpent = request.debitTransactionId === null;
  // Invite rewards unlock the moment the ask is actually funded and sent, exactly like a covered create.
  if (creditSpent) await grantPendingActionRewardsTx(tx, request.jobSeekerId, "job_seeker", "referral_request", String(input.requestId));
  await tx.insert(operationalActivityLogs).values({ action: "coverage.delivered", outcome: "success", resourceType: "referral_request", resourceId: String(input.requestId).slice(0, 120), companyDomain: companyDomain.toLowerCase().slice(0, 255), metadata: JSON.stringify({ referrerId: input.referrerId, creditSpent }) });
  return { outcome: "delivered", requestId: input.requestId, referrerId: input.referrerId, seekerUserId: request.jobSeekerId, companyDomain, creditSpent };
}

/** The company's waiting and held asks a hand-off may deliver, oldest queue position first. */
async function listDeliverableWaitingAsksTx(tx: LedgerTx, input: { companyDomain: string; limit: number; nowMs: number }): Promise<Array<{ id: number; jobSeekerId: number }>> {
  const reserved = await tx.select({ requestId: askInviteLinks.referralRequestId }).from(askInviteLinks)
    .innerJoin(referralRequests, eq(referralRequests.id, askInviteLinks.referralRequestId)).innerJoin(jobs, eq(jobs.id, referralRequests.jobId))
    .where(and(eq(jobs.company, input.companyDomain), eq(askInviteLinks.status, "claimed"), gt(askInviteLinks.reservationExpiresAt, new Date(input.nowMs))));
  const excluded = Array.from(new Set(reserved.map(row => row.requestId))).map(id => ne(referralRequests.id, id));
  return tx.select({ id: referralRequests.id, jobSeekerId: referralRequests.jobSeekerId })
    .from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id))
    .where(and(eq(jobs.company, input.companyDomain), eq(referralRequests.status, "pending"), eq(referralRequests.waitingForCoverage, true), isNull(referralRequests.referrerId), ...excluded))
    .orderBy(asc(referralRequests.coverageQueuedAt), asc(referralRequests.id))
    .limit(input.limit);
}

/** Live asks reserved for this employee go ahead of the ordinary oldest-first queue. */
async function listReservedWaitingAsksForReferrerTx(tx: LedgerTx, input: { referrerId: number; companyDomain: string; nowMs: number; limit: number }): Promise<Array<{ id: number; jobSeekerId: number }>> {
  return tx.select({ id: referralRequests.id, jobSeekerId: referralRequests.jobSeekerId }).from(askInviteLinks)
    .innerJoin(referralRequests, eq(referralRequests.id, askInviteLinks.referralRequestId)).innerJoin(jobs, eq(jobs.id, referralRequests.jobId))
    .where(and(eq(jobs.company, input.companyDomain), eq(askInviteLinks.status, "claimed"), eq(askInviteLinks.claimedByUserId, input.referrerId), gt(askInviteLinks.reservationExpiresAt, new Date(input.nowMs)), eq(referralRequests.status, "pending"), eq(referralRequests.waitingForCoverage, true), isNull(referralRequests.referrerId)))
    .orderBy(asc(askInviteLinks.claimedAt), asc(referralRequests.id)).limit(input.limit);
}

/**
 * D-062 hand-off: give `referrerId` their company's waiting asks, oldest
 * first, until their remaining capacity or `maxDeliveries` is reached. Each
 * open slot tries at most COVERAGE_ATTEMPTS_PER_SLOT candidates — blocked asks
 * and asks held for want of a credit keep their queue place for the next
 * opening, the sweep or the ask's own seeker. Returns the delivered ids (in
 * delivery order) plus how many were held or stepped past.
 */
async function handOffWaitingAsksToReferrerTx(tx: LedgerTx, input: { referrerId: number; companyDomain: string; maxDeliveries?: number; nowMs: number }): Promise<{ deliveredRequestIds: number[]; held: number; skipped: number }> {
  const referrer = (await tx.select({ userId: profiles.userId, accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt, paused: profiles.paused, referralCapacity: profiles.referralCapacity, userSuspended: users.suspended, personSuspended: canonicalPeople.suspended })
    .from(profiles).innerJoin(users, eq(users.id, profiles.userId)).leftJoin(canonicalPeople, eq(canonicalPeople.id, users.canonicalPersonId)).where(eq(profiles.userId, input.referrerId)).limit(1).for("update"))[0];
  const allocated = await readAllocatedSlotsForUpdateTx(tx, input.referrerId);
  const remaining = referrer && isOpenReferrer(referrer, input.companyDomain, allocated) ? referralCapacityRemaining(referrer, allocated) : 0;
  const target = Math.min(input.maxDeliveries ?? remaining, remaining);
  const summary = { deliveredRequestIds: [] as number[], held: 0, skipped: 0 };
  if (target <= 0) return summary;
  const scanLimit = target * COVERAGE_ATTEMPTS_PER_SLOT;
  const reserved = await listReservedWaitingAsksForReferrerTx(tx, { referrerId: input.referrerId, companyDomain: input.companyDomain, nowMs: input.nowMs, limit: scanLimit });
  const ordinary = await listDeliverableWaitingAsksTx(tx, { companyDomain: input.companyDomain, nowMs: input.nowMs, limit: scanLimit });
  const reservedIds = new Set(reserved.map(ask => ask.id));
  const candidates = [...reserved, ...ordinary.filter(ask => !reservedIds.has(ask.id))].slice(0, scanLimit);
  for (const ask of candidates) {
    if (summary.deliveredRequestIds.length >= target) break;
    const outcome = await deliverWaitingAskTx(tx, { requestId: ask.id, referrerId: input.referrerId, nowMs: input.nowMs });
    if (outcome.outcome === "delivered") summary.deliveredRequestIds.push(ask.id);
    else if (outcome.outcome === "held") summary.held += 1;
    else if (outcome.outcome === "waiting") break; // the target itself cannot take asks right now; nothing later in the queue can change that in this window
    else summary.skipped += 1;
  }
  return summary;
}

/**
 * D-062 enrollment hand-off, fail-soft for its callers: a freshly verified
 * referrer receives their capacity of waiting asks oldest first; the hourly
 * coverage-delivery-retry sweep recovers anything this attempt misses.
 */
export async function deliverWaitingAsksToReferrer(userId: number, companyDomain: string, nowMs: number = Date.now()): Promise<CoverageHandoffSummary> {
  const db = await getDb(); if (!db) return { delivered: 0, held: 0, skipped: 0 };
  const summary = await db.transaction(tx => handOffWaitingAsksToReferrerTx(tx, { referrerId: userId, companyDomain, nowMs }));
  return { delivered: summary.deliveredRequestIds.length, held: summary.held, skipped: summary.skipped };
}

/**
 * One delivery attempt for a waiting or held ask against the company's
 * available referrers — the coverage-delivery-retry sweep's unit of work
 * (server/coverageDeliverySweep.ts). A held ask whose company has no open
 * referrer left goes back to plain waiting (`returnedToWaiting`), so the
 * seeker's "add a credit" notice is only live while a referrer actually
 * exists. The delivery re-checks everything under the row lock, so a
 * concurrent read, claim or expiry can never deliver twice.
 */
export async function tryDeliverWaitingAsk(requestId: number, nowMs: number = Date.now()): Promise<CoverageDeliveryOutcome> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const current = (await tx.select({ request: referralRequests, companyDomain: jobs.company }).from(referralRequests).innerJoin(jobs, eq(jobs.id, referralRequests.jobId)).where(eq(referralRequests.id, requestId)).limit(1).for("update"))[0];
    if (!current || current.request.status !== "pending" || !current.request.waitingForCoverage) return { outcome: "settled", requestId };
    const wasHeld = current.request.coverageHeldAt !== null;
    const reservation = (await tx.select({ claimedByUserId: askInviteLinks.claimedByUserId }).from(askInviteLinks)
      .where(and(eq(askInviteLinks.referralRequestId, requestId), eq(askInviteLinks.status, "claimed"), gt(askInviteLinks.reservationExpiresAt, new Date(nowMs))))
      .limit(1).for("update"))[0];
    if (reservation?.claimedByUserId !== null && reservation?.claimedByUserId !== undefined) {
      return deliverWaitingAskTx(tx, { requestId, referrerId: reservation.claimedByUserId, nowMs });
    }
    for (const candidate of await selectDeliveryCandidatesTx(tx, { companyDomain: current.companyDomain, seekerUserId: current.request.jobSeekerId })) {
      const outcome = await deliverWaitingAskTx(tx, { requestId, referrerId: candidate.userId, nowMs });
      if (outcome.outcome === "delivered" || outcome.outcome === "held" || outcome.outcome === "settled") return outcome;
      // blocked or waiting: a block is per pair and a full referrer may free capacity; try the next candidate.
    }
    if (wasHeld) {
      await tx.update(referralRequests).set({ coverageHeldAt: null }).where(and(eq(referralRequests.id, requestId), eq(referralRequests.waitingForCoverage, true)));
      return { outcome: "waiting", requestId, returnedToWaiting: true };
    }
    return { outcome: "waiting", requestId, returnedToWaiting: false };
  });
}

export async function openCompanyReferralAvailability(userId: number, input: { slotCount?: number }) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !isVerifiedEmployeeOfCompany(profile, profile.workEmailDomain)) throw new Error("Verify your company email before opening referral capacity");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const slotCount = Math.max(1, Math.min(3, Math.floor(input.slotCount ?? 1)));
  const companyDomain = profile.workEmailDomain;
  const nowMs = Date.now();
  return db.transaction(async tx => {
    // D-062: an explicit opening hands over waiting asks oldest first, up to the
    // slots asked for and the employee's remaining capacity. Each delivery
    // spends the seeker's credit at first visibility (D-034); asks whose seeker
    // has no credit stay held (D-047) and keep their place.
    const summary = await handOffWaitingAsksToReferrerTx(tx, { referrerId: userId, companyDomain, maxDeliveries: slotCount, nowMs });
    return { companyDomain, requestedSlotCount: slotCount, allocatedRequestIds: summary.deliveredRequestIds, allocatedCount: summary.deliveredRequestIds.length };
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

// TRUTH-1 (D-066 (3), D-076 (8)): this counts asks a referrer accepted and that were not
// undone: the open accepted statuses, or closed only when an acceptance transition exists
// for the ask. An expired ask is closed with no acceptance and never counts, whether it
// was claimed or not. A "referrals made" count (intro_made or later) is a different
// number; never relabel this one as such.
export async function getPublicReferralImpact(): Promise<PublicReferralImpact> {
  const db = await getDb(); if (!db) return { acceptedReferrals: 0 };
  const open = await db.select({ acceptedReferrals: count(referralRequests.id) }).from(referralRequests).where(inArray(referralRequests.status, ["approved", "intro_made", "interview", "offer"]));
  const acceptedEventIds = await db.select({ id: referralTransitionEvents.referralRequestId }).from(referralTransitionEvents).where(eq(referralTransitionEvents.resultingStatus, "approved"));
  const closedAccepted = acceptedEventIds.length === 0 ? [] : await db.select({ acceptedReferrals: count(referralRequests.id) }).from(referralRequests).where(and(eq(referralRequests.status, "closed"), inArray(referralRequests.id, acceptedEventIds.map(row => row.id))));
  return { acceptedReferrals: Number(open[0]?.acceptedReferrals ?? 0) + Number(closedAccepted[0]?.acceptedReferrals ?? 0) };
}

export async function getDomainIntegrity(limit = 100) {
  const db = await getDb();
  if (!db) return buildDomainIntegrityReport([], limit);
  const result = await db.execute(sql`
    SELECT 'profiles' AS tableName, CAST(id AS CHAR) AS rowId, workEmailDomain AS storedDomain, 0 AS evidenceOnly FROM profiles WHERE workEmailDomain IS NOT NULL
    UNION SELECT 'jobs', CAST(id AS CHAR), company, 0 FROM jobs WHERE title = 'Role from shared job link' OR description = 'Private referral request routed from a Target Role URL.'
    UNION SELECT 'companyOpportunities', CAST(id AS CHAR), companyDomain, 0 FROM companyOpportunities
    UNION SELECT 'referralAvailabilitySlots', CAST(id AS CHAR), companyDomain, 0 FROM referralAvailabilitySlots
    UNION SELECT 'referrerFastTrackLinks', CAST(id AS CHAR), companyDomain, 0 FROM referrerFastTrackLinks
    UNION SELECT 'companyCoverageInvitations', CAST(id AS CHAR), companyDomain, 0 FROM companyCoverageInvitations
    UNION SELECT 'operationalActivityLogs', CAST(id AS CHAR), companyDomain, 1 FROM operationalActivityLogs WHERE companyDomain IS NOT NULL
  `);
  const rows = (result[0] as unknown as Array<{ tableName: string; rowId: string; storedDomain: string; evidenceOnly: number }>).map(row => ({ table: row.tableName, rowId: row.rowId, storedDomain: row.storedDomain, evidenceOnly: Boolean(row.evidenceOnly) })) satisfies StoredDomainRow[];
  return buildDomainIntegrityReport(rows, limit);
}

export async function getReferralFlowHealth() {
  const db = await getDb();
  if (!db) return { funnel: { requestsCreated: 0, requestsClaimed: 0, decisionsRecorded: 0, waitingForCoverage: 0 }, coverageGaps: [], instrumentation: { uploadedDocuments: 0, recordedFailures: 0 } };
  const [requests, verifiedProfiles, activities, domainIntegrity] = await Promise.all([
    db.select({ companyDomain: jobs.company, status: referralRequests.status, referrerId: referralRequests.referrerId }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)),
    db.select({ workEmailDomain: profiles.workEmailDomain }).from(profiles).where(eq(profiles.accountType, "referrer")),
    db.select({ action: operationalActivityLogs.action, outcome: operationalActivityLogs.outcome }).from(operationalActivityLogs).orderBy(desc(operationalActivityLogs.createdAt)).limit(1000),
    getDomainIntegrity(1),
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
      domainIntegrityAffected: domainIntegrity.affectedCount,
    },
  };
}

export async function listMyPaymentReceipts(userId: number, role: "job_seeker" | "referrer" = "job_seeker", limit = 50) {
  const db = await getDb(); if (!db) return [];
  const safeLimit = Math.max(1, Math.min(limit, 100));
  return db.select({ id: paymentFulfillments.id, provider: paymentFulfillments.provider, amount: paymentFulfillments.amount, currency: paymentFulfillments.currency, tokenCount: paymentFulfillments.tokenCount, status: paymentFulfillments.status, providerInvoiceId: paymentFulfillments.providerInvoiceId, createdAt: paymentFulfillments.createdAt }).from(paymentFulfillments).where(and(eq(paymentFulfillments.userId, userId), eq(paymentFulfillments.role, role), inArray(paymentFulfillments.status, ["credited", "refunded"]))).orderBy(desc(paymentFulfillments.createdAt)).limit(safeLimit);
}

type LedgerAuditDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type LedgerAuditWallet = typeof tokenBalances.$inferSelect;
type LedgerAuditFindings = { mismatches: Array<Record<string, unknown>>; integrity: Array<Record<string, unknown>> };

async function auditLedgerWallets(db: LedgerAuditDb, wallets: LedgerAuditWallet[]): Promise<LedgerAuditFindings> {
  const mismatches:Array<Record<string,unknown>>=[];const integrity:Array<Record<string,unknown>>=[];
  for(const wallet of wallets){const rows=await db.select().from(tokenTransactions).where(and(eq(tokenTransactions.userId,wallet.userId),eq(tokenTransactions.role,wallet.role))).orderBy(desc(tokenTransactions.id));
    const purchased=rows.filter(row=>row.source==="purchased_balance"||(["purchase","admin_adjustment","company_coverage_reward","personal_referral_reward","invite_reward_granted"].includes(row.kind)&&!row.source)).reduce((sum,row)=>sum+row.tokenCount,0);
    // Rows written before the bucket ledger (a spend with no source) cannot say which bucket they drew from, so such a wallet has no purchased-bucket evidence to compare. Cycle and grant buckets still reconcile below.
    const hasLegacySpend=rows.some(row=>!row.source&&(row.kind==="direct_request"||row.kind==="credit_spend"));
    if(!hasLegacySpend&&purchased!==wallet.balance)mismatches.push({userId:wallet.userId,role:wallet.role,bucket:"purchased_balance",expected:purchased,actual:wallet.balance,delta:wallet.balance-purchased,lastTransactionId:rows[0]?.id??null,referenceId:rows[0]?.referenceId??null});
    if(wallet.balance<0||wallet.monthlyCreditsRemaining<0)integrity.push({type:"negative_bucket",userId:wallet.userId,role:wallet.role,balance:wallet.balance,monthlyCreditsRemaining:wallet.monthlyCreditsRemaining});
    // Kit ledger: the cycle bucket reconciles against its own cycle's rows once that cycle was opened by a plan_grant row
    // (a cycle that began before the ledger has no opening row), and every grant against the rows that name it.
    const cycleRows=rows.filter(row=>row.source===BUCKET_SOURCES.cycle&&row.sourceCycleKey===wallet.monthlyCycleKey);
   
    if(cycleRows.filter(row=>row.kind==="plan_grant").length===1){const expected=cycleRows.reduce((sum,row)=>sum+row.tokenCount,0);if(expected!==wallet.monthlyCreditsRemaining)mismatches.push({userId:wallet.userId,role:wallet.role,bucket:"cycle",cycleKey:wallet.monthlyCycleKey,expected,actual:wallet.monthlyCreditsRemaining,delta:wallet.monthlyCreditsRemaining-expected});}
    const grants=await readGrantsTx(db,wallet.userId,wallet.role,false);
    for(const grant of grants){const expected=rows.filter(row=>row.creditGrantId===grant.id).reduce((sum,row)=>sum+row.tokenCount,0);if(expected!==grant.creditsRemaining)mismatches.push({userId:wallet.userId,role:wallet.role,bucket:`grant:${grant.source}`,grantId:grant.id,expected,actual:grant.creditsRemaining,delta:grant.creditsRemaining-expected});if(grant.creditsRemaining<0)integrity.push({type:"negative_grant",userId:wallet.userId,role:wallet.role,grantId:grant.id});}
  }
  return { mismatches, integrity };
}

async function auditOrphanLedgerDebits(db: LedgerAuditDb): Promise<Array<Record<string, unknown>>> {
  // Asks no longer reserve a credit, so an ask without a debit is expected; a debit without its ask is still a fault.
  const orphanDebits=await db.select({id:tokenTransactions.id,referenceId:tokenTransactions.referenceId,userId:tokenTransactions.userId}).from(tokenTransactions).leftJoin(referralRequests,eq(sql`CAST(${referralRequests.id} AS CHAR)`,sql`CAST(${tokenTransactions.referenceId} AS CHAR)`)).where(and(eq(tokenTransactions.kind,"direct_request"),isNotNull(tokenTransactions.referenceId),isNull(referralRequests.id))).limit(200);
  return orphanDebits.map(row=>({type:"debit_without_request",...row}));
}

export async function getCreditLedgerAudit(limit = 200) {
  const db=await getDb();if(!db)return {mismatches:[] as Array<Record<string,unknown>>,integrity:[] as Array<Record<string,unknown>>,checkedWallets:0};
  const wallets=await db.select().from(tokenBalances).orderBy(desc(tokenBalances.updatedAt)).limit(Math.max(1,Math.min(limit,500)));
  const findings=await auditLedgerWallets(db,wallets);
  const integrity=[...findings.integrity,...(await auditOrphanLedgerDebits(db))];
  return {checkedWallets:wallets.length,mismatches:findings.mismatches,integrity,readOnly:true};
}

/** D-065: the daily money check reads every wallet in id order, not the 200-latest admin page. Same bucket rules as getCreditLedgerAudit. */
export async function getFullCreditLedgerAudit(batch = 200) {
  const db=await getDb();if(!db)return {mismatches:[] as Array<Record<string,unknown>>,integrity:[] as Array<Record<string,unknown>>,checkedWallets:0};
  const size=Math.max(1,Math.min(batch,500));
  let afterId=0;let checkedWallets=0;
  const mismatches:Array<Record<string,unknown>>=[];const integrity:Array<Record<string,unknown>>=[];
  for(;;){
    const wallets=await db.select().from(tokenBalances).where(gt(tokenBalances.id,afterId)).orderBy(asc(tokenBalances.id)).limit(size);
    if(wallets.length===0)break;
    const part=await auditLedgerWallets(db,wallets);
    mismatches.push(...part.mismatches);integrity.push(...part.integrity);
    checkedWallets+=wallets.length;afterId=wallets[wallets.length-1]!.id;
    if(wallets.length<size)break;
  }
  integrity.push(...(await auditOrphanLedgerDebits(db)));
  return {checkedWallets,mismatches,integrity,readOnly:true};
}

export async function claimCompanyReferralRequest(userId: number, requestId: number) {
  const profile = await getProfileByUserId(userId);
  if (!profile?.workEmailDomain || !profile.workEmailVerifiedAt) throw new Error("Verify your work email before claiming referrals");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const current = (await tx.select({ request: referralRequests, company: jobs.company }).from(referralRequests).innerJoin(jobs,eq(referralRequests.jobId,jobs.id)).where(eq(referralRequests.id,requestId)).limit(1).for("update"))[0];
    if (!current || current.request.status !== "pending" || current.request.waitingForCoverage || !isVerifiedEmployeeOfCompany(profile,current.company) || (current.request.referrerId !== null && current.request.referrerId !== userId)) throw new ReferralTransitionConflict("This referral request is no longer available", { status: current?.request.status ?? "missing", revision: current?.request.revision ?? -1 });
    // D-061: a waiting or held ask has reached no referrer and cannot be claimed; the claim clock follows the ask's own
    // shelf life (7 days from first visibility; rows without coverageVisibleAt: creation). D-050 / P0-allocated-ask-stuck:
    // an assigned ask its employee never claimed (a personal-link ask or a queue allocation) is unclaimed too (decided under
    // this row lock, on the same window), so a late claim cannot end it after the seeker's expiry was due and keep their
    // credit spent.
    const claimNowMs = Date.now();
    if (current && (current.request.referrerId === null
      ? isAskExpired({ status: current.request.status, referrerId: current.request.referrerId, createdAt: current.request.createdAt, coverageVisibleAt: current.request.coverageVisibleAt, waitingForCoverage: current.request.waitingForCoverage }, claimNowMs)
      : isPastAskWindow(current.request, claimNowMs) && await heldForReferrerTx(tx, current.request) !== null)) throw new ReferralTransitionConflict("This referral request expired before it could be claimed", { status: current.request.status, revision: current.request.revision });
    // D-022: during the poster's 48-hour first look, nobody else can claim.
    if (current && firstLookExcludesViewer(current.request, userId, claimNowMs)) throw new ReferralTransitionConflict("This referral request is still in its poster's first look", { status: current.request.status, revision: current.request.revision });
    const passed = (await tx.select({id:referralRequestPasses.id}).from(referralRequestPasses).where(and(eq(referralRequestPasses.referralRequestId,requestId),eq(referralRequestPasses.referrerId,userId))).limit(1))[0];
    if (passed) throw new Error("You already passed on this referral request");
    // D-038-A (§4.7): a referrer holds at most 5 open claims at once. The claimant's own profiles row
    // is locked first so two simultaneous claims by one person take turns, and this transaction runs
    // at READ COMMITTED (D-038-reconcile A-1) so the count below sees what the other claim committed
    // while this one waited, instead of a snapshot taken when the transaction started.
    // Allocations and personal-link holds are not claims and never count (D-076 (2)).
    // D-038-reconcile R-4: the count is one bounded aggregate over the claimant's own current asks and
    // takes no lock on any other request's row. A claim event on an ask still assigned to the claimant
    // and pending is their open claim; every release (lapse, step-back, referral lapse) clears the
    // assignment and writes an exclusion, so a released ask never stays assigned to the same person.
    // R-6: repeating a claim on an ask the claimant already holds skips the cap and answers as a replay.
    await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.userId, userId)).limit(1).for("update");
    if (current.request.referrerId !== userId) {
      const [openClaims] = await tx.select({ openClaims: count() }).from(referralTransitionEvents)
        .innerJoin(referralRequests, eq(referralTransitionEvents.referralRequestId, referralRequests.id))
        .where(and(eq(referralRequests.referrerId, userId), eq(referralRequests.status, "pending"), eq(referralTransitionEvents.action, "claim"), eq(referralTransitionEvents.actorUserId, userId)));
      if (Number(openClaims?.openClaims ?? 0) >= MAX_ACTIVE_CLAIMS) throw new ReferralTransitionConflict(`You can hold ${MAX_ACTIVE_CLAIMS} asks at once. Accept or pass one of them first.`, { status: "pending", revision: -1 });
    }
    const result = await transitionReferralRequestTx(tx, { requestId, actorUserId: userId, action: "claim", operationKey: `claim:${userId}`, toStatus: "pending", allowedFrom: ["pending"], authorize: row => { if (row.referrerId !== null && row.referrerId !== userId) throw new Error("Another verified employee already claimed this request"); }, patch: { referrerId: userId }, notification: { userId: current.request.jobSeekerId, title: "Your referral request was claimed", body: "A verified employee at the target company is reviewing your request." } });
    // A claim grants no document access (D-019(e)); acceptance does, in transitionReferralRequestTx.
    return { requestId, claimed: true as const, replayed: result.replayed, revision: result.revision, jobSeekerId: current.request.jobSeekerId, companyDomain: current.company };
  }, { isolationLevel: "read committed" });
}

/** The latest event of a set, chosen by event id in code.
 *
 * Deliberately not `ORDER BY id DESC LIMIT 1`: the in-memory test kit returns rows
 * in insertion order and ignores ORDER BY on purpose (server/inMemoryDrizzle.testkit.ts),
 * so a query that leans on row order cannot be verified by any test. Picking the
 * highest id here is the same answer in MySQL and is testable. */
function latestByEventId<T extends { id: unknown }>(rows: readonly T[]): T | null {
  let latest: T | null = null;
  for (const row of rows) if (latest === null || Number(row.id) > Number(latest.id)) latest = row;
  return latest;
}

/** D-038-reconcile B-1: the extension belongs to one acceptance, keyed by that acceptance's event id. */
function referredExtensionOn(requestId: number, acceptEventId: number) {
  return and(eq(referralTransitionEvents.referralRequestId, requestId), eq(referralTransitionEvents.action, "referred_extension"), eq(referralTransitionEvents.operationKey, referredExtensionOperationKey(acceptEventId)));
}

/** The actions that start or end a pickup. D-038-B and D-035 add more release actions here. */
const PICKUP_OR_RELEASE_ACTIONS = ["claim", "claim_lapse", "referred_lapse", "step_back"] as const;

/** D-038-A: "pickup since the latest release" — true only when the most recent
 * pickup-or-release event for this request is a claim. Release actions (claim_lapse,
 * referred_lapse, step_back) end the pickup; a later claim starts a new one.
 * Reads only claim and release actions, under the same row lock as callers. */
export async function referralWasClaimedTx(tx: LedgerTx, requestId: number): Promise<boolean> {
  const events = await tx.select({ id: referralTransitionEvents.id, action: referralTransitionEvents.action }).from(referralTransitionEvents)
    .where(and(eq(referralTransitionEvents.referralRequestId, requestId), inArray(referralTransitionEvents.action, [...PICKUP_OR_RELEASE_ACTIONS])))
    .for("update");
  return latestByEventId(events)?.action === "claim";
}

/** D-038-A: a claim that nobody accepts or passes within 48 h returns the ask to colleagues.
 * Re-decides under the request row lock and returns { lapsed: true } only when it actually lapsed. */
export async function lapseClaimTx(tx: LedgerTx, requestId: number, nowMs: number): Promise<{ lapsed: boolean; reason?: string }> {
  const current = (await tx.select({ id: referralRequests.id, status: referralRequests.status, referrerId: referralRequests.referrerId, jobSeekerId: referralRequests.jobSeekerId, companyDomain: jobs.company }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(eq(referralRequests.id, requestId)).limit(1).for("update"))[0];
  if (!current || current.status !== "pending" || !current.referrerId) return { lapsed: false };
  const latest = await tx.select({ id: referralTransitionEvents.id, action: referralTransitionEvents.action, createdAt: referralTransitionEvents.createdAt }).from(referralTransitionEvents)
    .where(and(eq(referralTransitionEvents.referralRequestId, requestId), inArray(referralTransitionEvents.action, ["claim", "claim_lapse"])))
    .for("update");
  const claimEvent = latestByEventId(latest);
  if (!claimEvent || claimEvent.action !== "claim") return { lapsed: false };
  const claimEventId = Number(claimEvent.id);
  const claimCreatedAt = claimEvent.createdAt instanceof Date ? claimEvent.createdAt.getTime() : Date.parse(String(claimEvent.createdAt));
  if (!Number.isFinite(claimCreatedAt)) return { lapsed: false };
  if (nowMs < claimLapseAtMs(claimCreatedAt)) return { lapsed: false };
  const referrerId = current.referrerId;
  const companyDomain = current.companyDomain;
  await transitionReferralRequestTx(tx, { requestId, actorUserId: referrerId, action: "claim_lapse", operationKey: `claim-lapse:${claimEventId}`, toStatus: "pending", allowedFrom: ["pending"], authorize: row => { if (row.referrerId !== referrerId) throw new Error("Referral Request not found"); }, patch: { referrerId: null, referrerMessage: null }, notification: { userId: referrerId, title: "An ask went back to your colleagues", body: `You didn't accept or pass within 48 hours, so it's open to other verified employees at ${companyDomain} again.` } });
  await tx.delete(referralRequestSaves).where(and(eq(referralRequestSaves.referralRequestId, requestId), eq(referralRequestSaves.referrerId, referrerId)));
  await tx.update(referrerReviewEmailLinks).set({ consumedAt: new Date() }).where(and(eq(referrerReviewEmailLinks.referralRequestId, requestId), eq(referrerReviewEmailLinks.referrerId, referrerId), isNull(referrerReviewEmailLinks.consumedAt)));
  await tx.update(referralAvailabilitySlots).set({ status: "released", releasedAt: new Date() }).where(and(eq(referralAvailabilitySlots.referralRequestId, requestId), eq(referralAvailabilitySlots.referrerId, referrerId), eq(referralAvailabilitySlots.status, "allocated")));
  await tx.insert(referralRequestPasses).values({ referralRequestId: requestId, referrerId, reason: "timing", reasonCode: "lapsed_claim" }).onDuplicateKeyUpdate({ set: { reason: "timing", reasonCode: "lapsed_claim" } });
  await tx.insert(notifications).values({ userId: current.jobSeekerId, category: "status", kind: "ask_update", refId: requestId, title: `Update on your referral request — ${companyDomain}`, body: `The verified employee who picked up your ask didn't decide within 48 hours. It's open again to other verified employees at ${companyDomain}. If nobody picks it up, your credit comes back, ${CREDIT_ENDED_CAVEAT}.`, eventKey: `claim-lapsed:${requestId}:${referrerId}`.slice(0, 120) }).onDuplicateKeyUpdate({ set: { eventKey: `claim-lapsed:${requestId}:${referrerId}`.slice(0, 120) } });
  return { lapsed: true, reason: "lapsed_claim" };
}

/** D-038-A: an allocation nobody claims within 48 h of first visibility returns the ask to colleagues.
 * Never reads the slot's openedAt (a database clock). */
export async function lapseAllocationTx(tx: LedgerTx, requestId: number, nowMs: number): Promise<{ lapsed: boolean; reason?: string }> {
  const current = (await tx.select({ id: referralRequests.id, status: referralRequests.status, referrerId: referralRequests.referrerId, jobSeekerId: referralRequests.jobSeekerId, coverageVisibleAt: referralRequests.coverageVisibleAt, companyDomain: jobs.company }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(eq(referralRequests.id, requestId)).limit(1).for("update"))[0];
  if (!current || current.status !== "pending" || !current.referrerId) return { lapsed: false };
  if (await referralWasClaimedTx(tx, requestId)) return { lapsed: false };
  const slot = (await tx.select({ id: referralAvailabilitySlots.id, status: referralAvailabilitySlots.status }).from(referralAvailabilitySlots).where(and(eq(referralAvailabilitySlots.referralRequestId, requestId), eq(referralAvailabilitySlots.referrerId, current.referrerId), eq(referralAvailabilitySlots.status, "allocated"))).limit(1))[0];
  if (!slot) return { lapsed: false };
  const slotId = Number(slot.id);
  const coverageVisibleAt = current.coverageVisibleAt instanceof Date ? current.coverageVisibleAt.getTime() : typeof current.coverageVisibleAt === "string" || typeof current.coverageVisibleAt === "number" ? Date.parse(String(current.coverageVisibleAt)) : null;
  if (nowMs < allocationLapseAtMs(coverageVisibleAt)) return { lapsed: false };
  const referrerId = current.referrerId;
  const companyDomain = current.companyDomain;
  await transitionReferralRequestTx(tx, { requestId, actorUserId: referrerId, action: "allocation_lapse", operationKey: `allocation-lapse:${slotId}`, toStatus: "pending", allowedFrom: ["pending"], authorize: row => { if (row.referrerId !== referrerId) throw new Error("Referral Request not found"); }, patch: { referrerId: null, referrerMessage: null }, notification: { userId: referrerId, title: "An ask went back to your colleagues", body: `You didn't respond within 48 hours, so it's open to other verified employees at ${companyDomain} again.` } });
  await tx.delete(referralRequestSaves).where(and(eq(referralRequestSaves.referralRequestId, requestId), eq(referralRequestSaves.referrerId, referrerId)));
  await tx.update(referrerReviewEmailLinks).set({ consumedAt: new Date() }).where(and(eq(referrerReviewEmailLinks.referralRequestId, requestId), eq(referrerReviewEmailLinks.referrerId, referrerId), isNull(referrerReviewEmailLinks.consumedAt)));
  await tx.update(referralAvailabilitySlots).set({ status: "released", releasedAt: new Date() }).where(and(eq(referralAvailabilitySlots.referralRequestId, requestId), eq(referralAvailabilitySlots.referrerId, referrerId), eq(referralAvailabilitySlots.status, "allocated")));
  await tx.insert(referralRequestPasses).values({ referralRequestId: requestId, referrerId, reason: "timing", reasonCode: "lapsed_allocation" }).onDuplicateKeyUpdate({ set: { reason: "timing", reasonCode: "lapsed_allocation" } });
  await tx.insert(notifications).values({ userId: current.jobSeekerId, category: "status", kind: "ask_update", refId: requestId, title: `Update on your referral request — ${companyDomain}`, body: `The verified employee it reached didn't respond within 48 hours. It's open again to other verified employees at ${companyDomain}. If nobody picks it up, your credit comes back, ${CREDIT_ENDED_CAVEAT}.`, eventKey: `allocation-lapsed:${requestId}:${referrerId}`.slice(0, 120) }).onDuplicateKeyUpdate({ set: { eventKey: `allocation-lapsed:${requestId}:${referrerId}`.slice(0, 120) } });
  return { lapsed: true, reason: "lapsed_allocation" };
}

/** D-038-B: an accepted ask whose Referred deadline passed reopens to colleagues.
 * Re-decides under the request row lock and returns { lapsed: true } only when it actually lapsed. */
export async function lapseReferredTx(tx: LedgerTx, requestId: number, nowMs: number): Promise<{ lapsed: boolean; reason?: string }> {
  const current = (await tx.select({ id: referralRequests.id, status: referralRequests.status, referrerId: referralRequests.referrerId, jobSeekerId: referralRequests.jobSeekerId, companyDomain: jobs.company, revision: referralRequests.revision }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(eq(referralRequests.id, requestId)).limit(1).for("update"))[0];
  if (!current || current.status !== "approved" || !current.referrerId) return { lapsed: false };
  const latestEvents = await tx.select({ id: referralTransitionEvents.id, action: referralTransitionEvents.action, createdAt: referralTransitionEvents.createdAt, resultingStatus: referralTransitionEvents.resultingStatus }).from(referralTransitionEvents)
    .where(and(eq(referralTransitionEvents.referralRequestId, requestId), inArray(referralTransitionEvents.action, ["approve", "review", "referred_lapse", "step_back"])))
    .for("update");
  const latest = latestByEventId(latestEvents);
  if (!latest || latest.resultingStatus !== "approved") return { lapsed: false };
  const acceptEvent = latest;
  const acceptEventId = Number(acceptEvent.id);
  const acceptCreatedAt = acceptEvent.createdAt instanceof Date ? acceptEvent.createdAt.getTime() : Date.parse(String(acceptEvent.createdAt));
  if (!Number.isFinite(acceptCreatedAt)) return { lapsed: false };
  const extended = (await tx.select({ id: referralTransitionEvents.id }).from(referralTransitionEvents).where(referredExtensionOn(requestId, acceptEventId)).limit(1)).length > 0;
  if (nowMs < referredDueAtMs(acceptCreatedAt, extended)) return { lapsed: false };
  const referrerId = current.referrerId;
  const companyDomain = current.companyDomain;
  await tx.update(referralDocumentAccessGrants).set({ revokedAt: new Date(), revokeReason: "referred_lapse" }).where(and(eq(referralDocumentAccessGrants.referralRequestId, requestId), eq(referralDocumentAccessGrants.referrerId, referrerId), isNull(referralDocumentAccessGrants.revokedAt)));
  await transitionReferralRequestTx(tx, { requestId, actorUserId: referrerId, action: "referred_lapse", operationKey: `referred-lapse:${acceptEventId}`, toStatus: "pending", allowedFrom: ["approved"], authorize: row => { if (row.referrerId !== referrerId) throw new Error("Referral Request not found"); }, patch: { referrerId: null, referrerMessage: null }, notification: { userId: referrerId, title: "An accepted ask went back to your colleagues", body: `It wasn't marked Referred in time, so it's open to other verified employees at ${companyDomain} again.` } });
  await tx.delete(referralRequestSaves).where(and(eq(referralRequestSaves.referralRequestId, requestId), eq(referralRequestSaves.referrerId, referrerId)));
  await tx.update(referrerReviewEmailLinks).set({ consumedAt: new Date() }).where(and(eq(referrerReviewEmailLinks.referralRequestId, requestId), eq(referrerReviewEmailLinks.referrerId, referrerId), isNull(referrerReviewEmailLinks.consumedAt)));
  await tx.update(referralAvailabilitySlots).set({ status: "released", releasedAt: new Date() }).where(and(eq(referralAvailabilitySlots.referralRequestId, requestId), eq(referralAvailabilitySlots.referrerId, referrerId), eq(referralAvailabilitySlots.status, "allocated")));
  await tx.insert(referralRequestPasses).values({ referralRequestId: requestId, referrerId, reason: "timing", reasonCode: "lapsed_referred" }).onDuplicateKeyUpdate({ set: { reason: "timing", reasonCode: "lapsed_referred" } });
  await tx.insert(notifications).values({ userId: current.jobSeekerId, category: "status", kind: "ask_update", refId: requestId, title: `Update on your referral request — ${companyDomain}`, body: `The employee who accepted didn't confirm the referral within the deadline. Your ask is open again to other verified employees at ${companyDomain}. If nobody picks it up, your credit comes back, ${CREDIT_ENDED_CAVEAT}.`, eventKey: `referred-lapsed:${requestId}:${referrerId}`.slice(0, 120) }).onDuplicateKeyUpdate({ set: { eventKey: `referred-lapsed:${requestId}:${referrerId}`.slice(0, 120) } });
  return { lapsed: true, reason: "lapsed_referred" };
}

/** D-038-B: the accepting referrer steps back with no fault. Same reopen as a
 * missed deadline, but the exclusion code is `stepped_back` and the seeker's
 * notice is kinder. Returns { lapsed: true } only when it actually stepped back. */
export async function stepBackFromReferral(tx: LedgerTx, requestId: number, nowMs: number): Promise<{ lapsed: boolean; reason?: string }> {
  const current = (await tx.select({ id: referralRequests.id, status: referralRequests.status, referrerId: referralRequests.referrerId, jobSeekerId: referralRequests.jobSeekerId, companyDomain: jobs.company, revision: referralRequests.revision }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(eq(referralRequests.id, requestId)).limit(1).for("update"))[0];
  if (!current || current.status !== "approved" || !current.referrerId) return { lapsed: false };
  const latestEvents = await tx.select({ id: referralTransitionEvents.id, action: referralTransitionEvents.action, createdAt: referralTransitionEvents.createdAt, resultingStatus: referralTransitionEvents.resultingStatus }).from(referralTransitionEvents)
    .where(and(eq(referralTransitionEvents.referralRequestId, requestId), inArray(referralTransitionEvents.action, ["approve", "review", "referred_lapse", "step_back"])))
    .for("update");
  const latest = latestByEventId(latestEvents);
  if (!latest || latest.resultingStatus !== "approved") return { lapsed: false };
  const acceptEvent = latest;
  const acceptEventId = Number(acceptEvent.id);
  const referrerId = current.referrerId;
  const companyDomain = current.companyDomain;
  await tx.update(referralDocumentAccessGrants).set({ revokedAt: new Date(), revokeReason: "step_back" }).where(and(eq(referralDocumentAccessGrants.referralRequestId, requestId), eq(referralDocumentAccessGrants.referrerId, referrerId), isNull(referralDocumentAccessGrants.revokedAt)));
  await transitionReferralRequestTx(tx, { requestId, actorUserId: referrerId, action: "step_back", operationKey: `step-back:${acceptEventId}`, toStatus: "pending", allowedFrom: ["approved"], authorize: row => { if (row.referrerId !== referrerId) throw new Error("Referral Request not found"); }, patch: { referrerId: null, referrerMessage: null }, notification: { userId: referrerId, title: "An accepted ask went back to your colleagues", body: `You stepped back, so it's open to other verified employees at ${companyDomain} again.` } });
  await tx.delete(referralRequestSaves).where(and(eq(referralRequestSaves.referralRequestId, requestId), eq(referralRequestSaves.referrerId, referrerId)));
  await tx.update(referrerReviewEmailLinks).set({ consumedAt: new Date() }).where(and(eq(referrerReviewEmailLinks.referralRequestId, requestId), eq(referrerReviewEmailLinks.referrerId, referrerId), isNull(referrerReviewEmailLinks.consumedAt)));
  await tx.update(referralAvailabilitySlots).set({ status: "released", releasedAt: new Date() }).where(and(eq(referralAvailabilitySlots.referralRequestId, requestId), eq(referralAvailabilitySlots.referrerId, referrerId), eq(referralAvailabilitySlots.status, "allocated")));
  await tx.insert(referralRequestPasses).values({ referralRequestId: requestId, referrerId, reason: "cannot_support", reasonCode: "stepped_back" }).onDuplicateKeyUpdate({ set: { reason: "cannot_support", reasonCode: "stepped_back" } });
  await tx.insert(notifications).values({ userId: current.jobSeekerId, category: "status", kind: "ask_update", refId: requestId, title: `Update on your referral request — ${companyDomain}`, body: `The employee who accepted stepped back, no reflection on you. Your ask is open again to other verified employees at ${companyDomain}. If nobody picks it up, your credit comes back, ${CREDIT_ENDED_CAVEAT}.`, eventKey: `step-back:${requestId}:${referrerId}`.slice(0, 120) }).onDuplicateKeyUpdate({ set: { eventKey: `step-back:${requestId}:${referrerId}`.slice(0, 120) } });
  return { lapsed: true, reason: "stepped_back" };
}

/** D-038-B: the accepting referrer uses their one 3-day extension. Returns
 * { extended: true } when the extension was recorded, { extended: false, replayed: true }
 * when it was already used. Throws ReferralTransitionConflict when not allowed. */
export async function extendReferredDeadlineTx(tx: LedgerTx, requestId: number, nowMs: number): Promise<{ extended: boolean; replayed?: boolean }> {
  const current = (await tx.select({ id: referralRequests.id, status: referralRequests.status, referrerId: referralRequests.referrerId, revision: referralRequests.revision }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(eq(referralRequests.id, requestId)).limit(1).for("update"))[0];
  if (!current || current.status !== "approved" || !current.referrerId) throw new ReferralTransitionConflict("This referral request is not in an accepted state", { status: current?.status ?? "missing", revision: current?.revision ?? -1 });
  const latestEvents = await tx.select({ id: referralTransitionEvents.id, action: referralTransitionEvents.action, createdAt: referralTransitionEvents.createdAt, resultingStatus: referralTransitionEvents.resultingStatus }).from(referralTransitionEvents)
    .where(and(eq(referralTransitionEvents.referralRequestId, requestId), inArray(referralTransitionEvents.action, ["approve", "review", "referred_lapse", "step_back"])))
    .for("update");
  const latest = latestByEventId(latestEvents);
  if (!latest || latest.resultingStatus !== "approved") throw new ReferralTransitionConflict("This referral request is not in an accepted state", { status: current.status, revision: current.revision });
  const acceptEventId = Number(latest.id);
  const already = await tx.select({ id: referralTransitionEvents.id }).from(referralTransitionEvents).where(referredExtensionOn(requestId, acceptEventId)).limit(1);
  if (already.length > 0) return { extended: false, replayed: true };
  // D-038-B §4.3: the extension is offered "before the deadline". Past it the ask belongs back with
  // colleagues, and an extension would keep the seeker's name and resume open for three more days.
  const acceptedAtMs = latest.createdAt instanceof Date ? latest.createdAt.getTime() : Date.parse(String(latest.createdAt));
  if (!Number.isFinite(acceptedAtMs)) throw new ReferralTransitionConflict("This referral request is not in an accepted state", { status: current.status, revision: current.revision });
  if (nowMs >= referredDueAtMs(acceptedAtMs, false)) throw new ReferralTransitionConflict("The deadline to mark this referral as referred has passed", { status: current.status, revision: current.revision });
  await transitionReferralRequestTx(tx, { requestId, actorUserId: current.referrerId, action: "referred_extension", operationKey: referredExtensionOperationKey(acceptEventId), toStatus: "approved", allowedFrom: ["approved"], authorize: row => { if (row.referrerId !== current.referrerId) throw new Error("Referral Request not found"); }, patch: {} });
  return { extended: true };
}

/** D-038-B: the seeker confirms "I got the referral email". Moves the ask from
 * `approved` to `intro_made` (the referrer's mark already does this), stopping
 * the clock. Returns { confirmed: true } or { confirmed: false, replayed: true }
 * when already confirmed/marked. Throws when the ask is not `approved`. */
export async function confirmReferredBySeeker(tx: LedgerTx, requestId: number, nowMs: number): Promise<{ confirmed: boolean; replayed?: boolean }> {
  const current = (await tx.select({ id: referralRequests.id, status: referralRequests.status, referrerId: referralRequests.referrerId, jobSeekerId: referralRequests.jobSeekerId, revision: referralRequests.revision }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(eq(referralRequests.id, requestId)).limit(1).for("update"))[0];
  if (!current || current.status !== "approved") throw new ReferralTransitionConflict("This referral request has not been accepted", { status: current?.status ?? "missing", revision: current?.revision ?? -1 });
  const actorUserId = current.jobSeekerId;
  const latestEvents = await tx.select({ id: referralTransitionEvents.id, action: referralTransitionEvents.action, createdAt: referralTransitionEvents.createdAt, resultingStatus: referralTransitionEvents.resultingStatus }).from(referralTransitionEvents)
    .where(and(eq(referralTransitionEvents.referralRequestId, requestId), inArray(referralTransitionEvents.action, ["approve", "review", "referred_lapse", "step_back"])))
    .for("update");
  const latest = latestByEventId(latestEvents);
  if (!latest || latest.resultingStatus !== "approved") throw new ReferralTransitionConflict("This referral request has not been accepted", { status: current.status, revision: current.revision });
  const acceptEventId = Number(latest.id);
  const already = await tx.select({ id: referralTransitionEvents.id }).from(referralTransitionEvents).where(and(eq(referralTransitionEvents.referralRequestId, requestId), eq(referralTransitionEvents.action, "seeker_confirmed_referred"), eq(referralTransitionEvents.operationKey, `seeker-confirmed:${acceptEventId}`))).limit(1);
  if (already.length > 0) return { confirmed: false, replayed: true };
  await transitionReferralRequestTx(tx, { requestId, actorUserId, action: "seeker_confirmed_referred", operationKey: `seeker-confirmed:${acceptEventId}`, toStatus: "intro_made", allowedFrom: ["approved"], authorize: row => { if (row.jobSeekerId !== actorUserId) throw new Error("Referral Request not found"); }, patch: {}, notification: { userId: current.referrerId!, title: "The seeker confirmed the referral email", body: "They got your referral email. Nothing more is needed from you." } });
  return { confirmed: true };
}

/** Route-facing wrappers (D-038-B): the Tx functions above are timer-facing and
 * take the ledger transaction; the referral-action routes carry the signed-in
 * user, so these open the transaction, prove the actor owns the ask, then
 * delegate. Ownership failures read "not in your account" so the routes answer
 * 404, never another person's state. */
export async function stepBackFromReferralForUser(userId: number, requestId: number, nowMs: number): Promise<{ lapsed: boolean; reason?: string }> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const owner = (await tx.select({ referrerId: referralRequests.referrerId }).from(referralRequests).where(eq(referralRequests.id, requestId)).limit(1).for("update"))[0];
    if (!owner || owner.referrerId !== userId) throw new Error("Referral Request not in your account");
    return stepBackFromReferral(tx, requestId, nowMs);
  });
}

export async function extendReferredDeadlineForUser(userId: number, requestId: number, nowMs: number): Promise<{ extended: boolean; replayed?: boolean }> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const owner = (await tx.select({ referrerId: referralRequests.referrerId }).from(referralRequests).where(eq(referralRequests.id, requestId)).limit(1).for("update"))[0];
    if (!owner || owner.referrerId !== userId) throw new Error("Referral Request not in your account");
    return extendReferredDeadlineTx(tx, requestId, nowMs);
  });
}

export async function confirmReferredBySeekerForUser(userId: number, requestId: number, nowMs: number): Promise<{ confirmed: boolean; replayed?: boolean }> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const owner = (await tx.select({ jobSeekerId: referralRequests.jobSeekerId }).from(referralRequests).where(eq(referralRequests.id, requestId)).limit(1).for("update"))[0];
    if (!owner || owner.jobSeekerId !== userId) throw new Error("Referral Request not in your account");
    return confirmReferredBySeeker(tx, requestId, nowMs);
  });
}

/** D-038-A: candidates for the referral-timers job, bounded and oldest-first per step. */
export type ReferralTimerCandidate = { id: number; referrerId: number; companyDomain: string; claimEventId?: number; claimCreatedAt?: number; slotId?: number; coverageVisibleAt?: number | null; acceptEventId?: number; acceptCreatedAt?: number; extended?: boolean; reminderDay?: number };

export async function listReferralTimerCandidates(limit: number, nowMs: number = Date.now()): Promise<{ claimsToLapse: ReferralTimerCandidate[]; claimsToRemind: ReferralTimerCandidate[]; allocationsToLapse: ReferralTimerCandidate[]; allocationsToRemind: ReferralTimerCandidate[]; referredToLapse: ReferralTimerCandidate[]; referredToRemind: ReferralTimerCandidate[] }> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const rows = await db.select({ id: referralRequests.id, referrerId: referralRequests.referrerId, companyDomain: jobs.company, coverageVisibleAt: referralRequests.coverageVisibleAt }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(and(eq(referralRequests.status, "pending"), isNotNull(referralRequests.referrerId), lt(referralRequests.updatedAt, new Date(nowMs)))).orderBy(asc(referralRequests.updatedAt), asc(referralRequests.id)).limit(limit * 4);
  const claimsToLapse: ReferralTimerCandidate[] = [];
  const claimsToRemind: ReferralTimerCandidate[] = [];
  const allocationsToLapse: ReferralTimerCandidate[] = [];
  const allocationsToRemind: ReferralTimerCandidate[] = [];
  for (const row of rows) {
    if (!row.referrerId) continue;
    const latest = latestByEventId(await db.select({ id: referralTransitionEvents.id, action: referralTransitionEvents.action, createdAt: referralTransitionEvents.createdAt }).from(referralTransitionEvents).where(and(eq(referralTransitionEvents.referralRequestId, row.id), inArray(referralTransitionEvents.action, ["claim", "claim_lapse"]))));
    if (!latest || latest.action !== "claim") continue;
    const claimEventId = Number(latest.id);
    const claimCreatedAt = latest.createdAt instanceof Date ? latest.createdAt.getTime() : Date.parse(String(latest.createdAt));
    if (!Number.isFinite(claimCreatedAt)) continue;
    const candidate: ReferralTimerCandidate = { id: row.id, referrerId: row.referrerId, companyDomain: row.companyDomain, claimEventId, claimCreatedAt };
    const lapsesAt = claimLapseAtMs(claimCreatedAt);
    if (nowMs >= lapsesAt) claimsToLapse.push(candidate);
    else if (nowMs >= reminderAtMs(lapsesAt)) claimsToRemind.push(candidate);
  }
  const allocRows = await db.select({ id: referralRequests.id, referrerId: referralRequests.referrerId, companyDomain: jobs.company, coverageVisibleAt: referralRequests.coverageVisibleAt, slotId: referralAvailabilitySlots.id }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).leftJoin(referralAvailabilitySlots, and(eq(referralAvailabilitySlots.referralRequestId, referralRequests.id), eq(referralAvailabilitySlots.referrerId, referralRequests.referrerId), eq(referralAvailabilitySlots.status, "allocated"))).where(and(eq(referralRequests.status, "pending"), isNotNull(referralRequests.referrerId), isNotNull(referralAvailabilitySlots.id), lt(referralRequests.updatedAt, new Date(nowMs)))).orderBy(asc(referralRequests.updatedAt), asc(referralRequests.id)).limit(limit * 4);
  for (const row of allocRows) {
    if (!row.referrerId) continue;
    if (await referralWasClaimedTxFromDb(db, row.id)) continue;
    const coverageVisibleAt = row.coverageVisibleAt instanceof Date ? row.coverageVisibleAt.getTime() : typeof row.coverageVisibleAt === "string" || typeof row.coverageVisibleAt === "number" ? Date.parse(String(row.coverageVisibleAt)) : null;
    const candidate: ReferralTimerCandidate = { id: row.id, referrerId: row.referrerId, companyDomain: row.companyDomain, slotId: Number(row.slotId), coverageVisibleAt };
    const lapsesAt = allocationLapseAtMs(coverageVisibleAt);
    if (nowMs >= lapsesAt) allocationsToLapse.push(candidate);
    else if (nowMs >= reminderAtMs(lapsesAt)) allocationsToRemind.push(candidate);
  }
  const referredToLapse: ReferralTimerCandidate[] = [];
  const referredToRemind: ReferralTimerCandidate[] = [];
  const referredRows = await db.select({ id: referralRequests.id, referrerId: referralRequests.referrerId, companyDomain: jobs.company }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(and(eq(referralRequests.status, "approved"), isNotNull(referralRequests.referrerId), lt(referralRequests.updatedAt, new Date(nowMs)))).orderBy(asc(referralRequests.updatedAt), asc(referralRequests.id)).limit(limit * 4);
  for (const row of referredRows) {
    if (!row.referrerId) continue;
    const latest = latestByEventId(await db.select({ id: referralTransitionEvents.id, action: referralTransitionEvents.action, createdAt: referralTransitionEvents.createdAt, resultingStatus: referralTransitionEvents.resultingStatus }).from(referralTransitionEvents).where(and(eq(referralTransitionEvents.referralRequestId, row.id), inArray(referralTransitionEvents.action, ["approve", "review", "referred_lapse", "step_back"]))));
    if (!latest || latest.resultingStatus !== "approved") continue;
    const acceptEventId = Number(latest.id);
    const acceptCreatedAt = latest.createdAt instanceof Date ? latest.createdAt.getTime() : Date.parse(String(latest.createdAt));
    if (!Number.isFinite(acceptCreatedAt)) continue;
    const extended = (await db.select({ id: referralTransitionEvents.id }).from(referralTransitionEvents).where(referredExtensionOn(row.id, acceptEventId)).limit(1)).length > 0;
    const candidate: ReferralTimerCandidate = { id: row.id, referrerId: row.referrerId, companyDomain: row.companyDomain, acceptEventId, acceptCreatedAt, extended };
    const dueAt = referredDueAtMs(acceptCreatedAt, extended);
    if (nowMs >= dueAt) referredToLapse.push(candidate);
    else {
      for (const day of [...REFERRED_REMINDER_DAYS].sort((a, b) => b - a)) {
        const reminder = referredReminderAtMs(acceptCreatedAt, day);
        if (reminder !== null && nowMs >= reminder) {
          referredToRemind.push({ ...candidate, reminderDay: day });
          break;
        }
      }
    }
  }
  return { claimsToLapse: claimsToLapse.slice(0, limit), claimsToRemind: claimsToRemind.slice(0, limit), allocationsToLapse: allocationsToLapse.slice(0, limit), allocationsToRemind: allocationsToRemind.slice(0, limit), referredToLapse: referredToLapse.slice(0, limit), referredToRemind: referredToRemind.slice(0, limit) };
}

/** referralWasClaimedTx using a plain db handle (non-transactional candidate listing). */
async function referralWasClaimedTxFromDb(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, requestId: number): Promise<boolean> {
  const events = await db.select({ id: referralTransitionEvents.id, action: referralTransitionEvents.action }).from(referralTransitionEvents).where(and(eq(referralTransitionEvents.referralRequestId, requestId), inArray(referralTransitionEvents.action, [...PICKUP_OR_RELEASE_ACTIONS])));
  return latestByEventId(events)?.action === "claim";
}

// The ask assigned to this referrer: claimed and still pending, or accepted by them. A claim writes no document grant
// (D-019(e)), so a pending ask loads on its assignment alone; an accepted ask needs this referrer's own recorded
// acceptance, never a grant alone (isAcceptingReferrer). Only the accepting referrer gets the seeker's name, and
// documentAccessActive is the same rule as GET /api/documents/:id. server/referrerAskView.ts builds the response.
export async function getClaimedCompanyReferralDetail(userId: number, requestId: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select({ id: referralRequests.id, title: jobs.title, targetRoleUrl: jobs.targetRoleUrl, companyDomain: jobs.company, jobFunction: jobs.jobFunction, candidateName: users.name, candidateMessage: referralRequests.personalPitch, referrerId: referralRequests.referrerId, status: referralRequests.status, revision: referralRequests.revision, coverageVisibleAt: referralRequests.coverageVisibleAt, grantId: referralDocumentAccessGrants.id, grantRevokedAt: referralDocumentAccessGrants.revokedAt, grantExpiresAt: referralDocumentAccessGrants.expiresAt, passId: referralRequestPasses.id, acceptedByActorAt: referralTransitionEvents.createdAt, acceptedByActorEventId: referralTransitionEvents.id })
    .from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).innerJoin(users, eq(referralRequests.jobSeekerId, users.id))
    .leftJoin(referralDocumentAccessGrants, and(eq(referralDocumentAccessGrants.referralRequestId, referralRequests.id), eq(referralDocumentAccessGrants.referrerId, userId)))
    .leftJoin(referralRequestPasses, and(eq(referralRequestPasses.referralRequestId, referralRequests.id), eq(referralRequestPasses.referrerId, userId)))
    .leftJoin(referralTransitionEvents, actorAcceptanceEventOn(userId))
    .where(and(eq(referralRequests.id, requestId), eq(referralRequests.referrerId, userId), inArray(referralRequests.status, ["pending", ...REFERRER_DOCUMENT_ACCESS_STATUSES]))).limit(1);
  const row = rows[0];
  if (!row || (row.passId ?? null) !== null) return undefined;
  const access = { actorUserId: userId, referrerId: row.referrerId, requestStatus: row.status, passedByActor: false, grant: grantFromJoin(row), acceptedByActorAt: row.acceptedByActorAt, now: new Date() };
  const accepted = isAcceptingReferrer(access);
  if (row.status !== "pending" && !accepted) return undefined;
  const attachments = await db.select({ id: referralAttachments.id, fileName: referralAttachments.fileName, mimeType: referralAttachments.mimeType, fileSize: referralAttachments.fileSize }).from(referralAttachments).where(eq(referralAttachments.referralRequestId, requestId));
  // D-038-B: when the Referred decision is due for an accepted ask, and whether
  // this acceptance's one 3-day extension was already used (D-038-reconcile B-1).
  // D-038-reconcile R-2: part B omits both fields while it is switched off, so no
  // client can offer its controls.
  let referredDueAt: string | null = null;
  let extensionUsed = false;
  if (REFERRED_DEADLINE_ENABLED && accepted && row.acceptedByActorAt) {
    const acceptedAtMs = row.acceptedByActorAt instanceof Date ? row.acceptedByActorAt.getTime() : Date.parse(String(row.acceptedByActorAt));
    const hasExtension = await db.select({ id: referralTransitionEvents.id }).from(referralTransitionEvents)
      .where(referredExtensionOn(requestId, Number(row.acceptedByActorEventId))).limit(1);
    extensionUsed = hasExtension.length > 0;
    if (Number.isFinite(acceptedAtMs)) referredDueAt = new Date(referredDueAtMs(acceptedAtMs, extensionUsed)).toISOString();
  }
  // D-038-A (§4.10): for a pending ask this referrer holds, when their accept-or-pass decision is due.
  let decisionDueAt: string | null = null;
  if (row.status === "pending") {
    const pickups = await db.select({ id: referralTransitionEvents.id, action: referralTransitionEvents.action, createdAt: referralTransitionEvents.createdAt }).from(referralTransitionEvents)
      .where(and(eq(referralTransitionEvents.referralRequestId, requestId), inArray(referralTransitionEvents.action, [...PICKUP_OR_RELEASE_ACTIONS])));
    const latestPickup = latestByEventId(pickups);
    if (latestPickup?.action === "claim") {
      const claimedAt = latestPickup.createdAt instanceof Date ? latestPickup.createdAt.getTime() : Date.parse(String(latestPickup.createdAt));
      if (Number.isFinite(claimedAt)) decisionDueAt = new Date(claimLapseAtMs(claimedAt)).toISOString();
    } else if (!latestPickup) {
      const allocated = (await db.select({ id: referralAvailabilitySlots.id }).from(referralAvailabilitySlots)
        .where(and(eq(referralAvailabilitySlots.referralRequestId, requestId), eq(referralAvailabilitySlots.referrerId, userId), eq(referralAvailabilitySlots.status, "allocated"))).limit(1))[0];
      if (allocated) {
        const visibleAt = row.coverageVisibleAt instanceof Date ? row.coverageVisibleAt.getTime() : row.coverageVisibleAt ? Date.parse(String(row.coverageVisibleAt)) : null;
        decisionDueAt = new Date(allocationLapseAtMs(visibleAt !== null && Number.isFinite(visibleAt) ? visibleAt : null)).toISOString();
      }
    }
  }
  return { id: row.id, title: row.title, targetRoleUrl: row.targetRoleUrl, companyDomain: row.companyDomain, jobFunction: row.jobFunction, candidateMessage: row.candidateMessage, referrerId: row.referrerId, status: row.status, revision: row.revision, candidateName: accepted ? row.candidateName : null, documentAccessActive: isReferrerDocumentAccessActive(access), attachments, ...(REFERRED_DEADLINE_ENABLED ? { referredDueAt, extensionUsed } : {}), decisionDueAt };
}

export async function createReferralAttachment(ownerId: number, input: { fileName: string; fileKey: string; mimeType: string; fileSize: number }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const result = await db.insert(referralAttachments).values({ ownerId, ...input });
  return { id: Number(result[0].insertId), ...input };
}

// The resume bytes behind GET /api/documents/:id: its owner, or the referrer the ask is assigned to once they accepted
// it (isReferrerDocumentAccessActive, server/referrerDocumentAccess.ts, D-019(e)); a referrer who passed never matches.
export async function getAccessibleReferralAttachment(userId: number, attachmentId: number) {
  const db = await getDb(); if (!db) return undefined;
  const row = (await db.select({ id: referralAttachments.id, ownerId: referralAttachments.ownerId, fileName: referralAttachments.fileName, fileKey: referralAttachments.fileKey, mimeType: referralAttachments.mimeType, fileSize: referralAttachments.fileSize, referralRequestId: referralAttachments.referralRequestId, referrerId: referralRequests.referrerId, requestStatus: referralRequests.status, grantId: referralDocumentAccessGrants.id, grantExpiresAt: referralDocumentAccessGrants.expiresAt, grantRevokedAt: referralDocumentAccessGrants.revokedAt, passedByActor: referralRequestPasses.id, acceptedByActorAt: referralTransitionEvents.createdAt })
    .from(referralAttachments).leftJoin(referralRequests, eq(referralAttachments.referralRequestId, referralRequests.id))
    .leftJoin(referralDocumentAccessGrants, and(eq(referralDocumentAccessGrants.referralRequestId, referralRequests.id), eq(referralDocumentAccessGrants.referrerId, userId)))
    .leftJoin(referralRequestPasses, and(eq(referralRequestPasses.referralRequestId, referralRequests.id), eq(referralRequestPasses.referrerId, userId)))
    .leftJoin(referralTransitionEvents, actorAcceptanceEventOn(userId))
    .where(and(eq(referralAttachments.id,attachmentId),or(eq(referralAttachments.ownerId,userId),isNull(referralRequestPasses.id)))).limit(1))[0];
  if (!row || row.id !== attachmentId) return undefined;
  const { grantId, grantExpiresAt, grantRevokedAt, passedByActor, acceptedByActorAt, requestStatus, ...attachment } = row;
  if (attachment.ownerId === userId) return attachment;
  const active = isReferrerDocumentAccessActive({ actorUserId: userId, referrerId: attachment.referrerId, requestStatus, passedByActor: (passedByActor ?? null) !== null, grant: grantFromJoin({ grantId, grantRevokedAt, grantExpiresAt }), acceptedByActorAt, now: new Date() });
  return active ? attachment : undefined;
}

/** The seeker's own uploaded resume documents, newest first (Skippy's "use a saved resume" list). */
export async function listOwnedResumeAttachments(userId: number, limit = 10) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.select({ id: referralAttachments.id, fileName: referralAttachments.fileName, fileKey: referralAttachments.fileKey, mimeType: referralAttachments.mimeType, fileSize: referralAttachments.fileSize }).from(referralAttachments).where(eq(referralAttachments.ownerId, userId)).orderBy(desc(referralAttachments.createdAt)).limit(limit);
}

export async function getOwnedResumeAttachmentForPitch(userId: number, attachmentId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const result = await db.select({ id: referralAttachments.id, fileName: referralAttachments.fileName, fileKey: referralAttachments.fileKey, mimeType: referralAttachments.mimeType, fileSize: referralAttachments.fileSize }).from(referralAttachments).where(and(eq(referralAttachments.id, attachmentId), eq(referralAttachments.ownerId, userId))).limit(1);
  if (!result[0]) throw new Error("Your private resume is unavailable");
  return result[0];
}

// The status half of the rule only (the owner, or the assigned referrer once accepted); the grant half is
// isReferrerDocumentAccessActive. Before acceptance a referrer sees neither the seeker's name nor resume (D-019(e)).
export function canAccessReferralAttachment(actorUserId: number, attachment: { ownerId: number; referrerId?: number | null; requestStatus?: string | null }): boolean {
  if (attachment.ownerId === actorUserId) return true;
  return attachment.referrerId === actorUserId && isReferrerDocumentAccessStatus(attachment.requestStatus);
}
export class ReferralTransitionConflict extends Error {
  constructor(message: string, public currentState: { status: string; revision: number }) { super(message); this.name = "ReferralTransitionConflict"; }
}

type ReferralTransitionInput = {
  requestId: number; actorUserId: number; action: string; operationKey: string;
  toStatus: ReferralStatus; allowedFrom: ReferralStatus[];
  authorize: (current: typeof referralRequests.$inferSelect) => void;
  patch?: Partial<typeof referralRequests.$inferInsert>;
  notification?: { userId: number; title: string; body: string };
  beforeCommit?: (tx: any, current: typeof referralRequests.$inferSelect) => Promise<void>;
  eventReferenceId?: string | null;
};

/** Frees the allocated availability slot(s) an ask holds: one referrer's when given, otherwise every slot on the ask. */
async function releaseAvailabilitySlotsTx(tx: any, input: { requestId: number; referrerId?: number }) {
  const conditions = [eq(referralAvailabilitySlots.referralRequestId, input.requestId), eq(referralAvailabilitySlots.status, "allocated")];
  if (input.referrerId !== undefined) conditions.push(eq(referralAvailabilitySlots.referrerId, input.referrerId));
  await tx.update(referralAvailabilitySlots).set({ status: "released", releasedAt: new Date() }).where(and(...conditions));
}

async function transitionReferralRequestTx(tx: any, input: ReferralTransitionInput) {
  const replay = (await tx.select().from(referralTransitionEvents).where(and(eq(referralTransitionEvents.referralRequestId, input.requestId), eq(referralTransitionEvents.operationKey, input.operationKey))).limit(1))[0];
  if (replay) return { status: replay.resultingStatus as ReferralStatus, revision: replay.resultingRevision, replayed: true as const };
  const current = (await tx.select().from(referralRequests).where(eq(referralRequests.id, input.requestId)).limit(1).for("update"))[0];
  if (!current) throw new Error("Referral Request not found");
  input.authorize(current);
  if (!input.allowedFrom.includes(current.status)) throw new ReferralTransitionConflict("This referral action conflicts with the current state", { status: current.status, revision: current.revision });
  // D-061: an ask that has reached no referrer still accepts only the seeker's withdraw and the clock's expiry.
  if (current.waitingForCoverage && !isAwaitingCoverageActionAllowed(input.action)) throw new ReferralTransitionConflict("This referral request has not reached a verified employee yet", { status: current.status, revision: current.revision });
  await input.beforeCommit?.(tx, current);
  const nextRevision = current.revision + 1;
  const updated = await tx.update(referralRequests).set({ ...input.patch, status: input.toStatus, revision: nextRevision }).where(and(eq(referralRequests.id, input.requestId), eq(referralRequests.status, current.status), eq(referralRequests.revision, current.revision)));
  if (Number(updated[0]?.affectedRows ?? 0) !== 1) {
    const latest = (await tx.select({ status: referralRequests.status, revision: referralRequests.revision }).from(referralRequests).where(eq(referralRequests.id, input.requestId)).limit(1))[0];
    throw new ReferralTransitionConflict("This referral action lost a stale-write race", latest ?? { status: current.status, revision: current.revision });
  }
  if (["declined","withdrawn","closed"].includes(input.toStatus)) await tx.update(referralDocumentAccessGrants).set({revokedAt:new Date(),revokeReason:`terminal:${input.toStatus}`}).where(and(eq(referralDocumentAccessGrants.referralRequestId,input.requestId),isNull(referralDocumentAccessGrants.revokedAt)));
  // D-019(e): the referrer's own acceptance opens their document access, in this transaction (a replay returned above,
  // so once per acceptance). Every accept path lands here: one-click (/queue, thread, email link, D-022 first look) and review.
  // The event's time is the app clock, like the grant's: document access compares the acceptance time with app time (invariant 5).
  const now = new Date();
  const acceptedBy: number | null = input.toStatus === "approved" ? (input.patch?.referrerId !== undefined ? input.patch.referrerId : current.referrerId) : null;
  if (acceptedBy !== null && acceptedBy === input.actorUserId) {
    const grant = await openAcceptanceDocumentGrantTx(tx, { requestId: input.requestId, referrerId: acceptedBy, revision: nextRevision, now });
    if (grant === "kept_revoked") captureServerError(new Error("Acceptance left a revoked document grant closed"), { requestId: input.requestId, referrerId: acceptedBy });
  }
  // D-062 capacity: an accepted ask is no longer waiting in the distribution queue, so the accepting referrer's
  // allocated slot frees with the acceptance; a terminal status frees every slot the ask still holds (a safety net
  // for the paths that must always return capacity: withdraw and expiry).
  if (acceptedBy !== null) await releaseAvailabilitySlotsTx(tx, { requestId: input.requestId, referrerId: acceptedBy });
  if (["declined", "withdrawn", "closed"].includes(input.toStatus)) await releaseAvailabilitySlotsTx(tx, { requestId: input.requestId });
  await tx.insert(referralTransitionEvents).values({ referralRequestId: input.requestId, operationKey: input.operationKey, actorUserId: input.actorUserId, action: input.action, fromStatus: current.status, resultingStatus: input.toStatus, resultingRevision: nextRevision, referenceId: input.eventReferenceId ?? null, createdAt: now });
  if (input.notification) await tx.insert(notifications).values({ userId: input.notification.userId, category: "status", kind: transitionNotificationKind(input.action, input.toStatus), refId: input.requestId, title: input.notification.title, body: input.notification.body, eventKey: `referral:${input.requestId}:v${nextRevision}:${input.toStatus}` }).onDuplicateKeyUpdate({ set: { eventKey: `referral:${input.requestId}:v${nextRevision}:${input.toStatus}` } });
  return { status: input.toStatus, revision: nextRevision, replayed: false as const };
}

export async function reviewReferralRequest(userId: number, input: { requestId: number; decision: "approved" | "declined"; message?: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const rows = await tx.select({ request: referralRequests, companyDomain: jobs.company }).from(referralRequests).innerJoin(jobs, eq(jobs.id, referralRequests.jobId)).where(eq(referralRequests.id, input.requestId)).limit(1).for("update");
    const current = rows[0]?.request;
    const operationKey = `review:${userId}:${input.decision}`;
    const prior = (await tx.select().from(referralTransitionEvents).where(and(eq(referralTransitionEvents.referralRequestId, input.requestId), eq(referralTransitionEvents.operationKey, operationKey))).limit(1))[0];
    // Only the employee who holds the claim may review it; the one employee who
    // already decided it (a lost response, a retry) replays that same decision.
    if (!current || (current.referrerId !== userId && !prior)) throw new Error("Referral Request not found");
    // D-021: a claimed decline reopens the ask for the rest of the company; it
    // never ends it. Only expiry or withdrawal end an ask without acceptance.
    if (input.decision === "declined") {
      const note = input.message?.trim();
      const result = await passReferralRequestTx(tx, { requestId: input.requestId, actorUserId: userId, companyDomain: rows[0]?.companyDomain ?? "", jobSeekerId: current.jobSeekerId, reason: note || oneClickDeclineMessages.cannot_support, reasonCode: null, operationKey, releasedClaim: true });
      return { ...result, status: "passed" as const };
    }
    return transitionReferralRequestTx(tx, { requestId: input.requestId, actorUserId: userId, action: "review", operationKey, toStatus: "approved", allowedFrom: ["pending"], authorize: row => { if (row.referrerId !== userId) throw new Error("Referral Request not found"); }, patch: { referrerMessage: input.message ?? null }, notification: { userId: current.jobSeekerId, title: "Referral Request approved", body: input.message || "Your Referrer has reviewed your Referral Request." } });
  });
}

export function authorizeApprovedReferralConversation(userId: number, request: { jobSeekerId: number; referrerId: number | null; status: string } | undefined) {
  if (!request || (request.jobSeekerId !== userId && request.referrerId !== userId)) throw new Error("This conversation is not available to you");
  if (!isPostApprovalReferralStatus(request.status) || !request.referrerId) throw new Error("Conversation is only available after the referral is accepted");
  return { jobSeekerId: request.jobSeekerId, referrerId: request.referrerId, recipientId: userId === request.jobSeekerId ? request.referrerId : request.jobSeekerId };
}

export async function updateReferralProgress(userId: number, input: { requestId: number; status: ReferralProgressUpdateStatus; referenceId?: string | null }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const existing = (await tx.select().from(referralRequests).where(eq(referralRequests.id, input.requestId)).limit(1).for("update"))[0];
    const { recipientId } = authorizeApprovedReferralConversation(userId, existing);
    const operationKey = `progress:${userId}:${input.status}`;
    const prior = (await tx.select().from(referralTransitionEvents).where(and(eq(referralTransitionEvents.referralRequestId,input.requestId),eq(referralTransitionEvents.operationKey,operationKey))).limit(1))[0];
    const currentIndex = referralProgressUpdateStatuses.indexOf(existing.status as ReferralProgressUpdateStatus);
    const nextIndex = referralProgressUpdateStatuses.indexOf(input.status);
    if (!prior && (existing.status === "closed" || (input.status !== "closed" && (nextIndex < 0 || nextIndex <= currentIndex)))) throw new ReferralTransitionConflict("Choose a later real progress milestone", { status: existing.status, revision: existing.revision });
    const result = await transitionReferralRequestTx(tx, { requestId: input.requestId, actorUserId: userId, action: "progress", operationKey, toStatus: input.status, allowedFrom: [existing.status], eventReferenceId: input.status === "intro_made" ? input.referenceId ?? null : null, authorize: row => { authorizeApprovedReferralConversation(userId, row); }, notification: { userId: recipientId, title: `Referral progress: ${referralStatusLabels[input.status]}`, body: "Your private referral partner recorded a factual progress update." } });
    return { ...result, status: result.status as ReferralProgressUpdateStatus, changed: !result.replayed };
  });
}

async function getApprovedReferralConversationParticipants(userId: number, requestId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const request = await db.select({ jobSeekerId: referralRequests.jobSeekerId, referrerId: referralRequests.referrerId, status: referralRequests.status }).from(referralRequests).where(eq(referralRequests.id, requestId)).limit(1);
  return { db, ...authorizeApprovedReferralConversation(userId, request[0]) };
}

export async function getApprovedReferralProgressStatus(userId: number, requestId: number): Promise<{ status: ReferralStatus; referenceId: string | null }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const request = await db.select({ jobSeekerId: referralRequests.jobSeekerId, referrerId: referralRequests.referrerId, status: referralRequests.status }).from(referralRequests).where(eq(referralRequests.id, requestId)).limit(1);
  authorizeApprovedReferralConversation(userId, request[0]);
  // The latest portal reference recorded when the request was marked as referred.
  const event = (await db.select({ referenceId: referralTransitionEvents.referenceId }).from(referralTransitionEvents).where(and(eq(referralTransitionEvents.referralRequestId, requestId), eq(referralTransitionEvents.action, "progress"), eq(referralTransitionEvents.resultingStatus, "intro_made"), isNotNull(referralTransitionEvents.referenceId))).orderBy(desc(referralTransitionEvents.id)).limit(1))[0];
  return { status: request[0].status as ReferralStatus, referenceId: event?.referenceId ?? null };
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

export async function getPublicReferralShareCard(shareToken: string): Promise<{ companyDomain: string; status: ReferralStatus; inviteCode?: string | null } | undefined> {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select({ companyDomain: jobs.company, status: referralRequests.status, createdByUserId: referralShareCards.createdByUserId }).from(referralShareCards).innerJoin(referralRequests, eq(referralShareCards.referralRequestId, referralRequests.id)).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(and(eq(referralShareCards.shareToken, shareToken), eq(referralShareCards.isActive, true))).limit(1);
  const card = result[0];
  if (!card || !isPostApprovalReferralStatus(card.status)) return undefined;
  // Attribute joins back to the sharer through their existing personal invite
  // code (lookup only — a public view must never create invite rows). The
  // standard claim safeguards (self-invite, duplicates, timing) still apply.
  const invite = card.createdByUserId ? (await db.select({ inviteCode: personalReferralInvites.inviteCode }).from(personalReferralInvites).where(eq(personalReferralInvites.inviterUserId, card.createdByUserId)).limit(1))[0] : undefined;
  return { companyDomain: card.companyDomain, status: card.status as ReferralStatus, inviteCode: invite?.inviteCode ?? null };
}

export type ReferralConversationMessage = { id: number; body: string; createdAt: Date; isMine: boolean };

export async function listReferralConversation(userId: number, requestId: number): Promise<ReferralConversationMessage[]> {
  const { db, jobSeekerId, referrerId } = await getApprovedReferralConversationParticipants(userId, requestId);
  await db.update(messages).set({ readAt: new Date() }).where(and(eq(messages.referralRequestId, requestId), eq(messages.recipientId, userId), isNull(messages.readAt)));
  const rows = await db.select({ id: messages.id, body: messages.body, createdAt: messages.createdAt, senderId: messages.senderId }).from(messages).where(and(eq(messages.referralRequestId, requestId), or(and(eq(messages.senderId, jobSeekerId), eq(messages.recipientId, referrerId)), and(eq(messages.senderId, referrerId), eq(messages.recipientId, jobSeekerId))))).orderBy(asc(messages.createdAt), asc(messages.id));
  return rows.map(row => ({ id: row.id, body: row.body, createdAt: row.createdAt, isMine: row.senderId === userId }));
}

/**
 * The message and its notification are one write: a notice that fails after the
 * message landed must not leave a message the caller could resend.
 */
async function sendReferralConversationMessageTx(tx: LedgerTx, userId: number, requestId: number, trimmedBody: string) {
  const request = await tx.select({ jobSeekerId: referralRequests.jobSeekerId, referrerId: referralRequests.referrerId, status: referralRequests.status }).from(referralRequests).where(eq(referralRequests.id, requestId)).limit(1);
  const { recipientId } = authorizeApprovedReferralConversation(userId, request[0]);
  const result = await tx.insert(messages).values({ senderId: userId, recipientId, body: trimmedBody.slice(0, 3000), referralRequestId: requestId });
  await tx.insert(notifications).values({ kind: "message_new", userId: recipientId, category: "message", title: "New private referral message", body: "You have a new message in an accepted referral request." });
  return { id: Number(result[0].insertId) };
}

export async function sendReferralConversationMessage(userId: number, requestId: number, body: string) {
  const trimmedBody = body.trim();
  if (!trimmedBody) throw new Error("Write a message before sending");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(tx => sendReferralConversationMessageTx(tx, userId, requestId, trimmedBody));
}

/**
 * The kit landed journey (queue row 20 slice C): the seeker whose ask ended with a
 * hire records their thank-you, whether the referrer may keep it on their private
 * wall, and their pay-it-forward answer. The note stays editable until it reaches
 * the referrer, then it is final and reaches them through the existing referral
 * conversation exactly once — `deliveredAt` is
 * claimed with a conditional update before the send, so a double click or a retry
 * after a lost response cannot hand the referrer the same note twice. The claim, the
 * message and its notification commit together, so a failed send rolls the claim back
 * with it and the seeker's own next attempt can deliver the note; the response says
 * truthfully that it has not gone yet.
 */
export async function recordLandedJourney(userId: number, input: LandedJourneyRequest): Promise<LandedJourneyState> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const ask = (await db.select({ id: referralRequests.id, jobSeekerId: referralRequests.jobSeekerId, referrerId: referralRequests.referrerId, status: referralRequests.status }).from(referralRequests).where(eq(referralRequests.id, input.referralRequestId)).limit(1))[0];
  if (!ask || ask.jobSeekerId !== userId) throw new Error("This thank-you is not available to you");
  if (ask.status !== "closed" || !ask.referrerId) throw new Error("A thank-you opens once your referrer marks the ask as hired");
  const message = input.message?.trim().slice(0, THANK_YOU_MAX_LENGTH);
  const now = new Date();
  // Create-if-absent without throwing when a second submit wins the unique index.
  await db.insert(landedJourney).values({ referralRequestId: ask.id, seekerUserId: userId, referrerUserId: ask.referrerId }).onDuplicateKeyUpdate({ set: { updatedAt: now } });
  const rows = await db.select({ thankYouMessage: landedJourney.thankYouMessage, shareOnWall: landedJourney.shareOnWall, payForwardChoice: landedJourney.payForwardChoice, deliveredAt: landedJourney.deliveredAt }).from(landedJourney).where(eq(landedJourney.referralRequestId, ask.id)).limit(1);
  const row = rows[0];
  if (!row) throw new Error("We could not save that thank-you");
  let thankYouMessage = row.deliveredAt ? row.thankYouMessage ?? message ?? null : message ?? row.thankYouMessage ?? null;
  const shareOnWall = input.shareOnWall ?? row.shareOnWall;
  const payForward = input.payForward ?? PAY_FORWARD_CHOICES.find(choice => choice === row.payForwardChoice) ?? null;
  await db.update(landedJourney).set({ shareOnWall, payForwardChoice: payForward, updatedAt: now }).where(eq(landedJourney.referralRequestId, ask.id));
  // A note is final once it reaches the referrer: a submit that read an undelivered
  // row but lands after the delivery must not rewrite the note the wall shows.
  if (!row.deliveredAt) await db.update(landedJourney).set({ thankYouMessage, updatedAt: now }).where(and(eq(landedJourney.referralRequestId, ask.id), isNull(landedJourney.deliveredAt)));
  let delivered = Boolean(row.deliveredAt);
  if (!delivered && message) {
    try {
      // The claim, the message and the link back to it commit together; a send that
      // dies anywhere leaves no claim and no half-delivered note for a retry to duplicate.
      const settled: { delivered: boolean; thankYouMessage?: string | null } = await db.transaction(async tx => {
        const claimed = await tx.update(landedJourney).set({ deliveredAt: now, thankYouMessage: message, updatedAt: now }).where(and(eq(landedJourney.referralRequestId, ask.id), isNull(landedJourney.deliveredAt)));
        if (Number(claimed[0]?.affectedRows ?? 0) !== 1) {
          // Another of this seeker's own submits holds the claim; report the note it settled on.
          const after = (await tx.select({ deliveredAt: landedJourney.deliveredAt, thankYouMessage: landedJourney.thankYouMessage }).from(landedJourney).where(eq(landedJourney.referralRequestId, ask.id)).limit(1))[0];
          return { delivered: Boolean(after?.deliveredAt), thankYouMessage: after?.thankYouMessage ?? null };
        }
        const sent = await sendReferralConversationMessageTx(tx, userId, ask.id, message);
        await tx.update(landedJourney).set({ conversationMessageId: sent.id }).where(eq(landedJourney.referralRequestId, ask.id));
        return { delivered: true, thankYouMessage: message };
      });
      delivered = settled.delivered;
      if (settled.thankYouMessage !== undefined) thankYouMessage = settled.thankYouMessage;
    } catch (error) {
      captureServerError(error, { area: "landedJourney", referralRequestId: ask.id });
      delivered = false;
    }
  }
  return { referralRequestId: ask.id, thankYouMessage, shareOnWall, payForward, delivered };
}

/**
 * The referrer's private thank-you wall (queue row 20 slice D): the notes they
 * received, and the newest few the seekers let them keep. Only a delivered note
 * counts or shows, and the name and role are the ones this referrer already saw on
 * the ask they worked. Nothing here is public to another user. Blocked pairs
 * (userBlocks, either direction) are hidden from the wall and the count.
 */
export async function listReferrerThankYous(userId: number, limit = 3): Promise<ReferrerThankYouWall> {
  const db = await getDb(); if (!db) return { thankYous: [], total: 0 };
  const safeLimit = Math.max(1, Math.min(limit, 10));
  let blockedUserIds = new Set<number>();
  try {
    const blockRows = await db.select({ blockerUserId: userBlocks.blockerUserId, blockedUserId: userBlocks.blockedUserId }).from(userBlocks).where(or(eq(userBlocks.blockerUserId, userId), eq(userBlocks.blockedUserId, userId)));
    for (const b of blockRows) blockedUserIds.add(b.blockerUserId === userId ? b.blockedUserId : b.blockerUserId);
  } catch (error) {
    captureServerError(error, { area: "listReferrerThankYous", userId });
  }

  const received = and(eq(landedJourney.referrerUserId, userId), isNotNull(landedJourney.deliveredAt));
  const [wallRows, allReceived] = await Promise.all([
    db.select({ id: landedJourney.id, seekerUserId: landedJourney.seekerUserId, message: landedJourney.thankYouMessage, seekerName: users.name, roleTitle: jobs.title, createdAt: landedJourney.createdAt }).from(landedJourney).innerJoin(referralRequests, eq(landedJourney.referralRequestId, referralRequests.id)).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).innerJoin(users, eq(landedJourney.seekerUserId, users.id)).where(and(received, eq(landedJourney.shareOnWall, true), isNotNull(landedJourney.thankYouMessage))).orderBy(desc(landedJourney.createdAt), desc(landedJourney.id)),
    db.select({ id: landedJourney.id, seekerUserId: landedJourney.seekerUserId }).from(landedJourney).where(received),
  ]);

  const visibleWall = wallRows.filter(row => !blockedUserIds.has(row.seekerUserId) && Boolean(row.message));
  const visibleTotal = allReceived.filter(row => !blockedUserIds.has(row.seekerUserId)).length;

  return {
    thankYous: visibleWall.slice(0, safeLimit).map(row => ({ id: row.id, message: row.message ?? "", seekerName: row.seekerName ?? null, roleTitle: row.roleTitle ?? null, createdAt: new Date(row.createdAt).toISOString() })),
    total: visibleTotal,
  };
}



export type ReferralLedgerRow = { id: number; ref: string; status: string; company: string; jobTitle: string; jobLocation: string | null; seekerEmail: string | null; referrerEmail: string | null; createdAt: Date; updatedAt: Date };

/** Queryable referral ledger for admin export: one row per referral request. */
export async function listReferralLedger(limit = 1000): Promise<ReferralLedgerRow[]> {
  const db = await getDb(); if (!db) return [];
  const referrer = alias(users, "referrer");
  const safeLimit = Math.max(1, Math.min(limit, 5000));
  const rows = await db.select({ id: referralRequests.id, status: referralRequests.status, company: jobs.company, jobTitle: jobs.title, jobLocation: jobs.location, seekerEmail: users.email, referrerEmail: referrer.email, createdAt: referralRequests.createdAt, updatedAt: referralRequests.updatedAt }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).innerJoin(users, eq(referralRequests.jobSeekerId, users.id)).leftJoin(referrer, eq(referralRequests.referrerId, referrer.id)).orderBy(desc(referralRequests.createdAt)).limit(safeLimit);
  return rows.map(row => ({ ...row, ref: `Ref-${String(row.id).padStart(4, "0")}` }));
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

export class DirectMessageConflictError extends Error{constructor(){super("This message key was already used for different content");this.name="DirectMessageConflictError";}}
export class DirectMessageRateLimitError extends Error{constructor(public retryAt:Date){super("You're sending messages too quickly. Try again later.");this.name="DirectMessageRateLimitError";}}
/** Two members who are not verified referrers, with no thread and no mutual follow (D-067: no plan opens it). */
export class DirectMessageFollowRequiredError extends Error{readonly block=DM_FOLLOW_REQUIRED;constructor(){super(DM_FOLLOW_REQUIRED_ERROR);this.name="DirectMessageFollowRequiredError";}}
export async function sendDirectMessage(userId:number,recipientId:number,body:string,idempotencyKey:string){const db=await getDb();if(!db)throw new Error("Database unavailable");const safeBody=body.slice(0,3000),fingerprint=createHash("sha256").update(JSON.stringify({senderId:userId,recipientId,body:safeBody})).digest("hex");return db.transaction(async tx=>{const duplicate=(await tx.select().from(messages).where(and(eq(messages.senderId,userId),eq(messages.idempotencyKey,idempotencyKey))).limit(1).for("update"))[0];if(duplicate){if(duplicate.requestFingerprint!==fingerprint)throw new DirectMessageConflictError();return{id:duplicate.id,replayed:true as const};}const pair=await tx.select({id:users.id,suspended:users.suspended}).from(users).where(inArray(users.id,[userId,recipientId])).for("update");const sender=pair.find(x=>x.id===userId),recipient=pair.find(x=>x.id===recipientId);if(!sender||!recipient||sender.suspended||recipient.suspended)throw new Error("This member is not available");const gate=await loadReferrerDmGate(tx,userId,recipientId);assertReferrerDmGateOpen(gate);const thread=(await tx.select({id:messages.id}).from(messages).where(and(isNull(messages.referralRequestId),or(and(eq(messages.senderId,userId),eq(messages.recipientId,recipientId)),and(eq(messages.senderId,recipientId),eq(messages.recipientId,userId))))).limit(1))[0];const follows=await tx.select().from(userFollows).where(and(inArray(userFollows.followerUserId,[userId,recipientId]),inArray(userFollows.followingUserId,[userId,recipientId]))).for("update");const mutual=follows.some(x=>x.followerUserId===userId&&x.followingUserId===recipientId)&&follows.some(x=>x.followerUserId===recipientId&&x.followingUserId===userId);if(gate.kind==="not_referrer_pair"&&!thread&&!mutual)throw new DirectMessageFollowRequiredError();const now=new Date(),windowStart=new Date(now);windowStart.setMinutes(0,0,0);await tx.insert(directMessageQuotaWindows).values({senderId:userId,windowStart,sendCount:0}).onDuplicateKeyUpdate({set:{senderId:userId}});const quota=(await tx.select().from(directMessageQuotaWindows).where(and(eq(directMessageQuotaWindows.senderId,userId),eq(directMessageQuotaWindows.windowStart,windowStart))).limit(1).for("update"))[0];if(!quota||quota.sendCount>=30)throw new DirectMessageRateLimitError(new Date(windowStart.getTime()+3600_000));await tx.update(directMessageQuotaWindows).set({sendCount:quota.sendCount+1}).where(and(eq(directMessageQuotaWindows.id,quota.id),eq(directMessageQuotaWindows.sendCount,quota.sendCount)));const inserted=await tx.insert(messages).values({senderId:userId,recipientId,body:safeBody,referralRequestId:null,idempotencyKey,requestFingerprint:fingerprint});const id=Number(inserted[0].insertId);await tx.insert(notifications).values({ kind: "message_new",userId:recipientId,category:"message",title:"New direct message",body:"You have a new message from a member.",eventKey:`dm:${id}:notification`});await tx.insert(directMessageNotificationOutbox).values({messageId:id,recipientId,status:"pending"});return{id,replayed:false as const};});}



export async function listMessages(userId: number) { const db = await getDb(); if (!db) return []; return db.select().from(messages).where(or(eq(messages.senderId, userId), eq(messages.recipientId, userId))).orderBy(desc(messages.createdAt)); }
export async function sendMessage(userId: number, input: { recipientId: number; body: string; referralRequestId?: number }) { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const result = await db.insert(messages).values({ senderId: userId, recipientId: input.recipientId, body: input.body, referralRequestId: input.referralRequestId }); await db.insert(notifications).values({ kind: "message_new", userId: input.recipientId, category: "message", title: "New message", body: "You have a new message in Bridge." }); return { id: Number(result[0].insertId) }; }
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
  const [profile, availableJobs, saved, referrals, memberMessages, stats] = await Promise.all([
    getProfileByUserId(userId),
    listJobs({}),
    listSavedRoles(userId),
    listReferralRequests(userId),
    listMessages(userId),
    getDashboardStats(userId),
  ]);
  return {
    profile,
    jobs: availableJobs.slice(0, 12).map(job => ({ id: job.id, title: job.title, company: job.company, location: job.location, seniority: job.seniority, workMode: job.workMode, description: job.description })),
    // No referrer row ever enters an AI context: referrers are never listed or ranked and
    // stay anonymous until they accept, the model is a third party, and a reply could repeat it.
    referrers: [],
    savedRoles: saved.slice(0, 8).map(role => ({ title: role.title, company: role.company, seniority: role.seniority })),
    referrals: referrals.slice(0, 8).map(referral => ({ jobTitle: referral.jobTitle, company: referral.company, status: referral.status, updatedAt: referral.updatedAt })),
    recentMessageCount: memberMessages.length,
    stats,
  };
}


export type WalletRole = "job_seeker" | "referrer";
export type CreditSummary = {
  plan: WalletPlanId;
  monthlyAllowance: number;
  monthlyCreditsRemaining: number;
  purchasedCreditsRemaining: number;
  promoCreditsRemaining: number;
  promoExpiresAt: Date | null;
  promoStatus: "active" | "exhausted" | "expired" | "revoked" | null;
  /** False while promo grants are switched off; the UI must not advertise the offer. */
  promoOfferActive: boolean;
  totalAvailable: number;
  cycleKey: string;
  subscriptionStatus: string | null;
  subscriptionCurrentTermEnd: Date | null;
  /** Kit ledger block (shared/creditLedger.ts): on GET /api/credits/summary and spends; embedded summaries omit it. */
  ledger?: CreditsLedger;
  /** D-079: the provider confirmed a card for this wallet's owner. Always false for referrers (their credits are not gated). */
  cardValidated: boolean;
  /** D-079: flag on + seeker + no validated card: free monthly credits are locked until validation. */
  freeCreditsLocked: boolean;
};
export const MAX_ADMIN_TOKEN_ADJUSTMENT = 1000;
export const COMPANY_COVERAGE_REWARD_TOKENS = 1;
export const PERSONAL_REFERRAL_REWARD_TOKENS = 1;
/**
 * D-055: skipwait.me never pays referrers. No credits, passes, karma, money or perks for referring
 * or for accepting asks; recognition stays private (impact stats, thank-yous). The one
 * referrer-side reward, a coverage-invite joiner's pending credit that unlocked when they
 * accepted an ask, is switched off here, not deleted (D-042): accepting grants nothing and no
 * new referrer-side credit is promised. Pending rows written before D-055 are left untouched.
 * Seeker-side invite and coverage rewards are not referrer pay and stay on.
 */
export const REFERRER_ACCEPT_REWARDS_ENABLED: boolean = false;

async function addCoverageRewardCredit(tx: any, userId: number, role: WalletRole) {
  const wallet = await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, role))).limit(1);
  if (wallet[0]) await tx.update(tokenBalances).set({ balance: wallet[0].balance + COMPANY_COVERAGE_REWARD_TOKENS }).where(eq(tokenBalances.id, wallet[0].id));
  else await tx.insert(tokenBalances).values({ userId, role, balance: COMPANY_COVERAGE_REWARD_TOKENS, ...freshWalletCycle(role) });
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
    // Action-gated: no credits for verifying alone. The inviting seeker earns when they send an
    // ask. The invited referrer's side (earned by accepting a request) is off under D-055.
    await tx.insert(tokenTransactions).values([{ userId: invitation.inviterUserId, role: "job_seeker", tokenCount: COMPANY_COVERAGE_REWARD_TOKENS, kind: "invite_reward_pending", rewardStatus: "pending" }, ...(REFERRER_ACCEPT_REWARDS_ENABLED ? [{ userId: joinerUserId, role: "referrer" as const, tokenCount: COMPANY_COVERAGE_REWARD_TOKENS, kind: "invite_reward_pending" as const, rewardStatus: "pending" as const }] : [])]);
    await tx.insert(notifications).values([{ userId: invitation.inviterUserId, category: "system", title: "Company coverage pending reward", body: "A matching employee verified their work email. One referral credit unlocks after your next referral action." }, ...(REFERRER_ACCEPT_REWARDS_ENABLED ? [{ userId: joinerUserId, category: "system" as const, title: "Coverage credit pending", body: "Welcome to private company coverage. One referral credit unlocks after you accept your first private referral request." }] : [])]);
    await tx.update(companyCoverageInvitations).set({ status: "completed", joinerUserId, completedAt: new Date() }).where(eq(companyCoverageInvitations.id, invitation.id));
    return { rewarded: true as const, tokenCount: COMPANY_COVERAGE_REWARD_TOKENS };
  });
}

async function addPersonalReferralRewardCredit(tx: any, userId: number) {
  const wallet = await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, "job_seeker"))).limit(1);
  if (wallet[0]) await tx.update(tokenBalances).set({ balance: wallet[0].balance + PERSONAL_REFERRAL_REWARD_TOKENS }).where(eq(tokenBalances.id, wallet[0].id));
  else await tx.insert(tokenBalances).values({ userId, role: "job_seeker", balance: PERSONAL_REFERRAL_REWARD_TOKENS, ...freshWalletCycle("job_seeker") });
}

/**
 * Referral-link unlock (D-155): source-backed, provider-verified evidence of
 * a successful nonzero payment on the account. Two evidence paths:
 *
 * 1. A one-time checkout whose fulfillment reached "credited" - written only
 *    from a payment_succeeded webhook with a nonzero INR/USD amount after
 *    the amount check (mismatches park as requires_review and never count;
 *    pending / rejected fulfillments and mere checkout-or-page creation
 *    never count). A fulfillment later marked "refunded" does NOT unlock:
 *    refunded-first-payment policy is OPEN (D-155), no founder ruling exists,
 *    and the refunded-only case is surfaced for his decision rather than
 *    admitted or revoked silently (production today has no gate at all).
 * 2. A subscription payment stamped onto the wallet by
 *    recordSubscriptionPaymentEvidence from a payment_succeeded webhook tied
 *    to the wallet's subscriptionId. Activation alone (wallet
 *    subscriptionId) is NOT evidence: it can precede settlement or be
 *    created by hand in the Chargebee dashboard, and subscription payments
 *    never create a paymentFulfillments row.
 *
 * The promoCreditGrants first_paid_invoice row is not usable here: promo
 * grants are disabled (grantPromoCreditsTx returns early).
 */
export function personalInviteUnlockedFromEvidence(evidence: { paidPayments: number; subscriptionPayments: number }): boolean {
  return evidence.paidPayments > 0 || evidence.subscriptionPayments > 0;
}

/**
 * D-155: record provider-verified paid evidence for a subscription. The
 * caller passes an already-validated nonzero payment_succeeded event; the
 * subscriptionEvents row makes redeliveries duplicates and lets a payment
 * that arrived before the wallet's activation be backfilled by
 * hasUserMadePayment. The stamp keeps the earliest payment time - a renewal
 * or redelivery never moves it. Wallets are matched by provider
 * subscriptionId, so the evidence is tied to the subscription's owner, not
 * to an email guess.
 */
export async function recordSubscriptionPaymentEvidence(input: { eventId: string; subscriptionId: string; occurredAt?: Date }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const duplicate = await tx.select().from(subscriptionEvents).where(and(eq(subscriptionEvents.provider, "chargebee_paid"), eq(subscriptionEvents.providerEventId, input.eventId))).limit(1);
    if (duplicate[0]) return { status: "duplicate" as const };
    await tx.insert(subscriptionEvents).values({ provider: "chargebee_paid", providerEventId: input.eventId, subscriptionId: input.subscriptionId, eventType: "paid_evidence" });
    const wallet = (await tx.select().from(tokenBalances).where(eq(tokenBalances.subscriptionId, input.subscriptionId)).limit(1).for("update"))[0];
    if (!wallet) return { status: "recorded" as const, reason: "wallet_not_linked_yet" as const };
    const paidAt = input.occurredAt ?? new Date();
    if (!wallet.lastPaidAt || wallet.lastPaidAt > paidAt) await tx.update(tokenBalances).set({ lastPaidAt: paidAt }).where(eq(tokenBalances.id, wallet.id));
    return { status: "recorded" as const, reason: "stamped" as const };
  });
}

export async function hasUserMadePayment(userId: number): Promise<boolean> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const wallets = await db.select({ id: tokenBalances.id, role: tokenBalances.role, subscriptionId: tokenBalances.subscriptionId, lastPaidAt: tokenBalances.lastPaidAt }).from(tokenBalances).where(eq(tokenBalances.userId, userId));
  if (wallets.some(w => Boolean(w.lastPaidAt))) return personalInviteUnlockedFromEvidence({ paidPayments: 0, subscriptionPayments: 1 });

  const payments = await db.select({ id: paymentFulfillments.id, role: paymentFulfillments.role, creditedAt: paymentFulfillments.creditedAt, createdAt: paymentFulfillments.createdAt }).from(paymentFulfillments).where(and(eq(paymentFulfillments.userId, userId), eq(paymentFulfillments.status, "credited"))).limit(1);
  if (payments.length > 0) {
    const targetWallet = wallets.find(w => w.role === payments[0].role) ?? wallets[0];
    const paidAt = payments[0].creditedAt ?? payments[0].createdAt ?? new Date();
    if (targetWallet && !targetWallet.lastPaidAt) {
      await db.update(tokenBalances).set({ lastPaidAt: paidAt }).where(eq(tokenBalances.id, targetWallet.id));
      targetWallet.lastPaidAt = paidAt;
    }
    return personalInviteUnlockedFromEvidence({ paidPayments: 1, subscriptionPayments: 0 });
  }

  for (const wallet of wallets) {
    if (!wallet.subscriptionId) continue;
    // Out-of-order delivery: the paid_evidence event can be recorded
    // before the activation that links the wallet. A recorded payment event
    // for the now linked subscription backfills the stamp.
    const paidEvent = (await db.select({ id: subscriptionEvents.id }).from(subscriptionEvents).where(and(eq(subscriptionEvents.provider, "chargebee_paid"), eq(subscriptionEvents.subscriptionId, wallet.subscriptionId), eq(subscriptionEvents.eventType, "paid_evidence"))).limit(1))[0];
    if (paidEvent) {
      await db.update(tokenBalances).set({ lastPaidAt: new Date() }).where(eq(tokenBalances.id, wallet.id));
      return personalInviteUnlockedFromEvidence({ paidPayments: 0, subscriptionPayments: 1 });
    }
  }
  return personalInviteUnlockedFromEvidence({ paidPayments: 0, subscriptionPayments: 0 });
}

export type PersonalReferralInviteState = { status: "locked" } | { status: "unlocked"; inviteCode: string };

/**
 * The /share personal invite link (D-155): locked until the account's first
 * paid invoice; no invite row is created while locked. Once unlocked, the
 * existing get-or-create behaviour applies unchanged.
 */
export async function getPersonalReferralInviteState(userId: number): Promise<PersonalReferralInviteState> {
  if (!(await hasUserMadePayment(userId))) return { status: "locked" };
  const invite = await getOrCreatePersonalReferralInvite(userId);
  return { status: "unlocked", inviteCode: invite.inviteCode };
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
      // Action-gated: credits are recorded as pending (job seeker wallets) and unlock
      // only when that person sends a private referral request. Accepting one never
      // pays (D-055).
      await tx.insert(tokenTransactions).values([
        { userId: invitation.inviterUserId, role: "job_seeker", tokenCount: PERSONAL_REFERRAL_REWARD_TOKENS, kind: "invite_reward_pending", rewardStatus: "pending" },
        { userId: joinerUserId, role: "job_seeker", tokenCount: PERSONAL_REFERRAL_REWARD_TOKENS, kind: "invite_reward_pending", rewardStatus: "pending" },
      ]);
      await tx.insert(notifications).values([
        { userId: invitation.inviterUserId, category: "system", title: "Invite reward pending", body: "A friend joined with your link. One extra referral credit unlocks after you send your next private referral request." },
        { userId: joinerUserId, category: "system", title: "Invite credit pending", body: "You joined with an invite. One extra referral credit unlocks after you send your first private referral request." },
      ]);
      return { rewarded: true as const, tokenCount: PERSONAL_REFERRAL_REWARD_TOKENS };
    });
  } catch (error) {
    if (isDuplicateKey(error)) return { rewarded: false as const, reason: "duplicate_account" as const };
    throw error;
  }
}

function creditSummaryFromWallet(wallet: typeof tokenBalances.$inferSelect, promo: { remaining: number; expiresAt: Date | null; status: "active" | "exhausted" | "expired" | "revoked" | null } = { remaining: 0, expiresAt: null, status: null }): CreditSummary {
  return {
    plan: wallet.plan,
    monthlyAllowance: wallet.monthlyAllowance,
    monthlyCreditsRemaining: wallet.monthlyCreditsRemaining,
    purchasedCreditsRemaining: wallet.balance,
    promoCreditsRemaining: promo.remaining,
    promoExpiresAt: promo.expiresAt,
    promoStatus: promo.status,
    promoOfferActive: promoGrantsEnabled(),
    // Referral requests (createCompanyReferralRequest) never spend promo credits, and grants are paused
    // while PROMO_GRANTS_ENABLED is off, so promo must not inflate the spendable total shown to users.
    totalAvailable: wallet.monthlyCreditsRemaining + wallet.balance + (promoGrantsEnabled() ? promo.remaining : 0),
    cycleKey: wallet.monthlyCycleKey,
    subscriptionStatus: wallet.subscriptionStatus ?? null,
    subscriptionCurrentTermEnd: wallet.subscriptionCurrentTermEnd ?? null,
    cardValidated: wallet.role === "job_seeker" && wallet.cardValidatedAt != null,
    // D-127: the sign-up card-validation gate is retired; the field stays on the
    // payload for older clients and is always false.
    freeCreditsLocked: false,
  };
}

// The pre-kit referrer wallet reset. A paid plan counts only while it is a kit
// catalog plan billing inside its term (isPaidPlanActive, JS clock): a wallet
// still marked with a retired Pro/Max plan (D-067) normalizes to Free at once.
function normalizedWalletState(wallet: typeof tokenBalances.$inferSelect, now: Date = new Date()) {
  const cycleKey = currentMonthlyCycleKey(now);
  const subscriptionActive = isPaidPlanActive(wallet, now);
  if (subscriptionActive) return { changed: false, patch: {} };
  if (wallet.plan !== "free") return {
    changed: true,
    patch: {
      plan: "free" as const,
      monthlyAllowance: FREE_MONTHLY_ALLOWANCE,
      // Referrer wallets only (seekers reconcile through the kit ledger): leaving a paid plan never leaves more of
      // this month's credits than Free grants, so a retired Max wallet cannot read Free with 30 of 3 (D-067, D-055).
      monthlyCreditsRemaining: wallet.monthlyCycleKey === cycleKey ? Math.min(wallet.monthlyCreditsRemaining, FREE_MONTHLY_ALLOWANCE) : FREE_MONTHLY_ALLOWANCE,
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

// ---- Promo credits: 5 expiring credits for the first bank-verified payment ----
// A promo grant is a separate expiring ledger, never mixed into the
// never-expiring pack balance. Spend order is promo first (it expires),
// then monthly, then pack. Expiry is lazy: reads treat past-expiresAt grants
// as zero and sweep them to expired on the next write path. No cron.
export const PROMO_GRANT_TOKENS = 5;
export const PROMO_GRANT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Schema-pending degradation: the promo table/enum reach production via the
// reviewed migration, which may land after the code. Missing-schema failures
// (absent table, pre-widen enum) must degrade to "no promo" — never break
// payments, spends, or summaries. Anything else still throws.
function isSchemaMissingError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const typed = current as { code?: unknown; errno?: unknown; sqlState?: unknown; cause?: unknown };
    if (typed.code === "ER_NO_SUCH_TABLE" || typed.errno === 1146) return true;
    if (typed.code === "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD" || typed.errno === 1265 || typed.errno === 1366) return true;
    current = typed.cause;
  }
  return false;
}

type PromoState = { remaining: number; expiresAt: Date | null; status: "active" | "exhausted" | "expired" | "revoked" | null };

function promoStatusOf(grant: { status: string; expiresAt: Date } | undefined, now: Date): PromoState["status"] {
  if (!grant) return null;
  if (grant.status === "revoked") return "revoked";
  if (grant.status === "exhausted") return "exhausted";
  if (grant.status === "expired") return "expired";
  return grant.expiresAt.getTime() <= now.getTime() ? "expired" : "active";
}

async function promoStateForTx(tx: any, userId: number, role: WalletRole, now: Date): Promise<{ grant?: any; status: PromoState["status"] }> {
  try {
    const rows = await tx.select().from(promoCreditGrants).where(and(eq(promoCreditGrants.userId, userId), eq(promoCreditGrants.role, role))).limit(1).for("update");
    const grant = rows[0];
    const status = promoStatusOf(grant, now);
    if (grant && grant.status === "active" && status === "expired") {
      await tx.update(promoCreditGrants).set({ status: "expired" }).where(and(eq(promoCreditGrants.id, grant.id), eq(promoCreditGrants.status, "active")));
    }
    return { grant: status === "active" ? grant : undefined, status };
  } catch (error) {
    if (isSchemaMissingError(error)) return { grant: undefined, status: null };
    throw error;
  }
}

/** Promo grants are opt-in: only PROMO_GRANTS_ENABLED="true" turns the grant hooks on. */
export function promoGrantsEnabled(): boolean { return process.env.PROMO_GRANTS_ENABLED === "true"; }
/** D-110/D-132 wiring, flag ASK_LEVEL_COST (default off): an ask costs credits
 * equal to its job's classified level (L1=1 ... L10=10); off keeps the flat
 * 1-credit cost. Changeable default per the owner. */
export function askLevelCostEnabled(): boolean { return process.env.ASK_LEVEL_COST === "true"; }
/** Cost of one ask in credits. The create spend and the waiting-ask delivery
 * spend both classify the same stored job fields, and the pre-send quote
 * (/api/company-referrals/quote) classifies the same normalized link, so all
 * three always agree. */
export function askCreditCost(job: { title?: string | null; description?: string | null; url?: string | null }): number {
  if (!askLevelCostEnabled()) return 1;
  return creditsForLevel(assignJobLevel({ title: job.title, description: job.description, url: job.url }).level);
}
/** D-132 audit item 2: the level and cost an ask is priced at, for the one row stored at creation. */
export function askPriceAtCreate(job: { title?: string | null; description?: string | null; url?: string | null }): { jobLevel: number; creditCost: number } {
  const jobLevel = assignJobLevel({ title: job.title, description: job.description, url: job.url }).level;
  return { jobLevel, creditCost: creditsForLevel(jobLevel) };
}

export async function grantPromoCreditsTx(tx: any, input: { userId: number; role: WalletRole; source: string; providerRef: string; now?: Date }): Promise<{ granted: boolean; grantId?: number; reason?: "already_granted" | "disabled" }> {
  // Grants stay off until the issue #35 rebuild (reviewer contracts 39-41):
  // the current hooks grant without verified payment and can roll back a paid
  // fulfillment. Returning before any query keeps the fulfillment transaction
  // free of promo locks.
  if (!promoGrantsEnabled()) return { granted: false, reason: "disabled" };
  const now = input.now ?? new Date();
  // The unique (userId, role) row is the idempotency claim: one grant per
  // account ever. Lock first for the common path; the unique constraint wins
  // any insertion race and maps to already_granted below.
  const existing = await tx.select({ id: promoCreditGrants.id }).from(promoCreditGrants).where(and(eq(promoCreditGrants.userId, input.userId), eq(promoCreditGrants.role, input.role))).limit(1).for("update");
  if (existing[0]) return { granted: false, reason: "already_granted" };
  const expiresAt = new Date(now.getTime() + PROMO_GRANT_TTL_MS);
  try {
    const inserted = await tx.insert(promoCreditGrants).values({ userId: input.userId, role: input.role, tokenCount: PROMO_GRANT_TOKENS, creditsRemaining: PROMO_GRANT_TOKENS, status: "active", source: input.source.slice(0, 40), providerRef: input.providerRef.slice(0, 255), grantedAt: now, expiresAt });
    const grantId = Number(inserted[0].insertId);
    await tx.insert(tokenTransactions).values({ userId: input.userId, role: input.role, tokenCount: PROMO_GRANT_TOKENS, kind: "promo_grant", source: "promo_first_payment", referenceType: "promo_credit_grant", referenceId: String(grantId), idempotencyKey: `promo-grant-${grantId}` });
    await tx.insert(notifications).values({ kind: "credits_added", userId: input.userId, category: "system", title: `${PROMO_GRANT_TOKENS} bonus referral credits`, body: `Your verified payment earned ${PROMO_GRANT_TOKENS} bonus credits. They expire in 30 days and are used before monthly credits.` });
    return { granted: true, grantId };
  } catch (error) {
    if (isDuplicateKey(error)) return { granted: false, reason: "already_granted" };
    throw error;
  }
}

export async function revokePromoGrant(grantId: number, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const clean = reason.trim().slice(0, 255);
  if (!clean) throw new Error("Add a revocation reason");
  return db.transaction(async tx => {
    const rows = await tx.select().from(promoCreditGrants).where(eq(promoCreditGrants.id, grantId)).limit(1).for("update");
    const grant = rows[0];
    if (!grant) throw new Error("Promo grant not found");
    if (grant.status === "revoked") return { grantId, status: "revoked" as const };
    await tx.update(promoCreditGrants).set({ status: "revoked", creditsRemaining: 0, revokedAt: new Date(), revokedReason: clean }).where(eq(promoCreditGrants.id, grantId));
    return { grantId, status: "revoked" as const };
  });
}

/** Escape LIKE wildcards so recovery search treats % _ \ as literals (MySQL backslash escape). */
export function likeSearchPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, match => `\\${match}`)}%`;
}

export async function findUsersForTokenRecovery(query: string) {
  const db = await getDb(); if (!db) return [];
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  const pattern = likeSearchPattern(normalized);
  return db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(or(like(users.email, pattern), like(users.name, pattern))).orderBy(desc(users.lastSignedIn)).limit(15);
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
    // The unique adjustment row is the idempotency claim. Insert it before any
    // wallet side effect so concurrent requests for the same case cannot both
    // credit; a duplicate-key failure rolls the whole transaction back.
    const adjustment = await tx.insert(adminTokenAdjustments).values({ recipientUserId: input.recipientUserId, adminUserId, role: input.role, tokenCount: input.tokenCount, caseReference, reason });
    await tx.insert(tokenBalances).values({ userId: input.recipientUserId, role: input.role, balance: input.tokenCount, ...freshWalletCycle(input.role) }).onDuplicateKeyUpdate({ set: { balance: sql`${tokenBalances.balance} + ${input.tokenCount}` } });
    const wallet = await tx.select({ balance: tokenBalances.balance }).from(tokenBalances).where(and(eq(tokenBalances.userId, input.recipientUserId), eq(tokenBalances.role, input.role))).limit(1).for("update");
    if (!wallet[0]) throw new Error("Recovery wallet update failed");
    await tx.insert(tokenTransactions).values({ userId: input.recipientUserId, role: input.role, tokenCount: input.tokenCount, kind: "admin_adjustment", source: "admin_recovery", referenceType: "admin_token_adjustment", referenceId: String(Number(adjustment[0].insertId)), idempotencyKey: `admin-adjustment-${Number(adjustment[0].insertId)}`, balanceAfter: wallet[0].balance });
    await tx.insert(notifications).values({ kind: "credits_added", userId: input.recipientUserId, category: "system", title: "Token credit added", body: `${input.tokenCount} referral token${input.tokenCount === 1 ? " was" : "s were"} added after a support review.` });
    return { adjustmentId: Number(adjustment[0].insertId), recipientUserId: input.recipientUserId, role: input.role, tokenCount: input.tokenCount, newBalance: wallet[0].balance };
  });
}

/** D-079: apply a provider-confirmed card to the wallet. Maps the Chargebee
 * customer to the user (unmatched surfaces for the owner alert), stamps
 * cardValidatedAt once, then grants the current Free month once. Only a
 * provider "valid" status stamps; a decline or a pending check changes nothing. */
export async function applyCardValidationEvent(input: { eventId: string; eventType: string; customerId: string; paymentSourceId: string; status: string }) {
  if (input.status === "pending_verification") return { status: "ignored" as const, reason: "pending_verification" };
  if (input.status !== "valid") return { status: "invalid_source" as const, reason: input.status };
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const user = (await db.select({ id: users.id }).from(users).where(eq(users.chargebeeCustomerId, input.customerId)).limit(1))[0];
  if (!user) return { status: "unmatched" as const, reason: "no_user_for_customer" };
  const applied = await markCardValidatedFromProvider(user.id);
  return { status: "applied" as const, userId: user.id, granted: applied.granted };
}

/** D-079: the Chargebee customer id we created for this user, if any. */
export async function getUserChargebeeCustomerId(userId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const row = (await db.select({ chargebeeCustomerId: users.chargebeeCustomerId }).from(users).where(eq(users.id, userId)).limit(1))[0];
  return row?.chargebeeCustomerId ?? null;
}

/** D-079: persist the Chargebee customer id once; a concurrent creator loses and re-reads. */
export async function setUserChargebeeCustomerId(userId: number, customerId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(users).set({ chargebeeCustomerId: customerId }).where(and(eq(users.id, userId), isNull(users.chargebeeCustomerId)));
}

/** D-079: stamp the seeker wallet validated (once) and grant the current Free month (once). */
export async function markCardValidatedFromProvider(userId: number): Promise<{ granted: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await ensureTokenWallet(userId, "job_seeker");
  await db.update(tokenBalances).set({ cardValidatedAt: new Date() }).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, "job_seeker" as const), isNull(tokenBalances.cardValidatedAt)));
  return grantFreeCreditsOnValidation(userId);
}

/** D-079: after the provider confirms a card, grant the current Free month once, under the wallet lock. */
export async function grantFreeCreditsOnValidation(userId: number, now: Date = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const locked = (await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, "job_seeker" as const))).limit(1).for("update"))[0];
    if (!locked || !locked.cardValidatedAt) return { granted: false };
    const result = await grantFreeCycleOnValidationTx(tx, { wallet: locked, now });
    return { granted: result.granted };
  });
}

export async function ensureTokenWallet(userId: number, role: WalletRole) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date();
  const existing = await db.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, role))).limit(1);
  if (!existing[0]) {
    await db.insert(tokenBalances).values({ userId, role, balance: 0, ...freshWalletCycle(role, now) });
    const created = (await db.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, role))).limit(1))[0];
    // A new seeker wallet opens Free's current month (3 credits, one plan_grant row) at once.
    if (role !== "job_seeker" || !created) return created;
    existing.push(created);
  }
  if (role === "job_seeker") {
    // Kit ledger: cycle boundaries move credits (carryover, expiry, Free's monthly grant) with ledger rows, so they run under the wallet lock.
    if (!seekerCycleDue(existing[0], now)) return existing[0];
    return db.transaction(async tx => {
      const locked = (await tx.select().from(tokenBalances).where(eq(tokenBalances.id, existing[0].id)).limit(1).for("update"))[0];
      if (!locked) throw new Error("Your credit wallet is unavailable");
      return (await reconcileSeekerWalletTx(tx, locked, now)).wallet;
    });
  }
  const normalized = normalizedWalletState(existing[0]);
  if (normalized.changed) {
    await db.update(tokenBalances).set(normalized.patch).where(eq(tokenBalances.id, existing[0].id));
    return { ...existing[0], ...normalized.patch };
  }
  return existing[0];
}

type WalletRow = typeof tokenBalances.$inferSelect;

/** Brings a locked wallet up to now: the kit ledger for seekers, the pre-kit monthly reset for referrers. */
async function reconcileWalletTx(tx: LedgerTx, locked: WalletRow, now: Date): Promise<{ wallet: WalletRow; grants: GrantRow[] }> {
  if (locked.role === "job_seeker") {
    const { wallet, grants } = await reconcileSeekerWalletTx(tx, locked, now);
    return { wallet, grants };
  }
  const normalized = normalizedWalletState(locked, now);
  if (!normalized.changed) return { wallet: locked, grants: [] };
  const updated = await tx.update(tokenBalances).set(normalized.patch).where(eq(tokenBalances.id, locked.id));
  if (Number(updated[0]?.affectedRows ?? 0) !== 1) throw new CreditSpendConflictError();
  return { wallet: { ...locked, ...normalized.patch }, grants: [] };
}

function promoHolding(grant: typeof promoCreditGrants.$inferSelect | undefined): PromoHolding | null {
  return grant ? { grantId: grant.id, credits: grant.creditsRemaining, expiresAt: grant.expiresAt, tokenCount: grant.tokenCount } : null;
}

/** The full summary for a locked, reconciled wallet: the legacy fields plus the kit ledger block. */
async function creditSummaryTx(tx: LedgerTx, input: { wallet: WalletRow; grants: GrantRow[]; promo: { grant?: typeof promoCreditGrants.$inferSelect; status: PromoState["status"] }; now: Date }): Promise<CreditSummary> {
  const holding = promoHolding(input.promo.grant);
  // Promo credits count toward the balance only while grants are on (the pre-kit totalAvailable rule).
  const ledger = await creditsLedgerTx(tx, { wallet: input.wallet, grants: input.grants, promo: promoGrantsEnabled() ? holding : null, now: input.now });
  const legacy = creditSummaryFromWallet(input.wallet, holding ? { remaining: holding.credits, expiresAt: holding.expiresAt, status: input.promo.status } : { remaining: 0, expiresAt: null, status: input.promo.status });
  return { ...legacy, totalAvailable: ledger.balance, ledger };
}

/** GET /api/credits/summary: reconciles the caller's own wallet, then reports every bucket. */
export async function getTokenWallet(userId: number, role: WalletRole): Promise<CreditSummary> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const created = await ensureTokenWallet(userId, role);
  return db.transaction(async tx => {
    const locked = (await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, role))).limit(1).for("update"))[0] ?? created;
    const now = new Date();
    const { wallet, grants } = await reconcileWalletTx(tx, locked, now);
    const promo = await promoStateForTx(tx, userId, role, now);
    return creditSummaryTx(tx, { wallet, grants, promo, now });
  });
}

/** GET /api/credits/ledger: the caller's own ledger rows, newest first. Pending invite rewards are not credits yet. */
export async function listCreditLedger(userId: number, role: WalletRole, limit: number): Promise<CreditLedgerEntry[]> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db.select({ id: tokenTransactions.id, kind: tokenTransactions.kind, tokenCount: tokenTransactions.tokenCount, source: tokenTransactions.source, referenceType: tokenTransactions.referenceType, referenceId: tokenTransactions.referenceId, createdAt: tokenTransactions.createdAt }).from(tokenTransactions).where(and(eq(tokenTransactions.userId, userId), eq(tokenTransactions.role, role), notInArray(tokenTransactions.kind, [...HIDDEN_LEDGER_KINDS]))).orderBy(desc(tokenTransactions.id)).limit(Math.max(1, Math.min(limit, 100)));
  return rows.map(row => creditLedgerEntrySchema.parse({
      id: row.id,
      kind: row.kind,
      credits: row.tokenCount,
      bucket: bucketOfLedgerRow(row.kind, row.source ?? null),
      reference: row.referenceType && row.referenceId ? { type: row.referenceType.slice(0, 40), id: row.referenceId.slice(0, 80) } : null,
      createdAt: row.createdAt.toISOString(),
    }));
}

/**
 * Scheduled-job entry: brings one job-seeker wallet up to `now` under its row
 * lock (cycle grants for yearly terms, lapsed-plan and grant expiry). Idempotent:
 * a second call in the same cycle finds nothing due.
 */
export async function reconcileSeekerCredits(userId: number, now: Date): Promise<{ changed: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const locked = (await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, "job_seeker"))).limit(1).for("update"))[0];
    if (!locked) return { changed: false };
    const { changed } = await reconcileSeekerWalletTx(tx, locked, now);
    return { changed };
  });
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
// request. Joining grants nothing, which removes the incentive to farm sign-ups.
// The Referrer side (accepting a referral request) is off under D-055
// (REFERRER_ACCEPT_REWARDS_ENABLED): skipwait.me never pays referrers.
async function grantPendingActionRewardsTx(tx: any, userId: number, role: WalletRole, qualifiedByType: string, qualifiedById: string) {
  const pending = await tx.select().from(tokenTransactions).where(and(eq(tokenTransactions.userId,userId),eq(tokenTransactions.role,role),eq(tokenTransactions.kind,"invite_reward_pending"),or(isNull(tokenTransactions.rewardStatus),eq(tokenTransactions.rewardStatus,"pending")))).for("update");
  let total=0; const claimedIds:number[]=[];
  for(const row of pending){
    const claimed=await tx.update(tokenTransactions).set({rewardStatus:"granted",qualifiedByType,qualifiedById,qualifiedAt:new Date()}).where(and(eq(tokenTransactions.id,row.id),eq(tokenTransactions.kind,"invite_reward_pending"),or(isNull(tokenTransactions.rewardStatus),eq(tokenTransactions.rewardStatus,"pending"))));
    if(Number(claimed[0]?.affectedRows??0)===1){total+=Number(row.tokenCount);claimedIds.push(row.id);}
  }
  if(total===0)return {granted:0};
  const wallet=(await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId,userId),eq(tokenBalances.role,role))).limit(1).for("update"))[0];
  if(!wallet)throw new Error("Reward wallet is unavailable");
  const updated=await tx.update(tokenBalances).set({balance:sql`${tokenBalances.balance} + ${total}`}).where(eq(tokenBalances.id,wallet.id));
  if(Number(updated[0]?.affectedRows??0)!==1)throw new Error("Reward wallet update failed");
  for(const pendingId of claimedIds)await tx.insert(tokenTransactions).values({userId,role,tokenCount:Number(pending.find((row:any)=>row.id===pendingId)!.tokenCount),kind:"invite_reward_granted",source:"action_gated_reward",referenceType:"pending_reward",referenceId:String(pendingId),idempotencyKey:`reward-${pendingId}`,rewardStatus:"granted",qualifiedByType,qualifiedById,qualifiedAt:new Date()});
  await tx.insert(notifications).values({ kind: "credits_added",userId,category:"system",title:"Referral credits unlocked",body:`Your ${total} invite credit${total===1?"":"s"} were added after your referral action.`});
  return {granted:total};
}

/** Pre-kit single-credit spend (no caller key): one credit, soonest-expiring bucket first. */
export async function spendToken(userId: number, role: WalletRole) {
  const key = `spend-${randomUUID()}`;
  const { summary } = await spendCredits(userId, role, { credits: 1, idempotencyKey: key, referenceType: "credit_spend", referenceId: key });
  return summary;
}

/**
 * Spends credits for one finished unit of work, idempotently by `idempotencyKey`:
 * the soonest-expiring bucket first (shared/creditLedger.ts orderBuckets), the
 * whole spend or nothing, one ledger row per bucket drawn. A replayed key
 * returns the current summary without spending again.
 */
export async function spendCredits(userId: number, role: WalletRole, input: { credits: number; idempotencyKey: string; referenceType: string; referenceId: string }): Promise<{ replayed: boolean; summary: CreditSummary }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await ensureTokenWallet(userId, role);
  return db.transaction(async tx => {
    // Serialization point: the wallet row lock comes before any grant or promo row.
    const current = (await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, userId), eq(tokenBalances.role, role))).limit(1).for("update"))[0];
    if (!current) throw new InsufficientCreditsError(input.credits, 0);
    const now = new Date();
    const replayed = await spendAlreadyRecordedTx(tx, userId, role, input.idempotencyKey);
    const reconciled = await reconcileWalletTx(tx, current, now);
    const promo = await promoStateForTx(tx, userId, role, now);
    if (replayed) return { replayed: true, summary: await creditSummaryTx(tx, { wallet: reconciled.wallet, grants: reconciled.grants, promo, now }) };
    const spent = await spendCreditsTx(tx, { wallet: reconciled.wallet, grants: reconciled.grants, promo: promoHolding(promo.grant), credits: input.credits, meta: { idempotencyKey: input.idempotencyKey, referenceType: input.referenceType, referenceId: input.referenceId }, now });
    const promoAfter = promo.grant && spent.promoRemaining !== null ? { grant: { ...promo.grant, creditsRemaining: spent.promoRemaining }, status: spent.promoRemaining > 0 ? promo.status : "exhausted" as const } : promo;
    return { replayed: false, summary: await creditSummaryTx(tx, { wallet: spent.wallet, grants: spent.grants, promo: promoAfter, now }) };
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

/**
 * Holds a pending payment for the admin's review. The hosted page's invoice id and paid amount are kept
 * with it: the refund webhook finds a payment only by its invoice id, and a full refund closes a held
 * payment only when what was paid is on record (server/paymentRefundEvents.ts). An invoice id the row
 * already carries is never replaced.
 */
export async function markChargebeePaymentForReview(paymentId: number, reason: "provider_page_mismatch" | "provider_page_incomplete" | "reconciliation_rejected", evidence: { invoiceId?: string; paidAmount?: number; paidCurrency?: string } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.transaction(async tx => {
    const row = (await tx.select({ id: paymentFulfillments.id, userId: paymentFulfillments.userId, status: paymentFulfillments.status, providerInvoiceId: paymentFulfillments.providerInvoiceId }).from(paymentFulfillments).where(eq(paymentFulfillments.id, paymentId)).limit(1).for("update"))[0];
    if (!row || row.status !== "pending") return;
    const invoice = evidence.invoiceId && !row.providerInvoiceId ? { providerInvoiceId: evidence.invoiceId } : {};
    const held = await tx.update(paymentFulfillments).set({ status: "requires_review", reconciliationReason: reason, lastCheckedAt: new Date(), ...invoice }).where(and(eq(paymentFulfillments.id, paymentId), eq(paymentFulfillments.status, "pending")));
    if (Number(held[0]?.affectedRows ?? 0) !== 1) return;
    await recordPaidEvidenceTx(tx, row, { amount: evidence.paidAmount, currency: evidence.paidCurrency, invoiceId: evidence.invoiceId ?? row.providerInvoiceId, source: "credit_recovery" });
  });
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

/**
 * A paid event for a payment credit recovery already held: keep its invoice id, so its refund is found,
 * and what was paid, so a full refund closes it instead of leaving it creditable. Caller holds the row lock.
 */
async function keepHeldPaymentEvidenceTx(tx: LedgerTx, row: { id: number; userId: number; providerInvoiceId: string | null }, input: { invoiceId?: string; amount: number; currency: string }) {
  if (!row.providerInvoiceId && input.invoiceId) await tx.update(paymentFulfillments).set({ providerInvoiceId: input.invoiceId }).where(and(eq(paymentFulfillments.id, row.id), isNull(paymentFulfillments.providerInvoiceId)));
  await recordPaidEvidenceTx(tx, row, { amount: input.amount, currency: input.currency, invoiceId: input.invoiceId ?? row.providerInvoiceId, source: "paid_webhook" });
}

export async function fulfillChargebeePayment(input: { eventId: string; hostedPageId?: string; invoiceId?: string; passThruContent?: string; amount: number; currency: string }) {
  if (!input.hostedPageId) return { status: "ignored" as const, reason: "missing_hosted_page" };
  if (!input.passThruContent) return { status: "ignored" as const, reason: "missing_checkout_intent" };
  const checkoutIntentId = input.passThruContent;
  const hostedPageId = input.hostedPageId;
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const duplicate = await tx.select().from(paymentFulfillments).where(and(eq(paymentFulfillments.provider, "chargebee"), eq(paymentFulfillments.providerEventId, input.eventId))).limit(1);
    if (duplicate[0]) return { status: "duplicate" as const, tokenCount: duplicate[0].tokenCount };
    const intent = await tx.select().from(paymentFulfillments).where(and(eq(paymentFulfillments.provider, "chargebee"), eq(paymentFulfillments.providerEventId, `pending:${input.hostedPageId}`), eq(paymentFulfillments.checkoutIntentId, checkoutIntentId))).limit(1).for("update");
    if (!intent[0]) {
      // No pending row: credit recovery or the reconcile job may already have
      // settled this checkout (event id hosted_page:<id>), or an earlier event
      // parked it. That is the same payment, not an unknown one: reporting it as
      // unmatched tells the admin to credit the customer by hand, a second credit.
      // A different invoice on the same checkout is not this payment and stays unknown.
      // Only a credited row is a duplicate: credit recovery reports a duplicate to the
      // buyer as "credited", which a refunded, parked or rejected payment is not.
      const settled = (await tx.select().from(paymentFulfillments).where(and(eq(paymentFulfillments.provider, "chargebee"), eq(paymentFulfillments.providerHostedPageId, hostedPageId), eq(paymentFulfillments.checkoutIntentId, checkoutIntentId))).limit(1).for("update"))[0];
      if (settled && (!settled.providerInvoiceId || !input.invoiceId || settled.providerInvoiceId === input.invoiceId)) {
        if (settled.status === "credited") return { status: "duplicate" as const, tokenCount: settled.tokenCount };
        if (settled.status === "requires_review") await keepHeldPaymentEvidenceTx(tx, settled, input);
        if (settled.status === "refunded" || settled.status === "requires_review" || settled.status === "rejected") return { status: "ignored" as const, reason: "payment_already_reconciled" };
      }
      return { status: "ignored" as const, reason: "unknown_checkout" };
    }
    if (intent[0].status === "requires_review") {
      // Credit recovery held it before this event arrived: nothing is credited here.
      await keepHeldPaymentEvidenceTx(tx, intent[0], input);
      return { status: "ignored" as const, reason: "payment_already_reconciled" };
    }
    if (intent[0].amount !== input.amount || intent[0].currency !== input.currency) {
      // A paid invoice that disagrees with the checkout (tax, coupon, rounding,
      // catalog drift) must never be dropped quietly: the user has paid. Park
      // it for admin review, log it, and let the route raise the admin alert.
      // Credits are not added automatically because the amount is untrusted.
      const reviewedAt = new Date();
      const parked = await tx.update(paymentFulfillments).set({ providerEventId: input.eventId, providerInvoiceId: input.invoiceId ?? null, status: "requires_review", reconciliationReason: "checkout_amount_mismatch", lastCheckedAt: reviewedAt }).where(and(eq(paymentFulfillments.id, intent[0].id), eq(paymentFulfillments.status, "pending")));
      if (Number(parked[0]?.affectedRows ?? 0) !== 1) return { status: "ignored" as const, reason: "payment_already_reconciled" };
      await tx.insert(operationalActivityLogs).values({ actorUserId: intent[0].userId, action: "billing.payment_amount_mismatch", outcome: "failure", resourceType: "payment_fulfillment", resourceId: String(intent[0].id), metadata: JSON.stringify({ role: intent[0].role, expectedAmount: intent[0].amount, expectedCurrency: intent[0].currency, paidAmount: input.amount, paidCurrency: input.currency, invoiceId: input.invoiceId ?? null }) });
      return { status: "requires_review" as const, reason: "checkout_amount_mismatch" as const, paymentId: intent[0].id, userId: intent[0].userId, role: intent[0].role, expectedAmount: intent[0].amount, expectedCurrency: intent[0].currency, paidAmount: input.amount, paidCurrency: input.currency };
    }
    const creditedAt = new Date();
    const claimed = await tx.update(paymentFulfillments).set({ providerEventId: input.eventId, providerInvoiceId: input.invoiceId ?? null, status: "credited", reconciliationReason: null, lastCheckedAt: creditedAt, creditedAt }).where(and(eq(paymentFulfillments.id, intent[0].id), eq(paymentFulfillments.status, "pending"), eq(paymentFulfillments.providerEventId, `pending:${input.hostedPageId}`)));
    if (Number(claimed[0]?.affectedRows ?? 0) !== 1) {
      const current = await tx.select({ status: paymentFulfillments.status, tokenCount: paymentFulfillments.tokenCount }).from(paymentFulfillments).where(eq(paymentFulfillments.id, intent[0].id)).limit(1);
      if (current[0]?.status === "credited") return { status: "duplicate" as const, tokenCount: current[0].tokenCount };
      return { status: "ignored" as const, reason: "payment_already_reconciled" };
    }
    const wallet = await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, intent[0].userId), eq(tokenBalances.role, intent[0].role))).limit(1);
    if (wallet[0]) {
      const setFields: Record<string, unknown> = { balance: sql`${tokenBalances.balance} + ${intent[0].tokenCount}` };
      if (!wallet[0].lastPaidAt) setFields.lastPaidAt = creditedAt;
      await tx.update(tokenBalances).set(setFields).where(eq(tokenBalances.id, wallet[0].id));
    } else {
      await tx.insert(tokenBalances).values({ userId: intent[0].userId, role: intent[0].role, balance: intent[0].tokenCount, lastPaidAt: creditedAt, ...freshWalletCycle(intent[0].role) });
    }
    // Tagged with its payment, the shape the admin credit writes: the unique ledger
    // keys then refuse any second purchase row for this payment (P0-refund-review).
    await tx.insert(tokenTransactions).values({ userId: intent[0].userId, role: intent[0].role, tokenCount: intent[0].tokenCount, kind: "purchase", source: "purchased_balance", referenceType: "payment_fulfillment", referenceId: String(intent[0].id), idempotencyKey: `payment-credit-${intent[0].id}` });
    // First bank-verified payment earns the promo grant. Idempotent by the
    // unique (userId, role) grant row: renewals and replays no-op inside the
    // same transaction, so fulfillment can never double-grant. A pending
    // schema migration degrades loudly (ledger + Sentry) without blocking the
    // paid credits the user bought.
    try {
      await grantPromoCreditsTx(tx, { userId: intent[0].userId, role: intent[0].role, source: "first_paid_invoice", providerRef: input.invoiceId ?? input.hostedPageId ?? input.eventId, now: creditedAt });
    } catch (error) {
      if (!isSchemaMissingError(error)) throw error;
      captureServerError(error, { source: "promo-grant-skipped", userId: intent[0].userId, role: intent[0].role });
      await tx.insert(operationalActivityLogs).values({ actorUserId: intent[0].userId, action: "promo.grant_skipped_schema_pending", outcome: "failure", resourceType: "promo_credit_grant", metadata: JSON.stringify({ role: intent[0].role, providerRef: input.invoiceId ?? input.hostedPageId ?? input.eventId }) });
    }
    return { status: "credited" as const, tokenCount: intent[0].tokenCount, userId: intent[0].userId, role: intent[0].role };
  });
}

export async function listRequiresReviewPayments(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ id: paymentFulfillments.id, provider: paymentFulfillments.provider, providerHostedPageId: paymentFulfillments.providerHostedPageId, checkoutIntentId: paymentFulfillments.checkoutIntentId, userId: paymentFulfillments.userId, role: paymentFulfillments.role, tokenCount: paymentFulfillments.tokenCount, amount: paymentFulfillments.amount, currency: paymentFulfillments.currency, reconciliationReason: paymentFulfillments.reconciliationReason, creditedAt: paymentFulfillments.creditedAt, createdAt: paymentFulfillments.createdAt, userEmail: users.email }).from(paymentFulfillments).innerJoin(users, eq(paymentFulfillments.userId, users.id)).where(eq(paymentFulfillments.status, "requires_review")).orderBy(desc(paymentFulfillments.createdAt)).limit(Math.max(1, Math.min(limit, 250)));
  // What Chargebee refunded for each listed payment, from the refund webhook's records (server/paymentRefundEvents.ts).
  const ids = rows.map(row => String(row.id));
  const refunds = summariseRecordedRefunds(ids.length ? await db.select({ id: operationalActivityLogs.id, resourceId: operationalActivityLogs.resourceId, metadata: operationalActivityLogs.metadata }).from(operationalActivityLogs).where(and(eq(operationalActivityLogs.action, "billing.refund_needs_review"), eq(operationalActivityLogs.resourceType, "payment_fulfillment"), inArray(operationalActivityLogs.resourceId, ids))) : []);
  // Why each row is parked decides which decisions the review page offers (shared/paymentReview.ts).
  return rows.map(row => ({ ...row, reviewKind: paymentReviewKind(row), refunds: refunds.get(row.id) ?? null }));
}

/**
 * The administrator's decision on a parked pack payment. Why the row is parked
 * decides what may happen (shared/paymentReview.ts): a pack the webhook already
 * added and the provider then refunded can never be credited again (only its
 * unused credits taken back, or kept), and a pack never added has nothing to take
 * back. A refused decision writes nothing and throws PaymentReviewRefusedError.
 */
export async function resolveRequiresReviewPayment(adminUserId: number, paymentId: number, decision: PaymentReviewDecision, note?: string, credits?: number): Promise<PaymentReviewOutcome> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    // Serialize all decisions for this payment before doing wallet work. A
    // plain read followed by the credit was vulnerable to two admins both
    // observing requires_review and both adding tokens.
    const rows = await tx.select().from(paymentFulfillments).where(eq(paymentFulfillments.id, paymentId)).limit(1).for("update");
    const row = rows[0];
    if (!row) throw new Error("This payment record does not exist");
    if (row.status !== "requires_review") throw new Error("This payment was already resolved");
    const refusal = paymentReviewRefusal(paymentReviewKind(row), decision);
    if (refusal) throw new PaymentReviewRefusedError(refusal);
    if (credits !== undefined && (decision !== "revoke_unused" || !Number.isInteger(credits) || credits < 1)) throw new PaymentReviewRefusedError("A credit count only applies to taking back unused credits, as a whole number of at least 1.");
    const cleanNote = typeof note === "string" && note.trim() ? note.trim().slice(0, PAYMENT_REVIEW_NOTE_MAX) : null;
    if (decision === "revoke_unused" || decision === "keep_credits") return closeRefundedPaymentReviewTx(tx, { adminUserId, row, decision, note: cleanNote, credits, now: new Date() });
    // The stored reason can predate a refund (refunded under older code, or before its invoice was linked):
    // the payment's own refund records decide, under the row lock.
    if (decision === "credited" && await recordedRefundsCoverPaymentTx(tx, paymentId)) throw new PaymentReviewRefusedError("Chargebee shows this payment refunded in full, so its credits cannot be added. Reject it to close it. Nothing was changed.");
    const resolvedAt = new Date();
    const claimed = await tx.update(paymentFulfillments).set({ status: decision, creditedAt: decision === "credited" ? resolvedAt : null, lastCheckedAt: resolvedAt }).where(and(eq(paymentFulfillments.id, paymentId), eq(paymentFulfillments.status, "requires_review")));
    if (Number(claimed[0]?.affectedRows ?? 0) !== 1) throw new Error("This payment was already resolved");
    if (decision === "credited") {
      await tx.insert(tokenBalances).values({ userId: row.userId, role: row.role, balance: row.tokenCount, ...freshWalletCycle(row.role) }).onDuplicateKeyUpdate({ set: { balance: sql`${tokenBalances.balance} + ${row.tokenCount}` } });
      const wallet = await tx.select({ balance: tokenBalances.balance }).from(tokenBalances).where(and(eq(tokenBalances.userId, row.userId), eq(tokenBalances.role, row.role))).limit(1).for("update");
      if (!wallet[0]) throw new Error("Payment credit wallet update failed");
      try {
        await tx.insert(tokenTransactions).values({ userId: row.userId, role: row.role, tokenCount: row.tokenCount, kind: "purchase", source: "purchased_balance", referenceType: "payment_fulfillment", referenceId: String(paymentId), idempotencyKey: `payment-credit-${paymentId}`, balanceAfter: wallet[0].balance });
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        // This payment already has its purchase row (the webhook or an earlier
        // review added the pack): roll back the claim and the wallet credit.
        captureServerError(error, { source: "payment-review-second-credit", paymentId });
        throw new PaymentReviewRefusedError("This payment's credits were already added once, so they cannot be added again. Nothing was changed.");
      }
    }
    const metadata = { provider: row.provider, tokenCount: row.tokenCount, amount: row.amount, currency: row.currency, reason: row.reconciliationReason, note: cleanNote };
    await tx.insert(operationalActivityLogs).values({ actorUserId: adminUserId, action: `payment.review_${decision}`, outcome: "success", resourceType: "payment_fulfillment", resourceId: String(paymentId), metadata: JSON.stringify(metadata) });
    return { paymentId, decision, tokenCount: row.tokenCount, userId: row.userId, role: row.role };
  });
}

export async function listRecentPayments(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: paymentFulfillments.id, status: paymentFulfillments.status, provider: paymentFulfillments.provider, providerHostedPageId: paymentFulfillments.providerHostedPageId, checkoutIntentId: paymentFulfillments.checkoutIntentId, userId: paymentFulfillments.userId, role: paymentFulfillments.role, tokenCount: paymentFulfillments.tokenCount, amount: paymentFulfillments.amount, currency: paymentFulfillments.currency, reconciliationReason: paymentFulfillments.reconciliationReason, createdAt: paymentFulfillments.createdAt, userEmail: users.email }).from(paymentFulfillments).innerJoin(users, eq(paymentFulfillments.userId, users.id)).where(inArray(paymentFulfillments.status, ["credited", "refunded"])).orderBy(desc(paymentFulfillments.createdAt)).limit(Math.max(1, Math.min(limit, 250)));
}
export async function revokeCreditedPaymentCredits(adminUserId: number, paymentId: number, note?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    // Lock the fulfillment and wallet in a fixed order. This prevents duplicate
    // revocations and prevents an absolute balance write from erasing a grant
    // that commits concurrently.
    const rows = await tx.select().from(paymentFulfillments).where(and(eq(paymentFulfillments.id, paymentId), inArray(paymentFulfillments.provider, ["chargebee", "razorpay", "paypal"]))).limit(1).for("update");
    const row = rows[0];
    if (!row || row.status !== "credited") throw new Error("Credits cannot be revoked for this payment");
    const wallet = await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, row.userId), eq(tokenBalances.role, row.role))).limit(1).for("update");
    if (!wallet[0] || wallet[0].balance < row.tokenCount) throw new Error("Credits from this payment have been spent; ledger-only revocation is blocked");
    const updated = await tx.update(paymentFulfillments).set({ status: "rejected", reconciliationReason: "credits_revoked_no_provider_refund", lastCheckedAt: new Date() }).where(and(eq(paymentFulfillments.id, paymentId), eq(paymentFulfillments.status, "credited")));
    if (Number(updated[0]?.affectedRows ?? 0) !== 1) throw new Error("Credits cannot be revoked for this payment");
    const debited = await tx.update(tokenBalances).set({ balance: sql`${tokenBalances.balance} - ${row.tokenCount}` }).where(and(eq(tokenBalances.id, wallet[0].id), sql`${tokenBalances.balance} >= ${row.tokenCount}`));
    if (Number(debited[0]?.affectedRows ?? 0) !== 1) throw new Error("Credits from this payment have been spent; ledger-only revocation is blocked");
    await tx.insert(tokenTransactions).values({ userId: row.userId, role: row.role, tokenCount: -row.tokenCount, kind: "admin_adjustment", source: "payment_credit_revocation", referenceType: "payment_fulfillment", referenceId: String(paymentId), idempotencyKey: `payment-revoke-${paymentId}`, balanceAfter: wallet[0].balance - row.tokenCount });
    const metadata = { provider: row.provider, amount: row.amount, currency: row.currency, tokenCount: row.tokenCount, note: typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null };
    await tx.insert(operationalActivityLogs).values({ actorUserId: adminUserId, action: "payment.credits_revoked", outcome: "success", resourceType: "payment_fulfillment", resourceId: String(paymentId), metadata: JSON.stringify(metadata) });
    return { paymentId, creditsRevoked: true, tokenCount: row.tokenCount, userId: row.userId, role: row.role, provider: row.provider, amount: row.amount, currency: row.currency };
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

export type ChargebeeRefundOutcome =
  | { status: "revoked"; paymentId: number; tokenCount: number }
  | { status: "duplicate"; paymentId: number }
  | { status: "review"; paymentId: number; reason: RefundReviewReason; expectedAmount: number; currency: string }
  | { status: "unmatched"; reason: "refund_invoice_unreadable" | "refund_invoice_unknown" };

/**
 * Provider refund policy (founder, Oct 14 2026): a FULL refund of a credited
 * pack payment takes back that payment's credits only if they are all still in
 * the wallet; the balance never goes negative. Anything else (partial refund,
 * credits already spent, unreadable amount) is parked as requires_review with
 * no wallet change so a human decides. One transaction with the fulfillment and
 * wallet rows locked, in the same order as revokeCreditedPaymentCredits. A
 * payment that is no longer credited (parked, closed by review, refunded,
 * rejected, or still waiting for its credit) goes to
 * settleRefundOfNonCreditedPaymentTx: each refund event is recorded once, a
 * redelivered one is a duplicate, and a new one always reaches a human.
 */
export async function applyChargebeePaymentRefund(input: { eventId: string; invoiceId?: string; refundAmount?: number; currency?: string }): Promise<ChargebeeRefundOutcome> {
  if (!input.invoiceId) return { status: "unmatched", reason: "refund_invoice_unreadable" };
  const invoiceId = input.invoiceId;
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const rows = await tx.select().from(paymentFulfillments).where(and(eq(paymentFulfillments.provider, "chargebee"), eq(paymentFulfillments.providerInvoiceId, invoiceId))).limit(1).for("update");
    const row = rows[0];
    if (!row) return { status: "unmatched" as const, reason: "refund_invoice_unknown" as const };
    // Not credited: the refund is recorded once per event and decides what the review may do next; no credit moves there.
    if (row.status !== "credited") return settleRefundOfNonCreditedPaymentTx(tx, row, { eventId: input.eventId, invoiceId, refundAmount: input.refundAmount, currency: input.currency });
    // A replay of a refund recorded while the payment waited for its credit (the admin then added the pack) is not a new refund.
    if (await refundEventRecordedTx(tx, row.id, input.eventId)) return { status: "duplicate" as const, paymentId: row.id };
    const park = async (reason: "refund_partial" | "refund_credits_spent" | "refund_currency_mismatch" | "refund_amount_unreadable") => {
      await tx.update(paymentFulfillments).set({ status: "requires_review", reconciliationReason: reason, lastCheckedAt: new Date() }).where(and(eq(paymentFulfillments.id, row.id), eq(paymentFulfillments.status, "credited")));
      await tx.insert(operationalActivityLogs).values({ actorUserId: row.userId, action: "billing.refund_needs_review", outcome: "failure", resourceType: "payment_fulfillment", resourceId: String(row.id), metadata: JSON.stringify({ reason, eventId: input.eventId, invoiceId, refundAmount: input.refundAmount ?? null, refundCurrency: input.currency ?? null, amount: row.amount, currency: row.currency, tokenCount: row.tokenCount }) });
      return { status: "review" as const, paymentId: row.id, reason, expectedAmount: row.amount, currency: row.currency };
    };
    if (!input.refundAmount) return park("refund_amount_unreadable");
    if (input.currency && input.currency !== row.currency) return park("refund_currency_mismatch");
    if (input.refundAmount < row.amount) return park("refund_partial");
    const wallet = await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, row.userId), eq(tokenBalances.role, row.role))).limit(1).for("update");
    if (!wallet[0] || wallet[0].balance < row.tokenCount) return park("refund_credits_spent");
    const updated = await tx.update(paymentFulfillments).set({ status: "refunded", reconciliationReason: "refunded_by_provider", lastCheckedAt: new Date() }).where(and(eq(paymentFulfillments.id, row.id), eq(paymentFulfillments.status, "credited")));
    if (Number(updated[0]?.affectedRows ?? 0) !== 1) return { status: "duplicate" as const, paymentId: row.id };
    const debited = await tx.update(tokenBalances).set({ balance: sql`${tokenBalances.balance} - ${row.tokenCount}` }).where(and(eq(tokenBalances.id, wallet[0].id), sql`${tokenBalances.balance} >= ${row.tokenCount}`));
    if (Number(debited[0]?.affectedRows ?? 0) !== 1) throw new Error("Refund credit revocation could not debit the wallet");
    await tx.insert(tokenTransactions).values({ userId: row.userId, role: row.role, tokenCount: -row.tokenCount, kind: "admin_adjustment", source: "payment_refund", referenceType: "payment_fulfillment", referenceId: String(row.id), idempotencyKey: `payment-refund-${row.id}`, balanceAfter: wallet[0].balance - row.tokenCount });
    await tx.insert(operationalActivityLogs).values({ actorUserId: row.userId, action: "billing.refund_credits_revoked", outcome: "success", resourceType: "payment_fulfillment", resourceId: String(row.id), metadata: JSON.stringify({ eventId: input.eventId, invoiceId, amount: row.amount, currency: row.currency, tokenCount: row.tokenCount }) });
    return { status: "revoked" as const, paymentId: row.id, tokenCount: row.tokenCount };
  });
}

export async function createChargebeeSubscriptionIntent(input: { hostedPageId: string; checkoutIntentId: string; userId: number; role: WalletRole; plan: BillablePlanId; itemPriceId: string; amount: number; currency: "INR" | "USD"; billingPeriod?: BillingPeriod; kind?: "new" | "change" }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // A kit pass names its term (30d/90d, yearly for Keep warm) so the webhook can
  // refuse a delivery for a different term; the pre-kit body keeps "monthly".
  const result = await db.insert(subscriptionCheckoutIntents).values({ ...input, billingPeriod: input.billingPeriod ?? "monthly", kind: input.kind ?? "new", status: "pending" });
  return { id: Number(result[0].insertId), hostedPageId: input.hostedPageId };
}

/** GO-LIVE-1b: one checkout intent by its hosted page (recovery ownership check). */
export async function getSubscriptionCheckoutIntent(hostedPageId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(subscriptionCheckoutIntents).where(eq(subscriptionCheckoutIntents.hostedPageId, hostedPageId)).limit(1);
  return rows[0];
}

/** GO-LIVE-1b: pending pass checkouts for the hourly reconcile, oldest first. */
export async function listPendingSubscriptionCheckoutIntents(olderThan: Date, newerThan: Date, limit: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(subscriptionCheckoutIntents)
    // An intent parked for human review (failureReason set) is out of the automatic loop:
    // it was already alerted when parked, so re-reading it hourly would only re-alert.
    .where(and(eq(subscriptionCheckoutIntents.status, "pending"), isNull(subscriptionCheckoutIntents.failureReason), lt(subscriptionCheckoutIntents.createdAt, olderThan), gt(subscriptionCheckoutIntents.createdAt, newerThan)))
    .orderBy(asc(subscriptionCheckoutIntents.createdAt), asc(subscriptionCheckoutIntents.id))
    .limit(limit);
}

/** GO-LIVE-1b (QA #359): park a pending intent for human review; it stops re-alerting and is never reported cancelled. */
export async function markSubscriptionCheckoutIntentReview(hostedPageId: string, reviewReason: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(subscriptionCheckoutIntents).set({ failureReason: reviewReason.slice(0, 32) }).where(and(eq(subscriptionCheckoutIntents.hostedPageId, hostedPageId), eq(subscriptionCheckoutIntents.status, "pending"), isNull(subscriptionCheckoutIntents.failureReason)));
}

/** GO-LIVE-1b: an expired checkout page marks its pending intent cancelled; never an activated one. */
export async function markSubscriptionCheckoutIntentCancelled(hostedPageId: string, failureReason: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(subscriptionCheckoutIntents).set({ status: "cancelled", failureReason }).where(and(eq(subscriptionCheckoutIntents.hostedPageId, hostedPageId), eq(subscriptionCheckoutIntents.status, "pending")));
}

export async function applyChargebeeSubscriptionEvent(input: { eventId: string; eventType: string; hostedPageId?: string; passThruContent?: string; subscriptionId: string; plan?: BillablePlanId; itemPriceId?: string; interval?: BillingPeriod; status: string; currency?: "INR" | "USD"; currentTermStart?: Date; currentTermEnd?: Date; resourceVersion?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const duplicate = await tx.select().from(subscriptionEvents).where(and(eq(subscriptionEvents.provider, "chargebee"), eq(subscriptionEvents.providerEventId, input.eventId))).limit(1);
    if (duplicate[0]) {
      if (duplicate[0].subscriptionId !== input.subscriptionId) throw new Error("Duplicate receipt identity conflict");
      if (isRetiredPlanItemPrice(input.itemPriceId)) await enqueueBillingReviewTx(tx, { eventId: input.eventId, eventType: input.eventType, subscriptionId: input.subscriptionId, itemPriceId: input.itemPriceId, reason: "plan_retired" });
      if (isRetiredPlanItemPrice(input.itemPriceId)) return { status: "duplicate" as const };
      // Reconstruct from the original authoritative wallet/checkout identity before acknowledging.
      const receiptIntent = input.hostedPageId && input.passThruContent
        ? (await tx.select().from(subscriptionCheckoutIntents).where(and(eq(subscriptionCheckoutIntents.hostedPageId, input.hostedPageId), eq(subscriptionCheckoutIntents.checkoutIntentId, input.passThruContent))).limit(1).for("update"))[0] : undefined;
      const receiptWallet = (await tx.select().from(tokenBalances).where(eq(tokenBalances.subscriptionId, input.subscriptionId)).limit(1).for("update"))[0];
      if (duplicate[0].subscriptionId !== input.subscriptionId) throw new Error("Duplicate receipt identity conflict");
      const receiptPlan = receiptIntent?.plan ?? input.plan ?? (receiptWallet?.plan !== "free" ? receiptWallet?.plan : undefined);
      if ((receiptWallet || receiptIntent) && (!receiptPlan || !isBillablePlanId(receiptPlan))) {
        await enqueueBillingReviewTx(tx, { eventId: input.eventId, eventType: input.eventType, subscriptionId: input.subscriptionId, itemPriceId: input.itemPriceId, reason: isRetiredPlanId(receiptPlan) ? "plan_retired" : "unsupported_plan" });
      }
      return { status: "duplicate" as const };
    }
    // D-067: an event naming a retired Pro/Max item price grants nothing, whatever wallet or intent it
    // names (even a kit wallet whose subscription was moved to one). Recorded once so a redelivery is a
    // duplicate; the webhook alerts it (plan_retired) so a human cancels and refunds it in Chargebee.
    if (isRetiredPlanItemPrice(input.itemPriceId)) {
      await tx.insert(subscriptionEvents).values({ provider: "chargebee", providerEventId: input.eventId, subscriptionId: input.subscriptionId, resourceVersion: input.resourceVersion, eventType: input.eventType });
      await enqueueBillingReviewTx(tx, { eventId: input.eventId, eventType: input.eventType, subscriptionId: input.subscriptionId, itemPriceId: input.itemPriceId, reason: "plan_retired" });
      return { status: "ignored" as const, reason: PLAN_RETIRED_CODE };
    }

    const intent = input.hostedPageId && input.passThruContent
      ? (await tx.select().from(subscriptionCheckoutIntents).where(and(eq(subscriptionCheckoutIntents.hostedPageId, input.hostedPageId), eq(subscriptionCheckoutIntents.checkoutIntentId, input.passThruContent))).limit(1).for("update"))[0]
      : undefined;
    const walletBySubscription = await tx.select().from(tokenBalances).where(eq(tokenBalances.subscriptionId, input.subscriptionId)).limit(1).for("update");
    if ((input.hostedPageId || input.passThruContent) && !intent) return { status: "ignored" as const, reason: "checkout_intent_mismatch" };
    if (intent && walletBySubscription[0] && (walletBySubscription[0].userId !== intent.userId || walletBySubscription[0].role !== intent.role)) return { status: "ignored" as const, reason: "subscription_owner_mismatch" };
    const wallet = walletBySubscription[0] ?? (intent
      ? (await tx.select().from(tokenBalances).where(and(eq(tokenBalances.userId, intent.userId), eq(tokenBalances.role, intent.role))).limit(1).for("update"))[0]
      : undefined);
    const sameSubscription = wallet?.subscriptionId === input.subscriptionId;
    if (!sameSubscription && intent && intent.status !== "pending") return { status: "ignored" as const, reason: "checkout_already_reconciled" };
    if (wallet && !sameSubscription && (wallet.plan !== "free" || wallet.subscriptionStatus === "active" || wallet.subscriptionStatus === "non_renewing")) return { status: "ignored" as const, reason: "subscription_conflict" };
    if (intent && input.currency && input.currency !== intent.currency) return { status: "ignored" as const, reason: "currency_mismatch" };
    // A pass's term is part of what was bought: a 90-day delivery must never
    // activate the 30-day intent that started it (each term has its own item price).
    if (intent && input.itemPriceId && input.itemPriceId !== intent.itemPriceId) return { status: "ignored" as const, reason: "item_price_mismatch" };
    if (intent && input.interval && input.interval !== intent.billingPeriod) return { status: "ignored" as const, reason: "billing_period_mismatch" };
    const expectedPlan = intent?.plan ?? input.plan ?? (wallet?.plan !== "free" ? wallet?.plan : undefined);
    if (!wallet && !intent) {
      await tx.insert(subscriptionEvents).values({ provider: "chargebee", providerEventId: input.eventId, subscriptionId: input.subscriptionId, resourceVersion: input.resourceVersion, eventType: input.eventType });
      return { status: "ignored" as const, reason: "unknown_subscription" };
    }
    if (intent && input.plan && input.plan !== intent.plan) {
      await tx.insert(subscriptionEvents).values({ provider: "chargebee", providerEventId: input.eventId, subscriptionId: input.subscriptionId, resourceVersion: input.resourceVersion, eventType: input.eventType });
      return { status: "ignored" as const, reason: "plan_mismatch" };
    }
    if (!expectedPlan || !isBillablePlanId(expectedPlan)) {
      await tx.insert(subscriptionEvents).values({ provider: "chargebee", providerEventId: input.eventId, subscriptionId: input.subscriptionId, resourceVersion: input.resourceVersion, eventType: input.eventType });
      // A wallet or intent still stored as Pro/Max is a retired plan (cancel and refund); anything
      // else is a price skipwait.me cannot place, reviewed without a Pro/Max label.
      await enqueueBillingReviewTx(tx, { eventId: input.eventId, eventType: input.eventType, subscriptionId: input.subscriptionId, itemPriceId: input.itemPriceId, reason: isRetiredPlanId(expectedPlan) ? "plan_retired" : "unsupported_plan" });
      return { status: "ignored" as const, reason: isRetiredPlanId(expectedPlan) ? PLAN_RETIRED_CODE : "unsupported_plan" };
    }
    const currentSubscription = sameSubscription ? wallet : undefined;
    if (currentSubscription?.subscriptionResourceVersion && input.resourceVersion && input.resourceVersion <= currentSubscription.subscriptionResourceVersion) {
      await tx.insert(subscriptionEvents).values({ provider: "chargebee", providerEventId: input.eventId, subscriptionId: input.subscriptionId, resourceVersion: input.resourceVersion, eventType: input.eventType });
      return { status: "stale" as const };
    }

    // Plan credits a cycle: the kit plan's own creditsPerMonth. expectedPlan is a
    // catalog plan here: a retired Pro/Max intent or wallet (D-067) stopped above
    // as plan_retired, recorded once and granting nothing.
    const allowance = planEntitlementsFor(expectedPlan).creditsPerMonth;
    const retainsAccess = input.status === "active" || input.status === "non_renewing";
    const startsNewTerm = !currentSubscription?.subscriptionCurrentTermStart || (input.currentTermStart && currentSubscription.subscriptionCurrentTermStart.getTime() !== input.currentTermStart.getTime());
    const userId = wallet?.userId ?? intent!.userId;
    const role = wallet?.role ?? intent!.role;
    const now = new Date();
    // Credit ledger: a webhook-confirmed new term opens a plan cycle (plan_grant row) after the
    // previous cycle's leftover is carried or expired; an update inside the term keeps the cycle.
    const cycle: CyclePatch | undefined = retainsAccess
      ? startsNewTerm
        ? wallet
          ? await rollCycleTx(tx, { wallet, next: termOpeningCycle(input.currentTermStart, input.currentTermEnd, now), plan: expectedPlan, subscriptionId: input.subscriptionId, now })
          : await openCycleTx(tx, { userId, role, next: termOpeningCycle(input.currentTermStart, input.currentTermEnd, now), plan: expectedPlan, subscriptionId: input.subscriptionId })
        : { monthlyAllowance: allowance, monthlyCreditsRemaining: currentSubscription?.monthlyCreditsRemaining ?? allowance, monthlyCycleKey: currentSubscription?.monthlyCycleKey ?? termOpeningCycle(input.currentTermStart, input.currentTermEnd, now).key }
      // The seeker's paid term ended on this subscription: its plan credits end with it (kit billing).
      : role === "job_seeker" && wallet && sameSubscription && wallet.plan !== "free"
        ? await rollCycleTx(tx, { wallet, next: { startsAt: now, key: currentMonthlyCycleKey(now) }, plan: "free", subscriptionId: null, now })
        : undefined;
    const patch = retainsAccess && cycle
      ? {
          plan: expectedPlan,
          ...cycle,
          subscriptionId: input.subscriptionId,
          subscriptionStatus: input.status,
          subscriptionCurrency: input.currency ?? currentSubscription?.subscriptionCurrency ?? null,
          subscriptionCurrentTermStart: input.currentTermStart ?? currentSubscription?.subscriptionCurrentTermStart ?? null,
          subscriptionCurrentTermEnd: input.currentTermEnd ?? currentSubscription?.subscriptionCurrentTermEnd ?? null,
          subscriptionResourceVersion: input.resourceVersion ?? currentSubscription?.subscriptionResourceVersion ?? null,
        }
      : {
          plan: "free" as const,
          ...(cycle ?? {
            monthlyAllowance: FREE_MONTHLY_ALLOWANCE,
            monthlyCreditsRemaining: Math.min(wallet?.monthlyCreditsRemaining ?? FREE_MONTHLY_ALLOWANCE, FREE_MONTHLY_ALLOWANCE),
            monthlyCycleKey: currentMonthlyCycleKey(),
          }),
          subscriptionId: input.subscriptionId,
          subscriptionStatus: input.status,
          subscriptionCurrency: input.currency ?? currentSubscription?.subscriptionCurrency ?? null,
          subscriptionCurrentTermStart: input.currentTermStart ?? currentSubscription?.subscriptionCurrentTermStart ?? null,
          subscriptionCurrentTermEnd: input.currentTermEnd ?? currentSubscription?.subscriptionCurrentTermEnd ?? null,
          subscriptionResourceVersion: input.resourceVersion ?? currentSubscription?.subscriptionResourceVersion ?? null,
        };
    if (wallet) await tx.update(tokenBalances).set(patch).where(eq(tokenBalances.id, wallet.id));
    else await tx.insert(tokenBalances).values({ userId, role, balance: 0, ...patch });
    if (intent) await tx.update(subscriptionCheckoutIntents).set({ status: retainsAccess ? "activated" : "cancelled" }).where(and(eq(subscriptionCheckoutIntents.id, intent.id), eq(subscriptionCheckoutIntents.status, "pending")));
    await tx.insert(subscriptionEvents).values({ provider: "chargebee", providerEventId: input.eventId, subscriptionId: input.subscriptionId, resourceVersion: input.resourceVersion, eventType: input.eventType });
    // First bank-verified subscription earns the same promo grant as a pack
    // purchase. Idempotent: renewals hit the existing grant row and no-op.
    // A pending schema migration degrades loudly without blocking activation.
    if (retainsAccess) {
      try {
        await grantPromoCreditsTx(tx, { userId, role, source: "first_paid_invoice", providerRef: input.subscriptionId, now: new Date() });
      } catch (error) {
        if (!isSchemaMissingError(error)) throw error;
        captureServerError(error, { source: "promo-grant-skipped", userId, role });
        await tx.insert(operationalActivityLogs).values({ actorUserId: userId, action: "promo.grant_skipped_schema_pending", outcome: "failure", resourceType: "promo_credit_grant", metadata: JSON.stringify({ role, providerRef: input.subscriptionId }) });
      }
    }
    return { status: "applied" as const, plan: patch.plan, userId, role, creditSummary: creditSummaryFromWallet({ ...(wallet ?? { userId, role, balance: 0, monthlyCreditsRemaining: allowance, monthlyAllowance: allowance, monthlyCycleKey: currentMonthlyCycleKey(), plan: expectedPlan, subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, id: 0, updatedAt: new Date() }), ...patch }) };
  });
}

// ---- Gift subscriptions: receipts only (D-067) ----
// Gifts only ever sold the monthly Pro and Max plans, which D-067 removed
// completely, so no gift is ever credited to a wallet any more. Every provider
// gift event stays a durable receipt row (giftSubscriptionFulfillments; its plan
// ENUM('pro','max') is storage only). A claimed gift is parked as conflict with
// failureReason plan_retired, which the webhook and the claim route alert so a
// human cancels and refunds it in Chargebee. Nothing here writes a wallet, a
// plan cycle or a ledger row. Rows credited before D-067 stay credited.

export type GiftRecipientResolution =
  | { status: "resolved"; userId: number }
  | { status: "unresolved" | "ambiguous" | "suspended" };

export type RecordGiftEventInput = {
  eventId: string;
  eventType: string;
  giftId: string;
  status: string;
  receiverEmail?: string;
  receiverCustomerId?: string;
  subscriptionId?: string;
  buyerUserId?: number;
  plan?: RetiredPlanId;
  currency?: "INR" | "USD";
  amount?: number;
};

/** Why a gift row stops waiting: no plan can be gifted or claimed any more (D-067). */
const GIFT_RETIRED_REASON = "plan_retired" as const;

function giftTerminalStatus(providerStatus: string): "expired" | "cancelled" | undefined {
  return providerStatus === "expired" ? "expired" : providerStatus === "cancelled" ? "cancelled" : undefined;
}

async function resolveGiftRecipientTx(tx: any, normalizedEmail: string): Promise<GiftRecipientResolution> {
  const aliases = await tx.select({ canonicalPersonId: verifiedLoginAliases.canonicalPersonId }).from(verifiedLoginAliases).where(eq(verifiedLoginAliases.normalizedVerifiedEmail, normalizedEmail)).limit(50);
  if (!aliases.length) return { status: "unresolved" };
  const personIds: number[] = Array.from(new Set(aliases.map((alias: { canonicalPersonId: number }) => alias.canonicalPersonId)));
  const people = await tx.select({ id: canonicalPeople.id, suspended: canonicalPeople.suspended }).from(canonicalPeople).where(inArray(canonicalPeople.id, personIds)).limit(25);
  if (people.some((person: { suspended: boolean }) => person.suspended)) return { status: "suspended" };
  const accounts = await tx.select({ id: users.id, suspended: users.suspended }).from(users).where(inArray(users.canonicalPersonId, personIds)).limit(25);
  const active = accounts.filter((account: { suspended: boolean }) => !account.suspended);
  if (active.length === 1) return { status: "resolved", userId: active[0].id };
  return { status: active.length === 0 ? "unresolved" : "ambiguous" };
}

async function verifiedEmailsForUserTx(tx: any, userId: number): Promise<string[]> {
  const account = (await tx.select({ canonicalPersonId: users.canonicalPersonId }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!account?.canonicalPersonId) return [];
  const aliases = await tx.select({ normalizedVerifiedEmail: verifiedLoginAliases.normalizedVerifiedEmail }).from(verifiedLoginAliases).where(eq(verifiedLoginAliases.canonicalPersonId, account.canonicalPersonId)).limit(50);
  return Array.from(new Set(aliases.map((alias: { normalizedVerifiedEmail: string | null }) => alias.normalizedVerifiedEmail).filter((email: string | null): email is string => !!email)));
}

/**
 * The receipt row for a provider gift event. A claimed gift is parked as plan_retired in the same write; nothing is credited.
 * `parked` is true only for the call that moved the row to plan_retired (the webhook alerts once per gift on it); a
 * redelivery, a gift credited before D-067 and a terminal (expired/cancelled) gift park nothing.
 */
export async function recordGiftProviderEvent(input: RecordGiftEventInput) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const existing = (await tx.select().from(giftSubscriptionFulfillments).where(eq(giftSubscriptionFulfillments.giftId, input.giftId)).limit(1).for("update"))[0];
    const terminal = giftTerminalStatus(input.status);
    const claimed = input.status === "claimed";
    if (!existing) {
      await tx.insert(giftSubscriptionFulfillments).values({
        giftId: input.giftId, buyerUserId: input.buyerUserId ?? null, receiverEmail: input.receiverEmail ?? null,
        plan: input.plan ?? null, currency: input.currency ?? null, amount: input.amount ?? null,
        subscriptionId: input.subscriptionId ?? null, providerStatus: input.status,
        fulfillmentStatus: terminal ?? (claimed ? "conflict" : "pending"),
        failureReason: terminal ? `provider_${terminal}` : claimed ? GIFT_RETIRED_REASON : null,
      });
      const inserted = (await tx.select().from(giftSubscriptionFulfillments).where(eq(giftSubscriptionFulfillments.giftId, input.giftId)).limit(1))[0];
      if (!terminal && claimed) await enqueueBillingReviewTx(tx, { giftId: input.giftId, subscriptionId: input.subscriptionId, eventId: input.eventId, eventType: input.eventType, reason: isRetiredPlanId(input.plan) ? "gift_claimed" : "unsupported_plan" });
      return { ...inserted, parked: !terminal && claimed };
    }
    if (existing.fulfillmentStatus === "credited") return { ...existing, parked: false };
    const patch: Record<string, unknown> = { providerStatus: input.status };
    if (!existing.subscriptionId && input.subscriptionId) patch.subscriptionId = input.subscriptionId;
    if (!existing.receiverEmail && input.receiverEmail) patch.receiverEmail = input.receiverEmail;
    if (!existing.plan && input.plan) patch.plan = input.plan;
    if (!existing.currency && input.currency) patch.currency = input.currency;
    if ((existing.amount ?? null) === null && typeof input.amount === "number") patch.amount = input.amount;
    if (existing.buyerUserId === null && typeof input.buyerUserId === "number") patch.buyerUserId = input.buyerUserId;
    if (terminal && (existing.fulfillmentStatus === "pending" || existing.fulfillmentStatus === "conflict")) {
      patch.fulfillmentStatus = terminal;
      patch.failureReason = `provider_${terminal}`;
    }
    const parked = !terminal && claimed && existing.fulfillmentStatus === "pending";
    if (parked) {
      patch.fulfillmentStatus = "conflict";
      patch.failureReason = GIFT_RETIRED_REASON;
    }
    await tx.update(giftSubscriptionFulfillments).set(patch).where(eq(giftSubscriptionFulfillments.id, existing.id));
    if (parked || existing.failureReason === GIFT_RETIRED_REASON) await enqueueBillingReviewTx(tx, { giftId: input.giftId, subscriptionId: input.subscriptionId ?? existing.subscriptionId ?? undefined, eventId: input.eventId, eventType: input.eventType, reason: isRetiredPlanId(input.plan ?? existing.plan) ? "gift_claimed" : "unsupported_plan" });
    return { ...existing, ...patch, parked };
  });
}

/**
 * POST /api/chargebee/gifts/claim. Only the verified recipient may claim, and a
 * claim never credits anything (D-067): a still-pending gift is parked as
 * plan_retired and the answer is "retired" (`parked` says whether this call
 * moved it, so the route alerts once per gift); a gift credited before D-067 is
 * a duplicate. No wallet, plan cycle or ledger row is ever written here.
 */
export async function claimGiftSubscription(callerUserId: number, giftId: string): Promise<{ status: "retired"; giftId: string; parked: boolean } | { status: "duplicate" }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const row = (await tx.select().from(giftSubscriptionFulfillments).where(eq(giftSubscriptionFulfillments.giftId, giftId)).limit(1).for("update"))[0];
    if (!row) throw new Error("We could not find this gift");
    if (row.fulfillmentStatus === "credited") return { status: "duplicate" as const };
    if (!row.receiverEmail) throw new Error("This gift is not ready to claim yet");
    const resolution = await resolveGiftRecipientTx(tx, row.receiverEmail);
    if (resolution.status !== "resolved" || resolution.userId !== callerUserId) throw new Error("This gift was sent to a different email address");
    const parked = row.fulfillmentStatus === "pending";
    if (parked) await tx.update(giftSubscriptionFulfillments).set({ fulfillmentStatus: "conflict", failureReason: GIFT_RETIRED_REASON }).where(and(eq(giftSubscriptionFulfillments.id, row.id), eq(giftSubscriptionFulfillments.fulfillmentStatus, "pending")));
    if (parked || row.failureReason === GIFT_RETIRED_REASON) await enqueueBillingReviewTx(tx, { giftId: row.giftId, subscriptionId: row.subscriptionId ?? undefined, reason: isRetiredPlanId(row.plan) ? "gift_claim_refused" : "unsupported_plan" });
    return { status: "retired" as const, giftId: row.giftId, parked };
  });
}

export async function listBuyerGifts(buyerUserId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(giftSubscriptionFulfillments).where(eq(giftSubscriptionFulfillments.buyerUserId, buyerUserId)).limit(100);
  return rows.sort((a, b) => b.id - a.id).map(row => ({ giftId: row.giftId, plan: row.plan, currency: row.currency, amount: row.amount, receiverEmail: row.receiverEmail, providerStatus: row.providerStatus, fulfillmentStatus: row.fulfillmentStatus, subscriptionId: row.subscriptionId, creditedAt: row.creditedAt, createdAt: row.createdAt }));
}

export async function listClaimableGiftsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const emails = await db.transaction(async tx => verifiedEmailsForUserTx(tx, userId));
  if (!emails.length) return [];
  const rows = await db.select().from(giftSubscriptionFulfillments).where(inArray(giftSubscriptionFulfillments.receiverEmail, emails)).limit(100);
  return rows
    .filter(row => row.fulfillmentStatus === "pending" && row.providerStatus === "claimed")
    .sort((a, b) => b.id - a.id)
    .map(row => ({ giftId: row.giftId, plan: row.plan, currency: row.currency, amount: row.amount, subscriptionId: row.subscriptionId, receiverEmail: row.receiverEmail, createdAt: row.createdAt }));
}

// ---- Unified admin approval queue (seeker requests, referrer enrollments, payments) ----

export type AdminApprovalQueueKind = "referral_request" | "referrer_enrollment" | "payment" | "employer_application";
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
    companyName?: string | null;
    billingEmail?: string | null;
    duplicatePersonCount?: number | null;
    duplicateDomainCount?: number | null;
    evidenceVersion?: string | null;
    reviewDueAt?: Date | null;
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
  const [requests, payments, enrollments, enrollmentDecisions, employerApplications] = await Promise.all([
    db.select({ id: referralRequests.id, status: referralRequests.status, companyDomain: jobs.company, referrerId: referralRequests.referrerId, waitingForCoverage: referralRequests.waitingForCoverage, personalPitch: referralRequests.personalPitch, createdAt: referralRequests.createdAt, updatedAt: referralRequests.updatedAt, roleTitle: jobs.title, targetRoleUrl: jobs.targetRoleUrl, seekerName: users.name, seekerEmail: users.email, referrerName: referrerUser.name, referrerEmail: referrerUser.email }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).innerJoin(users, eq(referralRequests.jobSeekerId, users.id)).leftJoin(referrerUser, eq(referralRequests.referrerId, referrerUser.id)).where(inArray(referralRequests.status, ["pending", "approved", "declined"])).orderBy(desc(referralRequests.updatedAt)).limit(safeLimit),
    db.select({ id: paymentFulfillments.id, provider: paymentFulfillments.provider, amount: paymentFulfillments.amount, currency: paymentFulfillments.currency, tokenCount: paymentFulfillments.tokenCount, status: paymentFulfillments.status, reconciliationReason: paymentFulfillments.reconciliationReason, role: paymentFulfillments.role, createdAt: paymentFulfillments.createdAt, lastCheckedAt: paymentFulfillments.lastCheckedAt, creditedAt: paymentFulfillments.creditedAt, userEmail: users.email }).from(paymentFulfillments).innerJoin(users, eq(paymentFulfillments.userId, users.id)).where(inArray(paymentFulfillments.status, ["requires_review", "credited", "rejected"])).orderBy(desc(paymentFulfillments.lastCheckedAt), desc(paymentFulfillments.createdAt)).limit(safeLimit),
    listReferrerEnrollmentsAwaitingAction(),
    db.select({ resourceId: operationalActivityLogs.resourceId, action: operationalActivityLogs.action, metadata: operationalActivityLogs.metadata, createdAt: operationalActivityLogs.createdAt }).from(operationalActivityLogs).where(and(eq(operationalActivityLogs.resourceType, "referrer_enrollment"), like(operationalActivityLogs.action, "admin.approval_%"))).orderBy(desc(operationalActivityLogs.createdAt)).limit(safeLimit),
    db.select({ id: employerAccounts.id, userId: employerAccounts.userId, companyName: employerAccounts.companyName, billingEmail: employerAccounts.billingEmail, status: employerAccounts.approvalStatus, submittedAt: employerAccounts.submittedAt, updatedAt: employerAccounts.updatedAt, evidenceVersion: employerAccounts.evidenceVersion, applicationVersion: employerAccounts.applicationVersion }).from(employerAccounts).orderBy(desc(employerAccounts.submittedAt)).limit(safeLimit),
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
  for (const application of employerApplications) {
    const domain = application.billingEmail.split("@")[1] ?? "";
    const duplicatePersonCount = employerApplications.filter(other => other.userId === application.userId && other.id !== application.id).length;
    const duplicateDomainCount = domain ? employerApplications.filter(other => other.id !== application.id && other.billingEmail.endsWith(`@${domain}`)).length : 0;
    items.push({ kind:"employer_application", id:application.id, status:application.status === "approved" ? "approved" : application.status === "rejected" || application.status === "revoked" ? "declined" : application.status === "pending" ? "pending" : "under_review", companyDomain:domain, createdAt:application.submittedAt, updatedAt:application.updatedAt, summary:`${application.companyName} employer access application`, meta:{ companyName:application.companyName, billingEmail:application.billingEmail, duplicatePersonCount, duplicateDomainCount, evidenceVersion:application.evidenceVersion, reviewDueAt:new Date(application.submittedAt.getTime()+24*60*60*1000) } });
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
  if (itemKind === "employer_application") {
    return db.transaction(async tx => {
      const row=(await tx.select().from(employerAccounts).where(eq(employerAccounts.id,itemId)).limit(1).for("update"))[0];
      if(!row) throw new Error("This employer application could not be found");
      const target=decision === "approved" ? "approved" : "rejected";
      if(row.approvalStatus === target) return { kind:itemKind,id:itemId,status:target === "approved" ? "approved" as const : "declined" as const,replayed:true };
      if(row.approvalStatus !== "pending") throw new Error("This record was already resolved");
      const now=new Date(); const updated=await tx.update(employerAccounts).set({approvalStatus:target,approvedAt:target === "approved" ? now:null,approvedByUserId:adminUserId,decidedAt:now,decisionNote:trimmedNote}).where(and(eq(employerAccounts.id,itemId),eq(employerAccounts.approvalStatus,"pending")));
      if(Number(updated[0]?.affectedRows??0)!==1) throw new Error("This record was already resolved");
      if(target !== "approved"){ await tx.update(profileUnlocks).set({revokedAt:now,revocationReason:"employer_access_rejected"}).where(and(eq(profileUnlocks.employerUserId,row.userId),isNull(profileUnlocks.revokedAt))); await tx.update(employerTalentRefs).set({revokedAt:now}).where(and(eq(employerTalentRefs.employerUserId,row.userId),isNull(employerTalentRefs.revokedAt))); }
      await tx.insert(operationalActivityLogs).values({actorUserId:adminUserId,action:`admin.employer_${target}`,outcome:"success",resourceType:"employer_application",resourceId:String(itemId),companyDomain:row.billingEmail.split("@")[1],metadata:JSON.stringify({note:trimmedNote,evidenceVersion:row.evidenceVersion,applicationVersion:row.applicationVersion})});
      await tx.insert(notifications).values({userId:row.userId,category:"system",title:`Employer access ${target}`,body:target === "approved" ? "Your employer workspace is approved." : "Your employer application was not approved. Review the note and resubmit corrected evidence.",eventKey:`employer-application:${itemId}:${row.applicationVersion}:${target}`}).onDuplicateKeyUpdate({set:{eventKey:`employer-application:${itemId}:${row.applicationVersion}:${target}`}});
      return {kind:itemKind,id:itemId,status:target === "approved" ? "approved" as const : "declined" as const};
    });
  }
  if (itemKind === "payment") {
    // Approving a credit pack credits the tokens, mirroring the payment review
    // workflow; the row's own audit entry is written by the resolver.
    const result = await resolveRequiresReviewPayment(adminUserId, itemId, decision === "approved" ? "credited" : "rejected", trimmedNote ?? undefined);
    return { kind: itemKind, id: itemId, status: decision === "approved" ? "approved" as const : "declined" as const, tokenCount: result.tokenCount };
  }
  return db.transaction(async tx => {
    // Locked read: a claim landing between this read and the update cannot slip past the claimed check (D-012 item 3).
    const rows = await tx.select({ id: referralRequests.id, status: referralRequests.status, referrerId: referralRequests.referrerId, companyDomain: jobs.company }).from(referralRequests).innerJoin(jobs, eq(referralRequests.jobId, jobs.id)).where(eq(referralRequests.id, itemId)).limit(1).for("update");
    const row = rows[0];
    if (!row) throw new Error("This referral request could not be found");
    const nextStatus = decideAdminReferralApproval(row, decision);
    const updated = await tx.update(referralRequests).set({ status: nextStatus }).where(and(eq(referralRequests.id, itemId), eq(referralRequests.status, "pending"), ...(nextStatus === "approved" ? [isNull(referralRequests.referrerId)] : [])));
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

const firstSkillKeywords = (skills: string | null) => (skills ?? "").split(/[,;|]/).map(skill => skill.trim()).filter(Boolean).slice(0, 5);

export async function ensureEmployerAccount(userId: number, companyName: string, billingEmail: string) {
  const name=companyName.trim().slice(0,160); const email=billingEmail.trim().toLowerCase().slice(0,320);
  if(!name) throw new Error("Add your company name to open an employer account"); if(!email||!email.includes("@")) throw new Error("Add a billing email for your employer account");
  const db=await getDb();if(!db)throw new Error("Database unavailable");
  return db.transaction(async tx=>{ const existing=(await tx.select().from(employerAccounts).where(eq(employerAccounts.userId,userId)).limit(1).for("update"))[0]; if(!existing){await tx.insert(employerAccounts).values({userId,companyName:name,billingEmail:email,approvalStatus:"pending",submittedAt:new Date()});return (await tx.select().from(employerAccounts).where(eq(employerAccounts.userId,userId)).limit(1))[0];} const changed=existing.companyName!==name||existing.billingEmail!==email; if(!changed)return existing; const now=new Date(); await tx.update(employerAccounts).set({companyName:name,billingEmail:email,approvalStatus:"pending",submittedAt:now,decidedAt:null,decisionNote:null,approvedAt:null,approvedByUserId:null,applicationVersion:existing.applicationVersion+1}).where(eq(employerAccounts.id,existing.id)); await tx.update(profileUnlocks).set({revokedAt:now,revocationReason:"employer_application_changed"}).where(and(eq(profileUnlocks.employerUserId,userId),isNull(profileUnlocks.revokedAt))); await tx.update(employerTalentRefs).set({revokedAt:now}).where(and(eq(employerTalentRefs.employerUserId,userId),isNull(employerTalentRefs.revokedAt))); return (await tx.select().from(employerAccounts).where(eq(employerAccounts.id,existing.id)).limit(1))[0]; });
}
export async function getEmployerAccount(userId: number) {
  const db = await getDb(); if (!db) return undefined;
  return (await db.select().from(employerAccounts).where(eq(employerAccounts.userId, userId)).limit(1))[0];
}

// Talent access is an additive, approved capability. A typed company or
// billing address never grants it and existing seeker/referrer roles survive.
export async function isEmployer(userId: number) {
  const db = await getDb(); if (!db) return false;
  const row = await db.select({ status: employerAccounts.approvalStatus }).from(employerAccounts).where(and(eq(employerAccounts.userId, userId), eq(employerAccounts.approvalStatus, "approved"))).limit(1);
  return row[0]?.status === "approved";
}

export const TALENT_CONSENT_POLICY_VERSION = "2026-09-18.1";
export const TALENT_CONSENT_RETENTION_DAYS = 90;
export const TALENT_UNLOCK_DAYS = 30;
export const TALENT_DISCLOSABLE_FIELDS = ["headline", "location", "skills", "experience", "expertise"] as const;
export type TalentDisclosedField = typeof TALENT_DISCLOSABLE_FIELDS[number];
const TALENT_CONSENT_AUDIENCE = "approved employers on skipwait.me";
const TALENT_CONSENT_PURPOSE = "anonymous talent discovery and employer introduction requests";
const TALENT_CONTACT_FLOW = "Employers spend credits to unlock the approved snapshot and may request an introduction; the seeker chooses whether to respond.";

const asTalentFields = (fields: string[]) => Array.from(new Set(fields)).filter((field): field is TalentDisclosedField => TALENT_DISCLOSABLE_FIELDS.includes(field as TalentDisclosedField));
const coarseLocation = (value: string | null) => value?.split(",").slice(-2).join(",").trim().slice(0, 120) || null;
const coarseExperience = (value: string | null) => {
  if (!value) return null;
  const year = value.match(/(\d{1,2})\s*\+?\s*years?/i)?.[1];
  if (!year) return "Experience shared";
  const n = Number(year); return n < 3 ? "0-2 years" : n < 6 ? "3-5 years" : n < 11 ? "6-10 years" : "10+ years";
};
const talentSnapshot = (profile: { headline: string | null; location: string | null; skills: string | null; experience: string | null; expertise: string | null }, fields: TalentDisclosedField[]) => {
  const snapshot: Record<string, unknown> = {};
  if (fields.includes("headline")) snapshot.headline = profile.headline;
  if (fields.includes("location")) snapshot.location = coarseLocation(profile.location);
  if (fields.includes("skills")) snapshot.skills = firstSkillKeywords(profile.skills);
  if (fields.includes("experience")) snapshot.experience = coarseExperience(profile.experience);
  if (fields.includes("expertise")) snapshot.expertise = firstSkillKeywords(profile.expertise);
  return snapshot;
};

export function getTalentConsentPreview() {
  return { policyVersion: TALENT_CONSENT_POLICY_VERSION, availableFields: [...TALENT_DISCLOSABLE_FIELDS], audience: TALENT_CONSENT_AUDIENCE, purpose: TALENT_CONSENT_PURPOSE, retentionDays: TALENT_CONSENT_RETENTION_DAYS, contactFlow: TALENT_CONTACT_FLOW, paidUnlockInvolved: true, unlockCreditCost: EMPLOYER_UNLOCK_CREDIT_COST, unlockDays: TALENT_UNLOCK_DAYS };
}

async function latestActiveTalentConsent(db: any, seekerUserId: number) {
  const latest = (await db.select().from(talentDiscoveryConsents).where(eq(talentDiscoveryConsents.seekerUserId, seekerUserId)).orderBy(desc(talentDiscoveryConsents.id)).limit(1))[0];
  return latest?.grantedAt && !latest.revokedAt && latest.policyVersion === TALENT_CONSENT_POLICY_VERSION ? latest : undefined;
}

export async function getTalentConsentState(seekerUserId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const profile = await getProfileByUserId(seekerUserId);
  const latest = (await db.select().from(talentDiscoveryConsents).where(eq(talentDiscoveryConsents.seekerUserId, seekerUserId)).orderBy(desc(talentDiscoveryConsents.id)).limit(1))[0];
  const history = await db.select({ id: talentDiscoveryConsents.id, policyVersion: talentDiscoveryConsents.policyVersion, disclosedFields: talentDiscoveryConsents.disclosedFields, source: talentDiscoveryConsents.source, grantedAt: talentDiscoveryConsents.grantedAt, revokedAt: talentDiscoveryConsents.revokedAt, revocationReason: talentDiscoveryConsents.revocationReason }).from(talentDiscoveryConsents).where(eq(talentDiscoveryConsents.seekerUserId, seekerUserId)).orderBy(desc(talentDiscoveryConsents.id)).limit(50);
  const active = Boolean(profile?.accountType === "job_seeker" && profile.isOnboarded && latest?.grantedAt && !latest.revokedAt && latest.policyVersion === TALENT_CONSENT_POLICY_VERSION);
  return { ...getTalentConsentPreview(), active, selectedFields: latest ? JSON.parse(latest.disclosedFields) : [], history };
}

export async function grantTalentDiscoveryConsent(seekerUserId: number, input: { policyVersion: string; disclosedFields: string[]; source: string }) {
  if (input.policyVersion !== TALENT_CONSENT_POLICY_VERSION) throw new Error("Review the current talent-discovery consent before opting in");
  const fields = asTalentFields(input.disclosedFields); if (!fields.length) throw new Error("Choose at least one field to share");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const account = (await tx.select({ suspended: users.suspended }).from(users).where(eq(users.id, seekerUserId)).limit(1).for("update"))[0];
    const profile = (await tx.select().from(profiles).where(eq(profiles.userId, seekerUserId)).limit(1).for("update"))[0];
    if (!account || account.suspended || !profile || profile.accountType !== "job_seeker" || !profile.isOnboarded) throw new Error("Complete an active Job Seeker profile before opting in");
    await tx.update(talentDiscoveryConsents).set({ revokedAt: new Date(), revocationReason: "replaced_by_new_consent" }).where(and(eq(talentDiscoveryConsents.seekerUserId, seekerUserId), isNull(talentDiscoveryConsents.revokedAt)));
    const result = await tx.insert(talentDiscoveryConsents).values({ seekerUserId, policyVersion: TALENT_CONSENT_POLICY_VERSION, disclosedFields: JSON.stringify(fields), audience: TALENT_CONSENT_AUDIENCE, purpose: TALENT_CONSENT_PURPOSE, retentionDays: TALENT_CONSENT_RETENTION_DAYS, contactFlow: TALENT_CONTACT_FLOW, paidUnlockInvolved: true, source: input.source.slice(0,80), grantedAt: new Date() });
    await tx.update(profiles).set({ anonymityOptIn: true }).where(eq(profiles.userId, seekerUserId));
    return { active: true, consentId: Number(result[0].insertId), disclosedFields: fields };
  });
}

export async function revokeTalentDiscoveryConsent(seekerUserId: number, reason = "seeker_opt_out") {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const now = new Date();
    await tx.select({ id: users.id }).from(users).where(eq(users.id, seekerUserId)).limit(1).for("update");
    await tx.update(talentDiscoveryConsents).set({ revokedAt: now, revocationReason: reason.slice(0,255) }).where(and(eq(talentDiscoveryConsents.seekerUserId, seekerUserId), isNull(talentDiscoveryConsents.revokedAt)));
    await tx.update(profileUnlocks).set({ revokedAt: now, revocationReason: reason.slice(0,255) }).where(and(eq(profileUnlocks.seekerProfileUserId, seekerUserId), isNull(profileUnlocks.revokedAt)));
    await tx.update(employerTalentRefs).set({ revokedAt: now }).where(and(eq(employerTalentRefs.seekerProfileUserId, seekerUserId), isNull(employerTalentRefs.revokedAt)));
    await tx.update(profiles).set({ anonymityOptIn: false }).where(eq(profiles.userId, seekerUserId));
    return { active: false };
  });
}

export async function listTalentAccessHistory(seekerUserId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.select({ id: profileUnlocks.id, employerUserId: profileUnlocks.employerUserId, employerCompanyName: profileUnlocks.employerCompanyName, consentPolicyVersion: profileUnlocks.consentPolicyVersion, disclosedFields: profileUnlocks.disclosedFields, unlockedAt: profileUnlocks.unlockedAt, expiresAt: profileUnlocks.expiresAt, revokedAt: profileUnlocks.revokedAt, revocationReason: profileUnlocks.revocationReason }).from(profileUnlocks).where(eq(profileUnlocks.seekerProfileUserId, seekerUserId)).orderBy(desc(profileUnlocks.id)).limit(100);
}

export async function revokeTalentEmployerAccess(seekerUserId: number, employerUserId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => { const now = new Date(); await tx.update(profileUnlocks).set({ revokedAt: now, revocationReason: "seeker_revoked_employer" }).where(and(eq(profileUnlocks.seekerProfileUserId, seekerUserId), eq(profileUnlocks.employerUserId, employerUserId), isNull(profileUnlocks.revokedAt))); await tx.update(employerTalentRefs).set({ revokedAt: now }).where(and(eq(employerTalentRefs.seekerProfileUserId, seekerUserId), eq(employerTalentRefs.employerUserId, employerUserId), isNull(employerTalentRefs.revokedAt))); return { revoked: true }; });
}

export async function spendEmployerUnlockCredit(employerUserId: number, seekerUserId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const now = new Date();
    const account = (await tx.select().from(employerAccounts).where(eq(employerAccounts.userId, employerUserId)).limit(1).for("update"))[0];
    const employer = (await tx.select({ suspended: users.suspended }).from(users).where(eq(users.id, employerUserId)).limit(1))[0];
    const seeker = (await tx.select({ suspended: users.suspended }).from(users).where(eq(users.id, seekerUserId)).limit(1).for("update"))[0];
    const profile = (await tx.select().from(profiles).where(eq(profiles.userId, seekerUserId)).limit(1).for("update"))[0];
    const consent = await latestActiveTalentConsent(tx, seekerUserId);
    if (!account || account.approvalStatus !== "approved" || employer?.suspended) return { ok: false as const, reason: "no_employer_account" as const, credits: account?.credits ?? 0 };
    if (!seeker || seeker.suspended || !profile || !profile.anonymityOptIn || !profile.isOnboarded || !consent) return { ok: false as const, reason: "consent_withdrawn" as const, credits: account.credits };
    const active = (await tx.select({ id: profileUnlocks.id }).from(profileUnlocks).where(and(eq(profileUnlocks.employerUserId, employerUserId), eq(profileUnlocks.seekerProfileUserId, seekerUserId), eq(profileUnlocks.consentId, consent.id), isNull(profileUnlocks.revokedAt), gt(profileUnlocks.expiresAt, now))).limit(1))[0];
    if (active) return { ok: true as const, remaining: account.credits, alreadyUnlocked: true as const };
    if (account.creditDebt > 0) return { ok: false as const, reason: "credit_debt" as const, credits: account.credits };
    if (account.credits < EMPLOYER_UNLOCK_CREDIT_COST) return { ok: false as const, reason: "insufficient_credits" as const, credits: account.credits };
    const fields = asTalentFields(JSON.parse(consent.disclosedFields)); const snapshot = talentSnapshot(profile, fields); const expiresAt = new Date(now.getTime() + TALENT_UNLOCK_DAYS*86400000);
    const debited = await tx.update(employerAccounts).set({ credits: sql`${employerAccounts.credits} - ${EMPLOYER_UNLOCK_CREDIT_COST}` }).where(and(eq(employerAccounts.id, account.id), sql`${employerAccounts.credits} >= ${EMPLOYER_UNLOCK_CREDIT_COST}`));
    if (Number((debited as any)[0]?.affectedRows ?? 0) !== 1) return { ok: false as const, reason: "insufficient_credits" as const, credits: account.credits };
    await tx.insert(profileUnlocks).values({ employerUserId, seekerProfileUserId: seekerUserId, consentId: consent.id, consentPolicyVersion: consent.policyVersion, employerCompanyName: account.companyName, disclosedFields: JSON.stringify(fields), profileVersion: profile.updatedAt, profileSnapshot: JSON.stringify(snapshot), expiresAt, creditsSpent: EMPLOYER_UNLOCK_CREDIT_COST });
    return { ok: true as const, remaining: account.credits - EMPLOYER_UNLOCK_CREDIT_COST };
  });
}

export type AnonymizedSeekerProfile = { displayRef: string; headline: string | null; location: string | null; skills: string[]; isUnlocked: boolean };
async function ensureTalentRef(employerUserId: number, seekerUserId: number, consentId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const existing = await db.select({ publicRef: employerTalentRefs.publicRef }).from(employerTalentRefs).where(and(eq(employerTalentRefs.employerUserId, employerUserId), eq(employerTalentRefs.seekerProfileUserId, seekerUserId), eq(employerTalentRefs.consentId, consentId), isNull(employerTalentRefs.revokedAt))).limit(1);
  if (existing[0]) return existing[0].publicRef;
  const publicRef = `tal_${randomBytes(18).toString("base64url")}`;
  await db.insert(employerTalentRefs).values({ employerUserId, seekerProfileUserId: seekerUserId, publicRef, consentId }); return publicRef;
}
export async function resolveEmployerTalentRef(employerUserId: number, publicRef: string) {
  if (!/^tal_[A-Za-z0-9_-]{20,60}$/.test(publicRef)) return undefined; const db = await getDb(); if (!db) return undefined;
  const row = await db.select({ seekerUserId: employerTalentRefs.seekerProfileUserId, consentId: employerTalentRefs.consentId }).from(employerTalentRefs).innerJoin(profiles, eq(profiles.userId, employerTalentRefs.seekerProfileUserId)).innerJoin(users, eq(users.id, employerTalentRefs.seekerProfileUserId)).innerJoin(talentDiscoveryConsents, eq(talentDiscoveryConsents.id, employerTalentRefs.consentId)).where(and(eq(employerTalentRefs.employerUserId, employerUserId), eq(employerTalentRefs.publicRef, publicRef), isNull(employerTalentRefs.revokedAt), eq(profiles.accountType,"job_seeker"), eq(profiles.anonymityOptIn,true), eq(profiles.isOnboarded,true), eq(users.suspended,false), eq(talentDiscoveryConsents.policyVersion,TALENT_CONSENT_POLICY_VERSION), isNull(talentDiscoveryConsents.revokedAt), isNotNull(talentDiscoveryConsents.grantedAt))).limit(1); return row[0]?.seekerUserId;
}
export async function listAnonymizedSeekerProfiles(employerUserId: number, input: { query?: string; location?: string } = {}) {
  const db = await getDb(); if (!db || !(await isEmployer(employerUserId))) return [] as AnonymizedSeekerProfile[];
  const rows = await db.select({ userId: profiles.userId, headline: profiles.headline, location: profiles.location, skills: profiles.skills, experience: profiles.experience }).from(profiles).innerJoin(users, eq(users.id, profiles.userId)).where(and(eq(profiles.accountType,"job_seeker"),eq(profiles.anonymityOptIn,true),eq(profiles.isOnboarded,true),eq(users.suspended,false)));
  const term=input.query?.trim().toLowerCase(), locationTerm=input.location?.trim().toLowerCase(); const out: AnonymizedSeekerProfile[]=[];
  for (const row of rows) { const consent=await latestActiveTalentConsent(db,row.userId); if(!consent) continue; const fields=asTalentFields(JSON.parse(consent.disclosedFields)); const snap=talentSnapshot({ ...row, expertise:null },fields) as any; if(term && `${snap.headline??""} ${(snap.skills??[]).join(" ")} ${snap.experience??""}`.toLowerCase().includes(term)===false) continue; if(locationTerm && String(snap.location??"").toLowerCase().includes(locationTerm)===false) continue; const active=(await db.select({id:profileUnlocks.id}).from(profileUnlocks).where(and(eq(profileUnlocks.employerUserId,employerUserId),eq(profileUnlocks.seekerProfileUserId,row.userId),eq(profileUnlocks.consentId,consent.id),isNull(profileUnlocks.revokedAt),gt(profileUnlocks.expiresAt,new Date()))).limit(1))[0]; out.push({displayRef:await ensureTalentRef(employerUserId,row.userId,consent.id),headline:snap.headline??null,location:snap.location??null,skills:snap.skills??[],isUnlocked:Boolean(active)}); if(out.length>=60) break; } return out;
}
export async function getUnlockedProfile(employerUserId:number,seekerUserId:number){ const db=await getDb();if(!db||!(await isEmployer(employerUserId)))return undefined; const account=(await db.select({suspended:users.suspended}).from(users).where(eq(users.id,seekerUserId)).limit(1))[0]; if(!account||account.suspended)return undefined; const grant=(await db.select().from(profileUnlocks).where(and(eq(profileUnlocks.employerUserId,employerUserId),eq(profileUnlocks.seekerProfileUserId,seekerUserId),isNull(profileUnlocks.revokedAt),gt(profileUnlocks.expiresAt,new Date()))).orderBy(desc(profileUnlocks.id)).limit(1))[0]; if(!grant)return undefined; const consent=await latestActiveTalentConsent(db,seekerUserId);if(!consent||consent.id!==grant.consentId)return undefined; return {...JSON.parse(grant.profileSnapshot),unlockedAt:grant.unlockedAt,expiresAt:grant.expiresAt}; }
export async function requestEmployerTalentIntro(employerUserId:number,seekerUserId:number){ const db=await getDb();if(!db)throw new Error("Database unavailable"); return db.transaction(async tx=>{ const now=new Date(); const employer=(await tx.select({suspended:users.suspended}).from(users).where(eq(users.id,employerUserId)).limit(1))[0]; const seeker=(await tx.select({suspended:users.suspended}).from(users).where(eq(users.id,seekerUserId)).limit(1).for("update"))[0]; const account=(await tx.select({status:employerAccounts.approvalStatus}).from(employerAccounts).where(eq(employerAccounts.userId,employerUserId)).limit(1))[0]; const grant=(await tx.select().from(profileUnlocks).where(and(eq(profileUnlocks.employerUserId,employerUserId),eq(profileUnlocks.seekerProfileUserId,seekerUserId),isNull(profileUnlocks.revokedAt),gt(profileUnlocks.expiresAt,now))).orderBy(desc(profileUnlocks.id)).limit(1).for("update"))[0]; const consent=await latestActiveTalentConsent(tx,seekerUserId); if(!employer||employer.suspended||!seeker||seeker.suspended||account?.status!=="approved"||!grant||!consent||grant.consentId!==consent.id)return {ok:false as const,reason:"grant_inactive" as const}; try{await tx.insert(employerTalentIntroRequests).values({employerUserId,seekerProfileUserId:seekerUserId});return {ok:true as const,created:true as const};}catch(error){if((error as any).code==="ER_DUP_ENTRY")return {ok:true as const,created:false as const};throw error;} }); }

export async function sponsorCompanyOpportunity(userId: number, opportunityId: number, input: { tier: SponsorTier; idempotencyKey: string; isAdmin?: boolean; chargedUserId?: number }) {
  const tierCost = SPONSOR_TIERS[input.tier];
  if (!tierCost) throw new Error("Choose a featured or spotlight sponsorship tier");
  if (!/^[\x21-\x7E]{16,64}$/.test(input.idempotencyKey)) throw new Error("A valid Idempotency-Key header is required");
  const chargedUserId = input.chargedUserId ?? userId;
  if (input.isAdmin && input.chargedUserId === undefined) throw new Error("Administrator sponsorship must name the charged wallet owner");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const opportunity = (await tx.select().from(companyOpportunities).where(eq(companyOpportunities.id, opportunityId)).limit(1).for("update"))[0];
    if (!opportunity) throw new Error("This opportunity could not be found");
    if (!opportunity.isActive) throw new Error("This opportunity is not active and publishable");
    if (!input.isAdmin && opportunity.ownerId !== userId) throw new Error("Only the opportunity owner or an administrator can sponsor this role");
    if (!input.isAdmin && chargedUserId !== opportunity.ownerId) throw new Error("The opportunity owner wallet must fund this sponsorship");
    const replay = (await tx.select().from(opportunitySponsorshipPurchases).where(and(eq(opportunitySponsorshipPurchases.chargedUserId, chargedUserId), eq(opportunitySponsorshipPurchases.idempotencyKey, input.idempotencyKey))).limit(1).for("update"))[0];
    if (replay) {
      if (replay.opportunityId !== opportunityId || replay.tier !== input.tier) throw new Error("Idempotency-Key is already bound to a different sponsorship");
      const account = (await tx.select({ credits: employerAccounts.credits }).from(employerAccounts).where(eq(employerAccounts.userId, chargedUserId)).limit(1))[0];
      return { opportunityId, tier: replay.tier, sponsoredUntil: replay.endsAt, creditsSpent: replay.creditsSpent, credits: account?.credits ?? 0, replayed: true };
    }
    const account = (await tx.select().from(employerAccounts).where(eq(employerAccounts.userId, chargedUserId)).limit(1).for("update"))[0];
    if (!account) throw new Error("Open an employer account before sponsoring a role");
    if (account.creditDebt > 0) throw new Error("Refunded credit debt must be resolved before further spending");
    if (account.credits < tierCost.cost) throw new Error(`Sponsoring costs ${tierCost.cost} unlock credits; you have ${account.credits}`);
    const purchasedAt = new Date();
    const startsAt = opportunity.sponsoredUntil && opportunity.sponsoredUntil > purchasedAt ? opportunity.sponsoredUntil : purchasedAt;
    const sponsoredUntil = new Date(startsAt.getTime() + tierCost.days * 24 * 60 * 60 * 1000);
    // Claim the immutable purchase before the debit. A duplicate-key race rolls
    // this transaction back, so only one request can charge this key.
    await tx.insert(opportunitySponsorshipPurchases).values({ idempotencyKey: input.idempotencyKey, opportunityId, opportunityOwnerId: opportunity.ownerId, chargedUserId, actorUserId: userId, tier: input.tier, creditsSpent: tierCost.cost, startsAt, endsAt: sponsoredUntil, opportunityUpdatedAt: opportunity.updatedAt });
    const debited = await tx.update(employerAccounts).set({ credits: sql`${employerAccounts.credits} - ${tierCost.cost}` }).where(and(eq(employerAccounts.id, account.id), sql`${employerAccounts.credits} >= ${tierCost.cost}`));
    if (Number(debited[0]?.affectedRows ?? 0) !== 1) throw new Error("Not enough unlock credits for this sponsorship");
    const placed = await tx.update(companyOpportunities).set({ sponsoredUntil, sponsoredTier: input.tier }).where(and(eq(companyOpportunities.id, opportunityId), eq(companyOpportunities.isActive, true), eq(companyOpportunities.updatedAt, opportunity.updatedAt)));
    if (Number(placed[0]?.affectedRows ?? 0) !== 1) throw new Error("This opportunity changed while sponsorship was being purchased");
    const credits = account.credits - tierCost.cost;
    const metadata: Record<string, string | number> = { tier: input.tier, days: tierCost.days, creditsSpent: tierCost.cost, creditsRemaining: credits, chargedUserId, opportunityOwnerId: opportunity.ownerId, idempotencyKey: input.idempotencyKey };
    await tx.insert(operationalActivityLogs).values({ actorUserId: userId, action: "employer.opportunity_sponsored", outcome: "success", resourceType: "opportunity", resourceId: String(opportunityId), companyDomain: opportunity.companyDomain, metadata: JSON.stringify(metadata) });
    return { opportunityId, tier: input.tier, sponsoredUntil, creditsSpent: tierCost.cost, credits, replayed: false };
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

// D-040: a paid placement never buys priority. Employee posts stay newest-first
// and sponsored rows follow in their own labeled "Featured listing" slot; the
// sponsorship flag is carried for that label only. Pure, so the ordering
// contract is testable without a database.
export function orderOpportunitiesOrganicFirst<T extends { createdAt?: Date | string; sponsoredUntil?: Date | string | null }>(rows: T[]): T[] {
  const now = Date.now();
  const time = (value?: Date | string | null) => (value ? new Date(value).getTime() : 0);
  const featured = (row: T) => Boolean(row.sponsoredUntil && time(row.sponsoredUntil) > now);
  return [...rows].sort((a, b) => {
    const aFeatured = featured(a);
    const bFeatured = featured(b);
    if (aFeatured !== bFeatured) return aFeatured ? 1 : -1;
    return time(b.createdAt) - time(a.createdAt);
  });
}

export async function listPublicCompanyOpportunitiesWithSponsorship() {
  const db = await getDb(); if (!db) return [];
  const base = { id: companyOpportunities.id, companyDomain: companyOpportunities.companyDomain, kind: companyOpportunities.kind, roleTitle: companyOpportunities.roleTitle, targetRoleUrl: companyOpportunities.targetRoleUrl, location: companyOpportunities.location, walkInAt: companyOpportunities.walkInAt, walkInEndsAt: companyOpportunities.walkInEndsAt, createdAt: companyOpportunities.createdAt };
  // The poster join feeds ONLY the opt-in-gated first-name projection; owner
  // name/email never leave this function on a public row.
  const attempt = async () => db.select({ ...base, compensation: companyOpportunities.compensation, sponsoredUntil: companyOpportunities.sponsoredUntil, sponsoredTier: companyOpportunities.sponsoredTier, showPosterFirstName: companyOpportunities.showPosterFirstName, ownerName: users.name, ownerEmail: users.email }).from(companyOpportunities).innerJoin(users, eq(users.id, companyOpportunities.ownerId)).where(liveOpportunityCondition()).orderBy(desc(companyOpportunities.createdAt)).limit(24);
  try {
    const rows = await attempt();
    const now = Date.now();
    return orderOpportunitiesOrganicFirst(rows).map(row => ({ id: row.id, companyDomain: row.companyDomain, kind: row.kind, roleTitle: row.roleTitle, targetRoleUrl: row.targetRoleUrl, location: row.location, compensation: row.compensation, walkInAt: row.walkInAt, walkInEndsAt: row.walkInEndsAt, createdAt: row.createdAt, isSponsored: Boolean(row.sponsoredUntil && new Date(row.sponsoredUntil).getTime() > now), poster: opportunityPosterOf(row) }));
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

// A local checkout intent is durable before any provider call. Replays bind to
// one immutable user/pack/amount fingerprint and one deterministic receipt.
export async function prepareUnlockCreditCheckout(input: { checkoutKey:string; userId:number; pack:UnlockCreditPackId; amount:number; currency:string }) {
  const expected=UNLOCK_CREDIT_PACKS[input.pack]; if(!expected||input.amount!==expected.amountInPaise||input.currency.toUpperCase()!=="INR") throw new Error("Checkout does not match the selected pack");
  if(!/^[\x21-\x7E]{16,64}$/.test(input.checkoutKey)) throw new Error("A valid Idempotency-Key header is required");
  const fingerprint=createHash("sha256").update(`${input.userId}|${input.pack}|${input.amount}|INR`).digest("hex"); const providerReceipt=`sw_${createHash("sha256").update(`${input.userId}|${input.checkoutKey}`).digest("hex").slice(0,32)}`;
  const db=await getDb();if(!db)throw new Error("Database unavailable"); try{await db.insert(employerPaymentFulfillments).values({provider:"razorpay",providerOrderId:null,checkoutKey:input.checkoutKey,fingerprint,providerReceipt,userId:input.userId,pack:input.pack,amount:input.amount,currency:"INR",status:"creating"});}catch(error){if(!isDuplicateKey(error))throw error;}
  return db.transaction(async tx=>{const intent=(await tx.select().from(employerPaymentFulfillments).where(and(eq(employerPaymentFulfillments.userId,input.userId),eq(employerPaymentFulfillments.checkoutKey,input.checkoutKey))).limit(1).for("update"))[0];if(!intent||intent.fingerprint!==fingerprint)throw new Error("Idempotency-Key is already bound to a different credit pack");if(intent.providerOrderId)return {...intent,action:"bound" as const};const now=new Date();if(intent.status==="provider_create_in_progress"&&intent.createLeaseExpiresAt&&intent.createLeaseExpiresAt>now)return {...intent,action:"busy" as const};if(!["creating","provider_create_in_progress"].includes(intent.status))return {...intent,action:"blocked" as const};const leaseOwner=randomUUID();const leaseExpiresAt=new Date(now.getTime()+30_000);await tx.update(employerPaymentFulfillments).set({status:"provider_create_in_progress",createLeaseOwner:leaseOwner,createLeaseExpiresAt:leaseExpiresAt,attemptCount:sql`${employerPaymentFulfillments.attemptCount}+1`}).where(eq(employerPaymentFulfillments.id,intent.id));return {...intent,status:"provider_create_in_progress",createLeaseOwner:leaseOwner,createLeaseExpiresAt:leaseExpiresAt,action:intent.status==="provider_create_in_progress"?"reconcile" as const:"create" as const};});
}
export async function markUnlockCheckoutRequiresReview(intentId:number,reason:string){const db=await getDb();if(!db)throw new Error("Database unavailable");await db.update(employerPaymentFulfillments).set({status:"requires_review",lastError:reason,createLeaseOwner:null,createLeaseExpiresAt:null}).where(eq(employerPaymentFulfillments.id,intentId));}

export async function bindUnlockCreditProviderOrder(input:{intentId:number;orderId:string;amount:number;currency:string;leaseOwner?:string}){
  const db=await getDb();if(!db)throw new Error("Database unavailable"); return db.transaction(async tx=>{const intent=(await tx.select().from(employerPaymentFulfillments).where(eq(employerPaymentFulfillments.id,input.intentId)).limit(1).for("update"))[0];if(!intent)throw new Error("Checkout intent not found");if(intent.providerOrderId){if(intent.providerOrderId!==input.orderId)throw new Error("Checkout intent is bound to another provider order");return intent;}if(intent.status!=="provider_create_in_progress"||intent.amount!==input.amount||intent.currency!==input.currency.toUpperCase())throw new Error("Provider order does not match checkout intent");const changed=await tx.update(employerPaymentFulfillments).set({providerOrderId:input.orderId,status:"pending",createLeaseOwner:null,createLeaseExpiresAt:null}).where(and(eq(employerPaymentFulfillments.id,input.intentId),eq(employerPaymentFulfillments.status,"provider_create_in_progress"),eq(employerPaymentFulfillments.createLeaseOwner,input.leaseOwner??""),isNull(employerPaymentFulfillments.providerOrderId)));if(Number(changed[0]?.affectedRows??0)!==1)throw new Error("Checkout intent binding lost its claim");return {...intent,providerOrderId:input.orderId,status:"pending" as const};});
}

// Verified captures are fulfilled in one database transaction. The guarded
// pending->processing transition is the single winner for concurrent retries;
// credits and the terminal state commit together, so a crash rolls both back.
export async function fulfillUnlockCreditPurchase(input: { paymentId: string; orderId: string; userId: number; pack: UnlockCreditPackId; amount: number; currency: string }) {
  const expected = UNLOCK_CREDIT_PACKS[input.pack];
  if (!expected) return { status: "requires_review" as const, reason: "unknown_pack" };
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const intent = (await tx.select().from(employerPaymentFulfillments).where(and(eq(employerPaymentFulfillments.provider, "razorpay"), eq(employerPaymentFulfillments.providerOrderId, input.orderId))).limit(1))[0];
    if (!intent) return { status: "requires_review" as const, reason: "unknown_order" };
    if (intent.status === "credited") return intent.providerPaymentId === input.paymentId ? { status: "duplicate" as const, creditsAdded: expected.credits } : { status: "requires_review" as const, reason: "order_already_paid" };
    const exact = intent.userId === input.userId && intent.pack === input.pack && intent.amount === input.amount && intent.currency === input.currency.toUpperCase() && input.amount === expected.amountInPaise;
    if (!exact) {
      await tx.update(employerPaymentFulfillments).set({ status: "requires_review", providerPaymentId: input.paymentId, lastError: "capture_does_not_match_order" }).where(and(eq(employerPaymentFulfillments.id, intent.id), eq(employerPaymentFulfillments.status, "pending")));
      return { status: "requires_review" as const, reason: "capture_does_not_match_order" };
    }
    const claimed = await tx.update(employerPaymentFulfillments).set({ status: "processing", providerPaymentId: input.paymentId, attemptCount: sql`${employerPaymentFulfillments.attemptCount} + 1`, lastError: null }).where(and(eq(employerPaymentFulfillments.id, intent.id), eq(employerPaymentFulfillments.status, "pending"), isNull(employerPaymentFulfillments.providerPaymentId)));
    if (Number(claimed[0]?.affectedRows ?? 0) !== 1) {
      const current = (await tx.select().from(employerPaymentFulfillments).where(eq(employerPaymentFulfillments.id, intent.id)).limit(1))[0];
      return current?.status === "credited" && current.providerPaymentId === input.paymentId ? { status: "duplicate" as const, creditsAdded: expected.credits } : { status: "busy" as const };
    }
    const credited = await tx.update(employerAccounts).set({ credits: sql`${employerAccounts.credits} + ${expected.credits}` }).where(eq(employerAccounts.userId, intent.userId));
    if (Number(credited[0]?.affectedRows ?? 0) !== 1) throw new Error("Employer account unavailable for captured payment");
    const done = await tx.update(employerPaymentFulfillments).set({ status: "credited", creditedAt: new Date() }).where(and(eq(employerPaymentFulfillments.id, intent.id), eq(employerPaymentFulfillments.status, "processing"), eq(employerPaymentFulfillments.providerPaymentId, input.paymentId)));
    if (Number(done[0]?.affectedRows ?? 0) !== 1) throw new Error("Captured payment fulfillment lost its claim");
    await tx.insert(operationalActivityLogs).values({ actorUserId: intent.userId, action: "employer.unlock_credits_fulfilled", outcome: "success", resourceType: "employer_unlock_purchase", resourceId: input.paymentId, metadata: JSON.stringify({ orderId: input.orderId, pack: input.pack, creditsAdded: expected.credits }) });
    return { status: "credited" as const, creditsAdded: expected.credits };
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
  const unlockRows = unlocks.map(row => ({ kind: "profile_unlock" as const, creditsSpent: row.creditsSpent, displayRef: "Access record", createdAt: row.createdAt }));
  return [...sponsorRows, ...creditRows, ...unlockRows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
}

// Verified provider refunds reverse the cumulative proportional credit amount.
// Rounding is cumulative floor(refunded paise * pack credits / captured paise),
// so split partial refunds converge exactly to the full-pack credit total.
export async function applyEmployerUnlockRefund(input:{refundId:string;paymentId:string;orderId?:string;amount:number;currency:string}){
  if(!input.refundId||!input.paymentId||!Number.isInteger(input.amount)||input.amount<=0)return {status:"requires_review" as const,reason:"invalid_refund"};
  const db=await getDb();if(!db)throw new Error("Database unavailable");return db.transaction(async tx=>{
    const duplicate=(await tx.select().from(employerPaymentRefunds).where(and(eq(employerPaymentRefunds.provider,"razorpay"),eq(employerPaymentRefunds.providerRefundId,input.refundId))).limit(1))[0];if(duplicate)return {status:duplicate.status,creditsReversed:duplicate.creditsReversed,duplicate:true};
    const intent=(await tx.select().from(employerPaymentFulfillments).where(and(eq(employerPaymentFulfillments.provider,"razorpay"),eq(employerPaymentFulfillments.providerPaymentId,input.paymentId))).limit(1).for("update"))[0];
    if(!intent){await tx.insert(employerPaymentRefunds).values({provider:"razorpay",providerRefundId:input.refundId,providerPaymentId:input.paymentId,providerOrderId:input.orderId??null,amount:input.amount,currency:input.currency.toUpperCase(),creditsReversed:0,status:"requires_review",reason:"refund_before_capture_or_unknown_payment"});return {status:"requires_review" as const,reason:"refund_before_capture_or_unknown_payment"};}
    const cumulative=intent.refundedAmount+input.amount;if(input.currency.toUpperCase()!==intent.currency||cumulative>intent.amount){await tx.insert(employerPaymentRefunds).values({provider:"razorpay",providerRefundId:input.refundId,providerPaymentId:input.paymentId,providerOrderId:input.orderId??intent.providerOrderId,fulfillmentId:intent.id,amount:input.amount,currency:input.currency.toUpperCase(),creditsReversed:0,status:"requires_review",reason:"refund_amount_or_currency_mismatch"});await tx.update(employerPaymentFulfillments).set({status:"requires_review",lastError:"refund_amount_or_currency_mismatch"}).where(eq(employerPaymentFulfillments.id,intent.id));return {status:"requires_review" as const,reason:"refund_amount_or_currency_mismatch"};}
    const pack=UNLOCK_CREDIT_PACKS[intent.pack];const totalCredits=Math.floor(cumulative*pack.credits/intent.amount);const delta=totalCredits-intent.refundedCredits;if(delta<0)throw new Error("Refund credit ledger moved backwards");
    const account=(await tx.select().from(employerAccounts).where(eq(employerAccounts.userId,intent.userId)).limit(1).for("update"))[0];if(!account)throw new Error("Employer account missing for refund");
    const available=Math.max(0,account.credits);const consumed=Math.min(available,delta);const debt=delta-consumed;await tx.update(employerAccounts).set({credits:account.credits-consumed,creditDebt:account.creditDebt+debt}).where(eq(employerAccounts.id,account.id));
    await tx.update(employerPaymentFulfillments).set({refundedAmount:cumulative,refundedCredits:totalCredits,lastError:debt?"refunded_credits_already_spent":null}).where(eq(employerPaymentFulfillments.id,intent.id));
    await tx.insert(employerPaymentRefunds).values({provider:"razorpay",providerRefundId:input.refundId,providerPaymentId:input.paymentId,providerOrderId:input.orderId??intent.providerOrderId,fulfillmentId:intent.id,amount:input.amount,currency:intent.currency,creditsReversed:delta,status:"applied",reason:debt?"credit_debt_recorded":null});
    if(debt){await tx.update(profileUnlocks).set({revokedAt:new Date(),revocationReason:"refunded_employer_credits_review"}).where(and(eq(profileUnlocks.employerUserId,intent.userId),isNull(profileUnlocks.revokedAt)));}
    await tx.insert(operationalActivityLogs).values({actorUserId:intent.userId,action:"employer.unlock_credits_refunded",outcome:"success",resourceType:"employer_unlock_refund",resourceId:input.refundId,metadata:JSON.stringify({paymentId:input.paymentId,refundAmount:input.amount,cumulativeRefunded:cumulative,creditsReversed:delta,creditDebt:debt})});return {status:"applied" as const,creditsReversed:delta,creditDebt:debt};
  });
}

/**
 * Read-only rows for the admin billing ledger (GET /api/admin/billing/ledger).
 * Three bounded SELECTs by time window; no writes, no joins to PII tables.
 * Each source is fetched with limit+1 so the caller can tell when it was cut.
 */
export async function listBillingLedgerRows(window: { since: Date; until: Date; limit: number }) {
  const db = await getDb();
  if (!db) return undefined;
  const take = window.limit + 1;
  const intents = await db.select({ checkoutIntentId: subscriptionCheckoutIntents.checkoutIntentId, hostedPageId: subscriptionCheckoutIntents.hostedPageId, userId: subscriptionCheckoutIntents.userId, role: subscriptionCheckoutIntents.role, plan: subscriptionCheckoutIntents.plan, itemPriceId: subscriptionCheckoutIntents.itemPriceId, amount: subscriptionCheckoutIntents.amount, currency: subscriptionCheckoutIntents.currency, status: subscriptionCheckoutIntents.status, createdAt: subscriptionCheckoutIntents.createdAt })
    .from(subscriptionCheckoutIntents).where(and(gte(subscriptionCheckoutIntents.createdAt, window.since), lt(subscriptionCheckoutIntents.createdAt, window.until))).orderBy(asc(subscriptionCheckoutIntents.createdAt)).limit(take);
  const payments = await db.select({ id: paymentFulfillments.id, provider: paymentFulfillments.provider, providerEventId: paymentFulfillments.providerEventId, providerInvoiceId: paymentFulfillments.providerInvoiceId, providerHostedPageId: paymentFulfillments.providerHostedPageId, checkoutIntentId: paymentFulfillments.checkoutIntentId, userId: paymentFulfillments.userId, role: paymentFulfillments.role, tokenCount: paymentFulfillments.tokenCount, amount: paymentFulfillments.amount, currency: paymentFulfillments.currency, status: paymentFulfillments.status, reconciliationReason: paymentFulfillments.reconciliationReason, lastCheckedAt: paymentFulfillments.lastCheckedAt, creditedAt: paymentFulfillments.creditedAt, createdAt: paymentFulfillments.createdAt })
    .from(paymentFulfillments).where(and(gte(paymentFulfillments.createdAt, window.since), lt(paymentFulfillments.createdAt, window.until))).orderBy(asc(paymentFulfillments.createdAt)).limit(take);
  const transactions = await db.select({ id: tokenTransactions.id, userId: tokenTransactions.userId, role: tokenTransactions.role, tokenCount: tokenTransactions.tokenCount, kind: tokenTransactions.kind, source: tokenTransactions.source, referenceType: tokenTransactions.referenceType, referenceId: tokenTransactions.referenceId, idempotencyKey: tokenTransactions.idempotencyKey, reversesTransactionId: tokenTransactions.reversesTransactionId, balanceAfter: tokenTransactions.balanceAfter, createdAt: tokenTransactions.createdAt })
    .from(tokenTransactions).where(and(gte(tokenTransactions.createdAt, window.since), lt(tokenTransactions.createdAt, window.until))).orderBy(asc(tokenTransactions.createdAt)).limit(take);
  const parked = await db.select({ id: operationalActivityLogs.id, action: operationalActivityLogs.action, resourceId: operationalActivityLogs.resourceId, metadata: operationalActivityLogs.metadata, createdAt: operationalActivityLogs.createdAt })
    .from(operationalActivityLogs).where(and(inArray(operationalActivityLogs.action, ["billing.payment_unmatched", "billing.refund_needs_review"]), gte(operationalActivityLogs.createdAt, window.since), lt(operationalActivityLogs.createdAt, window.until))).orderBy(asc(operationalActivityLogs.createdAt)).limit(take);
  return { intents, payments, transactions, parked };
}


export async function getReferrerHome(userId: number, now: Date = new Date()) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const profile = await getProfileByUserId(userId);
  const verified = Boolean(profile?.workEmailDomain && isVerifiedEmployeeOfCompany(profile, profile.workEmailDomain));
  let used = 0, waiting = 0, expiringSoon = 0;
  if (verified) {
    const claimed = await db.select({ requestId: referralTransitionEvents.referralRequestId }).from(referralTransitionEvents).where(and(eq(referralTransitionEvents.actorUserId, userId), gte(referralTransitionEvents.createdAt, monthStartUtc(now)), or(eq(referralTransitionEvents.action, "claim"), eq(referralTransitionEvents.action, "approve"), and(eq(referralTransitionEvents.action, "review"), eq(referralTransitionEvents.resultingStatus, "approved"))))).groupBy(referralTransitionEvents.referralRequestId);
    used = claimed.length;
    const fresh = await listCompanyReferralInboxByState(userId, "new");
    waiting = fresh.length;
    expiringSoon = fresh.filter(row => { const at = row.expiresAt ? Date.parse(row.expiresAt) : NaN; return Number.isFinite(at) && at - now.getTime() <= 86_400_000 && at > now.getTime(); }).length;
  }
  return buildReferrerHome({ verified, paused: Boolean(profile?.paused), capacity: profile?.referralCapacity ?? 3, usedThisMonth: used, waiting, expiringSoon });
}


export async function getAccountPreferences(userId: number) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const row = (await db.select({ timeZone: accountPreferences.timeZone, dateFormat: accountPreferences.dateFormat }).from(accountPreferences).where(eq(accountPreferences.userId, userId)).limit(1))[0];
  return { timeZone: row?.timeZone ?? null, dateFormat: (row?.dateFormat ?? null) as "dmy" | "mdy" | "iso" | null };
}

export async function saveAccountPreferences(userId: number, patch: { timeZone?: string | null; dateFormat?: "dmy" | "mdy" | "iso" | null }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const set: { timeZone?: string | null; dateFormat?: string | null } = {};
  if (patch.timeZone !== undefined) set.timeZone = patch.timeZone;
  if (patch.dateFormat !== undefined) set.dateFormat = patch.dateFormat;
  await db.insert(accountPreferences).values({ userId, timeZone: set.timeZone ?? null, dateFormat: set.dateFormat ?? null }).onDuplicateKeyUpdate({ set });
  return getAccountPreferences(userId);
}
