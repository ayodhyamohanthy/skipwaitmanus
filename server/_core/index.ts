import "dotenv/config";
import express from "express";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { dataUrlToBuffer, sanitizeDocumentName } from "../documentUpload";
import { storageGetSignedUrl, storagePut } from "../storage";
import * as db from "../db";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerPrivateReferralRoutes } from "../privateReferralRoutes";
import { registerChargebeeRoutes } from "../chargebeeRoutes";
import { resolveChargebeeHostedPageForPayment } from "../chargebee";

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
  app.use(clerkMiddleware());
  const resolveClerkAccount = async (req: express.Request) => {
    const auth = getAuth(req);
    if (!auth.isAuthenticated || !auth.userId) return undefined;
    const clerkUser = await clerkClient.users.getUser(auth.userId);
    const primaryEmail = clerkUser.primaryEmailAddress;
    await db.upsertUser({ openId: auth.userId, name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null, email: primaryEmail?.emailAddress ?? null, loginMethod: "clerk" });
    const account = await db.getUserByOpenId(auth.userId);
    return account ? { account, primaryEmail, emailAddresses: clerkUser.emailAddresses } : undefined;
  };
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerPrivateReferralRoutes(app, { resolveIdentity: resolveClerkAccount, dataUrlToBuffer, sanitizeDocumentName, storagePut, storageGetSignedUrl, createReferralAttachment: db.createReferralAttachment, getAccessibleReferralAttachment: db.getAccessibleReferralAttachment, saveVerifiedWorkEmail: db.saveVerifiedWorkEmail, fulfillCompanyCoverageInvitation: db.fulfillCompanyCoverageInvitation, createCompanyReferralRequest: db.createCompanyReferralRequest, listCompanyReferralInbox: db.listCompanyReferralInbox, listCompanyReferralInboxByState: db.listCompanyReferralInboxByState, listJobSeekerCompanyReferrals: db.listJobSeekerCompanyReferrals, saveCompanyReferralRequest: db.saveCompanyReferralRequest, claimCompanyReferralRequest: db.claimCompanyReferralRequest, getClaimedCompanyReferralDetail: db.getClaimedCompanyReferralDetail, reviewReferralRequest: db.reviewReferralRequest, listPublicCompanyOpportunities: db.listPublicCompanyOpportunities, publishCompanyOpportunity: db.publishCompanyOpportunity, recordActivity: db.recordOperationalActivity, listOperationalActivity: db.listOperationalActivity, getReferralFlowHealth: db.getReferralFlowHealth, findUsersForTokenRecovery: db.findUsersForTokenRecovery, listAdminTokenAdjustments: db.listAdminTokenAdjustments, grantAdminTokenAdjustment: db.grantAdminTokenAdjustment, getCreditSummary: db.getTokenWallet });
  registerChargebeeRoutes(app, {
    resolveIdentity: resolveClerkAccount,
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
    await setupVite(app, server);
  } else {
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
