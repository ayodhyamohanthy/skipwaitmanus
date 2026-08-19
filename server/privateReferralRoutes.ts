import { createDecipheriv } from "node:crypto";
import express, { type Express, type Request } from "express";
import { validatePrivateDocument } from "./documentValidation";

type Account = { id: number; openId: string; role?: "user" | "admin" };
type EmailAddress = { emailAddress: string; verification?: { status?: string } | null };
type Identity = { account: Account; primaryEmail?: EmailAddress | null; emailAddresses?: EmailAddress[] };
type Attachment = { id: number; fileName: string; mimeType: string; fileSize: number; fileKey?: string };
type PrivateNotification = { id: number; category: "referral" | "message" | "status" | "system"; title: string; body: string; readAt: Date | null; createdAt: Date };

export type PrivateReferralRouteDeps = {
  resolveIdentity: (req: Request) => Promise<Identity | undefined>;
  dataUrlToBuffer: (dataUrl: string) => Buffer;
  sanitizeDocumentName: (fileName: string) => string;
  storagePut: (key: string, data: Buffer, mimeType: string) => Promise<{ key: string }>;
  storageGetSignedUrl: (key: string) => Promise<string>;
  createReferralAttachment: (ownerId: number, input: { fileName: string; fileKey: string; mimeType: string; fileSize: number }) => Promise<Attachment>;
  getAccessibleReferralAttachment: (userId: number, attachmentId: number) => Promise<(Attachment & { ownerId: number; referrerId?: number | null }) | undefined>;
  saveVerifiedWorkEmail: (userId: number, email: string) => Promise<{ workEmailDomain?: string | null } | undefined>;
  getVerifiedWorkEmailAccess?: (userId: number) => Promise<{ workEmailDomain: string } | undefined>;
  createCompanyReferralRequest: (userId: number, input: { targetRoleUrl: string; personalPitch: string; attachmentIds: number[] }) => Promise<{ requestId: number; companyDomain: string; notifiedEmployees: number; remainingTokens?: number; coverageInviteCode?: string }>;
  fulfillCompanyCoverageInvitation?: (joinerUserId: number, input: { inviteCode: string; workEmailDomain: string }) => Promise<{ rewarded: boolean; tokenCount?: number }>;
  listCompanyReferralInbox: (userId: number) => Promise<unknown[]>;
  listCompanyReferralInboxByState?: (userId: number, state: "new" | "saved" | "completed") => Promise<unknown[]>;
  getUnclaimedCompanyReferralPreview?: (userId: number, requestId: number) => Promise<({ attachments: Attachment[] } & Record<string, unknown>) | undefined>;
  listJobSeekerCompanyReferrals?: (userId: number) => Promise<unknown[]>;
  saveCompanyReferralRequest?: (userId: number, requestId: number, saved: boolean) => Promise<{ requestId: number; saved: boolean }>;
  claimCompanyReferralRequest: (userId: number, requestId: number) => Promise<{ requestId: number; claimed: boolean }>;
  getClaimedCompanyReferralDetail: (userId: number, requestId: number) => Promise<({ attachments: Attachment[] } & Record<string, unknown>) | undefined>;
  reviewReferralRequest?: (userId: number, input: { requestId: number; decision: "approved" | "declined"; message?: string }) => Promise<{ status: string }>;
  listReferralConversation?: (userId: number, requestId: number) => Promise<Array<{ id: number; body: string; createdAt: Date; isMine: boolean }>>;
  sendReferralConversationMessage?: (userId: number, requestId: number, body: string) => Promise<{ id: number }>;
  listPublicCompanyOpportunities: () => Promise<unknown[]>;
  publishCompanyOpportunity: (userId: number, input: { kind: "hiring_now" | "walk_in"; roleTitle: string; targetRoleUrl?: string; location?: string; walkInAt?: Date; walkInEndsAt?: Date }) => Promise<unknown>;
  recordActivity?: (input: { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number; companyDomain?: string; metadata?: Record<string, string | number | boolean | null | undefined> }) => Promise<void>;
  listOperationalActivity?: (input: { limit?: number; action?: string; query?: string; outcome?: "success" | "failure" | "denied" }) => Promise<unknown[]>;
  getReferralFlowHealth?: () => Promise<unknown>;
  findUsersForTokenRecovery?: (query: string) => Promise<unknown[]>;
  listAdminTokenAdjustments?: (limit?: number) => Promise<unknown[]>;
  grantAdminTokenAdjustment?: (adminUserId: number, input: { recipientUserId: number; role: "job_seeker" | "referrer"; tokenCount: number; caseReference: string; reason: string }) => Promise<{ adjustmentId: number; recipientUserId: number; role: "job_seeker" | "referrer"; tokenCount: number; newBalance: number }>;
  getCreditSummary?: (userId: number, role: "job_seeker" | "referrer") => Promise<unknown>;
  getOrCreatePersonalReferralInvite?: (userId: number) => Promise<{ inviteCode: string }>;
  claimPersonalReferralInvite?: (joinerUserId: number, input: { inviteCode: string; verifiedEmail: string }) => Promise<{ rewarded: boolean; tokenCount?: number; reason?: string }>;
  exportUserData?: (userId: number) => Promise<unknown>;
  listMyPrivacyRequests?: (userId: number) => Promise<unknown[]>;
  createPrivacyErasureRequest?: (userId: number) => Promise<{ id: number; kind: "erasure"; status: string; createdAt: Date; alreadyRequested: boolean }>;
  listAdminPrivacyRequests?: (limit?: number) => Promise<unknown[]>;
  reviewPrivacyRequest?: (adminUserId: number, requestId: number, input: { status: "in_review" | "completed" | "declined"; resolution?: string }) => Promise<unknown>;
  listNotifications?: (userId: number) => Promise<PrivateNotification[]>;
  markNotificationRead?: (userId: number, notificationId: number) => Promise<{ success: boolean }>;
};

