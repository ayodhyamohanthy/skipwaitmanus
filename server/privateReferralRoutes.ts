import { setRetryAfter } from "./retryAfter";
import { publicOutboundOrigin } from "./_core/authPostGuard";
import { dispatchReferralReviewDeliveries } from "./referralReviewDispatch";
import { buildClaimedAskDetailView, claimResponseView } from "./referrerAskView";
import { isOpenAskAttachment, toLockedAskAttachment } from "../shared/referrerAskView";
import { captureServerError } from "./sentry";
import { isPaymentReviewRefusal } from "./paymentRefundReview";
import { paymentReviewRequestSchema, type PaymentReviewDecision, type PaymentReviewOutcome } from "../shared/paymentReview";
import { normalizeReferenceId, REFERENCE_ID_ERROR } from "../shared/referenceId";
import { OTP_RESEND_COOLDOWN_SECONDS, OtpLockedError } from "./otpPolicy";
import { isPassReasonCode, passReasonSeekerLabel } from "../shared/passReasons";
import { randomUUID } from "node:crypto";
import { resolveTrustedClientIp } from "./_core/trustedClientIp";
import { createDecipheriv } from "node:crypto";
import express, { type Express, type Request, type Response as ExpressResponse } from "express";
import { validatePrivateDocument } from "./documentValidation";
import { getLastReconcileError, getLastReconcileResults, isSchemaReconciled, reconcileSchema } from "./schemaReconcile";
import { publicAskRef } from "./askRef";
import { getOrCreateReferralShareCard, getOwnedResumeAttachmentForPitch, getPrivateReferrerImpactSummary, getPublicReferralShareCard, listMyPaymentReceipts, listSeekerAlerts, createSeekerAlert, setSeekerAlertPaused, deleteSeekerAlert, revokeReferralShareCard, listCreditLedger, getMyProfile, getReferrerPreferences, listReferrerThankYous } from "./db";
import type { ReferrerImpactSummary } from "./db";
import { draftSmartReferralPitch } from "./ai";
import { sendReferrerReviewEmail } from "./referrerReviewEmail";
import { createReferrerSlackDeliverySender, isValidSlackIncomingWebhookUrl, sendReferrerSlackDelivery } from "./referrerSlackDelivery";
import { sendSlotOpenedAlertEmail } from "./slotOpenedAlertEmail";
import sharp from "sharp";
import { getAskShelfLifeEndsAtMs, isReferralProgressUpdateStatus, REFERRED_DEADLINE_ENABLED, type ReferralProgressUpdateStatus, type ReferralStatus } from "../shared/referral";
import { getBlockedRequestIds as defaultBlockedRequestIds } from "./blocksRoutes";
import { attachCompanyIdentities, getCompanyDirectoryEntry as defaultCompanyDirectoryEntry, notifySeekerAlertsForCompanyDomain, resolveCompanyIdentities, type CompanyIdentityLookup } from "./companyDirectory";
import { askJobFunctionInputSchema, withParsedJobFunction, type JobFunction } from "../shared/jobFunctions";
import { companyCapReachedSchema, type OpenAskSlots } from "../shared/openAskSlots";
import { askWorkItemIdsSchema, dedupeAskWorkItemIds } from "../shared/askWorkItems";
import { CompanyCapReachedError, CoverageOpenedUpError, OpenAskSlotCapError, PlanLimitError } from "./planGates";
import { BlockedPersonalLinkError } from "./blockedPairs";
import { creditLedgerQuerySchema, creditLedgerResponseSchema, type CreditLedgerEntry } from "../shared/creditLedger";
import type { ReferrerAccessResponse } from "../shared/referrerAccess";
import { resolveAskNote } from "../shared/askNote";
import { landedJourneyRequestSchema, type LandedJourneyRequest, type LandedJourneyState, type ReferrerThankYouWall } from "../shared/landedJourney";
import { isOpportunityExpired, myOpportunitiesResponseSchema, opportunityAskSelectionSchema, OPPORTUNITY_TTL_MS } from "../shared/companyOpportunities";
import type { AskInviteMine } from "../shared/askInvites";

type Account = { id: number; openId: string; role?: "user" | "admin" };
type EmailAddress = { emailAddress: string; verification?: { status?: string } | null };
type Identity = { account: Account; primaryEmail?: EmailAddress | null; emailAddresses?: EmailAddress[] };
type Attachment = { id: number; fileName: string; mimeType: string; fileSize: number; fileKey?: string };
type PrivateNotification = { id: number; category: "referral" | "message" | "status" | "system"; title: string; body: string; readAt: Date | null; createdAt: Date; kind?: string | null; refId?: number | null };

export type PrivateReferralRouteDeps = {
  resolveIdentity: (req: Request) => Promise<Identity | undefined>;
  dataUrlToBuffer: (dataUrl: string) => Buffer;
  sanitizeDocumentName: (fileName: string) => string;
  storagePut: (key: string, data: Buffer, mimeType: string) => Promise<{ key: string }>;
  storageGetSignedUrl: (key: string) => Promise<string>;
  // Direct server-side chunk read for upload reassembly. Preferred over
  // fetching the signed URL: the DB fallback resolves to a relative
  // /api/documents/by-key route that server-side fetch cannot parse (and
  // staging keys are not yet authorized on that route anyway). Optional so
  // existing injected-dependency callers keep working via the fetch fallback.
  storageGetBytes?: (key: string) => Promise<Buffer | Uint8Array | undefined>;
  createReferralAttachment: (ownerId: number, input: { fileName: string; fileKey: string; mimeType: string; fileSize: number }) => Promise<Attachment>;
  getAccessibleReferralAttachment: (userId: number, attachmentId: number) => Promise<(Attachment & { ownerId: number; referrerId?: number | null; referralRequestId?: number | null }) | undefined>;
  createResumeUploadSession?: (ownerId: number, input: { sessionId?: string; fileName: string; mimeType: string; expectedSize: number }) => Promise<{ id: string }>;
  getResumeUploadSession?: (ownerId: number, sessionId: string) => Promise<{ id: string; fileName: string; mimeType: string; expectedSize: number; receivedSize: number; nextChunkIndex: number; status: "active" | "finalizing" | "completed" | "failed"; attachmentId: number | null; chunks: Array<{ chunkIndex: number; storageKey: string; byteSize: number }> } | undefined>;
  appendResumeUploadChunk?: (ownerId: number, input: { sessionId: string; chunkIndex: number; storageKey: string; byteSize: number }) => Promise<{ nextChunkIndex: number; receivedSize: number; alreadyStored: boolean }>;
  claimResumeUploadFinalization?: (ownerId: number, sessionId: string, finalizationOwner: string) => Promise<{ outcome: "missing" | "claimed" | "finalizing" | "completed"; session?: { attachmentId: number | null } }>;
  clearUnattachedResumeUploads?: (ownerId: number) => Promise<{ cleared: number; fileKeys: string[] }>;
  completeResumeUploadSession?: (ownerId: number, sessionId: string, finalizationOwner: string, input: { fileName: string; fileKey: string; mimeType: string; fileSize: number }) => Promise<Attachment>;
  saveVerifiedWorkEmail: (userId: number, email: string) => Promise<{ workEmailDomain?: string | null } | undefined>;
  getVerifiedWorkEmailAccess?: (userId: number) => Promise<{ workEmailDomain: string } | undefined>;
  getMyProfile?: typeof getMyProfile;
  getReferrerPreferences?: typeof getReferrerPreferences;
  getPrivateReferrerImpactSummary?: (userId: number) => Promise<{ reviewed: number; approved: number; introductions: number; interviews: number; offers: number }>;
  getReferrerImpactSummary?: (userId: number) => Promise<ReferrerImpactSummary>;
  getOwnedResumeAttachmentForPitch?: (userId: number, attachmentId: number) => Promise<{ id: number; fileKey: string; mimeType: string }>;
  draftSmartReferralPitch?: (input: { companyDomain: string; targetRoleUrl: string; resumeUrl?: string; resumeMimeType?: string }) => Promise<string>;
  getOrCreateReferralShareCard?: (userId: number, requestId: number) => Promise<{ shareToken: string; companyDomain: string; status: ReferralStatus; isActive: boolean }>;
  revokeReferralShareCard?: (userId: number, requestId: number) => Promise<{ revoked: boolean }>;
  getPublicReferralShareCard?: (shareToken: string) => Promise<{ companyDomain: string; status: ReferralStatus; inviteCode?: string | null } | undefined>;
  getCompanyDirectoryEntry?: (slug: string) => Promise<{ name: string; domains: string[] } | undefined>;
  createCompanyReferralRequest: (userId: number, input: { selectedCompany?: { name: string; domains: string[] }; targetRoleUrl: string; personalPitch: string; attachmentIds: number[]; idempotencyKey: string; confirmedCompanyDomain?: string; compensation?: string; fastTrackCode?: string; fastTrackCompanySlug?: string; fastTrackAlias?: string; jobFunction?: JobFunction; submittedTargetRoleUrl?: string; opportunityId?: number }) => Promise<{ requestId: number; companyDomain: string; jobFunction?: string | null; notifiedEmployees: number; coverageStatus?: "covered" | "waiting_for_company_coverage"; remainingTokens?: number; coverageInviteCode?: string; creditSummary?: unknown; slots?: OpenAskSlots; fastTrack?: boolean; fromPost?: boolean; firstLook?: boolean; replayed?: boolean }>;
  getOrCreateReferrerFastTrackLink?: (userId: number) => Promise<{ linkCode: string; vanityAlias: string; companyDomain: string; isActive: boolean }>;
  getPublicReferrerFastTrackLink?: (linkCode: string) => Promise<{ companyDomain: string; isActive: true } | undefined>;
  getPublicReferrerFastTrackVanityLink?: (companySlug: string, vanityAlias: string) => Promise<{ companyDomain: string; isActive: true } | undefined>;
  deactivateReferrerFastTrackLink?: (userId: number) => Promise<{ deactivated: boolean }>;
  openCompanyReferralAvailability?: (userId: number, input: { slotCount?: number }) => Promise<{ companyDomain: string; requestedSlotCount: number; allocatedRequestIds: number[]; allocatedCount: number }>;
  getSlotOpenedAlertRecipients?: (referrerId: number, requestIds: number[]) => Promise<Array<{ requestId: number; jobSeekerId: number; email: string | null; companyDomain: string }>>;
  sendSlotOpenedAlertEmail?: (input: { to: string; companyDomain: string; requestsUrl: string }) => Promise<{ sent: boolean; reason: string }>;
  getPublicReferralImpact?: () => Promise<{ acceptedReferrals: number }>;
  fulfillCompanyCoverageInvitation?: (joinerUserId: number, input: { inviteCode: string; workEmailDomain: string }) => Promise<{ rewarded: boolean; tokenCount?: number }>;
  listCompanyReferralInbox: (userId: number) => Promise<unknown[]>;
  listCompanyReferralInboxByState?: (userId: number, state: "new" | "saved" | "completed") => Promise<unknown[]>;
  /**
   * Batched block check for referral lists and thread guards. Returns the
   * subset of request ids blocked with the viewer (either direction).
   * Fail-open by contract: a check failure must never hide unblocked threads
   * (e.g. before migration 0075_user_blocks is applied in an environment).
   */
  getBlockedReferralRequestIds?: (userId: number, requestIds: number[]) => Promise<Set<number>>;
  getUnclaimedCompanyReferralPreview?: (userId: number, requestId: number) => Promise<({ attachments: Attachment[] } & Record<string, unknown>) | undefined>;
  listJobSeekerCompanyReferrals?: (userId: number) => Promise<unknown[]>;
  /** Safe BYOR status projection only; omitted while the server feature flag is off. */
  listAskInvitesForRequests?: (userId: number, requestIds: number[]) => Promise<Map<number, AskInviteMine>>;
  hasEverCreatedReferralRequest?: (userId: number) => Promise<boolean>;
  hasEverReviewedReferral?: (userId: number) => Promise<boolean>;
  listMyPaymentReceipts?: (userId: number, role?: "job_seeker" | "referrer") => Promise<unknown[]>;
  listSeekerAlerts?: (userId: number) => Promise<unknown[]>;
  createSeekerAlert?: (userId: number, input: { companyDomain?: unknown }) => Promise<unknown>;
  setSeekerAlertPaused?: (userId: number, alertId: number, paused: boolean) => Promise<unknown>;
  deleteSeekerAlert?: (userId: number, alertId: number) => Promise<{ deleted: boolean; id: number }>;
  notifySeekerAlertsForCompany?: (companyDomain: string) => Promise<{ notified: number }>;
  /** Directory name/initials for row company domains (server/companyDirectory.ts). */
  resolveCompanyIdentities?: CompanyIdentityLookup;
  reconcileExpiredPendingReferrals?: (userId: number, nowMs?: number) => Promise<{ expiredRequestIds: number[] }>;
  /** The caller's own open-ask slots against the plan cap (shared/openAskSlots.ts). */
  getOpenAskSlots?: (userId: number, nowMs?: number) => Promise<OpenAskSlots>;
  saveCompanyReferralRequest?: (userId: number, requestId: number, saved: boolean) => Promise<{ requestId: number; saved: boolean }>;
  withdrawCompanyReferralRequest?: (userId: number, requestId: number) => Promise<{ withdrawn: boolean; requestId: number; status: string; creditSummary: unknown; creditRefunded?: boolean }>;
  claimCompanyReferralRequest: (userId: number, requestId: number) => Promise<{ requestId: number; claimed: boolean; jobSeekerId?: number; companyDomain?: string; revision?: number; replayed?: boolean }>;
  extendReferredDeadlineTx: (userId: number, requestId: number, nowMs: number) => Promise<{ extended: boolean; replayed?: boolean }>;
  stepBackFromReferral: (userId: number, requestId: number, nowMs: number) => Promise<{ lapsed: boolean; reason?: string }>;
  confirmReferredBySeeker: (userId: number, requestId: number, nowMs: number) => Promise<{ confirmed: boolean; replayed?: boolean }>;
  /** D-038-reconcile R-2: part B's three actions answer 409 until an independent review passes it. */
  referredDeadlineEnabled?: boolean;
  lapseReferredTx: (tx: any, requestId: number, nowMs: number) => Promise<{ lapsed: boolean; reason?: string }>;
  getClaimedCompanyReferralDetail: (userId: number, requestId: number) => Promise<({ attachments: Attachment[] } & Record<string, unknown>) | undefined>;
  reviewReferralRequest?: (userId: number, input: { requestId: number; decision: "approved" | "declined"; message?: string }) => Promise<{ status: string }>;
  oneClickReviewReferralRequest?: (userId: number, input: { requestId: number; decision: "approved" | "declined"; declineReason?: "role_not_a_fit" | "cannot_support" | "timing"; passReason?: string | null; reviewLinkToken?: string }) => Promise<{ status: string; companyDomain: string; jobSeekerId?: number; declineReason?: string; revision?: number; replayed?: boolean; reopened?: boolean }>;
  countRecentMessagesBySender?: (userId: number, since: Date) => Promise<number>;
  listReferralLedger?: () => Promise<Array<{ id: number; ref: string; status: string; company: string; jobTitle: string; jobLocation: string | null; seekerEmail: string | null; referrerEmail: string | null; createdAt: Date | string; updatedAt: Date | string }>>;
  getUserEmailById?: (userId: number) => Promise<string | null>;
  createNotification?: (userId: number, category: "referral" | "message" | "status" | "system", title: string, body: string) => Promise<void>;
  sendEmail?: (input: { to: string; subject: string; html: string }) => Promise<{ sent: boolean; reason?: string }>;
  prepareReferrerReviewEmailNotifications?: (requestId: number) => Promise<Array<{ referrerId: number; email: string; linkToken: string; companyDomain: string }>>;
  claimReferralReviewDelivery?: (requestId:number,referrerId:number,channel:"email"|"slack",leaseOwner:string)=>Promise<{id:number}|undefined>;
  completeReferralReviewDelivery?: (id:number,leaseOwner:string,result:{status:"sent"|"failed"|"unknown";providerMessageId?:string;error?:string})=>Promise<{recorded:boolean}>;
  resolveReferrerReviewEmailLink?: (userId: number, linkToken: string) => Promise<{ requestId: number }>;
  consumeReferrerReviewEmailLink?: (userId: number, linkToken: string) => Promise<void>;
  sendReferrerReviewEmail?: (input: { to: string; companyDomain: string; reviewUrl: string }) => Promise<{ sent: boolean; reason: string }>;
  saveReferrerSlackWebhook?: (userId: number, webhookUrl: string) => Promise<{ connected: boolean }>;
  getReferrerSlackWebhookStatus?: (userId: number) => Promise<{ connected: boolean; active?: boolean; updatedAt?: Date }>;
  deactivateReferrerSlackWebhook?: (userId: number) => Promise<{ deactivated: boolean }>;
  getActiveReferrerSlackWebhooks?: (referrerIds: number[]) => Promise<Array<{ referrerId: number; webhookUrl: string }>>;
  sendReferrerSlackDelivery?: (input: { to: string; companyDomain: string; reviewUrl: string }) => Promise<{ sent: boolean; reason: string }>;
  sendWorkEmailOtp?: (input: { email: string; ip?: string }) => Promise<{ sent: boolean; reason: string; retryAfterSeconds?: number }>;
  verifyWorkEmailOtp?: (input: { email: string; code: string; ip?: string }) => Promise<boolean>;
  registerWorkEmailOtpFailure?: (input: { email: string; code: string }) => Promise<void>;
  issueWorkEmailEnrollmentReceipt?: (input: { email: string; userId: number }) => Promise<{ receipt: string; expiresAt: Date }>;
  completeWorkEmailOtpEnrollment?: (input: { receipt: string; email: string; userId: number; inviteCode?: string }) => Promise<{ workEmailDomain: string; reward: { rewarded: boolean; tokenCount?: number }; replayed: boolean }>;
  updateReferralProgress?: (userId: number, input: { requestId: number; status: ReferralProgressUpdateStatus; referenceId?: string | null }) => Promise<{ status: ReferralProgressUpdateStatus; changed: boolean }>;
  getApprovedReferralProgressStatus?: (userId: number, requestId: number) => Promise<{ status: ReferralStatus; referenceId?: string | null }>;
  listReferralConversation?: (userId: number, requestId: number) => Promise<Array<{ id: number; body: string; createdAt: Date; isMine: boolean }>>;
  sendReferralConversationMessage?: (userId: number, requestId: number, body: string) => Promise<{ id: number }>;
  /** Kit landed journey write (queue row 20 slice C) — server/db.ts recordLandedJourney. */
  recordLandedJourney?: (userId: number, input: LandedJourneyRequest) => Promise<LandedJourneyState>;
  /** A referrer's private thank-you wall (queue row 20 slice D). */
  listReferrerThankYous?: (userId: number, limit?: number) => Promise<ReferrerThankYouWall>;
  listPublicCompanyOpportunities: () => Promise<unknown[]>;
  publishCompanyOpportunity: (userId: number, input: { kind: "hiring_now" | "walk_in"; roleTitle: string; targetRoleUrl?: string; location?: string; compensation?: string; walkInAt?: Date; walkInEndsAt?: Date; showPosterFirstName?: boolean }) => Promise<unknown>;
  /** The poster's own openings: owner list plus the renew/close controls (D-022). */
  listMyCompanyOpportunities?: (userId: number, nowMs?: number) => Promise<unknown[]>;
  renewCompanyOpportunity?: (userId: number, opportunityId: number, nowMs?: number) => Promise<{ id: number; renewed: true; expiresAt: Date } | undefined>;
  closeCompanyOpportunity?: (userId: number, opportunityId: number) => Promise<{ id: number; closed: true } | undefined>;
  recordActivity?: (input: { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number; companyDomain?: string; metadata?: Record<string, string | number | boolean | null | undefined> }) => Promise<void>;
  listMyUploadStarts?: (userId: number, since: Date) => Promise<Array<{ sessionId: string | null; clientUploadId: string | null; fileName: string | null; createdAt: Date }>>;
  listOperationalActivity?: (input: { limit?: number; action?: string; query?: string; outcome?: "success" | "failure" | "denied" }) => Promise<unknown[]>;
  getReferralFlowHealth?: () => Promise<unknown>;
  /** D-018 aggregate baseline; absent in partial test apps, never faked. */
  getReferralFlowBaseline?: () => Promise<unknown>;
  getCreditLedgerAudit?: (limit?: number) => Promise<unknown>;
  getDomainIntegrity?: (limit?: number) => Promise<unknown>;
  findUsersForTokenRecovery?: (query: string) => Promise<unknown[]>;
  listAdminTokenAdjustments?: (limit?: number) => Promise<unknown[]>;
  grantAdminTokenAdjustment?: (adminUserId: number, input: { recipientUserId: number; role: "job_seeker" | "referrer"; tokenCount: number; caseReference: string; reason: string }) => Promise<{ adjustmentId: number; recipientUserId: number; role: "job_seeker" | "referrer"; tokenCount: number; newBalance: number }>;
  getCreditSummary?: (userId: number, role: "job_seeker" | "referrer") => Promise<unknown>;
  /** D-079: provider-truth card-validation re-read on the return path (webhook lag); fail-open, alerts inside. */
  reconcileCardValidation?: (userId: number) => Promise<unknown>;
  listCreditLedger?: (userId: number, role: "job_seeker" | "referrer", limit: number) => Promise<CreditLedgerEntry[]>;
  getOrCreatePersonalReferralInvite?: (userId: number) => Promise<{ inviteCode: string }>;
  // D-155: locked until the account's first paid invoice; preferred over getOrCreatePersonalReferralInvite.
  getPersonalReferralInviteState?: (userId: number) => Promise<{ status: "locked" } | { status: "unlocked"; inviteCode: string }>;
  claimPersonalReferralInvite?: (joinerUserId: number, input: { inviteCode: string; verifiedEmail: string }) => Promise<{ rewarded: boolean; tokenCount?: number; reason?: string }>;
  exportUserData?: (userId: number) => Promise<unknown>;
  requestDataExport?: (userId: number) => Promise<{ kind: "created" | "active" | "cooldown"; id: number; retryAfterSeconds?: number }>;
  getLatestDataExport?: (userId: number) => Promise<{ id: number; status: string; requestedAt: Date; readyAt: Date | null; expiresAt: Date | null; byteSize: number; fileName: string | null } | null>;
  getDataExportFile?: (userId: number, id: number) => Promise<{ data: Buffer; fileName: string } | null>;
  listMyPrivacyRequests?: (userId: number) => Promise<unknown[]>;
  createPrivacyErasureRequest?: (userId: number) => Promise<{ id: number; kind: "erasure"; status: string; createdAt: Date; alreadyRequested: boolean }>;
  listAdminPrivacyRequests?: (limit?: number) => Promise<unknown[]>;
  reviewPrivacyRequest?: (adminUserId: number, requestId: number, input: { status: "in_review"; resolution?: string }) => Promise<unknown>;
  listNotifications?: (userId: number) => Promise<PrivateNotification[]>;
  markNotificationRead?: (userId: number, notificationId: number) => Promise<{ success: boolean }>;
  listRequiresReviewPayments?: (limit?: number) => Promise<unknown[]>;
  resolveRequiresReviewPayment?: (adminUserId: number, paymentId: number, decision: PaymentReviewDecision, note?: string, credits?: number) => Promise<PaymentReviewOutcome>;
  listRecentPayments?: (limit?: number) => Promise<unknown[]>;
  revokeCreditedPaymentCredits?: (adminUserId: number, paymentId: number, note?: string) => Promise<{ paymentId: number; creditsRevoked: boolean; tokenCount: number; userId: number; role: string; provider: string; amount: number; currency: string }>;
  getRevenueSummary?: () => Promise<{ byProvider: Array<{ provider: string; currency: string; totalAmount: number; count: number }>; totalsByCurrency: Array<{ currency: string; totalAmount: number; count: number }>; refundedTotalByCurrency: Array<{ currency: string; totalAmount: number; count: number }>; recordedAt: Date }>;
  listAdminApprovalQueue?: (limit?: number) => Promise<unknown[]>;
  resolveAdminApproval?: (adminUserId: number, itemKind: "referral_request" | "referrer_enrollment" | "payment" | "employer_application", itemId: number, decision: "approved" | "rejected", note?: string) => Promise<unknown>;
  listJobs?: (input: { query?: string; location?: string }) => Promise<unknown[]>;
  listSavedRoles?: (userId: number) => Promise<unknown[]>;
  setSavedRole?: (userId: number, jobId: number, saved: boolean) => Promise<{ saved: boolean }>;
  listUsersAdmin?: (limit?: number) => Promise<unknown[]>;
  setUserSuspended?: (userId: number, suspended: boolean) => Promise<{ userId: number; suspended: boolean }>;
};

