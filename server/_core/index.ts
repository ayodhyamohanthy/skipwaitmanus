import { registerCompanyClaimRoutes } from "../companyClaimRoutes";
import { jsonBodyError } from "../bodyErrors";
import { initServerSentry, captureServerError, flushServerSentry, isServerSentryActive, scrubSentryPath, sentryErrorMiddleware } from "../sentry";
import { registerJobLinkPreviewRoutes } from "../jobLinkPreviewRoutes";

initServerSentry();
if (process.env.NODE_ENV !== "production") {
  console.info(`[Sentry] server reporting ${isServerSentryActive() ? "ACTIVE" : "INACTIVE (set SENTRY_DSN to enable)"}`);
}
import { registerAdminSmokeFixture } from "../adminSmokeFixture";
import "./envBoot";
import { readFile } from "node:fs/promises";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerDbDocumentRoute, registerStorageProxy } from "./storageProxy";
import { dbStorageGet, dbStoragePut } from "../storageDb";
import { appRouter } from "../routers";
import { dataUrlToBuffer, sanitizeDocumentName } from "../documentUpload";
import { getDataExportFile, getLatestDataExport, requestDataExport } from "../dataExport";
import { dbStorageGetBytes } from "../storageDb";
import { storageGetBytes as forgeStorageGetBytes, storageGetSignedUrl as forgeStorageGetSignedUrl, storagePut as forgeStoragePut } from "../storage";
import { r2Configured, storageGetBytes as r2StorageGetBytes, storagePut as r2StoragePut, storageGetSignedUrl as r2StorageGetSignedUrl } from "../storageCloudflare";

// Document storage: Cloudflare R2 when configured (production), legacy Forge
// proxy otherwise (managed dev). Same storagePut/storageGetSignedUrl contract.
// Storage adapter selection: R2 when configured, managed Forge otherwise.
// When NEITHER backend is configured (fresh deployments), fall back to the
// authenticated document proxy route so detail views never 500.
const usingDbStorage = !r2Configured() && !(process.env.BUILT_IN_FORGE_API_URL && process.env.BUILT_IN_FORGE_API_KEY);
const storageGetSignedUrl = r2Configured()
  ? r2StorageGetSignedUrl
  : process.env.BUILT_IN_FORGE_API_URL && process.env.BUILT_IN_FORGE_API_KEY
    ? forgeStorageGetSignedUrl
    : async (key: string) => `/api/documents/by-key/${encodeURIComponent(key)}`;
