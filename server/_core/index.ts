import { registerJobLinkPreviewRoutes } from "../jobLinkPreviewRoutes";
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
import { createContext } from "./context";
import { registerDevAuthRoutes, resolveDevIdentity } from "./devAuth";
import { serveStatic, setupVite } from "./vite";
import { registerPrivateReferralRoutes } from "../privateReferralRoutes";
import { registerEmployerRoutes } from "../employerRoutes";
import { registerDmRoutes } from "../dmRoutes";
import { registerFollowRoutes } from "../followRoutes";
import { registerChargebeeRoutes } from "../chargebeeRoutes";
import { resolveChargebeeHostedPageForPayment } from "../chargebee";
import { materialErrorAlertMiddleware } from "../errorAlerting";
import { globalSecurityHeaders } from "../securityHeaders";
import { draftSmartReferralPitch } from "../ai";
import { sendReferrerReviewEmail } from "../referrerReviewEmail";
import { sendSlotOpenedAlertEmail } from "../slotOpenedAlertEmail";
import { sendTransactionalEmail } from "../emailDelivery";
import { workEmailOtpService } from "../workEmailOtp";
import { SUBSCRIPTION_PLANS } from "@shared/subscriptionPlans";
import { createWorkosAuthRoutesRegistrar, resolveWorkosIdentity, workosConfigured } from "./workosAuth";
import { registerReferrerOtpLoginRoutes } from "./otpLogin";
import { registerPaymentRoutes, paypalConfigured, razorpayConfigured, razorpayOrderInPaise } from "../payments";
import { registerPaymentWebhookRoutes } from "../paymentWebhooks";
import { getLastReconcileError, isSchemaReconciled, reconcileSchema } from "../schemaReconcile";
import { registerHealthRoutes } from "../healthRoutes";


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

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Boot-time schema auto-reconcile: the running server owns its DATABASE_URL,
  // so it heals missing columns itself. Fire-and-forget — a slow or unreachable
  // DB must never delay or crash boot; /api/health reports the flag as-is.
  void reconcileSchema().catch(() => {});
  // Managed deployments terminate TLS at a trusted reverse proxy. This lets
  // req.hostname reflect the canonical public host for host-scoped billing.
  app.set("trust proxy", true);
  app.disable("x-powered-by");
  app.use(globalSecurityHeaders);
  // Provider gateway webhooks (Razorpay HMAC, PayPal signature API) register
  // before the global JSON parser: the Razorpay handler must HMAC the exact
  // raw request bytes the provider signed, so it parses its own body.
  registerPaymentWebhookRoutes(app, { record: db.recordOperationalActivity, recordGatewayEvent: db.recordGatewayPaymentEvent, fulfillUnlockCredits: input => db.fulfillUnlockCreditPurchase({ eventId: input.eventId, userId: input.userId, pack: input.pack as Parameters<typeof db.fulfillUnlockCreditPurchase>[0]["pack"], amount: input.amount }) });
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
    // Public control-plane bodies stay small. The two deprecated JSON document
  // routes opt into their own authenticated, bounded parser at registration.
  const smallJson = express.json({ limit: "256kb" });
  app.use((req, res, next) => {
    if (req.path === "/api/documents" || req.path === "/api/documents/opaque") return next();
    smallJson(req, res, error => error ? res.status(413).json({ error: "Request body is too large" }) : next());
  });
  const smallForm = express.urlencoded({ limit: "256kb", extended: true });
  app.use((req, res, next) => smallForm(req, res, error => error ? res.status(413).json({ error: "Request body is too large" }) : next()));