/** A database driver message (query text and bound params) must never reach a client. */
export function isDriverErrorMessage(message: unknown): boolean {
  return typeof message === "string" && /^Failed query:|\bparams:|\bER_[A-Z_]{3,}\b|\bsql(?:State|Message)\b|You have an error in your SQL syntax/i.test(message);
}
export const GENERIC_SERVER_ERROR = "Something went wrong on our side. Please try again in a moment.";

export function registerPrivateReferralRoutes(app: Express, deps: PrivateReferralRouteDeps) {
  app.use("/api", (_req, res, next) => {
    const sendJson = res.json.bind(res);
    res.json = (body?: unknown) => {
      const error = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
      if (isDriverErrorMessage(error)) {
        console.error("[api] driver error withheld from client:", String(error).slice(0, 600));
        return sendJson({ ...(body as object), error: GENERIC_SERVER_ERROR });
      }
      return sendJson(body);
    };
    next();
  });
  app.use("/api/admin", (req, res, next) => { if (req.method === "GET") res.set("Cache-Control", "private, no-store"); next(); });
  // D-038-reconcile R-2: part B's actions touched money and privacy before their own review. While
  // switched off they refuse first — before identity, the block check, or any read or write.
  const referredActionsEnabled = deps.referredDeadlineEnabled ?? REFERRED_DEADLINE_ENABLED;
  const refuseReferredAction = (res: ExpressResponse) => res.status(409).json({ code: "not_available_yet", error: "This option is not available yet. Nothing has changed." });
  const record = (input: Parameters<NonNullable<typeof deps.recordActivity>>[0]) => { void deps.recordActivity?.(input).catch(() => undefined); };
  // Additive companyName/companyInitials from the company directory on every
  // row that carries a companyDomain; non-object rows pass through untouched.
  const lookupCompanies = deps.resolveCompanyIdentities ?? resolveCompanyIdentities;
  const isRecordRow = (row: unknown): row is Record<string, unknown> => typeof row === "object" && row !== null;
  const withCompanyIdentities = async (rows: readonly unknown[]) => {
    const objects = rows.filter(isRecordRow);
    const enriched = await attachCompanyIdentities(objects, row => row.companyDomain, lookupCompanies);
    const byRow = new Map<unknown, unknown>(objects.map((row, index) => [row, enriched[index]]));
    return rows.map(row => byRow.get(row) ?? row);
  };
  const notifyInApp = (userId: number | undefined, title: string, body: string) => { if (!userId) return; void deps.createNotification?.(userId, "status", title, body).catch(() => undefined); };
  const notifyEmail = (userId: number | undefined, subject: string, html: string) => { void (async () => { if (!userId) return; const email = await deps.getUserEmailById?.(userId); if (!email) return; await deps.sendEmail?.({ to: email, subject, html }); })().catch(() => undefined); };
  // Block enforcement is fail-open: if the check itself fails (e.g. the
  // userBlocks table is absent in an environment), threads stay visible
  // rather than vanishing. Denials are neutral 404s so blocks are not enumerable.
  const getBlockedIds = deps.getBlockedReferralRequestIds ?? defaultBlockedRequestIds;
  const blockedRequestIds = async (userId: number, rows: unknown[]): Promise<Set<number>> => {
    try {
      const ids = rows
        .map(row => (typeof row === "object" && row !== null ? Number((row as Record<string, unknown>).id) : NaN))
        .filter(id => Number.isInteger(id) && id > 0);
      return await getBlockedIds(userId, ids);
    } catch { return new Set<number>(); }
  };
  const isRequestBlocked = async (userId: number, requestId: number): Promise<boolean> => {
    try { return (await getBlockedIds(userId, [requestId])).has(requestId); }
    catch { return false; }
  };
  const blockedThreadDeny = (actorUserId: number | undefined, resourceId: number, res: ExpressResponse) => {
    record({ actorUserId, action: "company_referral.blocked_denied", outcome: "denied", resourceType: "referral_request", resourceId });
    return res.status(404).json({ error: "This private request is not available" });
  };
  const privateDocumentMimeTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg"];
  const parseRawPrivateDocument = express.raw({ type: privateDocumentMimeTypes, limit: "10mb" });
  const parseLegacyDocumentJson = express.json({ limit: "14mb" });
  const legacyDocumentBody = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const identity = await deps.resolveIdentity(req).catch(() => undefined);
    if (!identity) return res.status(401).json({ error: "Sign in to upload documents securely" });
    const declared = Number(req.header("content-length") || 0);
    if (Number.isFinite(declared) && declared > 14 * 1024 * 1024) return res.status(413).json({ error: "Documents must be 10 MB or smaller" });
    parseLegacyDocumentJson(req, res, error => error ? res.status(413).json({ error: "Documents must be 10 MB or smaller" }) : next());
  };
  const rawDocumentBody = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const identity = await deps.resolveIdentity(req).catch(() => undefined);
    if (!identity) return res.status(401).json({ error: "Sign in to upload documents securely" });
    const declared = Number(req.header("content-length") || 0);
    if (Number.isFinite(declared) && declared > 10 * 1024 * 1024) return res.status(413).json({ error: "Documents must be 10 MB or smaller" });
    parseRawPrivateDocument(req, res, error => error ? res.status(413).json({ error: "Documents must be 10 MB or smaller" }) : next());
  };
  const privateDocumentPrefix = (identity: Identity) => `skipwait/private-referrals/${identity.account.openId}/`;
  const opaqueDocumentBuffer = (input: { encryptedContent?: string; encryptionKey?: string; initializationVector?: string }) => {
    if (!input.encryptedContent || !input.encryptionKey || !input.initializationVector) throw new Error("Resume upload data is incomplete");
    const encrypted = Buffer.from(input.encryptedContent, "base64"); const key = Buffer.from(input.encryptionKey, "base64"); const iv = Buffer.from(input.initializationVector, "base64");
    if (key.length !== 32 || iv.length !== 12 || encrypted.length <= 16) throw new Error("Resume upload data is invalid");
    const decipher = createDecipheriv("aes-256-gcm", key, iv); decipher.setAuthTag(encrypted.subarray(-16));
    return Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]);
  };
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
  const isOpaqueShareToken = (value: string) => /^[a-zA-Z0-9-]{16,64}$/.test(value);
  const isOpaqueReviewLinkToken = (value: string) => /^[a-zA-Z0-9]{32,64}$/.test(value);
  const passReasonOf = (body: unknown): string | null | undefined => { const value = (body as { passReason?: unknown } | undefined)?.passReason; return value === undefined || value === null ? null : isPassReasonCode(value) ? value : undefined; };
  const isOneClickDeclineReason = (value: unknown): value is "role_not_a_fit" | "cannot_support" | "timing" => value === "role_not_a_fit" || value === "cannot_support" || value === "timing";
  const createPrivateAttachment = async (identity: Identity, fileName: string, mimeType: string, buffer: Buffer, fileKey?: string) => {
    const validated = validatePrivateDocument({ fileName, mimeType, buffer });
    const key = fileKey || (await deps.storagePut(`${privateDocumentPrefix(identity)}${Date.now()}-${deps.sanitizeDocumentName(validated.fileName)}`, buffer, validated.mimeType)).key;
    const attachment = await deps.createReferralAttachment(identity.account.id, { fileName: validated.fileName, fileKey: key, mimeType: validated.mimeType, fileSize: validated.fileSize });
    record({ actorUserId: identity.account.id, action: "document.uploaded", outcome: "success", resourceType: "attachment", resourceId: attachment.id, metadata: { mimeType: validated.mimeType, fileSize: validated.fileSize } });
    return { id: attachment.id, fileName: validated.fileName, mimeType: validated.mimeType, fileSize: validated.fileSize, url: `/api/documents/${attachment.id}` };
  };
  const persistPrivateDocument = async (identity: Identity, fileName: string, mimeType: string, buffer: Buffer) => {
    return createPrivateAttachment(identity, fileName, mimeType, buffer);
  };
  const workflowPrefixes = ["/api/company-referrals", "/api/documents", "/api/opportunities", "/api/personal-invites", "/api/referrer-fast-track", "/api/referral-share-cards", "/api/smart-pitch", "/api/credits", "/api/notifications", "/api/privacy", "/api/admin", "/api/chargebee"];
  const normalizedWorkflowRoute = (path: string) => path.replace(/\/\d+(?=\/|$)/g, "/:id").slice(0, 160);
  app.use(async (req, res, next) => {
    if (!workflowPrefixes.some(prefix => req.path === prefix || req.path.startsWith(`${prefix}/`))) return next();
    const startedAt = Date.now();
    const identity = await deps.resolveIdentity(req).catch(() => undefined);
    if (!identity) return next();
    const route = normalizedWorkflowRoute(req.path);
    res.once("finish", () => {
      const outcome = res.statusCode < 400 ? "success" : res.statusCode === 401 || res.statusCode === 403 ? "denied" : "failure";
      record({ actorUserId: identity.account.id, action: "workflow.request_completed", outcome, resourceType: "http_route", resourceId: route, metadata: { method: req.method, route, statusCode: res.statusCode, durationMs: Math.max(0, Date.now() - startedAt) } });
    });
    next();
  });
  // The wall's wired projection carries `createdAt` and may omit `expiresAt`
  // (the sponsored-capable select). Judge every row by the one clock migration
  // 0094 backfills — the row's own expiry — and fall back to createdAt + 30 days
  // only when a drifted projection omits the expiry; never hide a row whose age
  // cannot be established (drift stays visible, like every other read).
  const wallRowExpiresAt = (row: unknown): Date | string | null => {
    if (!row || typeof row !== "object") return null;
    const { expiresAt, createdAt } = row as { expiresAt?: unknown; createdAt?: unknown };
    if (expiresAt instanceof Date || typeof expiresAt === "string") return expiresAt;
    const createdMs = createdAt instanceof Date ? createdAt.getTime() : typeof createdAt === "string" ? Date.parse(createdAt) : NaN;
    return Number.isFinite(createdMs) ? new Date(createdMs + OPPORTUNITY_TTL_MS) : null;
  };
  app.get("/api/opportunities", async (_req, res) => {
    try {
      const opportunities = await deps.listPublicCompanyOpportunities();
      const nowMs = Date.now();
      const live = opportunities.filter(row => !isOpportunityExpired(wallRowExpiresAt(row), nowMs))
        // The wall is a public read: map to the explicit card shape so owner
        // name/email/flag columns can never ride along, however the store row
        // was shaped. The poster projection arrives already opt-in-gated.
        .map(row => {
          const source = row as Record<string, unknown>;
          return {
            id: source.id, companyDomain: source.companyDomain, kind: source.kind, roleTitle: source.roleTitle,
            targetRoleUrl: source.targetRoleUrl ?? null, location: source.location ?? null, compensation: source.compensation ?? null,
            walkInAt: source.walkInAt ?? null, walkInEndsAt: source.walkInEndsAt ?? null, createdAt: source.createdAt,
            expiresAt: source.expiresAt ?? null, isSponsored: source.isSponsored === true,
            poster: (source.poster as { kind: string; firstName?: string } | undefined)?.kind === "firstName" && typeof (source.poster as { firstName?: unknown }).firstName === "string"
              ? { kind: "firstName" as const, firstName: (source.poster as { firstName: string }).firstName }
              : { kind: "anonymous" as const },
          };
        });
      // The repair loop's only signal for lapsed posts the wall is hiding.
      if (live.length < opportunities.length) record({ action: "opportunity.expired_hidden", outcome: "success", resourceType: "opportunity", metadata: { hiddenCount: opportunities.length - live.length } });
      res.json({ opportunities: live });
    } catch { res.status(500).json({ error: "We could not load opportunities right now" }); }
  });
  // The poster's own openings (kit /post-opportunity list): owner only, never cached.
  app.get("/api/opportunities/mine", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to see your openings" });
      if (!deps.listMyCompanyOpportunities) return res.status(503).json({ error: "Your openings are unavailable right now" });
      const opportunities = await deps.listMyCompanyOpportunities(identity.account.id, Date.now());
      res.set("Cache-Control", "private, no-store");
      res.json(myOpportunitiesResponseSchema.parse({ opportunities }));
    } catch { res.status(500).json({ error: "We could not load your openings" }); }
  });
  app.get("/api/jobs", async (req, res) => {
    try {
      const query = typeof req.query.query === "string" ? req.query.query.slice(0, 120) : undefined;
      const location = typeof req.query.location === "string" ? req.query.location.slice(0, 120) : undefined;
      const jobs = await deps.listJobs?.({ query, location }) ?? [];
      // Defense in depth: the public route must never expose private referral
      // targets even if an alternate listJobs dependency regresses.
      const publicJobs = jobs.filter(job => !(job && typeof job === "object" && ((job as { title?: string }).title === "Role from shared job link" || (job as { description?: string }).description === "Private referral request routed from a Target Role URL.")));
      res.set("Cache-Control", "public, max-age=60");
      res.json({ jobs: publicJobs.slice(0, 50) });
    } catch { res.status(500).json({ error: "We could not load the job list right now" }); }
  });
  app.get("/api/saved-roles", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to see your saved roles" });
      if (!deps.listSavedRoles) return res.status(503).json({ error: "Saved roles are unavailable right now" });
      res.set("Cache-Control", "private, no-store");
      res.json({ saved: await deps.listSavedRoles(identity.account.id) });
    } catch { res.status(500).json({ error: "We could not load your saved roles" }); }
  });
  const setSavedRoleHandler=(saved:boolean)=>async(req:Request,res:ExpressResponse)=>{try{const identity=await deps.resolveIdentity(req);const jobId=Number(req.params.jobId);if(!identity)return res.status(401).json({error:"Sign in to save a role"});if(!Number.isInteger(jobId)||jobId<=0)return res.status(400).json({error:"Invalid job reference"});if(!deps.setSavedRole)return res.status(503).json({error:"Saved roles are unavailable right now"});const result=await deps.setSavedRole(identity.account.id,jobId,saved);record({actorUserId:identity.account.id,action:result.saved?"saved_role.saved":"saved_role.removed",outcome:"success",resourceType:"saved_role",resourceId:jobId});res.set("Cache-Control","private, no-store");res.json({saved:result.saved});}catch(error){const message=error instanceof Error?error.message:"We could not update your saved roles";res.status(/unavailable/i.test(message)?404:500).json({error:/unavailable/i.test(message)?"This role is unavailable":"We could not update your saved roles"});}};
  app.put("/api/saved-roles/:jobId",setSavedRoleHandler(true));
  app.delete("/api/saved-roles/:jobId",setSavedRoleHandler(false));

  app.get("/api/notifications", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view your private updates" });
      if (!deps.listNotifications) return res.status(503).json({ error: "Your updates are unavailable right now" });
      res.set("Cache-Control", "private, no-store");
      const notifications = await deps.listNotifications(identity.account.id);
      res.json({ notifications: notifications.map(({ id, category, title, body, readAt, createdAt, kind, refId }) => ({ id, category, title, body, readAt, createdAt, kind: kind ?? null, refId: refId ?? null })) });
    } catch { res.status(500).json({ error: "We could not load your private updates" }); }
  });
  app.put("/api/referrer/slack-webhook", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to manage your private triage delivery" });
      if (!deps.saveReferrerSlackWebhook) return res.status(503).json({ error: "Slack triage delivery is unavailable right now" });
      const webhookUrl = typeof req.body?.webhookUrl === "string" ? req.body.webhookUrl.trim() : "";
      if (!isValidSlackIncomingWebhookUrl(webhookUrl)) return res.status(400).json({ error: "Use a valid Slack incoming-webhook URL (https://hooks.slack.com/...)" });
      await deps.saveReferrerSlackWebhook(identity.account.id, webhookUrl);
      record({ actorUserId: identity.account.id, action: "slack_webhook.saved", outcome: "success", resourceType: "slack_webhook", metadata: { active: true } });
      res.json({ connected: true });
    } catch { res.status(500).json({ error: "We could not connect your Slack triage channel" }); }
  });
  app.get("/api/referrer/slack-webhook", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to manage your private triage delivery" });
      if (!deps.getReferrerSlackWebhookStatus) return res.status(503).json({ error: "Slack triage delivery is unavailable right now" });
      res.set("Cache-Control", "private, no-store");
      const status = await deps.getReferrerSlackWebhookStatus(identity.account.id);
      res.json({ connected: status.connected, active: status.connected ? status.active !== false : false });
    } catch { res.status(500).json({ error: "We could not load your Slack triage delivery status" }); }
  });
  app.delete("/api/referrer/slack-webhook", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to manage your private triage delivery" });
      if (!deps.deactivateReferrerSlackWebhook) return res.status(503).json({ error: "Slack triage delivery is unavailable right now" });
      const result = await deps.deactivateReferrerSlackWebhook(identity.account.id);
      record({ actorUserId: identity.account.id, action: "slack_webhook.disconnected", outcome: "success", resourceType: "slack_webhook", metadata: { wasConnected: result.deactivated } });
      res.json({ connected: false });
    } catch { res.status(500).json({ error: "We could not disconnect your Slack triage channel" }); }
  });
  app.post("/api/notifications/:notificationId/read", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      const notificationId = Number(req.params.notificationId);
      if (!identity) return res.status(401).json({ error: "Sign in to update your private notifications" });
      if (!Number.isInteger(notificationId) || notificationId <= 0) return res.status(400).json({ error: "Invalid notification reference" });
      if (!deps.markNotificationRead) return res.status(503).json({ error: "Notifications are unavailable right now" });
      await deps.markNotificationRead(identity.account.id, notificationId);
      record({ actorUserId: identity.account.id, action: "notification.read", outcome: "success", resourceType: "notification", resourceId: notificationId });
      res.set("Cache-Control", "private, no-store");
      res.json({ success: true });
    } catch { res.status(500).json({ error: "We could not update that notification" }); }
  });
  app.post("/api/opportunities", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to publish an opportunity" });
      // D-022: the gate is the server's own work-email verdict (the shared
      // verified-referrer rule), never a sign-in email presented on the session.
      const access = await deps.getVerifiedWorkEmailAccess?.(identity.account.id);
      if (!access?.workEmailDomain) return res.status(403).json({ error: "Verify your work email before publishing" });
      const { kind, roleTitle, targetRoleUrl, location, compensation, walkInAt, walkInEndsAt, showPosterFirstName } = req.body as { kind?: string; roleTitle?: string; targetRoleUrl?: string; location?: string; compensation?: string; walkInAt?: string; walkInEndsAt?: string; showPosterFirstName?: unknown };
      if ((kind !== "hiring_now" && kind !== "walk_in") || !roleTitle?.trim()) return res.status(400).json({ error: "Choose Hiring now or Walk-in and add the role" });
      const safeCompensation = typeof compensation === "string" && compensation.trim() ? compensation.trim().slice(0, 80) : undefined;
      const parseDate = (value?: string) => { if (!value) return undefined; const date = new Date(value); return Number.isNaN(date.getTime()) ? undefined : date; };
      if ((walkInAt && !parseDate(walkInAt)) || (walkInEndsAt && !parseDate(walkInEndsAt))) return res.status(400).json({ error: "Use valid walk-in dates" });
      // Only the exact boolean true shows a first name; every other value stays anonymous.
      const opportunity = await deps.publishCompanyOpportunity(identity.account.id, { kind, roleTitle, targetRoleUrl, location, compensation: safeCompensation, walkInAt: parseDate(walkInAt), walkInEndsAt: parseDate(walkInEndsAt), showPosterFirstName: showPosterFirstName === true });
      const logged = opportunity as { id?: number; companyDomain?: string }; record({ actorUserId: identity.account.id, action: "opportunity.published", outcome: "success", resourceType: "opportunity", resourceId: logged.id, companyDomain: logged.companyDomain, metadata: { kind, posterNamed: showPosterFirstName === true } });
      res.status(201).json({ opportunity });
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "We could not publish that opportunity" }); }
  });
  // One-tap renew/close for the poster's own openings; a foreign or missing id
  // answers 404 so post ids are not enumerable, and only success is recorded.
  app.post("/api/opportunities/:id/renew", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      const opportunityId = Number(req.params.id);
      if (!identity) return res.status(401).json({ error: "Sign in to renew your opening" });
      if (!Number.isInteger(opportunityId) || opportunityId <= 0) return res.status(400).json({ error: "Invalid opening reference" });
      if (!deps.renewCompanyOpportunity) return res.status(503).json({ error: "Your openings are unavailable right now" });
      const renewed = await deps.renewCompanyOpportunity(identity.account.id, opportunityId, Date.now());
      if (!renewed) return res.status(404).json({ error: "This opening is not available" });
      record({ actorUserId: identity.account.id, action: "opportunity.renewed", outcome: "success", resourceType: "opportunity", resourceId: opportunityId });
      res.set("Cache-Control", "private, no-store");
      res.json({ renewed: true, id: opportunityId, expiresAt: renewed.expiresAt });
    } catch { res.status(500).json({ error: "We could not renew this opening" }); }
  });
  app.post("/api/opportunities/:id/close", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      const opportunityId = Number(req.params.id);
      if (!identity) return res.status(401).json({ error: "Sign in to close your opening" });
      if (!Number.isInteger(opportunityId) || opportunityId <= 0) return res.status(400).json({ error: "Invalid opening reference" });
      if (!deps.closeCompanyOpportunity) return res.status(503).json({ error: "Your openings are unavailable right now" });
      const closed = await deps.closeCompanyOpportunity(identity.account.id, opportunityId);
      if (!closed) return res.status(404).json({ error: "This opening is not available" });
      record({ actorUserId: identity.account.id, action: "opportunity.closed", outcome: "success", resourceType: "opportunity", resourceId: opportunityId });
      res.set("Cache-Control", "private, no-store");
      res.json({ closed: true, id: opportunityId });
    } catch { res.status(500).json({ error: "We could not close this opening" }); }
  });
  app.post("/api/documents", legacyDocumentBody, async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in to upload documents securely" });
      const { fileName, mimeType, dataUrl } = req.body as { fileName?: string; mimeType?: string; dataUrl?: string };
      if (!fileName || !mimeType || !dataUrl) return res.status(400).json({ error: "Document details are required" });
      const buffer = deps.dataUrlToBuffer(dataUrl);
      res.status(201).json(await persistPrivateDocument(identity, fileName, mimeType, buffer));
    } catch (error) { const message = error instanceof Error ? error.message : "We could not upload that document. Please try again."; const isValidationError = /PDF|Word|PNG|JPEG|document type|smaller than/i.test(message); res.status(/smaller than 10 MB/i.test(message) ? 413 : isValidationError ? 400 : 500).json({ error: message }); }
  });
  app.post("/api/documents/raw", rawDocumentBody, async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in to upload documents securely" });
      const encodedName = req.header("x-resume-filename") || "";
      let fileName = ""; try { fileName = decodeURIComponent(encodedName); } catch { fileName = ""; }
      const mimeType = (req.header("content-type") || "").split(";", 1)[0]?.trim() || "";
      if (!fileName || !privateDocumentMimeTypes.includes(mimeType) || !Buffer.isBuffer(req.body)) return res.status(400).json({ error: "Use a PDF, Word document, PNG, or JPEG resume" });
      res.status(201).json(await persistPrivateDocument(identity, fileName, mimeType, req.body));
    } catch (error) { const message = error instanceof Error ? error.message : "We could not upload that document. Please try again."; const isValidationError = /PDF|Word|PNG|JPEG|document type|smaller than/i.test(message); res.status(/smaller than 10 MB/i.test(message) ? 413 : isValidationError ? 400 : 500).json({ error: message }); }
  });
  app.post("/api/documents/opaque", legacyDocumentBody, async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in to upload documents securely" });
      const { fileName, mimeType, encryptedContent, encryptionKey, initializationVector } = req.body as { fileName?: string; mimeType?: string; encryptedContent?: string; encryptionKey?: string; initializationVector?: string };
      if (!fileName || !mimeType || !privateDocumentMimeTypes.includes(mimeType)) return res.status(400).json({ error: "Use a PDF, Word document, PNG, or JPEG resume" });
      res.status(201).json(await persistPrivateDocument(identity, fileName, mimeType, opaqueDocumentBuffer({ encryptedContent, encryptionKey, initializationVector })));
    } catch (error) { const message = error instanceof Error ? error.message : "We could not upload that document. Please try again."; const isValidationError = /PDF|Word|PNG|JPEG|document type|smaller than|upload data/i.test(message); res.status(/smaller than 10 MB/i.test(message) ? 413 : isValidationError ? 400 : 500).json({ error: message }); }
  });
  app.get("/api/documents/debug/upload-starts", async (req, res) => { try { const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in to inspect your upload attempts" }); const starts = await deps.listMyUploadStarts?.(identity.account.id, new Date(Date.now() - 15 * 60 * 1000)) ?? []; res.set("Cache-Control", "private, no-store"); res.json({ starts }); } catch { res.status(500).json({ error: "Upload diagnostics are unavailable" }); } });
  app.post("/api/documents/uploads", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in to upload documents securely" });
      const { fileName, mimeType, fileSize, clientUploadId } = req.body as { fileName?: string; mimeType?: string; fileSize?: number; clientUploadId?: string };
      const safeFileSize = typeof fileSize === "number" && Number.isInteger(fileSize) && fileSize > 0 && fileSize <= 10 * 1024 * 1024 ? fileSize : null;
      if (!fileName || !mimeType || !privateDocumentMimeTypes.includes(mimeType) || safeFileSize === null) return res.status(400).json({ error: "Use a PDF, Word document, PNG, or JPEG resume smaller than 10 MB" });
      if (!deps.createResumeUploadSession) return res.status(503).json({ error: "Private uploads are temporarily unavailable" });
      const safeClientUploadId = typeof clientUploadId === "string" && /^[a-f0-9-]{20,64}$/i.test(clientUploadId) ? clientUploadId : undefined;
      const session = await deps.createResumeUploadSession(identity.account.id, { sessionId: safeClientUploadId, fileName: deps.sanitizeDocumentName(fileName), mimeType, expectedSize: safeFileSize });
      record({ actorUserId: identity.account.id, action: "document.upload_started", outcome: "success", resourceType: "upload_session", resourceId: session.id, metadata: { clientUploadId: safeClientUploadId || null, fileName: deps.sanitizeDocumentName(fileName) } });
      res.set("Cache-Control", "private, no-store"); res.status(201).json({ sessionId: session.id, chunkBytes: 48 * 1024 });
    } catch { res.status(500).json({ error: "We could not prepare your private resume upload. Please try again." }); }
  });
  app.post("/api/documents/uploads/:sessionId/chunks", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in to upload documents securely" });
      const { chunkIndex, encryptedContent, encryptionKey, initializationVector } = req.body as { chunkIndex?: number; encryptedContent?: string; encryptionKey?: string; initializationVector?: string };
      const safeChunkIndex = typeof chunkIndex === "number" && Number.isInteger(chunkIndex) && chunkIndex >= 0 ? chunkIndex : null;
      if (!deps.getResumeUploadSession || !deps.appendResumeUploadChunk || safeChunkIndex === null) return res.status(400).json({ error: "This resume chunk could not be verified" });
      const session = await deps.getResumeUploadSession(identity.account.id, req.params.sessionId); if (!session || session.status !== "active") return res.status(404).json({ error: "This private upload is no longer available" });
      const chunk = opaqueDocumentBuffer({ encryptedContent, encryptionKey, initializationVector }); if (chunk.length > 48 * 1024) return res.status(413).json({ error: "Resume upload chunk is too large" });
      const { key } = await deps.storagePut(`${privateDocumentPrefix(identity)}staging/${session.id}/${safeChunkIndex}`, chunk, "application/octet-stream");
      const progress = await deps.appendResumeUploadChunk(identity.account.id, { sessionId: session.id, chunkIndex: safeChunkIndex, storageKey: key, byteSize: chunk.length });
      res.set("Cache-Control", "private, no-store"); res.json(progress);
    } catch (error) { const message = error instanceof Error ? error.message : "We could not save this resume fragment"; res.status(/invalid|incomplete|out of order|too large/i.test(message) ? 400 : 500).json({ error: message }); }
  });
  app.post("/api/documents/uploads/:sessionId/complete", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in to upload documents securely" });
      if (!deps.getResumeUploadSession || !deps.claimResumeUploadFinalization || !deps.completeResumeUploadSession) return res.status(503).json({ error: "Private uploads are temporarily unavailable" });
      const initialSession = await deps.getResumeUploadSession(identity.account.id, req.params.sessionId); if (!initialSession) return res.status(404).json({ error: "This private upload is no longer available" });
      let session: typeof initialSession | undefined = initialSession;
      if (session.status === "completed" && session.attachmentId) return res.status(201).json({ id: session.attachmentId, fileName: session.fileName, mimeType: session.mimeType, fileSize: session.expectedSize, url: `/api/documents/${session.attachmentId}` });
      if ((session.status !== "active" && session.status !== "finalizing") || session.receivedSize !== session.expectedSize || session.chunks.length !== session.nextChunkIndex) return res.status(400).json({ error: "Your resume upload is incomplete. Please retry it." });
      const finalizationOwner = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const claim = await deps.claimResumeUploadFinalization(identity.account.id, session.id, finalizationOwner);
      if (claim.outcome === "missing") return res.status(404).json({ error: "This private upload is no longer available" });
      if (claim.outcome === "completed") { session = await deps.getResumeUploadSession(identity.account.id, session.id); if (session?.attachmentId) return res.status(201).json({ id: session.attachmentId, fileName: session.fileName, mimeType: session.mimeType, fileSize: session.expectedSize, url: `/api/documents/${session.attachmentId}` }); }
      if (claim.outcome === "finalizing") {
        const sessionId = initialSession.id;
        for (let attempt = 0; attempt < 40; attempt += 1) { await new Promise(resolve => setTimeout(resolve, 50)); session = await deps.getResumeUploadSession(identity.account.id, sessionId); if (session?.status === "completed" && session.attachmentId) return res.status(201).json({ id: session.attachmentId, fileName: session.fileName, mimeType: session.mimeType, fileSize: session.expectedSize, url: `/api/documents/${session.attachmentId}` }); }
        return res.status(409).json({ error: "Your resume is still finishing. Retry completion." });
      }
      if (!session) return res.status(404).json({ error: "This private upload is no longer available" });
      const pieces = await Promise.all(session.chunks.map(async (chunk, index) => {
        if (chunk.chunkIndex !== index) throw new Error("Resume upload chunks are incomplete");
        if (deps.storageGetBytes) { const bytes = await deps.storageGetBytes(chunk.storageKey).catch(() => undefined); if (!bytes) throw new Error("Resume upload fragment was not found"); return Buffer.from(bytes); }
        const signedUrl = await deps.storageGetSignedUrl(chunk.storageKey); let response: Response; try { response = await fetch(signedUrl); } catch { throw new Error("Resume upload fragment was not found"); }
        if (!response.ok) throw new Error("Resume upload fragment was not found"); return Buffer.from(await response.arrayBuffer());
      }));
      const buffer = Buffer.concat(pieces); if (buffer.length !== session.expectedSize) throw new Error("Resume upload size could not be verified");
      const validated = validatePrivateDocument({ fileName: session.fileName, mimeType: session.mimeType, buffer });
      const permanentKey = `${privateDocumentPrefix(identity)}uploads/${session.id}/${deps.sanitizeDocumentName(validated.fileName)}`;
      const stored = await deps.storagePut(permanentKey, buffer, validated.mimeType);
      const attachment = await deps.completeResumeUploadSession(identity.account.id, session.id, finalizationOwner, { fileName: validated.fileName, fileKey: stored.key, mimeType: validated.mimeType, fileSize: buffer.length });
      res.status(201).json({ ...attachment, url: `/api/documents/${attachment.id}` });
    } catch (error) { const message = error instanceof Error ? error.message : "We could not finish your resume upload"; res.status(/incomplete|size|PDF|Word|PNG|JPEG|document type/i.test(message) ? 400 : /still finishing|lease changed/i.test(message) ? 409 : 500).json({ error: message }); }
  });
  app.delete("/api/documents/draft", async (req, res) => {
    try { const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in to clear your private draft" }); if (!deps.clearUnattachedResumeUploads) return res.status(503).json({ error: "Draft cleanup is temporarily unavailable" }); const result = await deps.clearUnattachedResumeUploads(identity.account.id); record({ actorUserId: identity.account.id, action: "document.draft_cleared", outcome: "success", resourceType: "attachment", metadata: { cleared: result.cleared } }); res.json({ cleared: result.cleared }); }
    catch { res.status(500).json({ error: "We could not clear your private draft" }); }
  });
  app.get("/api/documents/:attachmentId", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const attachmentId = Number(req.params.attachmentId);
      if (!identity) return res.status(401).send("Sign in to view this document"); if (!Number.isInteger(attachmentId) || attachmentId <= 0) return res.status(400).send("Invalid document reference");
      const attachment = await deps.getAccessibleReferralAttachment(identity.account.id, attachmentId); if (!attachment) return res.status(404).send("Document not found");
      // A referrer blocked with the seeker, either way, gets the same 404 as no access (blocks stay unenumerable); the seeker
      // always keeps their own file. Fail-open like every referral surface: a failed check never hides a file.
      const askId = attachment.ownerId === identity.account.id ? null : attachment.referralRequestId ?? null;
      if (askId !== null && await isRequestBlocked(identity.account.id, askId)) {
        record({ actorUserId: identity.account.id, action: "company_referral.blocked_denied", outcome: "denied", resourceType: "referral_request", resourceId: askId, metadata: { surface: "document" } });
        return res.status(404).send("Document not found");
      }
      record({ actorUserId: identity.account.id, action: "document.accessed", outcome: "success", resourceType: "attachment", resourceId: attachmentId, metadata: { access: "authorized" } });
      res.set("Cache-Control", "private, no-store");
      res.set("X-Content-Type-Options", "nosniff");
      const safeName = String(attachment.fileName || "document").replace(/[\r\n"\\]/g, "_");
      res.set("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
      if (deps.storageGetBytes) {
        const bytes = await deps.storageGetBytes(attachment.fileKey || "").catch(() => undefined);
        if (!bytes) return res.status(404).send("Document not found");
        res.set("Content-Type", attachment.mimeType || "application/octet-stream");
        return res.send(Buffer.from(bytes));
      }
      const url = await deps.storageGetSignedUrl(attachment.fileKey || ""); res.redirect(307, url);
    } catch { res.status(502).send("We could not retrieve that document. Please try again."); }
  });
  app.get("/api/privacy/export", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in to export your data" });
      const exportData = await deps.exportUserData?.(identity.account.id); if (!exportData) return res.status(503).json({ error: "Your data export is unavailable right now" });
      record({ actorUserId: identity.account.id, action: "privacy.data_exported", outcome: "success", resourceType: "privacy_export" });
      res.set("Cache-Control", "private, no-store"); res.attachment(`skipwait-personal-data-${new Date().toISOString().slice(0, 10)}.json`); res.json(exportData);
    } catch { res.status(500).json({ error: "We could not prepare your data export" }); }
  });
  app.post("/api/privacy/export-requests", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in to request your data export" });
      if (!deps.requestDataExport) return res.status(503).json({ error: "Data export is unavailable right now" });
      const result = await deps.requestDataExport(identity.account.id);
      record({ actorUserId: identity.account.id, action: "privacy.export_requested", outcome: result.kind === "cooldown" ? "denied" : "success", resourceType: "data_export", resourceId: result.id, metadata: { kind: result.kind } });
      res.set("Cache-Control", "private, no-store");
      if (result.kind === "cooldown") { const wait = setRetryAfter(res, result.retryAfterSeconds ?? 60); return res.status(429).json({ error: "You can request one export every 24 hours. Your last one is below.", retryAfterSeconds: wait, id: result.id }); }
      return res.status(result.kind === "created" ? 201 : 200).json({ id: result.id, alreadyRequested: result.kind === "active" });
    } catch { res.status(500).json({ error: "We could not create your export request" }); }
  });
  app.get("/api/privacy/export-requests/latest", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in to view your data export" });
      res.set("Cache-Control", "private, no-store");
      res.json({ export: await deps.getLatestDataExport?.(identity.account.id) ?? null });
    } catch { res.status(500).json({ error: "We could not load your data export" }); }
  });
  app.get("/api/privacy/export-requests/:id/download", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in to download your data export" });
      const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: "This export is not available" });
      const file = await deps.getDataExportFile?.(identity.account.id, id); if (!file) return res.status(404).json({ error: "This export is not available. It may have expired, so request a new one." });
      record({ actorUserId: identity.account.id, action: "privacy.data_exported", outcome: "success", resourceType: "data_export", resourceId: id });
      res.set("Cache-Control", "private, no-store"); res.set("Content-Type", "application/zip"); res.attachment(file.fileName); res.send(file.data);
    } catch { res.status(500).json({ error: "We could not download your data export" }); }
  });
  app.get("/api/privacy/requests", async (req, res) => {
    try { const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in to view privacy requests" }); res.set("Cache-Control", "private, no-store"); res.json({ requests: await deps.listMyPrivacyRequests?.(identity.account.id) ?? [] }); } catch { res.status(500).json({ error: "We could not load your privacy requests" }); }
  });
  app.post("/api/privacy/requests/erasure", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in to request account deletion" });
      const privacyRequest = await deps.createPrivacyErasureRequest?.(identity.account.id); if (!privacyRequest) return res.status(503).json({ error: "Privacy requests are unavailable right now" });
      record({ actorUserId: identity.account.id, action: "privacy.erasure_requested", outcome: "success", resourceType: "privacy_request", resourceId: privacyRequest.id, metadata: { alreadyRequested: privacyRequest.alreadyRequested } });
      res.status(privacyRequest.alreadyRequested ? 200 : 201).json({ request: privacyRequest });
    } catch { res.status(500).json({ error: "We could not create your account deletion request" }); }
  });
  app.post("/api/work-email/otp/send", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in before verifying a work email" });
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      if (!deps.sendWorkEmailOtp) return res.status(503).json({ error: "Work-email verification is unavailable right now" });
      const result = await deps.sendWorkEmailOtp({ email, ip: resolveTrustedClientIp(req) });
      if (result.sent) { record({ actorUserId: identity.account.id, action: "work_email.otp_sent", outcome: "success", resourceType: "work_email_otp", metadata: { domain: email.split("@")[1] ?? "" } }); return res.json({ sent: true }); }
      if (result.reason === "rate_limited") { const retryAfterSeconds = result.retryAfterSeconds ?? 600; res.set("Retry-After", String(retryAfterSeconds)); return res.status(429).json({ error: retryAfterSeconds <= OTP_RESEND_COOLDOWN_SECONDS ? "Wait a moment before requesting another code." : "Too many code requests. Wait before trying again.", retryAfterSeconds }); }
      if (result.reason === "invalid_email") return res.status(400).json({ error: "Enter a valid work email address" });
      if (result.reason === "invalid_domain") return res.status(400).json({ error: "Enter a deliverable work email address" });
      if (result.reason === "not_configured") return res.status(503).json({ error: "Work-email verification is unavailable right now" });
      return res.status(502).json({ error: "We could not deliver the code. Try again shortly." });
    } catch { res.status(500).json({ error: "We could not send the verification code" }); }
  });
  app.post("/api/work-email/otp/verify", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in before verifying a work email" });
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
      if (!deps.verifyWorkEmailOtp) return res.status(503).json({ error: "Work-email verification is unavailable right now" });
      const verified = await deps.verifyWorkEmailOtp({ email, code, ip: resolveTrustedClientIp(req) });
      if (verified) {
        const issued = await deps.issueWorkEmailEnrollmentReceipt?.({ email, userId: identity.account.id });
        if (!issued) return res.status(503).json({ error: "Work-email verification is unavailable right now" });
        record({ actorUserId: identity.account.id, action: "work_email.otp_verified", outcome: "success", resourceType: "work_email_otp", metadata: { domain: email.split("@")[1] ?? "" } });
        return res.json({ verified: true, receipt: issued.receipt, expiresAt: issued.expiresAt });
      }
      record({ actorUserId: identity.account.id, action: "work_email.otp_verified", outcome: "denied", resourceType: "work_email_otp", metadata: { domain: email.split("@")[1] ?? "" } });
      res.status(400).json({ error: "That code could not be verified. Check the latest code and try again." });
    } catch (error) {
      if (error instanceof OtpLockedError) { res.set("Retry-After", String(error.retryAfterSeconds)); return res.status(429).json({ error: "Too many tries. Try again later.", retryAfterSeconds: error.retryAfterSeconds, lockedUntil: error.lockedUntil.toISOString() }); }
      res.status(500).json({ error: "We could not verify the code" });
    }
  });
  app.post("/api/company-referrals/verify-work-email", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      if (!identity) return res.status(401).json({ error: "Sign in to verify a work email" });
      if (!email) return res.status(400).json({ error: "Enter the work email address that received your code" });
      // OTP proof is a single-use bearer receipt scoped to this authenticated
      // account, canonical email, and enrollment purpose. Login OTP challenges
      // never mint this receipt and therefore cannot cross into this flow.
      const receipt = typeof req.body?.receipt === "string" ? req.body.receipt : "";
      const verifiedEmail = identity.emailAddresses?.find(address => address.emailAddress.trim().toLowerCase() === email && address.verification?.status === "verified");
      if (!verifiedEmail) {
        const inviteCodeOtp = typeof req.body?.inviteCode === "string" ? req.body.inviteCode.slice(0, 64) : undefined;
        const completed = receipt ? await deps.completeWorkEmailOtpEnrollment?.({ receipt, email, userId: identity.account.id, inviteCode: inviteCodeOtp }) : undefined;
        if (!completed) return res.status(403).json({ error: "Enter the one-time code sent to this work email before continuing" });
        record({ actorUserId: identity.account.id, action: "work_email.enrolled", outcome: "success", resourceType: "profile", companyDomain: completed.workEmailDomain, metadata: { verification: "server_otp_receipt", replayed: completed.replayed } });
        if (completed.reward.rewarded) record({ actorUserId: identity.account.id, action: "company_coverage.rewarded", outcome: "success", resourceType: "coverage_invitation", companyDomain: completed.workEmailDomain, metadata: { tokenCount: completed.reward.tokenCount ?? 0 } });
        try { await (deps.notifySeekerAlertsForCompany ?? notifySeekerAlertsForCompanyDomain)(completed.workEmailDomain); } catch { /* alerts never break enrollment */ }
        return res.json({ verified: true, workEmailDomain: completed.workEmailDomain, reward: completed.reward });
      }
      const profile = await deps.saveVerifiedWorkEmail(identity.account.id, verifiedEmail.emailAddress);
      const inviteCode = typeof req.body?.inviteCode === "string" ? req.body.inviteCode.slice(0, 64) : "";
      const reward = inviteCode && profile?.workEmailDomain && deps.fulfillCompanyCoverageInvitation ? await deps.fulfillCompanyCoverageInvitation(identity.account.id, { inviteCode, workEmailDomain: profile.workEmailDomain }) : { rewarded: false };
      record({ actorUserId: identity.account.id, action: "work_email.enrolled", outcome: "success", resourceType: "profile", companyDomain: profile?.workEmailDomain ?? undefined, metadata: { verification: "email_code" } });
      if (reward.rewarded) record({ actorUserId: identity.account.id, action: "company_coverage.rewarded", outcome: "success", resourceType: "coverage_invitation", companyDomain: profile?.workEmailDomain ?? undefined, metadata: { tokenCount: reward.tokenCount ?? 0 } });
      if (profile?.workEmailDomain) { try { await (deps.notifySeekerAlertsForCompany ?? notifySeekerAlertsForCompanyDomain)(profile.workEmailDomain); } catch { /* alerts never break enrollment */ } }
      res.json({ verified: true, workEmailDomain: profile?.workEmailDomain, reward });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not verify your work email";
      const isValidationError = /personal email domain|work email address|required/i.test(message);
      if (/^OTP_RECEIPT_/.test(message)) return res.status(403).json({ error: "Enter the one-time code sent to this work email before continuing" });
      res.status(isValidationError ? 400 : 500).json({ error: message });
    }
  });
  // D-132/D-110 (flag ASK_LEVEL_COST): the pre-send cost quote for the compose
  // screen - "This ask costs N credits. You have M. Add K more." The link is
  // normalized exactly as at creation, so the quote always matches the charge.
  app.get("/api/company-referrals/quote", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to see what this ask costs" });
      const url = typeof req.query.url === "string" ? req.query.url.trim() : "";
      if (!url || !isValidTargetRoleUrl(url)) return res.status(400).json({ error: TARGET_ROLE_URL_ERROR });
      const level = assignJobLevel({ url: normalizeTargetRoleUrl(url) }).level;
      const cost = askLevelCostEnabled() ? creditsForLevel(level) : 1;
      const summary = (await deps.getCreditSummary?.(identity.account.id, "job_seeker")) as { totalAvailable?: unknown } | undefined;
      const totalAvailable = typeof summary?.totalAvailable === "number" ? summary.totalAvailable : null;
      if (totalAvailable === null) return res.status(500).json({ error: "We could not load your referral credits" });
      res.set("Cache-Control", "private, no-store");
      res.json({ level, cost, totalAvailable, shortfall: Math.max(0, cost - totalAvailable) });
    } catch { res.status(500).json({ error: "We could not price this ask" }); }
  });
  app.post("/api/company-referrals", async (req, res) => {
    let actorUserId: number | undefined;
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in before sending a private company request" });
      actorUserId = identity.account.id;
      const { targetRoleUrl, attachmentIds, confirmedCompanyDomain, compensation, fastTrackCode, fastTrackCompanySlug, fastTrackAlias, companySlug, expectedCoverage } = req.body as { companySlug?: string; targetRoleUrl?: string; attachmentIds?: number[]; confirmedCompanyDomain?: string; compensation?: string; fastTrackCode?: string; fastTrackCompanySlug?: string; fastTrackAlias?: string; expectedCoverage?: string };
      // Optional seeker-confirmed function; absent means the server infers it from the job link.
      const chosenFunction = askJobFunctionInputSchema.safeParse(req.body?.jobFunction);
      if (!chosenFunction.success) return res.status(400).json({ error: "Choose a function from the list" });
      const idempotencyKey = typeof req.get("Idempotency-Key") === "string" ? req.get("Idempotency-Key")!.trim() : "";
      if (!/^[\x21-\x7E]{16,64}$/.test(idempotencyKey)) return res.status(428).json({ error: "A valid Idempotency-Key header is required" });
      if (!targetRoleUrl || !Array.isArray(attachmentIds) || attachmentIds.length === 0) return res.status(400).json({ error: "A Target Role URL and at least one resume document are required" });
      if (!isValidTargetRoleUrl(targetRoleUrl)) return res.status(400).json({ error: TARGET_ROLE_URL_ERROR });
      // The note is read from candidateMessage (the app) or personalPitch; any other key is ignored.
      const note = resolveAskNote(req.body);
      if (!note.ok) return res.status(400).json({ error: note.error });
      const personalPitch = note.personalPitch;
      const safeCompensation = typeof compensation === "string" && compensation.trim() ? compensation.trim().slice(0, 80) : undefined;
      const safeFastTrackCode = typeof fastTrackCode === "string" && /^[a-zA-Z0-9-]{16,64}$/.test(fastTrackCode) ? fastTrackCode : undefined;
      const safeFastTrackCompanySlug = typeof fastTrackCompanySlug === "string" && /^[a-z0-9-]{1,48}$/.test(fastTrackCompanySlug) ? fastTrackCompanySlug : undefined;
      const safeFastTrackAlias = typeof fastTrackAlias === "string" && /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(fastTrackAlias) ? fastTrackAlias : undefined;
      if ((fastTrackCompanySlug || fastTrackAlias) && (!safeFastTrackCompanySlug || !safeFastTrackAlias)) return res.status(400).json({ error: "This private referral alias is invalid" });
      if (fastTrackCode && !safeFastTrackCode) return res.status(400).json({ error: "This private referral link is invalid" });
      // A request made from a company's page (/explore/:slug) must use a job link
      // that belongs to that company; the directory owns the allowed domains.
      let selectedCompany: { name: string; domains: string[] } | undefined;
      if (companySlug !== undefined && companySlug !== null && companySlug !== "") {
        if (typeof companySlug !== "string" || !/^[a-z0-9-]{1,48}$/.test(companySlug)) return res.status(400).json({ error: "Choose a company from the list" });
        selectedCompany = await (deps.getCompanyDirectoryEntry ?? defaultCompanyDirectoryEntry)(companySlug);
        if (!selectedCompany) return res.status(400).json({ error: "Choose a company from the list" });
      }
      // A post selection from "/ask?post=<id>" must parse as one positive
      // integer id; anything else is refused so a typo never silently becomes
      // a plain ask (the message matches the DB's stale-post wording).
      const opportunitySelection = req.body?.opportunityId === undefined || req.body?.opportunityId === null
        ? null
        : opportunityAskSelectionSchema.safeParse({ opportunityId: req.body.opportunityId });
      if (opportunitySelection && !opportunitySelection.success) return res.status(400).json({ error: "That opening is no longer available. Refresh the company page and choose again." });
      // Task 13: the showcase pieces pinned to this ask. A malformed list is
      // refused here rather than ignored, so a typo never sends the ask without
      // the work the seeker meant to show. Duplicates are folded once, here, so
      // the analytics count and the forwarded list both describe what actually
      // rides along (D-088: truthful numbers) — [12,12] is one piece, not two.
      const pinnedWork = askWorkItemIdsSchema.safeParse(req.body?.workItemIds ?? []);
      if (!pinnedWork.success) return res.status(400).json({ error: "Pin work from your showcase, or send the ask without it." });
      const pinnedWorkIds = dedupeAskWorkItemIds(pinnedWork.data);
      const result = await deps.createCompanyReferralRequest(identity.account.id, { ...(selectedCompany ? { selectedCompany: { name: selectedCompany.name, domains: selectedCompany.domains } } : {}), ...(opportunitySelection?.success ? { opportunityId: opportunitySelection.data.opportunityId } : {}), targetRoleUrl: normalizeTargetRoleUrl(targetRoleUrl), attachmentIds, personalPitch, idempotencyKey, confirmedCompanyDomain: typeof confirmedCompanyDomain === "string" ? confirmedCompanyDomain : undefined, compensation: safeCompensation, fastTrackCode: safeFastTrackCode, fastTrackCompanySlug: safeFastTrackCompanySlug, fastTrackAlias: safeFastTrackAlias, submittedTargetRoleUrl: targetRoleUrl.trim(), ...(chosenFunction.data ? { jobFunction: chosenFunction.data } : {}), ...(pinnedWorkIds.length ? { workItemIds: pinnedWorkIds } : {}), ...(expectedCoverage === "waiting_for_company_coverage" ? { expectedCoverage } : {}) });
      // Referrer email + Slack delivery runs after the response (shared dispatcher, D-137):
      // the ask is already committed, each send has a durable claim/lease row, and every
      // outcome (with elapsedMs) goes to the audit log, so a slow or dead send never holds
      // the seeker on "Sending your ask...".
      dispatchReferralReviewDeliveries({ deps, record, origin: publicOutboundOrigin(req), result, actorUserId: identity.account.id });
      const requests = await deps.listJobSeekerCompanyReferrals?.(identity.account.id);
      const lifetimeRequestCount = Array.isArray(requests) ? requests.length : undefined;
      record({ actorUserId: identity.account.id, action: "company_referral.created", outcome: "success", resourceType: "referral_request", resourceId: result.requestId, companyDomain: result.companyDomain, metadata: { attachmentCount: attachmentIds.length, pinnedWorkCount: pinnedWorkIds.length, notifiedEmployees: result.notifiedEmployees, creditReserved: result.coverageStatus !== "waiting_for_company_coverage", coverageStatus: result.coverageStatus ?? "covered", fastTrack: Boolean(result.fastTrack), fromPost: Boolean(result.fromPost), firstLook: Boolean(result.firstLook), jobFunctionChosen: Boolean(chosenFunction.data) } });
      if (result.coverageStatus === "waiting_for_company_coverage") {
        record({ actorUserId: identity.account.id, action: "company_referral.manual_follow_up_queued", outcome: "success", resourceType: "referral_request", resourceId: result.requestId, companyDomain: result.companyDomain, metadata: { notifiedEmployees: 0, creditReserved: false } });
      }
      res.status(result.replayed ? 200 : 201).json({ ...withParsedJobFunction(result), ...(lifetimeRequestCount ? { lifetimeRequestCount } : {}) });
    } catch (error) {
      // Plan open-ask cap: refused before any side effect, with the slots payload the kit nudge reads.
      if (error instanceof OpenAskSlotCapError) {
        record({ actorUserId, action: "company_referral.slot_cap_reached", outcome: "denied", resourceType: "referral_request", metadata: { open: error.slots.open, cap: error.slots.cap, plan: error.slots.plan } });
        return res.status(409).json({ error: error.message, code: error.code, slots: error.slots });
      }
      // D-006 per-company fairness cap: refused before any side effect, same body shape on every plan.
      if (error instanceof CompanyCapReachedError) {
        record({ actorUserId, action: "company_referral.company_cap_reached", outcome: "denied", resourceType: "referral_request", companyDomain: error.companyDomain, metadata: { open: error.open, cap: error.cap } });
        return res.status(409).json(companyCapReachedSchema.parse({ error: error.message, code: error.code, companyDomain: error.companyDomain, open: error.open, cap: error.cap }));
      }
      // D-132 item 3: composed as free-waiting but coverage opened up - nothing
      // was created or charged; the composer re-prices and the seeker re-sends.
      if (error instanceof CoverageOpenedUpError) {
        record({ actorUserId, action: "company_referral.coverage_changed", outcome: "denied", resourceType: "referral_request", companyDomain: error.companyDomain });
        return res.status(409).json({ error: error.message, code: error.code, companyDomain: error.companyDomain });
      }
      // P0-block-delivery: a personal link whose owner is blocked with the seeker answers exactly like an inactive link
      // (same 400 and words, so the block is not revealed); the denial is recorded like every other blocked request.
      if (error instanceof BlockedPersonalLinkError) {
        record({ actorUserId, action: "company_referral.blocked_denied", outcome: "denied", resourceType: "referral_request", metadata: { path: "personal_link_create" } });
        return res.status(400).json({ error: error.message });
      }
      // Task 13: more pinned work than the plan puts in front of a referrer. The
      // same typed 409 the showcase routes answer, thrown before the ask exists.
      if (error instanceof PlanLimitError) {
        record({ actorUserId, action: "company_referral.pinned_work_limit_reached", outcome: "denied", resourceType: "referral_request", metadata: { limit: error.limit, cap: error.cap } });
        return res.status(409).json({ error: error.message, code: error.code, limit: error.limit, cap: error.cap });
      }
      // A piece that stopped being the caller's own while the ask was written.
      if (error instanceof Error && error.name === "AskWorkItemNotInShowcaseError") return res.status(400).json({ error: error.message });
      res.status(error instanceof Error && error.name === "ReferralIdempotencyConflictError" ? 409 : /credit|document|link|company domain|employer behind|submission key|opening/i.test(error instanceof Error ? error.message : "") ? 400 : 500).json({ error: error instanceof Error ? error.message : "We could not send this private referral request" }); }
  });
  app.get("/api/credits/summary", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view your referral credits" });
      const role = req.query.role === "referrer" ? "referrer" : "job_seeker";
      // D-079: after the hosted page redirects back, the webhook may lag; re-read provider truth first (fail-open).
      if (role === "job_seeker" && deps.reconcileCardValidation) { try { await deps.reconcileCardValidation(identity.account.id); } catch { /* the summary still loads; the alert fired inside */ } }
      const summary = await deps.getCreditSummary?.(identity.account.id, role);
      if (!summary) return res.status(500).json({ error: "We could not load your referral credits" });
      // Seeker open-ask slots ride on the summary; fail-open: a count failure omits them, never the credits.
      let slots: OpenAskSlots | undefined;
      if (role === "job_seeker" && deps.getOpenAskSlots) {
        try { slots = await deps.getOpenAskSlots(identity.account.id, Date.now()); } catch { slots = undefined; }
      }
      res.set("Cache-Control", "private, no-store");
      res.json({ summary: slots && typeof summary === "object" ? { ...summary, slots } : summary });
    } catch { res.status(500).json({ error: "We could not load your referral credits" }); }
  });
  // The caller's own credit ledger rows (kit credits panel): owner only, newest first, never cached.
  app.get("/api/credits/ledger", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view your credit history" });
      const query = creditLedgerQuerySchema.safeParse(req.query);
      if (!query.success) return res.status(400).json({ error: "Choose a role and a page size of 1 to 100" });
      const entries = await (deps.listCreditLedger ?? listCreditLedger)(identity.account.id, query.data.role, query.data.limit);
      res.set("Cache-Control", "private, no-store");
      res.json(creditLedgerResponseSchema.parse({ entries }));
    } catch { res.status(500).json({ error: "We could not load your credit history" }); }
  });
  app.get("/api/billing/receipts", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view your receipts" });
      const role = req.query.role === "referrer" ? "referrer" : "job_seeker";
      const receipts = await (deps.listMyPaymentReceipts ?? listMyPaymentReceipts)(identity.account.id, role);
      res.set("Cache-Control", "private, no-store");
      res.json({ receipts });
    } catch { res.status(500).json({ error: "We could not load your receipts" }); }
  });
  app.get("/api/seeker-alerts", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view your alerts" });
      const alerts = await (deps.listSeekerAlerts ?? listSeekerAlerts)(identity.account.id);
      res.set("Cache-Control", "private, no-store");
      res.json({ alerts });
    } catch { res.status(500).json({ error: "We could not load your alerts" }); }
  });
  app.post("/api/seeker-alerts", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to watch a company" });
      const alert = await (deps.createSeekerAlert ?? createSeekerAlert)(identity.account.id, { companyDomain: req.body?.companyDomain });
      record({ actorUserId: identity.account.id, action: "seeker_alert.created", outcome: "success", resourceType: "seeker_alert", resourceId: (alert as { id?: number }).id });
      res.status(201).json({ alert });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not save this alert";
      res.status(/valid company domain|alerts|already watch/i.test(message) ? 400 : 500).json({ error: message });
    }
  });
  app.patch("/api/seeker-alerts/:alertId", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      const alertId = Number(req.params.alertId);
      if (!identity) return res.status(401).json({ error: "Sign in to change your alerts" });
      if (!Number.isInteger(alertId) || alertId <= 0) return res.status(400).json({ error: "Invalid alert" });
      const alert = await (deps.setSeekerAlertPaused ?? setSeekerAlertPaused)(identity.account.id, alertId, req.body?.paused !== false);
      res.json({ alert });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not update this alert";
      res.status(/not in your account/i.test(message) ? 404 : 500).json({ error: message });
    }
  });
  app.delete("/api/seeker-alerts/:alertId", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      const alertId = Number(req.params.alertId);
      if (!identity) return res.status(401).json({ error: "Sign in to remove your alerts" });
      if (!Number.isInteger(alertId) || alertId <= 0) return res.status(400).json({ error: "Invalid alert" });
      const result = await (deps.deleteSeekerAlert ?? deleteSeekerAlert)(identity.account.id, alertId);
      record({ actorUserId: identity.account.id, action: "seeker_alert.deleted", outcome: "success", resourceType: "seeker_alert", resourceId: alertId });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not remove this alert";
      res.status(/not in your account/i.test(message) ? 404 : 500).json({ error: message });
    }
  });
  const loadAccess = async (userId: number): Promise<ReferrerAccessResponse> => {
    const access = await deps.getVerifiedWorkEmailAccess?.(userId);
    const [named] = access ? await attachCompanyIdentities([access], row => row.workEmailDomain, lookupCompanies) : [];
    return { verifiedCompanyAccess: Boolean(access), workEmailDomain: access?.workEmailDomain ?? null, companyName: named?.companyName ?? null, companyInitials: named?.companyInitials ?? null } satisfies ReferrerAccessResponse;
  };
  app.get("/api/company-referrals/access", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in with your company email to continue" });
      const body = await loadAccess(identity.account.id);
      res.set("Cache-Control", "private, no-store");
      res.json(body);
    } catch { res.status(500).json({ error: "We could not check your company-email access" }); }
  });
  app.get("/api/referrer-impact/me", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in with your company email to view private impact" });
      const summary = await (deps.getPrivateReferrerImpactSummary ?? getPrivateReferrerImpactSummary)(identity.account.id);
      res.set("Cache-Control", "private, no-store");
      res.json({ summary });
    } catch (error) { res.status(/verify your company email/i.test(error instanceof Error ? error.message : "") ? 403 : 500).json({ error: error instanceof Error ? error.message : "We could not load private impact" }); }
  });
  app.get("/api/referral-impact", async (_req, res) => {
    try {
      const impact = await deps.getPublicReferralImpact?.() ?? { acceptedReferrals: 0 };
      res.set("Cache-Control", "public, max-age=120");
      res.json({ acceptedReferrals: Math.max(0, Math.floor(impact.acceptedReferrals)) });
    } catch { res.status(503).json({ error: "Referral impact is unavailable right now" }); }
  });
  app.get("/api/referrer/impact-summary", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in with your work email to see your referral impact" });
      if (!deps.getReferrerImpactSummary) return res.status(503).json({ error: "Your referral impact is unavailable right now" });
      const summary = await deps.getReferrerImpactSummary(identity.account.id);
      record({ actorUserId: identity.account.id, action: "referrer_impact.viewed", outcome: "success", resourceType: "referrer_impact", metadata: { acceptedReferrals: summary.acceptedReferrals, introductions: summary.introductions, activeConversations: summary.activeConversations, outcomesShared: summary.outcomesShared, pendingRequests: summary.pendingRequests } });
      res.set("Cache-Control", "private, no-store");
      res.json(summary);
    } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : "We could not load your referral impact" }); }
  });
  app.get("/api/referrer-fast-track/me", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in with your verified company email to create your link" });
      if (!deps.getOrCreateReferrerFastTrackLink) return res.status(503).json({ error: "Your link is unavailable right now" });
      const link = await deps.getOrCreateReferrerFastTrackLink(identity.account.id);
      const origin = publicOutboundOrigin(req);
      const url = `${origin}/fast/${encodeURIComponent(link.linkCode)}`;
      const vanityUrl = `${origin}/refer/${encodeURIComponent(link.companyDomain.split(".")[0] || link.companyDomain)}/${encodeURIComponent(link.vanityAlias)}`;
      record({ actorUserId: identity.account.id, action: "referrer_fast_track.link_accessed", outcome: "success", resourceType: "referrer_fast_track", companyDomain: link.companyDomain, metadata: { active: link.isActive } });
      res.set("Cache-Control", "private, no-store");
      res.json({ link: { ...link, url, vanityUrl, suggestedBioCopy: `Private referral requests at ${link.companyDomain} via skipwait.me.` } });
    } catch (error) { res.status(/verify your company email/i.test(error instanceof Error ? error.message : "") ? 403 : 500).json({ error: error instanceof Error ? error.message : "We could not create your link" }); }
  });
  app.post("/api/referrer-fast-track/me/deactivate", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to pause your link" });
      if (!deps.deactivateReferrerFastTrackLink) return res.status(503).json({ error: "Your link is unavailable right now" });
      const result = await deps.deactivateReferrerFastTrackLink(identity.account.id);
      record({ actorUserId: identity.account.id, action: "referrer_fast_track.link_paused", outcome: "success", resourceType: "referrer_fast_track", metadata: { deactivated: result.deactivated } });
      res.set("Cache-Control", "private, no-store");
      res.json(result);
    } catch { res.status(500).json({ error: "We could not pause your link" }); }
  });
  app.get("/api/referrer-fast-track/:linkCode", async (req, res) => {
    try {
      if (!deps.getPublicReferrerFastTrackLink) return res.status(503).json({ error: "Your link is unavailable right now" });
      const link = await deps.getPublicReferrerFastTrackLink(req.params.linkCode);
      if (!link) return res.status(404).json({ error: "This private referral link is no longer active" });
      record({ action: "referrer_fast_track.link_resolved", outcome: "success", resourceType: "referrer_fast_track", companyDomain: link.companyDomain, metadata: { public: true } });
      res.set("Cache-Control", "no-store");
      res.json({ link });
    } catch { res.status(500).json({ error: "We could not open this private referral link" }); }
  });
  app.get("/api/referrer-fast-track/vanity/:companySlug/:vanityAlias", async (req, res) => {
    try {
      if (!deps.getPublicReferrerFastTrackVanityLink) return res.status(503).json({ error: "Your link is unavailable right now" });
      const link = await deps.getPublicReferrerFastTrackVanityLink(req.params.companySlug, req.params.vanityAlias);
      if (!link) return res.status(404).json({ error: "This private referral link is no longer active" });
      record({ action: "referrer_fast_track.vanity_resolved", outcome: "success", resourceType: "referrer_fast_track", companyDomain: link.companyDomain, metadata: { public: true } });
      res.set("Cache-Control", "no-store");
      res.json({ link });
    } catch { res.status(500).json({ error: "We could not open this private referral link" }); }
  });
  app.post("/api/smart-pitch", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to create a private starting draft" });
      const { attachmentId, targetRoleUrl, companyDomain } = req.body as { attachmentId?: number; targetRoleUrl?: string; companyDomain?: string };
      if (!Number.isInteger(attachmentId) || !targetRoleUrl || !isValidTargetRoleUrl(targetRoleUrl)) return res.status(400).json({ error: "Add a valid Target Role URL and uploaded resume first" });
      const attachment = await (deps.getOwnedResumeAttachmentForPitch ?? getOwnedResumeAttachmentForPitch)(identity.account.id, Number(attachmentId));
      const requestedCompany = typeof companyDomain === "string" && /^[a-z0-9][a-z0-9.-]{1,251}[a-z0-9]$/i.test(companyDomain.trim()) ? companyDomain.trim().toLowerCase() : new URL(targetRoleUrl).hostname.replace(/^www\./, "").toLowerCase();
      let resumeUrl: string | undefined;
      if (attachment.mimeType === "application/pdf") { try { resumeUrl = await deps.storageGetSignedUrl(attachment.fileKey); } catch { resumeUrl = undefined; } }
      const draft = await (deps.draftSmartReferralPitch ?? draftSmartReferralPitch)({ companyDomain: requestedCompany, targetRoleUrl: normalizeTargetRoleUrl(targetRoleUrl), resumeUrl, resumeMimeType: attachment.mimeType });
      record({ actorUserId: identity.account.id, action: "smart_pitch.drafted", outcome: "success", resourceType: "attachment", resourceId: attachment.id, companyDomain: requestedCompany, metadata: { pdfUsed: Boolean(resumeUrl) } });
      res.set("Cache-Control", "private, no-store");
      res.json({ draft });
    } catch (error) { const message = error instanceof Error ? error.message : "We could not create a starting draft"; const status = /private resume is unavailable/i.test(message) ? 403 : 500; const safeMessage = status === 403 || /resume|draft|upload|document|PDF|Word|PNG|JPEG/i.test(message) ? message : "We could not create a starting draft"; res.status(status).json({ error: safeMessage }); }
  });
  app.post("/api/referral-share-cards/:requestId", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId);
      if (!identity) return res.status(401).json({ error: "Sign in to create a share card" });
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral reference" });
      const card = await (deps.getOrCreateReferralShareCard ?? getOrCreateReferralShareCard)(identity.account.id, requestId);
      const shareUrl = `${publicOutboundOrigin(req)}/share-card/${encodeURIComponent(card.shareToken)}`;
      record({ actorUserId: identity.account.id, action: "referral_share_card.created", outcome: "success", resourceType: "referral_share_card", resourceId: requestId, companyDomain: card.companyDomain, metadata: { status: card.status } });
      res.set("Cache-Control", "private, no-store"); res.status(201).json({ shareToken: card.shareToken, shareUrl, companyDomain: card.companyDomain, status: "accepted" });
    } catch (error) { const message = error instanceof Error ? error.message : "We could not create a share card"; res.status(/only available after approval|not part of this private referral/i.test(message) ? 403 : 500).json({ error: message }); }
  });
  app.delete("/api/referral-share-cards/:requestId", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId);
      if (!identity) return res.status(401).json({ error: "Sign in to remove a share card" });
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral reference" });
      const result = await (deps.revokeReferralShareCard ?? revokeReferralShareCard)(identity.account.id, requestId);
      record({ actorUserId: identity.account.id, action: "referral_share_card.revoked", outcome: "success", resourceType: "referral_share_card", resourceId: requestId, metadata: { revoked: result.revoked } });
      res.set("Cache-Control", "private, no-store"); res.json(result);
    } catch (error) { const message = error instanceof Error ? error.message : "We could not remove that share card"; res.status(/only available after approval|not part of this private referral/i.test(message) ? 403 : 500).json({ error: message }); }
  });
  app.get("/api/referral-share-cards/public/:shareToken", async (req, res) => {
    try {
      if (!/^[a-zA-Z0-9-]{16,64}$/.test(req.params.shareToken)) return res.status(404).json({ error: "This share card is unavailable" });
      const card = await (deps.getPublicReferralShareCard ?? getPublicReferralShareCard)(req.params.shareToken);
      if (!card) return res.status(404).json({ error: "This share card is unavailable" });
      record({ action: "referral_share_card.resolved", outcome: "success", resourceType: "referral_share_card", companyDomain: card.companyDomain, metadata: { public: true } });
      res.set("Cache-Control", "no-store"); res.json({ card: { companyDomain: card.companyDomain, status: "accepted", ...(card.inviteCode ? { inviteCode: card.inviteCode } : {}) } });
    } catch { res.status(500).json({ error: "We could not open this share card" }); }
  });
  app.get("/api/referral-share-cards/public/:shareToken/image.png", async (req, res) => {
    try {
      if (!isOpaqueShareToken(req.params.shareToken)) return res.status(404).end();
      const card = await (deps.getPublicReferralShareCard ?? getPublicReferralShareCard)(req.params.shareToken);
      if (!card) return res.status(404).end();
      const companyDomain = escapeHtml(card.companyDomain);
      const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="630" fill="#131311"/><rect x="48" y="48" width="1104" height="534" rx="6" fill="#f4f4f1" stroke="#f0b4a8" stroke-width="3"/><rect x="94" y="100" width="74" height="74" rx="3" fill="#e8442e"/><path d="M112 137h38M131 118v38" stroke="#fff" stroke-width="7" stroke-linecap="round"/><text x="94" y="232" fill="#000" font-family="Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="4">SKIPWAIT.ME · PRIVATE REFERRAL</text><text x="94" y="332" fill="#000" font-family="Arial, sans-serif" font-size="64" font-weight="700">Accepted at ${companyDomain}</text><text x="94" y="405" fill="#505050" font-family="Arial, sans-serif" font-size="34">Shared voluntarily. No hiring outcome is implied.</text><line x1="94" y1="478" x2="1106" y2="478" stroke="#dcdcd4" stroke-width="3"/><text x="94" y="532" fill="#c2351f" font-family="Arial, sans-serif" font-size="28">A factual company-level milestone</text></svg>`;
      const image = await sharp(Buffer.from(svg)).png().toBuffer();
      res.set("Cache-Control", "public, max-age=300"); res.type("png").send(image);
    } catch { res.status(500).end(); }
  });
  app.get("/share-card/:shareToken", async (req, res) => {
    try {
      if (!isOpaqueShareToken(req.params.shareToken)) return res.status(404).type("html").send("<!doctype html><title>Share card unavailable</title><meta name=\"robots\" content=\"noindex\"><body style=\"margin:0;background:#f4f4f1;color:#131311;font-family:Barlow,'Helvetica Neue',Arial,sans-serif\"><main style=\"min-height:100dvh;display:grid;place-items:center;padding:24px;box-sizing:border-box\"><section style=\"max-width:420px;border:1px solid #dcdcd4;border-radius:3px;background:#fbfbf8;padding:28px;text-align:center\"><h1 style=\"margin:0;font-size:26px\">Share card unavailable</h1><p style=\"margin:12px 0 0;color:#5f5f58;line-height:1.5\">This voluntary milestone card may have been removed.</p></section></main></body>");
      const card = await (deps.getPublicReferralShareCard ?? getPublicReferralShareCard)(req.params.shareToken);
      if (!card) return res.status(404).type("html").send("<!doctype html><title>Share card unavailable</title><meta name=\"robots\" content=\"noindex\"><body style=\"margin:0;background:#f4f4f1;color:#131311;font-family:Barlow,'Helvetica Neue',Arial,sans-serif\"><main style=\"min-height:100dvh;display:grid;place-items:center;padding:24px;box-sizing:border-box\"><section style=\"max-width:420px;border:1px solid #dcdcd4;border-radius:3px;background:#fbfbf8;padding:28px;text-align:center\"><h1 style=\"margin:0;font-size:26px\">Share card unavailable</h1><p style=\"margin:12px 0 0;color:#5f5f58;line-height:1.5\">This voluntary milestone card may have been removed.</p></section></main></body>");
      const origin = publicOutboundOrigin(req); const canonicalUrl = `${origin}/share-card/${encodeURIComponent(req.params.shareToken)}`; const imageUrl = `${origin}/api/referral-share-cards/public/${encodeURIComponent(req.params.shareToken)}/image.png`; const companyDomain = escapeHtml(card.companyDomain);
      record({ action: "referral_share_card.viewed", outcome: "success", resourceType: "referral_share_card", companyDomain: card.companyDomain, metadata: { public: true } });
      const joinHref = card.inviteCode ? `${origin}/start?invite=${encodeURIComponent(card.inviteCode)}` : `${origin}/start`;
      res.set("Cache-Control", "no-store"); res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Accepted referral at ${companyDomain} | skipwait.me</title><meta name="description" content="A voluntarily shared referral acceptance milestone at ${companyDomain}. No hiring outcome is implied."><link rel="canonical" href="${canonicalUrl}"><meta property="og:type" content="website"><meta property="og:site_name" content="skipwait.me"><meta property="og:title" content="Accepted at ${companyDomain}"><meta property="og:description" content="Shared voluntarily. No hiring outcome is implied."><meta property="og:url" content="${canonicalUrl}"><meta property="og:image" content="${imageUrl}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="Accepted at ${companyDomain}"><meta name="twitter:description" content="Shared voluntarily. No hiring outcome is implied."><meta name="twitter:image" content="${imageUrl}"><style>body{margin:0;background:#f4f4f1;color:#131311;font-family:Barlow,'Helvetica Neue',Arial,sans-serif}.card{box-sizing:border-box;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px}.panel{width:min(100%,520px);border:1px solid #dcdcd4;border-radius:3px;background:#fbfbf8;padding:32px}.mark{display:grid;place-items:center;width:48px;height:48px;border-radius:2px;background:#e8442e;color:#131311;font-weight:800;font-size:24px}.eyebrow{margin:24px 0 0;color:#131311;font-size:12px;font-weight:800;letter-spacing:.14em}.title{margin:12px 0 0;font-size:38px;font-weight:700;line-height:.95;text-transform:uppercase;letter-spacing:.005em}.copy{margin:20px 0 0;color:#505050;font-size:16px;line-height:1.55}.note{margin:20px 0 0;border-radius:2px;background:#fbe0da;padding:14px;color:#131311;font-size:14px;line-height:1.45}.cta{display:block;margin:24px 0 0;border-radius:2px;background:#131311;color:#f4f4f1;text-align:center;text-decoration:none;font-weight:800;font-size:16px;padding:16px}</style></head><body><main class="card"><section class="panel" aria-label="Referral acceptance milestone"><div class="mark">✓</div><p class="eyebrow">SKIPWAIT.ME · PRIVATE REFERRAL</p><h1 class="title">Accepted at ${companyDomain}</h1><p class="copy">A private referral request was accepted at ${companyDomain}.</p><p class="note">Shared voluntarily. No hiring outcome is implied.</p><a class="cta" href="${joinHref}">Get your own referral</a></section></main></body></html>`);
    } catch { res.status(500).type("html").send("<!doctype html><title>Share card unavailable</title>"); }
  });
  app.get("/api/personal-invites/me", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to create your personal invite link" });
      // D-155: the link unlocks after the first paid invoice; locked accounts
      // get no invite row and a 200 with locked: true, never an error.
      if (deps.getPersonalReferralInviteState) {
        const state = await deps.getPersonalReferralInviteState(identity.account.id);
        return res.json({ invite: state.status === "unlocked" ? { inviteCode: state.inviteCode } : null, locked: state.status === "locked" });
      }
      if (!deps.getOrCreatePersonalReferralInvite) return res.status(503).json({ error: "Personal invites are not available yet" });
      const invite = await deps.getOrCreatePersonalReferralInvite(identity.account.id);
      res.json({ invite, locked: false });
    } catch { res.status(500).json({ error: "We could not create your personal invite link" }); }
  });
  app.post("/api/personal-invites/claim", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      const inviteCode = typeof req.body?.inviteCode === "string" ? req.body.inviteCode.slice(0, 64) : "";
      const verifiedEmail = identity?.primaryEmail?.emailAddress?.trim().toLowerCase() ?? "";
      if (!identity) return res.status(401).json({ error: "Sign in before claiming an invite" });
      if (!inviteCode) return res.status(400).json({ error: "An invite code is required" });
      if (!verifiedEmail || identity.primaryEmail?.verification?.status !== "verified") return res.status(403).json({ error: "Verify your email before claiming an invite" });
      if (!deps.claimPersonalReferralInvite) return res.status(503).json({ error: "Personal invites are not available yet" });
      const reward = await deps.claimPersonalReferralInvite(identity.account.id, { inviteCode, verifiedEmail });
      record({ actorUserId: identity.account.id, action: "personal_invite.claimed", outcome: reward.rewarded ? "success" : "denied", resourceType: "personal_invite", metadata: { rewarded: reward.rewarded, reason: reward.reason ?? null, tokenCount: reward.tokenCount ?? 0 } });
      res.json({ reward });
    } catch { res.status(500).json({ error: "We could not apply that invite" }); }
  });
  app.get("/api/company-referrals/mine", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view your referral requests" });
      // Reconcile-on-read: stale unclaimed asks close with their credit
      // refunded. Fail-open — a reconcile failure never blocks listing.
      let expiredRequestIds: number[] = [];
      try {
        if (deps.reconcileExpiredPendingReferrals) expiredRequestIds = (await deps.reconcileExpiredPendingReferrals(identity.account.id, Date.now())).expiredRequestIds ?? [];
      } catch { expiredRequestIds = []; }
      const listed = await deps.listJobSeekerCompanyReferrals?.(identity.account.id) ?? [];
      const toExpiresAt = (row: Record<string, unknown>): string | null => {
        const createdAt = row.createdAt;
        if (typeof createdAt !== "string" && !(createdAt instanceof Date)) return null;
        const coverageVisibleAt = row.coverageVisibleAt;
        // D-061: waiting asks count down 90 days from creation; everything else 7 days from first visibility (creation for pre-0095 rows).
        const expiresAt = getAskShelfLifeEndsAtMs({
          createdAt,
          waitingForCoverage: row.waitingForCoverage === true || row.waitingForCoverage === 1,
          coverageVisibleAt: coverageVisibleAt instanceof Date || typeof coverageVisibleAt === "string" || typeof coverageVisibleAt === "number" ? coverageVisibleAt : null,
        });
        return expiresAt === null ? null : new Date(expiresAt).toISOString();
      };
      const blockedMine = await blockedRequestIds(identity.account.id, listed);
      let requests: Array<Record<string, unknown>> = await attachCompanyIdentities((listed as Array<Record<string, unknown>>).filter(row => !blockedMine.has(Number(row.id))).map((row): Record<string, unknown> => ({ ...withParsedJobFunction(row), expiresAt: toExpiresAt(row) })), row => row.companyDomain, lookupCompanies);
      if (process.env.BYOR_LINK_ENABLED === "true") {
        const waitingForInvite = (row: Record<string, unknown>) => row.status === "pending" && (row.waitingForCoverage === true || row.waitingForCoverage === 1) && row.referrerId == null;
        // Item 12/27: the insider already took the ask, so the row is no longer waiting but still shows its delivered line.
        const takenByReferrer = (row: Record<string, unknown>) => row.status === "pending" && row.referrerId != null;
        const inviteIds = requests.filter(row => waitingForInvite(row) || takenByReferrer(row)).map(row => Number(row.id)).filter(id => Number.isInteger(id) && id > 0);
        if (inviteIds.length) {
          try {
            const listInvites = deps.listAskInvitesForRequests ?? (await import("./askInvites")).listAskInvitesForRequests;
            const invites = await listInvites(identity.account.id, inviteIds);
            requests = requests.map(row => {
              const requestId = Number(row.id);
              if (!Number.isInteger(requestId)) return row;
              const invite = invites.get(requestId);
              if (!invite) return row;
              // A non-waiting row only ever projects the delivered state; an active or claimed link cannot describe it.
              if (!waitingForInvite(row) && !(takenByReferrer(row) && invite.state === "delivered")) return row;
              return { ...row, askInvite: { state: invite.state, createdAt: invite.createdAt, expiresAt: invite.expiresAt } };
            });
          } catch (error) { captureServerError(error, { area: "ask_invite_mine_projection" }); }
        }
      }
      record({ actorUserId: identity.account.id, action: "company_referral.seeker_home_viewed", outcome: "success", resourceType: "request_home", metadata: { requestCount: requests.length, expiredCount: expiredRequestIds.length } });
      // Counted after the expiry reconcile above, so expired asks have already freed their slots.
      let slots: OpenAskSlots | undefined;
      try { slots = await deps.getOpenAskSlots?.(identity.account.id, Date.now()); } catch { slots = undefined; }
      let hasEverAsked = true; // fail closed: a payload doubt must never show first-timer sample rows
      try { hasEverAsked = deps.hasEverCreatedReferralRequest ? await deps.hasEverCreatedReferralRequest(identity.account.id) : true; } catch { hasEverAsked = true; }
      res.json({ requests, expiredRequestIds, hasEverAsked, ...(slots ? { slots } : {}) });
    } catch { res.status(500).json({ error: "We could not load your referral requests" }); }
  });
  const loadInbox = async (userId: number, requestedScope: string) => {
    const scope = requestedScope === "saved" || requestedScope === "completed" ? requestedScope : "new";
    const requests = deps.listCompanyReferralInboxByState ? await deps.listCompanyReferralInboxByState(userId, scope) : await deps.listCompanyReferralInbox(userId);
    const blockedInbox = await blockedRequestIds(userId, requests);
    const visible = requests.filter(row => typeof row !== "object" || row === null || !blockedInbox.has(Number((row as Record<string, unknown>).id)));
    record({ actorUserId: userId, action: "company_referral.inbox_viewed", outcome: "success", resourceType: "inbox", metadata: { requestCount: visible.length, scope } });
    // Sample-filled empty states: durable first-timer flag (claimed OR passed ever).
    // Fails CLOSED (true) so sample rows never show on doubt.
    let hasEverReviewed = true;
    try { hasEverReviewed = deps.hasEverReviewedReferral ? await deps.hasEverReviewedReferral(userId) : true; } catch { hasEverReviewed = true; }
    const withRefs = visible.map(row => {
      const parsed = isRecordRow(row) ? withParsedJobFunction(row) : row;
      const id = Number((parsed as Record<string, unknown>).id);
      // W1: referrers quote the HMAC public ref, never the sequential id.
      return Number.isInteger(id) && id > 0 ? { ...(parsed as Record<string, unknown>), publicRef: publicAskRef(id) } : parsed;
    });
    return { requests: await withCompanyIdentities(withRefs), scope, hasEverReviewed };
  };
  app.get("/api/company-referrals/inbox", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view employee requests" });
      res.json(await loadInbox(identity.account.id, typeof req.query.scope === "string" ? req.query.scope : "new"));
    } catch { res.status(500).json({ error: "We could not load private company requests" }); }
  });
  // One call for the referrer home page: same helpers as the separate endpoints, one sign-in check, sections in parallel.
  // Unverified accounts get no inbox/impact data. A failing section is reported in `failed` and does not hide the others.
  app.get("/api/referrer/home-bundle", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in with your company email to continue" });
      const userId = identity.account.id;
      res.set("Cache-Control", "private, no-store");
      const access = await loadAccess(userId);
      const failed: string[] = [];
      const section = async <T>(name: string, run: () => Promise<T>, skip = false): Promise<T | null> => {
        if (skip) return null;
        try { return await run(); } catch { failed.push(name); return null; }
      };
      const verified = access.verifiedCompanyAccess;
      const [preferences, fresh, completed, profile, impact, thankYous] = await Promise.all([
        section("preferences", () => (deps.getReferrerPreferences ?? getReferrerPreferences)(userId), !verified),
        section("inboxNew", () => loadInbox(userId, "new"), !verified),
        section("inboxCompleted", () => loadInbox(userId, "completed"), !verified),
        section("profile", () => (deps.getMyProfile ?? getMyProfile)(userId), !verified),
        section("impact", () => (deps.getPrivateReferrerImpactSummary ?? getPrivateReferrerImpactSummary)(userId), !verified),
        section("thankYous", () => (deps.listReferrerThankYous ?? listReferrerThankYous)(userId), !verified),
      ]);
      res.json({ access, preferences, inboxNew: fresh, inboxCompleted: completed, profile, impact, thankYous, failed });
    } catch { res.status(500).json({ error: "We could not load your referrer home" }); }
  });
  app.post("/api/company-referrals/availability/open", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in with your verified company email to open referral capacity" });
      if (!deps.openCompanyReferralAvailability) return res.status(503).json({ error: "Referral availability is unavailable right now" });
      const requestedSlotCount = typeof req.body?.slotCount === "number" ? req.body.slotCount : 1;
      if (!Number.isInteger(requestedSlotCount) || requestedSlotCount < 1 || requestedSlotCount > 3) return res.status(400).json({ error: "Open between one and three real referral slots" });
      const result = await deps.openCompanyReferralAvailability(identity.account.id, { slotCount: requestedSlotCount });
      if (result.allocatedCount && deps.getSlotOpenedAlertRecipients) {
        try {
          const recipients = await deps.getSlotOpenedAlertRecipients(identity.account.id, result.allocatedRequestIds);
          const sender = deps.sendSlotOpenedAlertEmail ?? sendSlotOpenedAlertEmail;
          const origin = publicOutboundOrigin(req);
          const deliveries = await Promise.all(recipients.map(recipient => sender({ to: recipient.email ?? "", companyDomain: recipient.companyDomain, requestsUrl: `${origin}/requests` })));
          record({ actorUserId: identity.account.id, action: "company_referral.slot_open_alert_dispatched", outcome: deliveries.some(delivery => delivery.sent) ? "success" : "failure", resourceType: "referral_availability", companyDomain: result.companyDomain, metadata: { allocatedCount: result.allocatedCount, alertRecipientCount: recipients.length, deliveredCount: deliveries.filter(delivery => delivery.sent).length } });
        } catch {
          record({ actorUserId: identity.account.id, action: "company_referral.slot_open_alert_dispatched", outcome: "failure", resourceType: "referral_availability", companyDomain: result.companyDomain, metadata: { allocatedCount: result.allocatedCount } });
        }
      }
      record({ actorUserId: identity.account.id, action: "company_referral.queue_opened", outcome: "success", resourceType: "referral_availability", companyDomain: result.companyDomain, metadata: { requestedSlotCount: result.requestedSlotCount, allocatedCount: result.allocatedCount } });
      res.set("Cache-Control", "private, no-store");
      res.json({ availability: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not open referral capacity";
      res.status(/verify your company email/i.test(message) ? 403 : 409).json({ error: message });
    }
  });
  app.post("/api/company-referrals/:requestId/save", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId);
      const saved = req.body?.saved !== false;
      if (!identity) return res.status(401).json({ error: "Sign in to save a private request" });
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral request" });
      if (await isRequestBlocked(identity.account.id, requestId)) return blockedThreadDeny(identity.account.id, requestId, res);
      if (!deps.saveCompanyReferralRequest) return res.status(501).json({ error: "Saving requests is not available yet" });
      const result = await deps.saveCompanyReferralRequest(identity.account.id, requestId, saved);
      record({ actorUserId: identity.account.id, action: saved ? "company_referral.saved" : "company_referral.unsaved", outcome: "success", resourceType: "referral_request", resourceId: requestId });
      res.json(result);
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "This referral request is no longer available" }); }
  });
  app.post("/api/company-referrals/:requestId/withdraw", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId);
      if (!identity) return res.status(401).json({ error: "Sign in to withdraw a referral request" });
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral reference" });
      if (!deps.withdrawCompanyReferralRequest) return res.status(501).json({ error: "Withdrawing requests is not available yet" });
      // Internal operation metadata must not expand the public withdrawal response.
      const { creditRefunded, ...result } = await deps.withdrawCompanyReferralRequest(identity.account.id, requestId);
      record({ actorUserId: identity.account.id, action: "referral_request.withdrawn", outcome: "success", resourceType: "referral_request", resourceId: requestId, metadata: typeof creditRefunded === "boolean" ? { creditRefunded } : undefined });
      res.set("Cache-Control", "private, no-store"); res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not withdraw this referral request";
      const currentState = typeof error === "object" && error !== null && "currentState" in error ? (error as { currentState: unknown }).currentState : undefined;
      res.status(/not in your account/i.test(message) ? 404 : /no longer be withdrawn|conflicts with the current state/i.test(message) ? 409 : 500).json({ error: message, currentState });
    }
  });
  app.post("/api/company-referrals/:requestId/review", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId);
      const decision = req.body?.decision;
      const message = typeof req.body?.message === "string" ? req.body.message.slice(0, 3000) : undefined;
      if (!identity) return res.status(401).json({ error: "Sign in to review a private request" });
      if (!Number.isInteger(requestId) || requestId <= 0 || (decision !== "approved" && decision !== "declined")) return res.status(400).json({ error: "Choose approve or decline for this referral request" });
      if (await isRequestBlocked(identity.account.id, requestId)) return blockedThreadDeny(identity.account.id, requestId, res);
      if (!deps.reviewReferralRequest) return res.status(501).json({ error: "Reviewing requests is not available yet" });
      const result = await deps.reviewReferralRequest(identity.account.id, { requestId, decision, message });
      record({ actorUserId: identity.account.id, action: `company_referral.${decision}`, outcome: "success", resourceType: "referral_request", resourceId: requestId });
      res.json(result);
    } catch (error) { const currentState = typeof error === "object" && error !== null && "currentState" in error ? (error as { currentState: unknown }).currentState : undefined; res.status(409).json({ error: error instanceof Error ? error.message : "This referral request can no longer be reviewed", currentState }); }
  });
  app.post("/api/company-referrals/:requestId/one-click-review", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId); const decision = req.body?.decision; const declineReason = req.body?.declineReason;
      if (!identity) return res.status(401).json({ error: "Sign in with your verified company email to review this private request" });
      if (!Number.isInteger(requestId) || requestId <= 0 || (decision !== "approved" && decision !== "declined") || (decision === "declined" && !isOneClickDeclineReason(declineReason)) || passReasonOf(req.body) === undefined) return res.status(400).json({ error: "Choose accept or a concise decline reason" });
      // An accept reveals names both ways and the resume, so it must be an explicit confirmed act (the kit
      // checkbox the thread and queue both show); a bare approve call is refused before any state change.
      if (decision === "approved" && req.body?.ethicsConfirmed !== true) return res.status(400).json({ error: "Confirm you will refer only through the company's official process before accepting" });
      if (await isRequestBlocked(identity.account.id, requestId)) return blockedThreadDeny(identity.account.id, requestId, res);
      if (!deps.oneClickReviewReferralRequest) return res.status(503).json({ error: "One-click review is unavailable right now" });
      const result = await deps.oneClickReviewReferralRequest(identity.account.id, { requestId, decision, declineReason: decision === "declined" ? declineReason : undefined, passReason: decision === "declined" ? passReasonOf(req.body) : null });
      record({ actorUserId: identity.account.id, action: `company_referral.one_click_${decision}`, outcome: "success", resourceType: "referral_request", resourceId: requestId, companyDomain: result.companyDomain, metadata: { declineReason: result.declineReason ?? null } });
      if (result.revision === undefined && result.jobSeekerId) notifyInApp(result.jobSeekerId, decision === "approved" ? `Your referral request was accepted at ${result.companyDomain}` : `Update on your referral request — ${result.companyDomain}`, decision === "approved" ? "A verified employee accepted your private request." : `The employee can't help right now${passReasonSeekerLabel(passReasonOf(req.body)) ? ` (${passReasonSeekerLabel(passReasonOf(req.body))})` : ""}. Your request stays active for other employees.`);
      if (!result.replayed && result.jobSeekerId) notifyEmail(result.jobSeekerId, decision === "approved" ? `Your referral was accepted — ${result.companyDomain}` : `Update on your referral request — ${result.companyDomain}`, decision === "approved" ? `<p>A verified employee at <strong>${escapeHtml(result.companyDomain)}</strong> accepted your private referral request.</p>` : result.reopened ? `<p>The employee who was reviewing your request at <strong>${escapeHtml(result.companyDomain)}</strong> can't take it on right now. Your ask is open again to other verified employees there.</p>` : `<p>Your request at <strong>${escapeHtml(result.companyDomain)}</strong> remains visible to other verified employees.</p>`);
      res.set("Cache-Control", "private, no-store"); res.json({ status: result.status, declineReason: result.declineReason });
    } catch (error) { const message = error instanceof Error ? error.message : "This referral request can no longer be reviewed"; const currentState = typeof error === "object" && error !== null && "currentState" in error ? (error as { currentState: unknown }).currentState : undefined; res.status(/verify your work email|no longer available|another verified employee|conflicts with the current state/i.test(message) ? 409 : 500).json({ error: message, currentState }); }
  });
  app.get("/api/referrer-review-links/:linkToken", async (req,res)=>{try{const identity=await deps.resolveIdentity(req);const linkToken=req.params.linkToken;if(!identity)return res.status(401).json({error:"Sign in with your verified company email to use this private review link"});if(!isOpaqueReviewLinkToken(linkToken))return res.status(400).json({error:"This private review link is invalid"});if(!deps.resolveReferrerReviewEmailLink)return res.status(503).json({error:"Email review is unavailable right now"});const link=await deps.resolveReferrerReviewEmailLink(identity.account.id,linkToken);if(await isRequestBlocked(identity.account.id,link.requestId))return blockedThreadDeny(identity.account.id,link.requestId,res);res.set("Cache-Control","private, no-store");res.json({review:{ready:true,decisions:["approved","role_not_a_fit","cannot_support","timing"]}});}catch(error){const message=error instanceof Error?error.message:"This private review link is unavailable";res.status(409).json({error:message});}});
  app.post("/api/referrer-review-links/:linkToken/decision", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const linkToken = req.params.linkToken; const decision = req.body?.decision; const declineReason = req.body?.declineReason;
      if (!identity) return res.status(401).json({ error: "Sign in with your verified company email to use this private review link" });
      if (!isOpaqueReviewLinkToken(linkToken) || (decision !== "approved" && decision !== "declined") || (decision === "declined" && !isOneClickDeclineReason(declineReason)) || passReasonOf(req.body) === undefined) return res.status(400).json({ error: "This private review action is invalid" });
      if (!deps.resolveReferrerReviewEmailLink || !deps.oneClickReviewReferralRequest) return res.status(503).json({ error: "Email review is unavailable right now" });
      const link = await deps.resolveReferrerReviewEmailLink(identity.account.id, linkToken);
      // The same two-way block check as dashboard review, once the link is proven to be this
      // referrer's and before any decision, link use or notice.
      if (await isRequestBlocked(identity.account.id, link.requestId)) return blockedThreadDeny(identity.account.id, link.requestId, res);
      // Same confirmed-accept rule as the dashboard route: names and the resume are revealed on accept.
      // Checked after the link is proven to be this referrer's, so a foreign link keeps its neutral answer.
      if (decision === "approved" && req.body?.ethicsConfirmed !== true) return res.status(400).json({ error: "Confirm you will refer only through the company's official process before accepting" });
      const result = await deps.oneClickReviewReferralRequest(identity.account.id, { requestId: link.requestId, decision, declineReason: decision === "declined" ? declineReason : undefined, passReason: decision === "declined" ? passReasonOf(req.body) : null, reviewLinkToken: linkToken });
      if (result.revision === undefined && deps.consumeReferrerReviewEmailLink) await deps.consumeReferrerReviewEmailLink(identity.account.id, linkToken);
      record({ actorUserId: identity.account.id, action: `company_referral.email_one_click_${decision}`, outcome: "success", resourceType: "referral_request", resourceId: link.requestId, companyDomain: result.companyDomain, metadata: { declineReason: result.declineReason ?? null } });
      if (result.revision === undefined && result.jobSeekerId) notifyInApp(result.jobSeekerId, decision === "approved" ? `Your referral request was accepted at ${result.companyDomain}` : `Update on your referral request — ${result.companyDomain}`, decision === "approved" ? "A verified employee accepted your private request." : `The employee can't help right now${passReasonSeekerLabel(passReasonOf(req.body)) ? ` (${passReasonSeekerLabel(passReasonOf(req.body))})` : ""}. Your request stays active for other employees.`);
      if (!result.replayed && result.jobSeekerId) notifyEmail(result.jobSeekerId, decision === "approved" ? `Your referral was accepted — ${result.companyDomain}` : `Update on your referral request — ${result.companyDomain}`, decision === "approved" ? `<p>A verified employee at <strong>${escapeHtml(result.companyDomain)}</strong> accepted your private referral request.</p>` : result.reopened ? `<p>The employee who was reviewing your request at <strong>${escapeHtml(result.companyDomain)}</strong> can't take it on right now. Your ask is open again to other verified employees there.</p>` : `<p>Your request at <strong>${escapeHtml(result.companyDomain)}</strong> remains visible to other verified employees.</p>`);
      res.set("Cache-Control", "private, no-store"); res.json({ status: result.status, declineReason: result.declineReason });
    } catch (error) { const message = error instanceof Error ? error.message : "This private review link is unavailable"; const currentState = typeof error === "object" && error !== null && "currentState" in error ? (error as { currentState: unknown }).currentState : undefined; res.status(/private review link|no longer available|another verified employee|conflicts with the current state/i.test(message) ? 409 : 500).json({ error: message, currentState }); }
  });
  app.post("/api/company-referrals/:requestId/progress", async (req, res) => {
    const requestId = Number(req.params.requestId);
    let actorUserId: number | undefined;
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to record private referral progress" });
      actorUserId = identity.account.id;
      const status = req.body?.status;
      if (!Number.isInteger(requestId) || requestId <= 0 || !isReferralProgressUpdateStatus(status)) return res.status(400).json({ error: "Choose a real referral progress milestone" });
      if (await isRequestBlocked(actorUserId, requestId)) return blockedThreadDeny(actorUserId, requestId, res);
      if (!deps.updateReferralProgress) return res.status(503).json({ error: "Referral progress updates are unavailable right now" });
      const referenceId = normalizeReferenceId(req.body?.referenceId);
      if (referenceId === undefined || (referenceId !== null && status !== "intro_made")) return res.status(400).json({ error: REFERENCE_ID_ERROR });
      const result = await deps.updateReferralProgress(actorUserId, { requestId, status, referenceId });
      record({ actorUserId, action: "company_referral.progress_updated", outcome: "success", resourceType: "referral_request", resourceId: requestId, metadata: { status: result.status } });
      res.json({ progress: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not record this referral progress";
      record({ actorUserId, action: "company_referral.progress_updated", outcome: "denied", resourceType: "referral_request", resourceId: Number.isInteger(requestId) ? requestId : undefined });
      const currentState = typeof error === "object" && error !== null && "currentState" in error ? (error as { currentState: unknown }).currentState : undefined;
      res.status(/only available after the referral is accepted|not available to you/i.test(message) ? 403 : 409).json({ error: message, currentState });
    }
  });
  app.get("/api/company-referrals/:requestId/conversation", async (req, res) => {
    const requestId = Number(req.params.requestId);
    let actorUserId: number | undefined;
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to open this private conversation" });
      actorUserId = identity.account.id;
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral request" });
      if (!deps.listReferralConversation) return res.status(503).json({ error: "Private conversations are not available yet" });
      if (await isRequestBlocked(actorUserId, requestId)) {
        record({ actorUserId, action: "company_referral.conversation_viewed", outcome: "denied", resourceType: "referral_conversation", resourceId: requestId });
        return res.status(404).json({ error: "This private conversation isn't available" });
      }
      const messages = await deps.listReferralConversation(actorUserId, requestId);
      const progress = await deps.getApprovedReferralProgressStatus?.(actorUserId, requestId);
      record({ actorUserId, action: "company_referral.conversation_viewed", outcome: "success", resourceType: "referral_conversation", resourceId: requestId, metadata: { messageCount: messages.length } });
      res.set("Cache-Control", "private, no-store");
      res.json({ messages, progressStatus: progress?.status, referenceId: progress?.referenceId ?? null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not open this private conversation";
      record({ actorUserId, action: "company_referral.conversation_viewed", outcome: "denied", resourceType: "referral_conversation", resourceId: Number.isInteger(requestId) ? requestId : undefined });
      res.status(/only available after the referral is accepted/i.test(message) ? 409 : 403).json({ error: message });
    }
  });
  app.post("/api/company-referrals/:requestId/conversation", async (req, res) => {
    const requestId = Number(req.params.requestId);
    let actorUserId: number | undefined;
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to send a private message" });
      actorUserId = identity.account.id;
      const recentCount = deps.countRecentMessagesBySender ? await deps.countRecentMessagesBySender(identity.account.id, new Date(Date.now() - 60 * 60 * 1000)) : 0;
      if (recentCount >= 30) { record({ actorUserId: identity.account.id, action: "company_referral.conversation_rate_limited", outcome: "denied", resourceType: "referral_conversation", resourceId: Number.isInteger(requestId) ? requestId : undefined }); return res.status(429).json({ error: "You're sending messages too quickly. Try again in a few minutes." }); }
      const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral request" });
      if (!body) return res.status(400).json({ error: "Write a message before sending" });
      if (body.length > 3000) return res.status(400).json({ error: "Messages can be up to 3,000 characters" });
      if (await isRequestBlocked(actorUserId, requestId)) {
        record({ actorUserId, action: "company_referral.conversation_message_sent", outcome: "denied", resourceType: "referral_conversation", resourceId: requestId });
        return res.status(404).json({ error: "This private conversation isn't available" });
      }
      if (!deps.sendReferralConversationMessage) return res.status(503).json({ error: "Private conversations are not available yet" });
      const message = await deps.sendReferralConversationMessage(actorUserId, requestId, body);
      record({ actorUserId, action: "company_referral.conversation_message_sent", outcome: "success", resourceType: "referral_conversation", resourceId: requestId, metadata: { bodyLength: body.length } });
      res.status(201).json({ message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not send this private message";
      record({ actorUserId, action: "company_referral.conversation_message_sent", outcome: "denied", resourceType: "referral_conversation", resourceId: Number.isInteger(requestId) ? requestId : undefined });
      res.status(/only available after the referral is accepted/i.test(message) ? 409 : 403).json({ error: message });
    }
  });
  // Kit landed journey (queue row 20 slice C): the seeker whose ask ended with a hire
  // records their thank-you, their wall choice and their pay-it-forward answer. The note
  // reaches the referrer's conversation at most once (server/db.ts claims delivery before
  // it sends), and `state.delivered` tells the page the truth when a send failed, so it
  // can offer a retry instead of claiming "thanks sent".
  app.post("/api/landed/journey", async (req, res) => {
    let actorUserId: number | undefined;
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to send your thank-you" });
      actorUserId = identity.account.id;
      const parsed = landedJourneyRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check your thank-you" });
      const requestId = parsed.data.referralRequestId;
      if (await isRequestBlocked(actorUserId, requestId)) return blockedThreadDeny(actorUserId, requestId, res);
      if (!deps.recordLandedJourney) return res.status(503).json({ error: "Thank-yous are not available yet" });
      const state = await deps.recordLandedJourney(actorUserId, parsed.data);
      record({ actorUserId, action: "landed.thanks_recorded", outcome: "success", resourceType: "landed_journey", resourceId: state.referralRequestId, metadata: { delivered: state.delivered, shareOnWall: state.shareOnWall, messageLength: state.thankYouMessage?.length ?? 0 } });
      if (parsed.data.payForward) record({ actorUserId, action: "landed.pay_forward_chosen", outcome: "success", resourceType: "landed_journey", resourceId: state.referralRequestId, metadata: { choice: parsed.data.payForward } });
      res.json({ state });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not send your thank-you";
      const isKnownClientError = /not available to you/i.test(message) || /marks the ask as hired/i.test(message) || /database unavailable/i.test(message);
      if (isKnownClientError) {
        record({ actorUserId, action: "landed.thanks_recorded", outcome: "denied", resourceType: "landed_journey" });
        res.status(/not available to you/i.test(message) ? 404 : /database unavailable/i.test(message) ? 503 : 409).json({ error: message });
      } else {
        record({ actorUserId, action: "landed.thanks_recorded", outcome: "failure", resourceType: "landed_journey" });
        captureServerError(error, { route: "POST /api/landed/journey", actorUserId });
        res.status(500).json({ error: "We could not send your thank-you" });
      }
    }
  });
  // The referrer's private thank-you wall (queue row 20 slice D). Only the notes a seeker
  // let this referrer keep show on the wall; the total counts every one they received.
  app.get("/api/referrer/thank-yous", async (req, res) => {
    let actorUserId: number | undefined;
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in with your company email to continue" });
      actorUserId = identity.account.id;
      res.set("Cache-Control", "private, no-store");
      if (!deps.getVerifiedWorkEmailAccess) return res.status(503).json({ error: "Referrer access is not available yet" });
      const access = await loadAccess(identity.account.id);
      if (!access.verifiedCompanyAccess) { record({ actorUserId: identity.account.id, action: "landed.wall_viewed", outcome: "denied", resourceType: "thank_you_wall" }); return res.status(403).json({ error: "Verify your work email to see your thank-yous" }); }
      const wall = await (deps.listReferrerThankYous ?? listReferrerThankYous)(identity.account.id);
      record({ actorUserId: identity.account.id, action: "landed.wall_viewed", outcome: "success", resourceType: "thank_you_wall", metadata: { noteCount: wall.thankYous.length, total: wall.total } });
      res.json(wall);
    } catch (error) {
      if (actorUserId) record({ actorUserId, action: "landed.wall_viewed", outcome: "failure", resourceType: "thank_you_wall" });
      captureServerError(error, { route: "GET /api/referrer/thank-yous", actorUserId });
      res.status(500).json({ error: "We could not load your thank-yous" });
    }
  });
  app.get("/api/company-referrals/:requestId/preview", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId);
      if (!identity) return res.status(401).json({ error: "Sign in to review this request" });
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral request" });
      if (!deps.getUnclaimedCompanyReferralPreview) return res.status(501).json({ error: "Candidate preview is not available yet" });
      if (await isRequestBlocked(identity.account.id, requestId)) return blockedThreadDeny(identity.account.id, requestId, res);
      const request = await deps.getUnclaimedCompanyReferralPreview(identity.account.id, requestId);
      if (!request) return res.status(404).json({ error: "This private request is not available to your verified company account" });
      const attachments = request.attachments.map(toLockedAskAttachment);
      // Privacy: the seeker's name is never part of the unclaimed preview (revealed only after accept).
      const { candidateName: _withheld, ...anonymousRequest } = request as typeof request & { candidateName?: unknown }; void _withheld;
      const [named] = await attachCompanyIdentities([anonymousRequest], row => row.companyDomain, lookupCompanies);
      const pinnedWorkCount = Array.isArray(request.workItems) ? request.workItems.length : 0;
      record({ actorUserId: identity.account.id, action: "company_referral.preview_viewed", outcome: "success", resourceType: "referral_request", resourceId: requestId, companyDomain: typeof request.companyDomain === "string" ? request.companyDomain : undefined, metadata: { attachmentCount: attachments.length, resumeAccess: "metadata_only", pinnedWorkCount } });
      res.set("Cache-Control", "private, no-store");
      res.json({ request: { ...withParsedJobFunction(anonymousRequest), publicRef: publicAskRef(requestId), companyName: named?.companyName ?? null, companyInitials: named?.companyInitials ?? null, attachments } });
    } catch { res.status(500).json({ error: "We could not load this private candidate preview" }); }
  });
  app.get("/api/company-referrals/:requestId", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      const requestId = Number(req.params.requestId);
      if (!identity) return res.status(401).json({ error: "Sign in to view this request" });
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral request" });
      if (await isRequestBlocked(identity.account.id, requestId)) return blockedThreadDeny(identity.account.id, requestId, res);
      const request = await deps.getClaimedCompanyReferralDetail(identity.account.id, requestId);
      if (!request) return res.status(404).json({ error: "This private request is not assigned to your verified employee account" });
      // D-019(e): an explicit allow-list; before acceptance no seeker name and no file names, ids or links.
      const built = buildClaimedAskDetailView(request);
      if (!built.ok) { captureServerError(built.error, { route: "GET /api/company-referrals/:requestId", requestId }); return res.status(500).json({ error: "We could not load this private referral request" }); }
      const view = built.view;
      const [named] = await attachCompanyIdentities([view], row => row.companyDomain, lookupCompanies);
      const documentLinks = view.attachments.filter(file => isOpenAskAttachment(file) && Boolean(file.url)).length;
      record({ actorUserId: identity.account.id, action: "company_referral.claimed_detail_viewed", outcome: "success", resourceType: "referral_request", resourceId: requestId, companyDomain: view.companyDomain ?? undefined, metadata: { attachmentCount: view.attachments.length, accepted: view.candidateName !== undefined, documentLinks } });
      res.set("Cache-Control", "private, no-store");
      res.json({ request: { ...view, companyName: named?.companyName ?? null, companyInitials: named?.companyInitials ?? null } });
    } catch {
      res.status(500).json({ error: "We could not load this private referral request" });
    }
  });
  app.post("/api/company-referrals/:requestId/claim", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId);
      if (!identity) return res.status(401).json({ error: "Sign in to claim a referral request" });
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral request" });
      if (await isRequestBlocked(identity.account.id, requestId)) return blockedThreadDeny(identity.account.id, requestId, res);
      const result = await deps.claimCompanyReferralRequest(identity.account.id, requestId);
      record({ actorUserId: identity.account.id, action: "company_referral.claimed", outcome: "success", resourceType: "referral_request", resourceId: requestId, companyDomain: result.companyDomain });
      if (result.revision === undefined && result.jobSeekerId) notifyInApp(result.jobSeekerId, "Your referral request was claimed", `A verified employee at ${result.companyDomain ?? "the company"} claimed your private request.`);
      if (!result.replayed && result.jobSeekerId) notifyEmail(result.jobSeekerId, `Your referral request was claimed — ${result.companyDomain ?? "your target company"}`, `<p>A verified employee at <strong>${escapeHtml(result.companyDomain ?? "the company")}</strong> claimed your private referral request.</p>`);
      res.json(claimResponseView(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : "This referral request is no longer available";
      const currentState = typeof error === "object" && error !== null && "currentState" in error ? (error as { currentState: unknown }).currentState : undefined;
      // D-038-A: the 5-claim cap is a state conflict (the referrer must accept or pass one first), never a server fault.
      const capReached = error instanceof Error && error.name === "ReferralTransitionConflict" && /asks at once/i.test(message);
      res.status(/verify your (work|company) email/i.test(message) ? 403 : capReached || /no longer available|already claimed|already passed|conflicts with the current state|expired/i.test(message) ? 409 : /not in your account|not found|no longer exists/i.test(message) ? 404 : 500).json({ error: message, currentState });
    }
  });
  app.post("/api/company-referrals/:requestId/extend-referred-deadline", async (req, res) => {
    if (!referredActionsEnabled) return refuseReferredAction(res);
    try {
      const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId);
      if (!identity) return res.status(401).json({ error: "Sign in to extend this referral deadline" });
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral request" });
      if (await isRequestBlocked(identity.account.id, requestId)) return blockedThreadDeny(identity.account.id, requestId, res);
      const result = await deps.extendReferredDeadlineTx(identity.account.id, requestId, Date.now());
      record({ actorUserId: identity.account.id, action: "company_referral.extend_referred_deadline", outcome: "success", resourceType: "referral_request", resourceId: requestId, metadata: { extended: result.extended, replayed: result.replayed } });
      res.json({ extended: result.extended, replayed: result.replayed ?? false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "This referral request is no longer available";
      const currentState = typeof error === "object" && error !== null && "currentState" in error ? (error as { currentState: unknown }).currentState : undefined;
      res.status(/not in your account|not found|no longer exists/i.test(message) ? 404 : 409).json({ error: message, currentState });
    }
  });
  app.post("/api/company-referrals/:requestId/step-back", async (req, res) => {
    if (!referredActionsEnabled) return refuseReferredAction(res);
    try {
      const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId);
      if (!identity) return res.status(401).json({ error: "Sign in to step back from this referral" });
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral request" });
      if (await isRequestBlocked(identity.account.id, requestId)) return blockedThreadDeny(identity.account.id, requestId, res);
      const result = await deps.stepBackFromReferral(identity.account.id, requestId, Date.now());
      record({ actorUserId: identity.account.id, action: "company_referral.step_back", outcome: "success", resourceType: "referral_request", resourceId: requestId, metadata: { steppedBack: result.lapsed, reason: result.reason } });
      res.json({ steppedBack: result.lapsed, reason: result.reason ?? null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "This referral request is no longer available";
      const currentState = typeof error === "object" && error !== null && "currentState" in error ? (error as { currentState: unknown }).currentState : undefined;
      res.status(/not in your account|not found|no longer exists/i.test(message) ? 404 : 409).json({ error: message, currentState });
    }
  });
  app.post("/api/company-referrals/:requestId/confirm-referred", async (req, res) => {
    if (!referredActionsEnabled) return refuseReferredAction(res);
    try {
      const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId);
      if (!identity) return res.status(401).json({ error: "Sign in to confirm this referral" });
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral request" });
      if (await isRequestBlocked(identity.account.id, requestId)) return blockedThreadDeny(identity.account.id, requestId, res);
      const result = await deps.confirmReferredBySeeker(identity.account.id, requestId, Date.now());
      record({ actorUserId: identity.account.id, action: "company_referral.seeker_confirmed_referred", outcome: "success", resourceType: "referral_request", resourceId: requestId, metadata: { confirmed: result.confirmed, replayed: result.replayed } });
      res.json({ confirmed: result.confirmed, replayed: result.replayed ?? false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "This referral request is no longer available";
      const currentState = typeof error === "object" && error !== null && "currentState" in error ? (error as { currentState: unknown }).currentState : undefined;
      res.status(/not in your account|not found|no longer exists/i.test(message) ? 404 : 409).json({ error: message, currentState });
    }
  });
  app.get("/api/admin/referrals/export.csv", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      const rows = await (deps.listReferralLedger?.() ?? []);
      const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
      const header = ["Ref", "Status", "Company", "Job title", "Location", "Seeker email", "Referrer email", "Created", "Updated"];
      const lines = rows.map(row => [row.ref, row.status, row.company, row.jobTitle, row.jobLocation, row.seekerEmail, row.referrerEmail, row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt, row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt].map(escape).join(","));
      const csv = [header.map(escape).join(","), ...lines].join("\n");
      record({ actorUserId: identity.account.id, action: "admin.referral_ledger_exported", outcome: "success", resourceType: "referral_ledger", metadata: { rowCount: rows.length } });
      res.set("Content-Type", "text/csv; charset=utf-8");
      res.set("Content-Disposition", `attachment; filename="skipwait-referral-ledger-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.set("Cache-Control", "private, no-store");
      res.send(csv);
    } catch { res.status(500).json({ error: "We could not export the referral ledger" }); }
  });
  app.get("/api/admin/activity", async (req, res) => { try { const identity = await deps.resolveIdentity(req); if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" }); const limit = Math.min(250, Math.max(1, Number(req.query.limit) || 100)); const action = typeof req.query.action === "string" ? req.query.action.slice(0, 100) : undefined; const query = typeof req.query.query === "string" ? req.query.query.slice(0, 120) : undefined; const outcome = req.query.outcome === "success" || req.query.outcome === "failure" || req.query.outcome === "denied" ? req.query.outcome : undefined; const events = await deps.listOperationalActivity?.({ limit, action, query, outcome }) ?? []; record({ actorUserId: identity.account.id, action: "admin.activity_viewed", outcome: "success", resourceType: "activity_log", metadata: { limit, filtered: Boolean(action || query || outcome) } }); res.json({ events }); } catch { res.status(500).json({ error: "We could not load operational activity" }); } });
  app.get("/api/admin/approval-queue", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      const limit = Math.min(250, Math.max(1, Number(req.query.limit) || 100));
      const items = await deps.listAdminApprovalQueue?.(limit) ?? [];
      record({ actorUserId: identity.account.id, action: "admin.approval_queue_viewed", outcome: "success", resourceType: "approval_queue", metadata: { limit, queueCount: items.length } });
      res.json({ items });
    } catch { res.status(500).json({ error: "We could not load the approval queue" }); }
  });
  app.post("/api/admin/approval-queue/:kind/:id/decision", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      const kind = req.params.kind;
      const itemId = Number(req.params.id);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      if (kind !== "referral_request" && kind !== "referrer_enrollment" && kind !== "payment" && kind !== "employer_application") return res.status(400).json({ error: "Invalid record type" });
      if (!Number.isInteger(itemId) || itemId <= 0) return res.status(400).json({ error: "Invalid record reference" });
      const decision = req.body?.decision;
      if (decision !== "approved" && decision !== "rejected") return res.status(400).json({ error: "Choose approve or reject for this record" });
      if (!deps.resolveAdminApproval) return res.status(501).json({ error: "Approval decisions are not available yet" });
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) : undefined;
      const result = await deps.resolveAdminApproval(identity.account.id, kind, itemId, decision, note);
      record({ actorUserId: identity.account.id, action: `admin.approval_${decision}`, outcome: "success", resourceType: kind, resourceId: itemId, metadata: { decision, note: typeof note === "string" ? note : null } });
      res.json({ ok: true, status: (result as { status?: string })?.status ?? (decision === "approved" ? "approved" : "declined"), decision });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not record this approval decision";
      const claimedByEmployee = error instanceof Error && error.name === "AdminCannotAcceptClaimedReferralError";
      // A payment the webhook already credited and the provider refunded is never credited again (P0-refund-review).
      res.status(claimedByEmployee || isPaymentReviewRefusal(error) || /already resolved|already reviewed|already been reviewed/i.test(message) ? 409 : /could not be found|does not exist/i.test(message) ? 404 : 500).json({ error: message });
    }
  });
  app.get("/api/admin/users", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
      const users = await deps.listUsersAdmin?.(limit) ?? [];
      record({ actorUserId: identity.account.id, action: "admin.users_viewed", outcome: "success", resourceType: "user_directory", metadata: { limit, userCount: users.length } });
      res.set("Cache-Control", "private, no-store");
      res.json({ users });
    } catch { res.status(500).json({ error: "We could not load the users directory" }); }
  });
  app.post("/api/admin/users/:userId/suspend", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const userId = Number(req.params.userId);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: "Invalid user reference" });
      if (typeof req.body?.suspended !== "boolean") return res.status(400).json({ error: "State whether the account should be suspended" });
      if (userId === identity.account.id && req.body.suspended) return res.status(400).json({ error: "You cannot suspend your own administrator account" });
      if (!deps.setUserSuspended) return res.status(503).json({ error: "User suspension is unavailable right now" });
      const user = await deps.setUserSuspended(userId, req.body.suspended);
      const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 500) : undefined;
      record({ actorUserId: identity.account.id, action: req.body.suspended ? "admin.user_suspended" : "admin.user_unsuspended", outcome: "success", resourceType: "user", resourceId: userId, metadata: { note: typeof note === "string" ? note : null } });
      res.set("Cache-Control", "private, no-store");
      res.json({ user });
    } catch { res.status(500).json({ error: "We could not update this user account" }); }
  });
  app.get("/api/admin/payments/review", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      const limit = Math.min(250, Math.max(1, Number(req.query.limit) || 100));
      const scope = req.query.scope === "credited" ? "credited" : "review";
      const payments = scope === "credited" ? await deps.listRecentPayments?.(limit) ?? [] : await deps.listRequiresReviewPayments?.(limit) ?? [];
      record({ actorUserId: identity.account.id, action: "admin.payment_reviews_viewed", outcome: "success", resourceType: "payment_fulfillment", metadata: { limit, queueCount: payments.length, scope } });
      res.json({ payments });
    } catch { res.status(500).json({ error: "We could not load the payment review queue" }); }
  });
  app.post("/api/admin/payments/review/:paymentId/refund", async (_req, res) => res.status(410).json({ error: "This legacy action did not refund provider money and is disabled. Use the separate credit-revocation action or a provider-confirmed refund workflow." }));
  app.post("/api/admin/payments/review/:paymentId/revoke-credits", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const paymentId = Number(req.params.paymentId);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      if (!Number.isInteger(paymentId) || paymentId <= 0) return res.status(400).json({ error: "Invalid payment reference" });
      if (!deps.revokeCreditedPaymentCredits) return res.status(501).json({ error: "Credit revocation is unavailable" });
      const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 500) : undefined;
      const result = await deps.revokeCreditedPaymentCredits(identity.account.id, paymentId, note);
      record({ actorUserId: identity.account.id, action: "payment.credits_revoked", outcome: "success", resourceType: "payment_fulfillment", resourceId: paymentId, metadata: { provider: result.provider, amount: result.amount, currency: result.currency, tokenCount: result.tokenCount, note: note || null } });
      res.json({ creditsRevoked: true, paymentId });
    } catch (error) { const message = error instanceof Error ? error.message : "We could not revoke these credits"; res.status(409).json({ error: message }); }
  });
  app.post("/api/admin/payments/review/:paymentId", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const paymentId = Number(req.params.paymentId);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      if (!Number.isInteger(paymentId) || paymentId <= 0) return res.status(400).json({ error: "Invalid payment reference" });
      // The shared contract (shared/paymentReview.ts) is checked before anything runs; only a take-back may carry a credit cap.
      const body = paymentReviewRequestSchema.safeParse(req.body ?? {});
      if (!body.success) return res.status(400).json({ error: body.error.issues.some(issue => issue.path[0] === "credits") ? "Enter the credits to take back as a whole number of at least 1" : "Choose a valid decision for this payment" });
      if (!deps.resolveRequiresReviewPayment) return res.status(501).json({ error: "Payment review is not available yet" });
      const { decision, note } = body.data;
      const credits = body.data.decision === "revoke_unused" ? body.data.credits : undefined;
      let payment: PaymentReviewOutcome;
      try {
        payment = await deps.resolveRequiresReviewPayment(identity.account.id, paymentId, decision, note, credits);
      } catch (error) {
        // Why the payment is parked forbids this decision (a refunded pack cannot be credited again): nothing was written.
        if (!isPaymentReviewRefusal(error)) throw error;
        record({ actorUserId: identity.account.id, action: "payment.review_refused", outcome: "denied", resourceType: "payment_fulfillment", resourceId: paymentId, metadata: { decision, reason: error.message } });
        return res.status(409).json({ error: error.message });
      }
      const takeBack = payment.decision === "revoke_unused" ? { requested: payment.requested, revoked: payment.revoked, unrecovered: payment.unrecovered } : {};
      record({ actorUserId: identity.account.id, action: `payment.review_${decision}`, outcome: "success", resourceType: "payment_fulfillment", resourceId: paymentId, metadata: { decision, note: note ?? null, ...takeBack } });
      res.json({ payment });
    } catch (error) {
      // The resolver's own plain messages; a driver error (its text can quote a note) is never one of them.
      const message = error instanceof Error && !isDriverErrorMessage(error.message) ? error.message : "";
      if (/already resolved/i.test(message)) return res.status(409).json({ error: message });
      if (/does not exist/i.test(message)) return res.status(404).json({ error: message });
      // Anything else is unexpected on a money path: report it, and give the page plain words, never the database's.
      const paymentId = Number(req.params.paymentId);
      const decision = typeof req.body?.decision === "string" ? req.body.decision.slice(0, 40) : null;
      console.error("[AdminPaymentReview] decision failed", { paymentId, decision, error });
      captureServerError(error, { route: "POST /api/admin/payments/review/:paymentId", paymentId, decision });
      res.status(500).json({ error: "We could not record this payment decision. Reload this page to check the payment before you try again." });
    }
  });
  app.get("/api/admin/privacy-requests", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      const limit = Math.min(250, Math.max(1, Number(req.query.limit) || 100)); const requests = await deps.listAdminPrivacyRequests?.(limit) ?? [];
      record({ actorUserId: identity.account.id, action: "admin.privacy_requests_viewed", outcome: "success", resourceType: "privacy_request", metadata: { limit } });
      res.json({ requests });
    } catch { res.status(500).json({ error: "We could not load privacy requests" }); }
  });
  app.post("/api/admin/privacy-requests/:requestId/review", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid privacy request" });
      const status = req.body?.status; const resolution = typeof req.body?.resolution === "string" ? req.body.resolution.slice(0, 500) : undefined;
      if (status !== "in_review") return res.status(409).json({ error: "Completion is blocked until a verified erasure workflow records every resource step and retained-data exception. This endpoint can only start review." });
      const request = await deps.reviewPrivacyRequest?.(identity.account.id, requestId, { status, resolution }); if (!request) return res.status(404).json({ error: "Privacy request not found" });
      record({ actorUserId: identity.account.id, action: "admin.privacy_request_reviewed", outcome: "success", resourceType: "privacy_request", resourceId: requestId, metadata: { status } });
      res.json({ request });
    } catch { res.status(500).json({ error: "We could not update this privacy request" }); }
  });
  app.get("/api/admin/domain-integrity", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 200));
      const diagnostic = await deps.getDomainIntegrity?.(limit) ?? { affectedCount: 0, aggregates: {}, affectedRows: [], evidence: { affectedCount: 0, aggregates: {}, affectedRows: [] } };
      record({ actorUserId: identity.account.id, action: "admin.domain_integrity_viewed", outcome: "success", resourceType: "domain_integrity" });
      res.json({ diagnostic });
    } catch { res.status(500).json({ error: "We could not load domain integrity" }); }
  });
  app.get("/api/admin/credit-ledger-audit", async (req,res)=>{try{const identity=await deps.resolveIdentity(req);if(!identity||identity.account.role!=="admin")return res.status(403).json({error:"Administrator access required"});const audit=await deps.getCreditLedgerAudit?.(Math.min(Number(req.query.limit)||200,500));res.set("Cache-Control","private, no-store");res.json(audit??{checkedWallets:0,mismatches:[],integrity:[],readOnly:true});}catch(error){res.status(500).json({error:error instanceof Error?error.message:"Credit ledger audit failed"});}});
  app.get("/api/admin/flow-health", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      // The baseline block is deliberately separate from the live funnel: it is the
      // measurement D-018 asks for (D-034/D-037 need it), and null when unwired so the
      // panel shows nothing rather than invented numbers.
      const [health, baseline] = await Promise.all([
        deps.getReferralFlowHealth?.() ?? { funnel: { requestsCreated: 0, requestsClaimed: 0, decisionsRecorded: 0, waitingForCoverage: 0 }, coverageGaps: [], instrumentation: { uploadedDocuments: 0, recordedFailures: 0 } },
        deps.getReferralFlowBaseline ? deps.getReferralFlowBaseline() : Promise.resolve(null),
      ]);
      record({ actorUserId: identity.account.id, action: "admin.flow_health_viewed", outcome: "success", resourceType: "flow_health" });
      res.set("Cache-Control", "private, no-store");
      res.json({ health, baseline });
    } catch { res.status(500).json({ error: "We could not load referral flow health" }); }
  });
  app.get("/api/admin/revenue", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      const revenue = await deps.getRevenueSummary?.() ?? { byProvider: [], totalsByCurrency: [], refundedTotalByCurrency: [], recordedAt: new Date() };
      record({ actorUserId: identity.account.id, action: "admin.revenue_viewed", outcome: "success", resourceType: "revenue" });
      res.json({ revenue });
    } catch { res.status(500).json({ error: "We could not load revenue" }); }
  });
  app.get("/api/admin/token-recovery/users", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
      if (query.length < 2) return res.status(400).json({ error: "Enter at least two characters to find a user" });
      const users = await deps.findUsersForTokenRecovery?.(query) ?? [];
      record({ actorUserId: identity.account.id, action: "admin.token_recovery_search", outcome: "success", resourceType: "user_lookup", metadata: { resultCount: users.length } });
      res.json({ users });
    } catch { res.status(500).json({ error: "We could not find user accounts" }); }
  });
  app.get("/api/admin/token-recovery/adjustments", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      const adjustments = await deps.listAdminTokenAdjustments?.(Number(req.query.limit) || 20) ?? [];
      res.json({ adjustments });
    } catch { res.status(500).json({ error: "We could not load token recovery history" }); }
  });
  app.post("/api/admin/token-recovery/grants", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      if (req.body?.confirmed !== true) return res.status(400).json({ error: "Confirm that you reviewed the payment or support issue before granting tokens" });
      const recipientUserId = Number(req.body?.recipientUserId); const role = req.body?.role; const tokenCount = Number(req.body?.tokenCount);
      const caseReference = typeof req.body?.caseReference === "string" ? req.body.caseReference : ""; const reason = typeof req.body?.reason === "string" ? req.body.reason : "";
      if ((role !== "job_seeker" && role !== "referrer") || !Number.isInteger(recipientUserId) || !Number.isInteger(tokenCount)) return res.status(400).json({ error: "Choose a user, role, and whole token amount" });
      if (!deps.grantAdminTokenAdjustment) return res.status(501).json({ error: "Token recovery is not available yet" });
      const grant = await deps.grantAdminTokenAdjustment(identity.account.id, { recipientUserId, role, tokenCount, caseReference, reason });
      record({ actorUserId: identity.account.id, action: "admin.token_recovery_granted", outcome: "success", resourceType: "token_adjustment", resourceId: grant.adjustmentId, metadata: { recipientUserId, role, tokenCount } });
      res.status(201).json({ grant });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "We could not create this token recovery grant" }); }
  });
  // Admin schema-migrate trigger: runs the reconciler's FIXED allowlist (the
  // DESIRED_COLUMNS/DESIRED_TABLES DDL in schemaReconcile.ts) against the live
  // DB on demand. No request input reaches the SQL layer, so there is no
  // arbitrary-SQL surface; the admin guard is the only gate. Statement-level
  // results come back so a partial run (e.g. one metadata-lock timeout) is
  // diagnosable without shell access. GET is the no-run inspection snapshot.
  const schemaSnapshot = () => ({ reconciled: isSchemaReconciled(), results: getLastReconcileResults(), firstError: getLastReconcileError() });
  app.get("/api/admin/schema/reconcile", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      res.set("Cache-Control", "private, no-store");
      res.json(schemaSnapshot());
    } catch { res.status(500).json({ error: "We could not load the schema reconcile status" }); }
  });
  app.post("/api/admin/schema/reconcile", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      await reconcileSchema();
      record({ actorUserId: identity.account.id, action: "admin.schema_reconcile_run", outcome: isSchemaReconciled() ? "success" : "failure", resourceType: "schema_reconcile", metadata: { statementCount: getLastReconcileResults().length, reconciled: isSchemaReconciled() } });
      res.set("Cache-Control", "private, no-store");
      res.json(schemaSnapshot());
    } catch { res.status(500).json({ error: "We could not run the schema reconcile" }); }
  });
}
import { isValidTargetRoleUrl, normalizeTargetRoleUrl, TARGET_ROLE_URL_ERROR } from "@shared/referralUrl";
import { assignJobLevel, creditsForLevel } from "../shared/jobLevel";
import { askLevelCostEnabled } from "./db";