const storagePut = r2Configured() ? r2StoragePut : process.env.BUILT_IN_FORGE_API_URL && process.env.BUILT_IN_FORGE_API_KEY ? forgeStoragePut : dbStoragePut;
// Server-side byte reads for upload reassembly (never redirects): R2 direct,
// Forge presigned GET, or DB blobs — matching the storagePut selection above.
const storageGetBytes = r2Configured() ? r2StorageGetBytes : process.env.BUILT_IN_FORGE_API_URL && process.env.BUILT_IN_FORGE_API_KEY ? forgeStorageGetBytes : dbStorageGetBytes;
import * as db from "../db";
import { publicCatalogJobs } from "../testCatalogJobs";
import { getReferralFlowBaseline } from "../flowBaseline";
import { sql } from "drizzle-orm";
import { createContext } from "./context";
import { registerDevAuthRoutes, resolveDevIdentity } from "./devAuth";
import { serveStatic, setupVite } from "./vite";
import { registerPrivateReferralRoutes } from "../privateReferralRoutes";
import { askInviteFeatureGateMiddleware, registerAskInviteRoutes } from "../askInviteRoutes";
import { registerImpactCardRoutes } from "../impactCardRoutes";
import { registerCompanyDirectoryRoutes } from "../companyDirectoryRoutes";
import { registerSitemapRoutes } from "../sitemapRoutes";
import { listCompanyDirectory } from "../companyDirectory";
import { registerScheduledJobsRoutes } from "../scheduledJobsRoutes";
import { dispatchReferralReviewDeliveries } from "../referralReviewDispatch";
import { publicOutboundOrigin } from "./authPostGuard";
import { registerSkippieSeekerRoutes, skippieSeekerAllowedIds } from "../skippieSeekerRoutes";
import { createSkippieSeekerDeps } from "../skippieSeekerDeps";
import { createSkippieAdminDeps } from "../skippieAdminDeps";
import { registerEmployerRoutes } from "../employerRoutes";
import { employerSponsorshipEnabled } from "../billingSettings";
import { registerDmRoutes } from "../dmRoutes";
import { registerFollowRoutes } from "../followRoutes";
import { registerAssistantRoutes } from "../assistantRoutes";
import { registerSeekerAgentRoutes } from "../seekerAgentRoutes";
import { createSeekerAgentSourceDeps, createSeekerAgentStore } from "../seekerAgentDeps";
import { registerOAuthRoutes } from "../oauthRoutes";
import { consumeAuthCode, getOAuthClient, issueAuthCode, registerOAuthClient } from "../oauthStore";
import { registerMcpRoutes } from "../mcpRoutes";
import { registerProfileRoutes } from "../profileRoutes";
import { registerAskDraftRoutes } from "../askDraftRoutes";
import { registerSafetyRoutes } from "../safetyRoutes";
import { registerBlocksRoutes } from "../blocksRoutes";
import { createCardValidationPageForUser, reconcileCardValidationFromProvider } from "../cardValidation";
import { registerChargebeeRoutes } from "../chargebeeRoutes";
import { registerAdminBillingCatalogRoutes } from "../adminBillingCatalog";
import { registerAdminCatalogSyncRoutes } from "../adminCatalogSyncRoutes";
import { registerPlansCatalogRoutes } from "../plansCatalogRoutes";
import { registerAdminBillingLedgerRoutes } from "../adminBillingLedger";
import { validateBillingEnvironment } from "../chargebeeEnvironment";
import { resolveChargebeeHostedPageForPayment } from "../chargebee";
import { createPaymentRefundAlerter, createPaymentReviewAlerter, createUnmatchedPaymentAlerter, createCardValidationAlerter, createRetiredPlanAlerter, materialErrorAlertMiddleware } from "../errorAlerting";
import { globalSecurityHeaders } from "../securityHeaders";
import { draftSmartReferralPitch } from "../ai";
import { sendReferrerReviewEmail } from "../referrerReviewEmail";
import { sendSlotOpenedAlertEmail } from "../slotOpenedAlertEmail";
import { sendTransactionalEmail } from "../emailDelivery";
import { workEmailOtpService } from "../workEmailOtp";
import { createWorkosAuthRoutesRegistrar, currentWorkosSessionId, configuredWorkosClientId, resolveWorkosIdentity, workosConfigured } from "./workosAuth";
import { WorkOS } from "@workos-inc/node";
import { registerAccountSessionRoutes } from "../accountSessions";
import { registerAccountPreferenceRoutes } from "../accountPreferences";
import { registerReferrerOtpLoginRoutes } from "./otpLogin";
import { registerReviewerLoginRoutes } from "./reviewerLogin";
import { sessionRenewal } from "./sessionRenewal";
import { registerPaymentRoutes, findRazorpayOrdersByReceipt, paypalConfigured, razorpayConfigured, razorpayOrderInPaise } from "../payments";
import { registerPaymentWebhookRoutes } from "../paymentWebhooks";
import { registerWorkosWebhookRoutes } from "../workosWebhooks";
import { registerPasswordResetRoutes } from "../passwordResetRoutes";
import { getLastReconcileError, getLastReconcileResults, isSchemaReconciled, startSchemaReconcileRecovery } from "../schemaReconcile";
import { registerHealthRoutes } from "../healthRoutes";
import { AssistantPlanRequiredError } from "../planGates";