// Liveness is process-only; readiness gates on schema reconciliation. The
// legacy endpoint stays 200-compatible for existing SHA verification clients.
registerHealthRoutes(app,{commitSha:async()=>{try{return(await readFile("commit-sha.txt","utf8")).trim()}catch{return""}},isReady:isSchemaReconciled,lastError:getLastReconcileError,retry:reconcileSchema});

  registerAdminSmokeFixture(app, { resolveIdentity, recordActivity: db.recordOperationalActivity });

  // Dev session routes read JSON bodies, so they register after the parsers.
  // WorkOS AuthKit takes precedence over the dev fallback when configured.
  // Referrer OTP-first login is a public surface, always registered.
  registerReferrerOtpLoginRoutes(app);
  if (workosConfigured()) createWorkosAuthRoutesRegistrar()(app);
  else registerDevAuthRoutes(app);
  app.use(materialErrorAlertMiddleware);
  registerStorageProxy(app);
  registerDbDocumentRoute(app, { resolveIdentity });
  registerPrivateReferralRoutes(app, { resolveIdentity, dataUrlToBuffer, sanitizeDocumentName, storagePut, storageGetSignedUrl, storageGetBytes, createReferralAttachment: db.createReferralAttachment, getAccessibleReferralAttachment: db.getAccessibleReferralAttachment, createResumeUploadSession: db.createResumeUploadSession, getResumeUploadSession: db.getResumeUploadSession, appendResumeUploadChunk: db.appendResumeUploadChunk, completeResumeUploadSession: db.completeResumeUploadSession, saveVerifiedWorkEmail: db.saveVerifiedWorkEmail, getVerifiedWorkEmailAccess: db.getVerifiedWorkEmailAccess, fulfillCompanyCoverageInvitation: db.fulfillCompanyCoverageInvitation, createCompanyReferralRequest: db.createCompanyReferralRequest, prepareReferrerReviewEmailNotifications: db.prepareReferrerReviewEmailNotifications, resolveReferrerReviewEmailLink: db.resolveReferrerReviewEmailLink, consumeReferrerReviewEmailLink: db.consumeReferrerReviewEmailLink, oneClickReviewReferralRequest: db.oneClickReviewReferralRequest, sendReferrerReviewEmail, saveReferrerSlackWebhook: db.saveReferrerSlackWebhook, getReferrerSlackWebhookStatus: db.getReferrerSlackWebhookStatus, deactivateReferrerSlackWebhook: db.deactivateReferrerSlackWebhook, getActiveReferrerSlackWebhooks: db.getActiveReferrerSlackWebhooks, sendWorkEmailOtp: ({ email }) => workEmailOtpService.sendCode(email), verifyWorkEmailOtp: ({ email, code }) => workEmailOtpService.verifyCode(email, code), registerWorkEmailOtpFailure: ({ email, code }) => workEmailOtpService.registerFailedAttempt(email, code), hasVerifiedWorkEmailOtp: ({ email }) => workEmailOtpService.hasRecentVerification(email), getSlotOpenedAlertRecipients: db.getSlotOpenedAlertRecipients, sendSlotOpenedAlertEmail, getPublicReferralImpact: db.getPublicReferralImpact, getReferrerImpactSummary: db.getReferrerImpactSummary, getOwnedResumeAttachmentForPitch: db.getOwnedResumeAttachmentForPitch, draftSmartReferralPitch, getOrCreateReferralShareCard: db.getOrCreateReferralShareCard, revokeReferralShareCard: db.revokeReferralShareCard, getPublicReferralShareCard: db.getPublicReferralShareCard, getOrCreateReferrerFastTrackLink: db.getOrCreateReferrerFastTrackLink, getPublicReferrerFastTrackLink: db.getPublicReferrerFastTrackLink, getPublicReferrerFastTrackVanityLink: db.getPublicReferrerFastTrackVanityLink, deactivateReferrerFastTrackLink: db.deactivateReferrerFastTrackLink, openCompanyReferralAvailability: db.openCompanyReferralAvailability, listCompanyReferralInbox: db.listCompanyReferralInbox, listCompanyReferralInboxByState: db.listCompanyReferralInboxByState, getUnclaimedCompanyReferralPreview: db.getUnclaimedCompanyReferralPreview, listJobSeekerCompanyReferrals: db.listJobSeekerCompanyReferrals, saveCompanyReferralRequest: db.saveCompanyReferralRequest, withdrawCompanyReferralRequest: db.withdrawCompanyReferralRequest, listRequiresReviewPayments: db.listRequiresReviewPayments, resolveRequiresReviewPayment: db.resolveRequiresReviewPayment, listRecentPayments: db.listRecentPayments, revokeCreditedPaymentCredits: db.revokeCreditedPaymentCredits, getRevenueSummary: db.getRevenueSummary, claimCompanyReferralRequest: db.claimCompanyReferralRequest, getClaimedCompanyReferralDetail: db.getClaimedCompanyReferralDetail, reviewReferralRequest: db.reviewReferralRequest, updateReferralProgress: db.updateReferralProgress, getApprovedReferralProgressStatus: db.getApprovedReferralProgressStatus, listReferralConversation: db.listReferralConversation, sendReferralConversationMessage: db.sendReferralConversationMessage, listPublicCompanyOpportunities: db.listPublicCompanyOpportunitiesWithSponsorship, publishCompanyOpportunity: db.publishCompanyOpportunity, recordActivity: db.recordOperationalActivity, listOperationalActivity: db.listOperationalActivity, getReferralFlowHealth: db.getReferralFlowHealth, getDomainIntegrity: db.getDomainIntegrity, findUsersForTokenRecovery: db.findUsersForTokenRecovery, listAdminTokenAdjustments: db.listAdminTokenAdjustments, grantAdminTokenAdjustment: db.grantAdminTokenAdjustment, getCreditSummary: db.getTokenWallet, getOrCreatePersonalReferralInvite: db.getOrCreatePersonalReferralInvite, claimPersonalReferralInvite: db.claimPersonalReferralInvite, exportUserData: db.exportUserData, listMyPrivacyRequests: db.listMyPrivacyRequests, createPrivacyErasureRequest: db.createPrivacyErasureRequest, listAdminPrivacyRequests: db.listAdminPrivacyRequests, reviewPrivacyRequest: db.reviewPrivacyRequest, listNotifications: db.listNotifications, markNotificationRead: db.markNotificationRead, countRecentMessagesBySender: db.countRecentMessagesBySender, listReferralLedger: db.listReferralLedger, getUserEmailById: db.getUserEmailById, createNotification: db.createNotification, listJobs: db.listJobs, listSavedRoles: db.listSavedRoles, toggleSavedRole: db.toggleSavedRole, listUsersAdmin: db.listUsersAdmin, setUserSuspended: db.setUserSuspended, sendEmail: async ({ to, subject, html }) => sendTransactionalEmail({ to, subject, html, text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }) });
  // B2B monetization surface: employer accounts, unlock credits, anonymized
  // talent discovery, sponsored roles, and contextual partner modules.
  registerEmployerRoutes(app, { resolveIdentity, recordActivity: db.recordOperationalActivity, isEmployer: db.isEmployer, ensureEmployerAccount: db.ensureEmployerAccount, getEmployerAccount: db.getEmployerAccount, listAnonymizedSeekerProfiles: db.listAnonymizedSeekerProfiles, resolveEmployerTalentRef: db.resolveEmployerTalentRef, spendEmployerUnlockCredit: db.spendEmployerUnlockCredit, getUnlockedProfile: db.getUnlockedProfile, requestEmployerTalentIntro: db.requestEmployerTalentIntro, createNotification: db.createNotification, sponsorCompanyOpportunity: db.sponsorCompanyOpportunity, endCompanyOpportunitySponsorship: db.endCompanyOpportunitySponsorship, listSponsoredCompanyOpportunities: db.listSponsoredCompanyOpportunities, listEmployerOpportunities: db.listEmployerOpportunities, listPartnerModules: db.listPartnerModules, recordPartnerImpression: db.recordPartnerImpression, recordPartnerClick: db.recordPartnerClick, createPartnerModule: db.createPartnerModule, updatePartnerModule: db.updatePartnerModule, listAllPartnerModules: db.listAllPartnerModules, listEmployerSpendHistory: db.listEmployerSpendHistory, createRazorpayUnlockOrder: razorpayConfigured() ? razorpayOrderInPaise : undefined });
  // Paid direct messages (X-style): premium (Pro/Max) members can DM referrers
  // directly; replies inside an existing thread stay free for everyone.
  registerDmRoutes(app, { resolveIdentity, recordActivity: db.recordOperationalActivity, countRecentMessagesBySender: db.countRecentMessagesBySender });
  // X-style follow graph: follow members, see counts, and unlock free mutual-follow messaging.
  registerFollowRoutes(app, { resolveIdentity, recordActivity: db.recordOperationalActivity });

  // Razorpay (INR domestic) + PayPal (USD global) checkout order creation.
  // Chargebee stays the fallback gateway for subscription management.
  registerPaymentRoutes(app, {
    resolveIdentity,
    record: db.recordOperationalActivity,
    planPricing: (planId, tokens) => {
      void tokens;
      const plan = SUBSCRIPTION_PLANS[planId as keyof typeof SUBSCRIPTION_PLANS];
      if (!plan) return undefined;
      return { inrAmount: plan.prices.INR.amount / 100, usdAmount: plan.prices.USD.amount / 100 };
    },
  });
  registerChargebeeRoutes(app, {
    resolveIdentity,
    recordActivity: db.recordOperationalActivity,
    createPaymentIntent: db.createChargebeePaymentIntent,
    fulfillPayment: db.fulfillChargebeePayment,
    createSubscriptionIntent: db.createChargebeeSubscriptionIntent,
    applySubscriptionEvent: db.applyChargebeeSubscriptionEvent,
    getUserSubscription: db.getUserSubscription,
    markSubscriptionNonRenewing: db.markSubscriptionNonRenewing,
    getPaymentRecovery: db.getChargebeePaymentRecovery,
    markPaymentForReview: db.markChargebeePaymentForReview,
    getCreditSummary: db.getTokenWallet,
    resolveHostedPage: async input => {
      const pending = await db.listPendingChargebeePaymentIntents();
      return resolveChargebeeHostedPageForPayment({ ...input, pendingHostedPageIds: pending.flatMap(row => row.hostedPageId ? [row.hostedPageId] : []) });
    },
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
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