export function registerPrivateReferralRoutes(app: Express, deps: PrivateReferralRouteDeps) {
  const record = (input: Parameters<NonNullable<typeof deps.recordActivity>>[0]) => { void deps.recordActivity?.(input).catch(() => undefined); };
  const privateDocumentMimeTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg"];
  const parseRawPrivateDocument = express.raw({ type: privateDocumentMimeTypes, limit: "10mb" });
  const privateDocumentPrefix = (identity: Identity) => `skipwait/private-referrals/${identity.account.openId}/`;
  const opaqueDocumentBuffer = (input: { encryptedContent?: string; encryptionKey?: string; initializationVector?: string }) => {
    if (!input.encryptedContent || !input.encryptionKey || !input.initializationVector) throw new Error("Resume upload data is incomplete");
    const encrypted = Buffer.from(input.encryptedContent, "base64"); const key = Buffer.from(input.encryptionKey, "base64"); const iv = Buffer.from(input.initializationVector, "base64");
    if (key.length !== 32 || iv.length !== 12 || encrypted.length <= 16) throw new Error("Resume upload data is invalid");
    const decipher = createDecipheriv("aes-256-gcm", key, iv); decipher.setAuthTag(encrypted.subarray(-16));
    return Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]);
  };
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
  const workflowPrefixes = ["/api/company-referrals", "/api/documents", "/api/opportunities", "/api/personal-invites", "/api/credits", "/api/notifications"];
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
  app.get("/api/opportunities", async (_req, res) => {
    try { res.json({ opportunities: await deps.listPublicCompanyOpportunities() }); } catch { res.status(500).json({ error: "We could not load opportunities right now" }); }
  });
  app.get("/api/notifications", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view your private updates" });
      if (!deps.listNotifications) return res.status(503).json({ error: "Your updates are unavailable right now" });
      res.set("Cache-Control", "private, no-store");
      const notifications = await deps.listNotifications(identity.account.id);
      res.json({ notifications: notifications.map(({ id, category, title, body, readAt, createdAt }) => ({ id, category, title, body, readAt, createdAt })) });
    } catch { res.status(500).json({ error: "We could not load your private updates" }); }
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
      if (!identity) return res.status(401).json({ error: "Sign in with Clerk to publish an opportunity" });
      if (!identity.primaryEmail || identity.primaryEmail.verification?.status !== "verified") return res.status(403).json({ error: "Verify your primary work email in Clerk before publishing" });
      const { kind, roleTitle, targetRoleUrl, location, walkInAt, walkInEndsAt } = req.body as { kind?: string; roleTitle?: string; targetRoleUrl?: string; location?: string; walkInAt?: string; walkInEndsAt?: string };
      if ((kind !== "hiring_now" && kind !== "walk_in") || !roleTitle?.trim()) return res.status(400).json({ error: "Choose Hiring now or Walk-in and add the role" });
      const parseDate = (value?: string) => { if (!value) return undefined; const date = new Date(value); return Number.isNaN(date.getTime()) ? undefined : date; };
      if ((walkInAt && !parseDate(walkInAt)) || (walkInEndsAt && !parseDate(walkInEndsAt))) return res.status(400).json({ error: "Use valid walk-in dates" });
      const opportunity = await deps.publishCompanyOpportunity(identity.account.id, { kind, roleTitle, targetRoleUrl, location, walkInAt: parseDate(walkInAt), walkInEndsAt: parseDate(walkInEndsAt) });
      const logged = opportunity as { id?: number; companyDomain?: string }; record({ actorUserId: identity.account.id, action: "opportunity.published", outcome: "success", resourceType: "opportunity", resourceId: logged.id, companyDomain: logged.companyDomain, metadata: { kind } });
      res.status(201).json({ opportunity });
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "We could not publish that opportunity" }); }
  });
  app.post("/api/documents", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in with Clerk to upload documents securely" });
      const { fileName, mimeType, dataUrl } = req.body as { fileName?: string; mimeType?: string; dataUrl?: string };
      if (!fileName || !mimeType || !dataUrl) return res.status(400).json({ error: "Document details are required" });
      const buffer = deps.dataUrlToBuffer(dataUrl);
      res.status(201).json(await persistPrivateDocument(identity, fileName, mimeType, buffer));
    } catch (error) { const message = error instanceof Error ? error.message : "We could not upload that document. Please try again."; const isValidationError = /PDF|Word|PNG|JPEG|document type|smaller than/i.test(message); res.status(isValidationError ? 400 : 500).json({ error: message }); }
  });
  app.post("/api/documents/raw", (req, res, next) => parseRawPrivateDocument(req, res, error => error ? res.status(413).json({ error: "Documents must be smaller than 10 MB" }) : next()), async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in with Clerk to upload documents securely" });
      const encodedName = req.header("x-resume-filename") || "";
      let fileName = ""; try { fileName = decodeURIComponent(encodedName); } catch { fileName = ""; }
      const mimeType = (req.header("content-type") || "").split(";", 1)[0]?.trim() || "";
      if (!fileName || !privateDocumentMimeTypes.includes(mimeType) || !Buffer.isBuffer(req.body)) return res.status(400).json({ error: "Use a PDF, Word document, PNG, or JPEG resume" });
      res.status(201).json(await persistPrivateDocument(identity, fileName, mimeType, req.body));
    } catch (error) { const message = error instanceof Error ? error.message : "We could not upload that document. Please try again."; const isValidationError = /PDF|Word|PNG|JPEG|document type|smaller than/i.test(message); res.status(isValidationError ? 400 : 500).json({ error: message }); }
  });
  app.post("/api/documents/opaque", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in with Clerk to upload documents securely" });
      const { fileName, mimeType, encryptedContent, encryptionKey, initializationVector } = req.body as { fileName?: string; mimeType?: string; encryptedContent?: string; encryptionKey?: string; initializationVector?: string };
      if (!fileName || !mimeType || !privateDocumentMimeTypes.includes(mimeType)) return res.status(400).json({ error: "Use a PDF, Word document, PNG, or JPEG resume" });
      res.status(201).json(await persistPrivateDocument(identity, fileName, mimeType, opaqueDocumentBuffer({ encryptedContent, encryptionKey, initializationVector })));
    } catch (error) { const message = error instanceof Error ? error.message : "We could not upload that document. Please try again."; const isValidationError = /PDF|Word|PNG|JPEG|document type|smaller than|upload data/i.test(message); res.status(isValidationError ? 400 : 500).json({ error: message }); }
  });
  app.get("/api/documents/:attachmentId", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const attachmentId = Number(req.params.attachmentId);
      if (!identity) return res.status(401).send("Sign in with Clerk to view this document"); if (!Number.isInteger(attachmentId) || attachmentId <= 0) return res.status(400).send("Invalid document reference");
      const attachment = await deps.getAccessibleReferralAttachment(identity.account.id, attachmentId); if (!attachment) return res.status(404).send("Document not found");
      record({ actorUserId: identity.account.id, action: "document.accessed", outcome: "success", resourceType: "attachment", resourceId: attachmentId, metadata: { access: "authorized" } });
      const url = await deps.storageGetSignedUrl(attachment.fileKey || ""); res.set("Cache-Control", "private, no-store"); res.redirect(307, url);
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
  app.post("/api/company-referrals/verify-work-email", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      if (!identity) return res.status(401).json({ error: "Sign in with Clerk to verify a work email" });
      if (!email) return res.status(400).json({ error: "Enter the work email address that received your code" });
      const verifiedEmail = identity.emailAddresses?.find(address => address.emailAddress.trim().toLowerCase() === email && address.verification?.status === "verified");
      if (!verifiedEmail) return res.status(403).json({ error: "Enter the one-time code sent to this work email before continuing" });
      const profile = await deps.saveVerifiedWorkEmail(identity.account.id, verifiedEmail.emailAddress);
      const inviteCode = typeof req.body?.inviteCode === "string" ? req.body.inviteCode.slice(0, 64) : "";
      const reward = inviteCode && profile?.workEmailDomain && deps.fulfillCompanyCoverageInvitation ? await deps.fulfillCompanyCoverageInvitation(identity.account.id, { inviteCode, workEmailDomain: profile.workEmailDomain }) : { rewarded: false };
      record({ actorUserId: identity.account.id, action: "work_email.enrolled", outcome: "success", resourceType: "profile", companyDomain: profile?.workEmailDomain ?? undefined, metadata: { verification: "email_code" } });
      if (reward.rewarded) record({ actorUserId: identity.account.id, action: "company_coverage.rewarded", outcome: "success", resourceType: "coverage_invitation", companyDomain: profile?.workEmailDomain ?? undefined, metadata: { tokenCount: reward.tokenCount ?? 0 } });
      res.json({ verified: true, workEmailDomain: profile?.workEmailDomain, reward });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not verify your work email";
      const isValidationError = /personal email domain|work email address|required/i.test(message);
      res.status(isValidationError ? 400 : 500).json({ error: message });
    }
  });
  app.post("/api/company-referrals", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in with Clerk before sending a private company request" });
      const { targetRoleUrl, attachmentIds, candidateMessage } = req.body as { targetRoleUrl?: string; attachmentIds?: number[]; candidateMessage?: string };
      if (!targetRoleUrl || !Array.isArray(attachmentIds) || attachmentIds.length === 0) return res.status(400).json({ error: "A Target Role URL and at least one resume document are required" });
      if (!isValidTargetRoleUrl(targetRoleUrl)) return res.status(400).json({ error: TARGET_ROLE_URL_ERROR });
      const personalPitch = typeof candidateMessage === "string" && candidateMessage.trim() ? candidateMessage.trim().slice(0, 2000) : "No personal note was included with this referral request.";
      const result = await deps.createCompanyReferralRequest(identity.account.id, { targetRoleUrl: normalizeTargetRoleUrl(targetRoleUrl), attachmentIds, personalPitch });
      const requests = await deps.listJobSeekerCompanyReferrals?.(identity.account.id);
      const lifetimeRequestCount = Array.isArray(requests) ? requests.length : undefined;
      record({ actorUserId: identity.account.id, action: "company_referral.created", outcome: "success", resourceType: "referral_request", resourceId: result.requestId, companyDomain: result.companyDomain, metadata: { attachmentCount: attachmentIds.length, notifiedEmployees: result.notifiedEmployees } });
      res.status(201).json({ ...result, ...(lifetimeRequestCount ? { lifetimeRequestCount } : {}) });
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "We could not send this private referral request" }); }
  });
  app.get("/api/credits/summary", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view your referral credits" });
      const role = req.query.role === "referrer" ? "referrer" : "job_seeker";
      const summary = await deps.getCreditSummary?.(identity.account.id, role);
      if (!summary) return res.status(500).json({ error: "We could not load your referral credits" });
      res.json({ summary });
    } catch { res.status(500).json({ error: "We could not load your referral credits" }); }
  });
  app.get("/api/company-referrals/access", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in with your company email to continue" });
      const access = await deps.getVerifiedWorkEmailAccess?.(identity.account.id);
      res.set("Cache-Control", "private, no-store");
      res.json({ verifiedCompanyAccess: Boolean(access), workEmailDomain: access?.workEmailDomain ?? null });
    } catch { res.status(500).json({ error: "We could not check your company-email access" }); }
  });
  app.get("/api/personal-invites/me", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to create your personal invite link" });
      if (!deps.getOrCreatePersonalReferralInvite) return res.status(503).json({ error: "Personal invites are not available yet" });
      const invite = await deps.getOrCreatePersonalReferralInvite(identity.account.id);
      res.json({ invite });
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
      if (!identity) return res.status(401).json({ error: "Sign in with Clerk to view your referral requests" });
      const requests = await deps.listJobSeekerCompanyReferrals?.(identity.account.id) ?? [];
      record({ actorUserId: identity.account.id, action: "company_referral.seeker_home_viewed", outcome: "success", resourceType: "request_home", metadata: { requestCount: requests.length } });
      res.json({ requests });
    } catch { res.status(500).json({ error: "We could not load your referral requests" }); }
  });
  app.get("/api/company-referrals/inbox", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in with Clerk to view employee requests" });
      const requestedScope = typeof req.query.scope === "string" ? req.query.scope : "new";
      const scope = requestedScope === "saved" || requestedScope === "completed" ? requestedScope : "new";
      const requests = deps.listCompanyReferralInboxByState ? await deps.listCompanyReferralInboxByState(identity.account.id, scope) : await deps.listCompanyReferralInbox(identity.account.id);
      record({ actorUserId: identity.account.id, action: "company_referral.inbox_viewed", outcome: "success", resourceType: "inbox", metadata: { requestCount: requests.length, scope } });
      res.json({ requests, scope });
    } catch { res.status(500).json({ error: "We could not load private company requests" }); }
  });
  app.post("/api/company-referrals/:requestId/save", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId);
      const saved = req.body?.saved !== false;
      if (!identity) return res.status(401).json({ error: "Sign in with Clerk to save a private request" });
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral request" });
      if (!deps.saveCompanyReferralRequest) return res.status(501).json({ error: "Saving requests is not available yet" });
      const result = await deps.saveCompanyReferralRequest(identity.account.id, requestId, saved);
      record({ actorUserId: identity.account.id, action: saved ? "company_referral.saved" : "company_referral.unsaved", outcome: "success", resourceType: "referral_request", resourceId: requestId });
      res.json(result);
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "This referral request is no longer available" }); }
  });
  app.post("/api/company-referrals/:requestId/review", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId);
      const decision = req.body?.decision;
      const message = typeof req.body?.message === "string" ? req.body.message.slice(0, 3000) : undefined;
      if (!identity) return res.status(401).json({ error: "Sign in with Clerk to review a private request" });
      if (!Number.isInteger(requestId) || requestId <= 0 || (decision !== "approved" && decision !== "declined")) return res.status(400).json({ error: "Choose approve or decline for this referral request" });
      if (!deps.reviewReferralRequest) return res.status(501).json({ error: "Reviewing requests is not available yet" });
      const result = await deps.reviewReferralRequest(identity.account.id, { requestId, decision, message });
      record({ actorUserId: identity.account.id, action: `company_referral.${decision}`, outcome: "success", resourceType: "referral_request", resourceId: requestId });
      res.json(result);
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "This referral request can no longer be reviewed" }); }
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
      const messages = await deps.listReferralConversation(actorUserId, requestId);
      record({ actorUserId, action: "company_referral.conversation_viewed", outcome: "success", resourceType: "referral_conversation", resourceId: requestId, metadata: { messageCount: messages.length } });
      res.set("Cache-Control", "private, no-store");
      res.json({ messages });
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
      const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral request" });
      if (!body) return res.status(400).json({ error: "Write a message before sending" });
      if (body.length > 3000) return res.status(400).json({ error: "Messages can be up to 3,000 characters" });
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
  app.get("/api/company-referrals/:requestId/preview", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId);
      if (!identity) return res.status(401).json({ error: "Sign in with Clerk to review this request" });
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral request" });
      if (!deps.getUnclaimedCompanyReferralPreview) return res.status(501).json({ error: "Candidate preview is not available yet" });
      const request = await deps.getUnclaimedCompanyReferralPreview(identity.account.id, requestId);
      if (!request) return res.status(404).json({ error: "This private request is not available to your verified company account" });
      const attachments = await Promise.all(request.attachments.map(async attachment => ({ id: attachment.id, fileName: attachment.fileName, mimeType: attachment.mimeType, fileSize: attachment.fileSize, url: attachment.fileKey ? await deps.storageGetSignedUrl(attachment.fileKey) : `/api/documents/${attachment.id}` })));
      record({ actorUserId: identity.account.id, action: "company_referral.preview_viewed", outcome: "success", resourceType: "referral_request", resourceId: requestId, companyDomain: typeof request.companyDomain === "string" ? request.companyDomain : undefined, metadata: { attachmentCount: attachments.length } });
      res.set("Cache-Control", "private, no-store");
      res.json({ request: { ...request, attachments } });
    } catch { res.status(500).json({ error: "We could not load this private candidate preview" }); }
  });
  app.get("/api/company-referrals/:requestId", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      const requestId = Number(req.params.requestId);
      if (!identity) return res.status(401).json({ error: "Sign in with Clerk to view this request" });
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral request" });
      const request = await deps.getClaimedCompanyReferralDetail(identity.account.id, requestId);
      if (!request) return res.status(404).json({ error: "This private request is not assigned to your verified employee account" });
      const attachments = await Promise.all(request.attachments.map(async attachment => ({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize,
        url: attachment.fileKey ? await deps.storageGetSignedUrl(attachment.fileKey) : `/api/documents/${attachment.id}`,
      })));
      record({ actorUserId: identity.account.id, action: "company_referral.claimed_detail_viewed", outcome: "success", resourceType: "referral_request", resourceId: requestId, companyDomain: typeof request.companyDomain === "string" ? request.companyDomain : undefined, metadata: { attachmentCount: attachments.length } });
      res.json({ request: { ...request, attachments } });
    } catch {
      res.status(500).json({ error: "We could not load this private referral request" });
    }
  });
  app.post("/api/company-referrals/:requestId/claim", async (req, res) => { try { const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId); if (!identity) return res.status(401).json({ error: "Sign in with Clerk to claim a referral request" }); if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral request" }); const result = await deps.claimCompanyReferralRequest(identity.account.id, requestId); record({ actorUserId: identity.account.id, action: "company_referral.claimed", outcome: "success", resourceType: "referral_request", resourceId: requestId }); res.json(result); } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "This referral request is no longer available" }); } });
  app.get("/api/admin/activity", async (req, res) => { try { const identity = await deps.resolveIdentity(req); if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" }); const limit = Math.min(250, Math.max(1, Number(req.query.limit) || 100)); const action = typeof req.query.action === "string" ? req.query.action.slice(0, 100) : undefined; const query = typeof req.query.query === "string" ? req.query.query.slice(0, 120) : undefined; const outcome = req.query.outcome === "success" || req.query.outcome === "failure" || req.query.outcome === "denied" ? req.query.outcome : undefined; const events = await deps.listOperationalActivity?.({ limit, action, query, outcome }) ?? []; record({ actorUserId: identity.account.id, action: "admin.activity_viewed", outcome: "success", resourceType: "activity_log", metadata: { limit, filtered: Boolean(action || query || outcome) } }); res.json({ events }); } catch { res.status(500).json({ error: "We could not load operational activity" }); } });
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
      if (status !== "in_review" && status !== "completed" && status !== "declined") return res.status(400).json({ error: "Choose a valid privacy request status" });
      const request = await deps.reviewPrivacyRequest?.(identity.account.id, requestId, { status, resolution }); if (!request) return res.status(404).json({ error: "Privacy request not found" });
      record({ actorUserId: identity.account.id, action: "admin.privacy_request_reviewed", outcome: "success", resourceType: "privacy_request", resourceId: requestId, metadata: { status } });
      res.json({ request });
    } catch { res.status(500).json({ error: "We could not update this privacy request" }); }
  });
  app.get("/api/admin/flow-health", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      const health = await deps.getReferralFlowHealth?.() ?? { funnel: { requestsCreated: 0, requestsClaimed: 0, decisionsRecorded: 0, waitingForCoverage: 0 }, coverageGaps: [], instrumentation: { uploadedDocuments: 0, recordedFailures: 0 } };
      record({ actorUserId: identity.account.id, action: "admin.flow_health_viewed", outcome: "success", resourceType: "flow_health" });
      res.json({ health });
    } catch { res.status(500).json({ error: "We could not load referral flow health" }); }
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
}
import { isValidTargetRoleUrl, normalizeTargetRoleUrl, TARGET_ROLE_URL_ERROR } from "@shared/referralUrl";
