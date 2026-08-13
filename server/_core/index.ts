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
    return account ? { account, primaryEmail } : undefined;
  };
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.post("/api/documents", async (req, res) => {
    try {
      const identity = await resolveClerkAccount(req);
      if (!identity) return res.status(401).json({ error: "Sign in with Clerk to upload documents securely" });
      const { fileName, mimeType, dataUrl } = req.body as { fileName?: string; mimeType?: string; dataUrl?: string };
      if (!fileName || !mimeType || !dataUrl) return res.status(400).json({ error: "Document details are required" });
      const buffer = dataUrlToBuffer(dataUrl);
      if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: "Documents must be smaller than 10 MB" });
      const safeName = sanitizeDocumentName(fileName);
      const { key } = await storagePut(`skipwait/private-referrals/${identity.account.openId}/${Date.now()}-${safeName}`, buffer, mimeType);
      const attachment = await db.createReferralAttachment(identity.account.id, { fileName, fileKey: key, mimeType, fileSize: buffer.length });
      res.status(201).json({ id: attachment.id, fileName, mimeType, fileSize: buffer.length, url: `/api/documents/${attachment.id}` });
    } catch (error) {
      console.error("Document upload failed", error);
      res.status(500).json({ error: "We could not upload that document. Please try again." });
    }
  });
  app.get("/api/documents/:attachmentId", async (req, res) => {
    try {
      const auth = getAuth(req);
      const attachmentId = Number(req.params.attachmentId);
      if (!auth.isAuthenticated || !auth.userId) return res.status(401).send("Sign in with Clerk to view this document");
      if (!Number.isInteger(attachmentId) || attachmentId <= 0) return res.status(400).send("Invalid document reference");
      const viewer = await db.getUserByOpenId(auth.userId);
      if (!viewer) return res.status(403).send("Document access is not available for this account");
      const attachment = await db.getAccessibleReferralAttachment(viewer.id, attachmentId);
      if (!attachment) return res.status(404).send("Document not found");
      const url = await storageGetSignedUrl(attachment.fileKey);
      res.set("Cache-Control", "private, no-store");
      res.redirect(307, url);
    } catch (error) {
      console.error("Secure document access failed", error);
      res.status(502).send("We could not retrieve that document. Please try again.");
    }
  });
  app.post("/api/company-referrals/verify-work-email", async (req, res) => {
    try {
      const identity = await resolveClerkAccount(req);
      if (!identity) return res.status(401).json({ error: "Sign in with Clerk to verify a work email" });
      if (!identity.primaryEmail || identity.primaryEmail.verification?.status !== "verified") return res.status(403).json({ error: "Verify your primary work email in Clerk before joining the private employee pool" });
      const profile = await db.saveVerifiedWorkEmail(identity.account.id, identity.primaryEmail.emailAddress);
      res.json({ verified: true, workEmailDomain: profile?.workEmailDomain });
    } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : "We could not verify your work email" }); }
  });
  app.post("/api/company-referrals", async (req, res) => {
    try {
      const identity = await resolveClerkAccount(req);
      if (!identity) return res.status(401).json({ error: "Sign in with Clerk before sending a private company request" });
      const { targetRoleUrl, attachmentIds } = req.body as { targetRoleUrl?: string; attachmentIds?: number[] };
      if (!targetRoleUrl || !Array.isArray(attachmentIds) || attachmentIds.length === 0) return res.status(400).json({ error: "A Target Role URL and at least one resume document are required" });
      const request = await db.createCompanyReferralRequest(identity.account.id, { targetRoleUrl, attachmentIds, personalPitch: "Private referral request submitted through skipwait.me." });
      res.status(201).json(request);
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "We could not send this private referral request" }); }
  });
  app.get("/api/company-referrals/inbox", async (req, res) => {
    try {
      const identity = await resolveClerkAccount(req);
      if (!identity) return res.status(401).json({ error: "Sign in with Clerk to view employee requests" });
      res.json({ requests: await db.listCompanyReferralInbox(identity.account.id) });
    } catch { res.status(500).json({ error: "We could not load private company requests" }); }
  });
  app.get("/api/company-referrals/:requestId", async (req, res) => {
    try {
      const identity = await resolveClerkAccount(req);
      const requestId = Number(req.params.requestId);
      if (!identity) return res.status(401).json({ error: "Sign in with Clerk to view this request" });
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral request" });
      const request = await db.getClaimedCompanyReferralDetail(identity.account.id, requestId);
      if (!request) return res.status(404).json({ error: "This private request is not assigned to your verified employee account" });
      res.json({ request: { ...request, attachments: request.attachments.map(attachment => ({ ...attachment, url: `/api/documents/${attachment.id}` })) } });
    } catch { res.status(500).json({ error: "We could not load this private referral request" }); }
  });
  app.post("/api/company-referrals/:requestId/claim", async (req, res) => {
    try {
      const identity = await resolveClerkAccount(req);
      const requestId = Number(req.params.requestId);
      if (!identity) return res.status(401).json({ error: "Sign in with Clerk to claim a referral request" });
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral request" });
      res.json(await db.claimCompanyReferralRequest(identity.account.id, requestId));
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "This referral request is no longer available" }); }
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