function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// Runtime activation anchor: rollback after billing startup guard failure.
async function startServer() {
  validateBillingEnvironment();
  const app = express();
  const server = createServer(app);
  // Boot-time schema auto-reconcile: the running server owns its DATABASE_URL,
  // so it heals missing columns itself. Fire-and-forget — a slow or unreachable
  // DB must never delay or crash boot; /api/health reports the flag as-is.
  // Recovery retries read-only validation with backoff until it passes.
  startSchemaReconcileRecovery();
  // Managed deployments terminate TLS at a trusted reverse proxy. This lets
  // req.hostname and req.protocol reflect the canonical public host/protocol.
  // `true` stays intentional: the Worker (src/worker.ts, shared/clientIp.ts)
  // deletes every client-supplied forwarding header, writes one X-Forwarded-For
  // from Cloudflare's CF-Connecting-IP, and fixes X-Forwarded-Host and
  // X-Forwarded-Proto to the zone host and https, so req.ip, req.hostname and
  // req.protocol cannot be spoofed. Any route that reaches this server without
  // passing through that Worker would trust caller-supplied forwarding headers
  // and reopen the rate-limit bypass. Do not add a direct-to-container path
  // without re-applying withEdgeClientIp (or change this setting).
  app.set("trust proxy", true);
  app.disable("x-powered-by");
  app.use(globalSecurityHeaders);
  // Provider gateway webhooks (Razorpay HMAC, PayPal signature API) register
  // before the global JSON parser: the Razorpay handler must HMAC the exact
  // raw request bytes the provider signed, so it parses its own body.
  registerPaymentWebhookRoutes(app, { record: db.recordOperationalActivity, recordGatewayEvent: db.recordGatewayPaymentEvent, applyUnlockRefund: db.applyEmployerUnlockRefund, fulfillUnlockCredits: input => db.fulfillUnlockCreditPurchase({ ...input, pack: input.pack as Parameters<typeof db.fulfillUnlockCreditPurchase>[0]["pack"] }) });
  // WorkOS identity webhooks (user.deleted/user.updated) register before the
  // global JSON parser for the same reason: the WorkOS-Signature covers the
  // exact raw bytes, so this route parses its own body.
  registerWorkosWebhookRoutes(app, { record: entry => { void db.recordOperationalActivity(entry).catch(() => undefined); }, suspendUserByWorkosId: db.suspendUserByWorkosId, updateUserProfileByWorkosId: db.updateUserProfileByWorkosId });
  // WorkOS AuthKit is the only production auth authority. The callback route
  // (server/_core/workosAuth.ts) verifies the AuthKit session and issues the
  // app_session_id JWT; resolveWorkosIdentity loads the upserted user for it.
  // When WorkOS keys are absent entirely (fresh clone, offline demo, CI), the
  // local dev session keeps the app usable without granting any production
  // identity.
  const resolveIdentity = workosConfigured()
    ? resolveWorkosIdentity
    : async (req: express.Request) => {
    const identity = await resolveDevIdentity(req);
    if (!identity) return undefined;
    return { account: identity.account, primaryEmail: identity.primaryEmail, emailAddresses: identity.emailAddresses };
  };
  registerJobLinkPreviewRoutes(app, { resolveEmployerDomainFromTargetUrl: db.resolveEmployerDomainFromTargetUrl });
  // BYOR off must answer before body parsers and session renewal can reach any user/database state.
  app.use(askInviteFeatureGateMiddleware);
    // Public control-plane bodies stay small. The two deprecated JSON document
  // routes opt into their own authenticated, bounded parser at registration.
  const smallJson = express.json({ limit: "256kb" });
  // Timing only, no behavior change: Server-Timing header on /api responses and a log line for slow ones (path only, no query or user data).
  app.use("/api", (req, res, next) => {
    const started = performance.now();
    const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => typeof res;
    res.writeHead = ((...args: unknown[]) => {
      if (!res.headersSent) res.setHeader("Server-Timing", `app;dur=${Math.round(performance.now() - started)}`);
      return writeHead(...args);
    }) as typeof res.writeHead;
    res.on("finish", () => {
      const ms = Math.round(performance.now() - started);
      if (ms >= 800) console.warn(`[slow-api] ${req.method} ${scrubSentryPath(`${req.baseUrl}${req.path}`)} ${res.statusCode} ${ms}ms`);
    });
    next();
  });
  app.use((req, res, next) => {
    if (req.path === "/api/documents" || req.path === "/api/documents/opaque") return next();
    smallJson(req, res, error => error ? res.status(jsonBodyError(error).status).json(jsonBodyError(error).body) : next());
  });
  const smallForm = express.urlencoded({ limit: "256kb", extended: true });
  app.use((req, res, next) => smallForm(req, res, error => error ? res.status(413).json({ error: "Request body is too large" }) : next()));

// Liveness is process-only; readiness gates on schema reconciliation. The
// legacy endpoint stays 200-compatible for existing SHA verification clients.
registerHealthRoutes(app,{commitSha:async()=>{try{return(await readFile("commit-sha.txt","utf8")).trim()}catch{return""}},isReady:isSchemaReconciled,lastError:getLastReconcileError,dbPing:async()=>{const d=await db.getDb();if(!d)throw new Error("no db");const r=await d.execute(sql`SELECT @@lower_case_table_names AS v`);const row=(r as unknown as Array<Array<{v:number|string}>>)[0]?.[0];return row?Number(row.v):undefined}});

  registerAdminSmokeFixture(app, { resolveIdentity, recordActivity: db.recordOperationalActivity });
  let sessionsApi: WorkOS | undefined;
  registerAccountSessionRoutes(app, {
    resolveIdentity,
    listWorkosSubjects: db.listWorkosSubjectsForUser,
    api: () => { if (!workosConfigured()) return undefined; sessionsApi ??= new WorkOS(process.env.WORKOS_API_KEY!, { clientId: configuredWorkosClientId() }); return sessionsApi.userManagement as never; },
    currentSessionId: currentWorkosSessionId,
    record: input => { void db.recordOperationalActivity(input as never)?.catch?.(() => undefined); },
  });

  registerAccountPreferenceRoutes(app, { resolveIdentity, getPreferences: db.getAccountPreferences, savePreferences: db.saveAccountPreferences });
  registerImpactCardRoutes(app, { resolveIdentity, recordActivity: db.recordOperationalActivity });

  // Dev session routes read JSON bodies, so they register after the parsers.
  // WorkOS AuthKit takes precedence over the dev fallback when configured.
  // Referrer OTP-first login is a public surface, always registered.
  app.use("/api", sessionRenewal);
  registerReferrerOtpLoginRoutes(app);
  registerReviewerLoginRoutes(app);
  registerPasswordResetRoutes(app);
  if (workosConfigured()) createWorkosAuthRoutesRegistrar()(app);
  else registerDevAuthRoutes(app);
  registerAskInviteRoutes(app, { resolveIdentity, recordActivity: db.recordOperationalActivity });
  app.use(materialErrorAlertMiddleware);
  registerStorageProxy(app);
  registerDbDocumentRoute(app, { resolveIdentity });
  registerPrivateReferralRoutes(app, { resolveIdentity, dataUrlToBuffer, sanitizeDocumentName, storagePut, storageGetSignedUrl, storageGetBytes, createReferralAttachment: db.createReferralAttachment, getAccessibleReferralAttachment: db.getAccessibleReferralAttachment, createResumeUploadSession: db.createResumeUploadSession, getResumeUploadSession: db.getResumeUploadSession, appendResumeUploadChunk: db.appendResumeUploadChunk, claimResumeUploadFinalization: db.claimResumeUploadFinalization, clearUnattachedResumeUploads: db.clearUnattachedResumeUploads, completeResumeUploadSession: db.completeResumeUploadSession, saveVerifiedWorkEmail: db.saveVerifiedWorkEmail, getVerifiedWorkEmailAccess: db.getVerifiedWorkEmailAccess, fulfillCompanyCoverageInvitation: db.fulfillCompanyCoverageInvitation, createCompanyReferralRequest: db.createCompanyReferralRequest, prepareReferrerReviewEmailNotifications: db.prepareReferrerReviewEmailNotifications, claimReferralReviewDelivery: db.claimReferralReviewDelivery, completeReferralReviewDelivery: db.completeReferralReviewDelivery, resolveReferrerReviewEmailLink: db.resolveReferrerReviewEmailLink, consumeReferrerReviewEmailLink: db.consumeReferrerReviewEmailLink, oneClickReviewReferralRequest: db.oneClickReviewReferralRequest, sendReferrerReviewEmail, saveReferrerSlackWebhook: db.saveReferrerSlackWebhook, getReferrerSlackWebhookStatus: db.getReferrerSlackWebhookStatus, deactivateReferrerSlackWebhook: db.deactivateReferrerSlackWebhook, getActiveReferrerSlackWebhooks: db.getActiveReferrerSlackWebhooks, sendWorkEmailOtp: ({ email, ip }) => workEmailOtpService.sendCode(email, { ip }), verifyWorkEmailOtp: ({ email, code, ip }) => workEmailOtpService.verifyCode(email, code, { ip }), registerWorkEmailOtpFailure: ({ email, code }) => workEmailOtpService.registerFailedAttempt(email, code), issueWorkEmailEnrollmentReceipt: ({ email, userId }) => workEmailOtpService.issueEnrollmentReceipt(email, userId), completeWorkEmailOtpEnrollment: db.completeWorkEmailOtpEnrollment, getSlotOpenedAlertRecipients: db.getSlotOpenedAlertRecipients, sendSlotOpenedAlertEmail, getPublicReferralImpact: db.getPublicReferralImpact, getReferrerImpactSummary: db.getReferrerImpactSummary, getOwnedResumeAttachmentForPitch: db.getOwnedResumeAttachmentForPitch, draftSmartReferralPitch, getOrCreateReferralShareCard: db.getOrCreateReferralShareCard, revokeReferralShareCard: db.revokeReferralShareCard, getPublicReferralShareCard: db.getPublicReferralShareCard, getOrCreateReferrerFastTrackLink: db.getOrCreateReferrerFastTrackLink, getPublicReferrerFastTrackLink: db.getPublicReferrerFastTrackLink, getPublicReferrerFastTrackVanityLink: db.getPublicReferrerFastTrackVanityLink, deactivateReferrerFastTrackLink: db.deactivateReferrerFastTrackLink, openCompanyReferralAvailability: db.openCompanyReferralAvailability, listCompanyReferralInbox: db.listCompanyReferralInbox, listCompanyReferralInboxByState: db.listCompanyReferralInboxByState, getUnclaimedCompanyReferralPreview: db.getUnclaimedCompanyReferralPreview, listJobSeekerCompanyReferrals: db.listJobSeekerCompanyReferrals, hasEverCreatedReferralRequest: db.hasEverCreatedReferralRequest, hasEverReviewedReferral: db.hasEverReviewedReferral, reconcileExpiredPendingReferrals: db.reconcileExpiredPendingReferrals, getOpenAskSlots: db.getOpenAskSlots, saveCompanyReferralRequest: db.saveCompanyReferralRequest, withdrawCompanyReferralRequest: db.withdrawCompanyReferralRequest, listRequiresReviewPayments: db.listRequiresReviewPayments, resolveRequiresReviewPayment: db.resolveRequiresReviewPayment, listRecentPayments: db.listRecentPayments, revokeCreditedPaymentCredits: db.revokeCreditedPaymentCredits, getRevenueSummary: db.getRevenueSummary, claimCompanyReferralRequest: db.claimCompanyReferralRequest, getClaimedCompanyReferralDetail: db.getClaimedCompanyReferralDetail, reviewReferralRequest: db.reviewReferralRequest, updateReferralProgress: db.updateReferralProgress, getApprovedReferralProgressStatus: db.getApprovedReferralProgressStatus, extendReferredDeadlineTx: db.extendReferredDeadlineForUser, stepBackFromReferral: db.stepBackFromReferralForUser, confirmReferredBySeeker: db.confirmReferredBySeekerForUser, lapseReferredTx: db.lapseReferredTx, listReferralConversation: db.listReferralConversation, sendReferralConversationMessage: db.sendReferralConversationMessage, recordLandedJourney: db.recordLandedJourney, listReferrerThankYous: db.listReferrerThankYous, listPublicCompanyOpportunities: db.listPublicCompanyOpportunitiesWithSponsorship, publishCompanyOpportunity: db.publishCompanyOpportunity, listMyCompanyOpportunities: db.listMyCompanyOpportunities, renewCompanyOpportunity: db.renewCompanyOpportunity, closeCompanyOpportunity: db.closeCompanyOpportunity, recordActivity: db.recordOperationalActivity, listOperationalActivity: db.listOperationalActivity, listMyUploadStarts: db.listMyUploadStarts, getReferralFlowHealth: db.getReferralFlowHealth, getReferralFlowBaseline, getCreditLedgerAudit: db.getCreditLedgerAudit, getDomainIntegrity: db.getDomainIntegrity, findUsersForTokenRecovery: db.findUsersForTokenRecovery, listAdminTokenAdjustments: db.listAdminTokenAdjustments, grantAdminTokenAdjustment: db.grantAdminTokenAdjustment, getCreditSummary: db.getTokenWallet, reconcileCardValidation: async (userId: number) => { try { await reconcileCardValidationFromProvider({ userId }); } catch (error) { console.error("[Chargebee] card-validation reconcile failed", error); void createCardValidationAlerter()({ reason: "provider_reconcile_failed" }).catch(() => undefined); } }, getOrCreatePersonalReferralInvite: db.getOrCreatePersonalReferralInvite, getPersonalReferralInviteState: db.getPersonalReferralInviteState, claimPersonalReferralInvite: db.claimPersonalReferralInvite, exportUserData: db.exportUserData, requestDataExport: userId => requestDataExport(userId), getLatestDataExport, getDataExportFile: (userId, id) => getDataExportFile(userId, id), listMyPrivacyRequests: db.listMyPrivacyRequests, createPrivacyErasureRequest: db.createPrivacyErasureRequest, listAdminPrivacyRequests: db.listAdminPrivacyRequests, reviewPrivacyRequest: db.reviewPrivacyRequest, listNotifications: db.listNotifications, markNotificationRead: db.markNotificationRead, countRecentMessagesBySender: db.countRecentMessagesBySender, listReferralLedger: db.listReferralLedger, getUserEmailById: db.getUserEmailById, createNotification: db.createNotification, listJobs: publicCatalogJobs(db.listJobs), listSavedRoles: db.listSavedRoles, setSavedRole: db.setSavedRole, listUsersAdmin: db.listUsersAdmin, setUserSuspended: db.setUserSuspended, sendEmail: async ({ to, subject, html }) => sendTransactionalEmail({ to, subject, html, text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }) });
  // Server-owned company directory: public /api/companies reads and the
  // admin-gated /api/admin/companies writes (server/companyDirectoryRoutes.ts).
  registerCompanyDirectoryRoutes(app, { resolveIdentity, recordActivity: db.recordOperationalActivity });
  registerCompanyClaimRoutes(app, { resolveIdentity });
  // skipwait.me/sitemap.xml routes to the Worker (wrangler routes), which
  // forwards it here: the sitemap's live reads come straight from the DB.
  registerSitemapRoutes(app, { listJobs: publicCatalogJobs(db.listJobs), listCompanySlugs: async () => (await listCompanyDirectory()).companies });
  registerScheduledJobsRoutes(app, { resolveIdentity, recordActivity: db.recordOperationalActivity, skippie: { enabled: () => process.env.SKIPPIE_ADMIN_ENABLED === "true", deps: () => createSkippieAdminDeps() } }); // Worker cron tick + admin job status
  // Seeker Skippy (D-136..D-142, step 2): ask-only chat. Off unless SKIPPIE_SEEKER_ENABLED=true,
  // and then only for the account ids in SKIPPIE_SEEKER_USER_IDS (the test seeker).
  registerSkippieSeekerRoutes(app, {
    resolveIdentity,
    recordActivity: db.recordOperationalActivity,
    enabled: () => process.env.SKIPPIE_SEEKER_ENABLED === "true",
    allowedUserIds: () => skippieSeekerAllowedIds(),
    deps: () => {
      // The storagePut selection above is a union of three backends with slightly different
      // signatures (dbStoragePut takes no content type and returns no URL). Adapt once here.
      const put = storagePut as (key: string, data: Buffer, contentType?: string) => Promise<{ key: string; url?: string }>;
      return createSkippieSeekerDeps({
        storagePut: async (key, data, contentType) => { const stored = await put(key, Buffer.from(data), contentType); return { key: stored.key, url: stored.url ?? "" }; },
        storageGetBytes: async key => { const bytes = await storageGetBytes(key); if (!bytes) throw new Error("Stored file is missing."); return bytes; },
      });
    },
    listOwnedResumes: userId => db.listOwnedResumeAttachments(userId),
    afterCreate: (req, actorUserId, result) => dispatchReferralReviewDeliveries({ deps: { prepareReferrerReviewEmailNotifications: db.prepareReferrerReviewEmailNotifications, claimReferralReviewDelivery: db.claimReferralReviewDelivery, completeReferralReviewDelivery: db.completeReferralReviewDelivery, getActiveReferrerSlackWebhooks: db.getActiveReferrerSlackWebhooks }, record: entry => { void db.recordOperationalActivity(entry).catch(() => undefined); }, origin: publicOutboundOrigin(req), result, actorUserId }),
  });
  // B2B monetization surface: employer accounts, unlock credits, anonymized
  // talent discovery, sponsored roles, and contextual partner modules.
  registerEmployerRoutes(app, { resolveIdentity, recordActivity: db.recordOperationalActivity, isEmployer: db.isEmployer, ensureEmployerAccount: db.ensureEmployerAccount, getEmployerAccount: db.getEmployerAccount, listAnonymizedSeekerProfiles: db.listAnonymizedSeekerProfiles, resolveEmployerTalentRef: db.resolveEmployerTalentRef, spendEmployerUnlockCredit: db.spendEmployerUnlockCredit, getUnlockedProfile: db.getUnlockedProfile, requestEmployerTalentIntro: db.requestEmployerTalentIntro, createNotification: db.createNotification, sponsorCompanyOpportunity: db.sponsorCompanyOpportunity, employerSponsorshipEnabled: () => employerSponsorshipEnabled(), endCompanyOpportunitySponsorship: db.endCompanyOpportunitySponsorship, listSponsoredCompanyOpportunities: db.listSponsoredCompanyOpportunities, listEmployerOpportunities: db.listEmployerOpportunities, listPartnerModules: db.listPartnerModules, recordPartnerImpression: db.recordPartnerImpression, recordPartnerClick: db.recordPartnerClick, createPartnerModule: db.createPartnerModule, updatePartnerModule: db.updatePartnerModule, listAllPartnerModules: db.listAllPartnerModules, listEmployerSpendHistory: db.listEmployerSpendHistory, prepareUnlockCreditCheckout: db.prepareUnlockCreditCheckout, bindUnlockCreditProviderOrder: db.bindUnlockCreditProviderOrder, markUnlockCheckoutRequiresReview: db.markUnlockCheckoutRequiresReview, findRazorpayOrdersByReceipt, createRazorpayUnlockOrder: razorpayConfigured() ? razorpayOrderInPaise : undefined });
  // Direct messages. With a verified referrer on either side, sending opens only
  // after that referrer accepted a request linking the two (D-012 item 3,
  // server/dmReferrerGate.ts); other members keep thread / mutual follow / plan.
  registerDmRoutes(app, { resolveIdentity, recordActivity: db.recordOperationalActivity, countRecentMessagesBySender: db.countRecentMessagesBySender });
  // X-style follow graph: follow members, see counts, and unlock free mutual-follow messaging.
  registerFollowRoutes(app, { resolveIdentity, recordActivity: db.recordOperationalActivity });
  // Assistant access (kit screens 22/23/24/26): connections, API
  // tokens, assistant approvals and the developer app console.
  registerAssistantRoutes(app, { resolveIdentity, recordActivity: db.recordOperationalActivity });
  // Skippy step 5 (D-141): seeker agents, draft-only. Off unless SKIPPIE_AGENT_ENABLED.
  registerSeekerAgentRoutes(app, { enabled: () => process.env.SKIPPIE_AGENT_ENABLED === "true", resolveIdentity, store: createSeekerAgentStore(), ...createSeekerAgentSourceDeps() });
  // MCP endpoint for connected assistants (read tools plus propose_ask, which only creates a pending approval) (bearer-token auth, skipwait.me/api/mcp).
  registerMcpRoutes(app, {
    verifyBearer: db.verifyAssistantBearer,
    hasAccess: db.hasAssistantAccess,
    recordActivity: db.recordOperationalActivity,
    searchJobs: publicCatalogJobs(db.listJobs),
    listRequests: async userId => (await db.listReferralRequests(userId)).filter(row => row.jobSeekerId === userId),
    listAlerts: userId => db.listSeekerAlerts(userId),
    listResumes: userId => db.listMyUnattachedResumes(userId),
    proposeAsk: (userId, input) => db.proposeAssistantAsk(userId, input),
  });
  // OAuth (authorization code + PKCE) so ChatGPT/Claude can connect without pasting a token.
  registerOAuthRoutes(app, {
    resolveIdentity,
    registerClient: registerOAuthClient,
    getClient: getOAuthClient,
    issueCode: async (userId, input) => { if (!(await db.hasAssistantAccess(userId))) throw new AssistantPlanRequiredError(); return issueAuthCode(userId, input); },
    consumeCode: consumeAuthCode,
    mintToken: (userId, name) => db.createAssistantToken(userId, { name }),
    recordActivity: db.recordOperationalActivity,
  });
  // Seeker/referrer profiles, work showcases, and shareable public profiles.
  registerAskDraftRoutes(app, { resolveIdentity, recordActivity: db.recordOperationalActivity });
  registerProfileRoutes(app, { resolveIdentity, recordActivity: db.recordOperationalActivity, getMyProfile: db.getMyProfile, updateMyProfile: db.updateMyProfile, listMyWorkItems: db.listMyWorkItems, createWorkItem: db.createWorkItem, updateWorkItem: db.updateWorkItem, deleteWorkItem: db.deleteWorkItem, getPublicProfileByHandle: db.getPublicProfileByHandle });
  // Safety reports and company suggestions intake.
  registerSafetyRoutes(app, { resolveIdentity, recordActivity: db.recordOperationalActivity, createSafetyReport: db.createSafetyReport, listMySafetyReports: db.listMySafetyReports, createCompanySuggestion: db.createCompanySuggestion, listMyCompanySuggestions: db.listMyCompanySuggestions, listSafetyReportsAdmin: db.listSafetyReportsAdmin, reviewSafetyReport: db.reviewSafetyReport, listCompanySuggestionsAdmin: db.listCompanySuggestionsAdmin, reviewCompanySuggestion: db.reviewCompanySuggestion, createNotification: (userId, title, body) => db.createNotification(userId, "system", title, body) });
  // Self-serve user blocks: block by member or by referral conversation.
  registerBlocksRoutes(app, { resolveIdentity, recordActivity: db.recordOperationalActivity });

  // Razorpay (INR domestic) + PayPal (USD global) checkout order creation.
  // Chargebee stays the fallback gateway for subscription management.
  registerPaymentRoutes(app, {
    resolveIdentity,
    record: db.recordOperationalActivity,
  });
  registerAdminBillingCatalogRoutes(app, { resolveIdentity });
  // D-069: admin-only Chargebee catalog sync (dry run, then one owner-triggered apply).
  // The strict recorder refuses the apply when nothing can be written, so no create
  // ever happens without an audit trail.
  registerAdminCatalogSyncRoutes(app, {
    resolveIdentity,
    recordActivity: async entry => {
      if (!(await db.getDb())) throw new Error("Database unavailable");
      await db.recordOperationalActivity(entry);
    },
    reportError: captureServerError,
  });
  registerPlansCatalogRoutes(app);
  registerAdminBillingLedgerRoutes(app, { resolveIdentity, loadRows: db.listBillingLedgerRows });
  registerChargebeeRoutes(app, {
    resolveIdentity,
    recordActivity: db.recordOperationalActivity,
    createPaymentIntent: db.createChargebeePaymentIntent,
    fulfillPayment: db.fulfillChargebeePayment,
    createSubscriptionIntent: db.createChargebeeSubscriptionIntent,
    applySubscriptionEvent: db.applyChargebeeSubscriptionEvent,
    recordSubscriptionPaymentEvidence: db.recordSubscriptionPaymentEvidence,
    recordGiftEvent: db.recordGiftProviderEvent,
    listBuyerGifts: db.listBuyerGifts,
    listClaimableGifts: db.listClaimableGiftsForUser,
    claimGift: db.claimGiftSubscription,
    getUserSubscription: db.getUserSubscription,
    markSubscriptionNonRenewing: db.markSubscriptionNonRenewing,
    getPaymentRecovery: db.getChargebeePaymentRecovery,
    getSubscriptionCheckoutIntent: db.getSubscriptionCheckoutIntent,
    markSubscriptionCheckoutIntentCancelled: db.markSubscriptionCheckoutIntentCancelled,
    markSubscriptionCheckoutIntentReview: db.markSubscriptionCheckoutIntentReview,
    markPaymentForReview: db.markChargebeePaymentForReview,
    getCreditSummary: db.getTokenWallet,
    alertPaymentReview: createPaymentReviewAlerter(),
    applyPaymentRefund: db.applyChargebeePaymentRefund,
    alertPaymentRefund: createPaymentRefundAlerter(),
    alertUnmatchedPayment: createUnmatchedPaymentAlerter(),
    alertRetiredPlanEvent: createRetiredPlanAlerter(),
    applyCardValidationEvent: db.applyCardValidationEvent,
    alertCardValidationEvent: createCardValidationAlerter(),
    createCardValidationPage: createCardValidationPageForUser,
    alertCardValidationPageError: async () => createCardValidationAlerter()({ reason: "hosted_page_creation_failed" }),
    resolveHostedPage: async input => {
      const pending = await db.listPendingChargebeePaymentIntents();
      return resolveChargebeeHostedPageForPayment({ ...input, pendingHostedPageIds: pending.flatMap(row => row.hostedPageId ? [row.hostedPageId] : []) });
    },
  });
  // tRPC API — tRPC handles errors internally and never calls Express
  // error middleware, so report them to Sentry here explicitly.
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error, path, req }) {
        captureServerError(error, {
          trpcPath: scrubSentryPath(typeof path === "string" ? `/${path}` : req.path),
          code: error.code,
        });
      },
    })
  );
  // Sentry diagnostics (no secrets in responses): status is safe everywhere;
  // the test sender only exists outside production to avoid event spam.
  app.get("/api/debug/sentry-status", (_req, res) => {
    res.json({ active: isServerSentryActive() });
  });
  if (process.env.NODE_ENV !== "production") {
    app.get("/api/debug/sentry-test", async (_req, res) => {
      const active = isServerSentryActive();
      if (active) {
        captureServerError(new Error("Sentry server test event"), { source: "debug-endpoint" });
        await flushServerSentry();
      }
      res.json({ active, sent: active });
    });
    app.get("/api/debug/sentry-throw", () => {
      throw new Error("Sentry server middleware test throw");
    });
  }
  // Error-reporting middleware sits after every route so forwarded errors are
  // captured by Sentry (when configured) before the final handlers respond.
  app.use(sentryErrorMiddleware);
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    // API catch-all: unmatched /api/* paths return JSON 404 instead of SPA HTML
    app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
    await setupVite(app, server);
  } else {
    // API catch-all: unmatched /api/* paths return JSON 404 instead of SPA HTML
    app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
