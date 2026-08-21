import { createDecipheriv } from "node:crypto";
import express, { type Express, type Request } from "express";
import { validatePrivateDocument } from "./documentValidation";
import { getOrCreateReferralShareCard, getOwnedResumeAttachmentForPitch, getPrivateReferrerImpactSummary, getPublicReferralShareCard, revokeReferralShareCard } from "./db";
import { draftSmartReferralPitch } from "./ai";
import { sendReferrerReviewEmail } from "./referrerReviewEmail";
import { sendSlotOpenedAlertEmail } from "./slotOpenedAlertEmail";
import sharp from "sharp";
import { isReferralProgressUpdateStatus, type ReferralProgressUpdateStatus, type ReferralStatus } from "../shared/referral";

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
  createResumeUploadSession?: (ownerId: number, input: { fileName: string; mimeType: string; expectedSize: number }) => Promise<{ id: string }>;
  getResumeUploadSession?: (ownerId: number, sessionId: string) => Promise<{ id: string; fileName: string; mimeType: string; expectedSize: number; receivedSize: number; nextChunkIndex: number; status: "active" | "completed" | "failed"; attachmentId: number | null; chunks: Array<{ chunkIndex: number; storageKey: string; byteSize: number }> } | undefined>;
  appendResumeUploadChunk?: (ownerId: number, input: { sessionId: string; chunkIndex: number; storageKey: string; byteSize: number }) => Promise<{ nextChunkIndex: number; receivedSize: number; alreadyStored: boolean }>;
  completeResumeUploadSession?: (ownerId: number, sessionId: string, attachmentId: number) => Promise<void>;
  saveVerifiedWorkEmail: (userId: number, email: string) => Promise<{ workEmailDomain?: string | null } | undefined>;
  getVerifiedWorkEmailAccess?: (userId: number) => Promise<{ workEmailDomain: string } | undefined>;
  getPrivateReferrerImpactSummary?: (userId: number) => Promise<{ reviewed: number; approved: number; introductions: number; interviews: number; offers: number }>;
  getOwnedResumeAttachmentForPitch?: (userId: number, attachmentId: number) => Promise<{ id: number; fileKey: string; mimeType: string }>;
  draftSmartReferralPitch?: (input: { companyDomain: string; targetRoleUrl: string; resumeUrl?: string; resumeMimeType?: string }) => Promise<string>;
  getOrCreateReferralShareCard?: (userId: number, requestId: number) => Promise<{ shareToken: string; companyDomain: string; status: ReferralStatus; isActive: boolean }>;
  revokeReferralShareCard?: (userId: number, requestId: number) => Promise<{ revoked: boolean }>;
  getPublicReferralShareCard?: (shareToken: string) => Promise<{ companyDomain: string; status: ReferralStatus } | undefined>;
  createCompanyReferralRequest: (userId: number, input: { targetRoleUrl: string; personalPitch: string; attachmentIds: number[]; fastTrackCode?: string; fastTrackCompanySlug?: string; fastTrackAlias?: string }) => Promise<{ requestId: number; companyDomain: string; notifiedEmployees: number; coverageStatus?: "covered" | "waiting_for_company_coverage"; remainingTokens?: number; coverageInviteCode?: string; creditSummary?: unknown; fastTrack?: boolean }>;
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
  getUnclaimedCompanyReferralPreview?: (userId: number, requestId: number) => Promise<({ attachments: Attachment[] } & Record<string, unknown>) | undefined>;
  listJobSeekerCompanyReferrals?: (userId: number) => Promise<unknown[]>;
  saveCompanyReferralRequest?: (userId: number, requestId: number, saved: boolean) => Promise<{ requestId: number; saved: boolean }>;
  claimCompanyReferralRequest: (userId: number, requestId: number) => Promise<{ requestId: number; claimed: boolean }>;
  getClaimedCompanyReferralDetail: (userId: number, requestId: number) => Promise<({ attachments: Attachment[] } & Record<string, unknown>) | undefined>;
  reviewReferralRequest?: (userId: number, input: { requestId: number; decision: "approved" | "declined"; message?: string }) => Promise<{ status: string }>;
  oneClickReviewReferralRequest?: (userId: number, input: { requestId: number; decision: "approved" | "declined"; declineReason?: "role_not_a_fit" | "cannot_support" | "timing" }) => Promise<{ status: string; companyDomain: string; declineReason?: string }>;
  prepareReferrerReviewEmailNotifications?: (requestId: number) => Promise<Array<{ referrerId: number; email: string; linkToken: string; companyDomain: string }>>;
  resolveReferrerReviewEmailLink?: (userId: number, linkToken: string) => Promise<{ requestId: number }>;
  consumeReferrerReviewEmailLink?: (userId: number, linkToken: string) => Promise<void>;
  sendReferrerReviewEmail?: (input: { to: string; companyDomain: string; reviewUrl: string }) => Promise<{ sent: boolean; reason: string }>;
  updateReferralProgress?: (userId: number, input: { requestId: number; status: ReferralProgressUpdateStatus }) => Promise<{ status: ReferralProgressUpdateStatus; changed: boolean }>;
  getApprovedReferralProgressStatus?: (userId: number, requestId: number) => Promise<{ status: ReferralStatus }>;
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
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
  const isOpaqueShareToken = (value: string) => /^[a-zA-Z0-9-]{16,64}$/.test(value);
  const isOpaqueReviewLinkToken = (value: string) => /^[a-zA-Z0-9]{32,64}$/.test(value);
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
  app.post("/api/documents/uploads", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in with Clerk to upload documents securely" });
      const { fileName, mimeType, fileSize } = req.body as { fileName?: string; mimeType?: string; fileSize?: number };
      const safeFileSize = typeof fileSize === "number" && Number.isInteger(fileSize) && fileSize > 0 && fileSize <= 10 * 1024 * 1024 ? fileSize : null;
      if (!fileName || !mimeType || !privateDocumentMimeTypes.includes(mimeType) || safeFileSize === null) return res.status(400).json({ error: "Use a PDF, Word document, PNG, or JPEG resume smaller than 10 MB" });
      if (!deps.createResumeUploadSession) return res.status(503).json({ error: "Private uploads are temporarily unavailable" });
      const session = await deps.createResumeUploadSession(identity.account.id, { fileName: deps.sanitizeDocumentName(fileName), mimeType, expectedSize: safeFileSize });
      res.set("Cache-Control", "private, no-store"); res.status(201).json({ sessionId: session.id, chunkBytes: 48 * 1024 });
    } catch { res.status(500).json({ error: "We could not prepare your private resume upload. Please try again." }); }
  });
  app.post("/api/documents/uploads/:sessionId/chunks", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in with Clerk to upload documents securely" });
      const { chunkIndex, encryptedContent, encryptionKey, initializationVector } = req.body as { chunkIndex?: number; encryptedContent?: string; encryptionKey?: string; initializationVector?: string };
      const safeChunkIndex = typeof chunkIndex === "number" && Number.isInteger(chunkIndex) && chunkIndex >= 0 ? chunkIndex : null;
      if (!deps.getResumeUploadSession || !deps.appendResumeUploadChunk || safeChunkIndex === null) return res.status(400).json({ error: "This resume chunk could not be verified" });
      const session = await deps.getResumeUploadSession(identity.account.id, req.params.sessionId); if (!session || session.status !== "active") return res.status(404).json({ error: "This private upload is no longer available" });
      const chunk = opaqueDocumentBuffer({ encryptedContent, encryptionKey, initializationVector }); if (chunk.length > 48 * 1024) return res.status(400).json({ error: "Resume upload chunk is too large" });
      const { key } = await deps.storagePut(`${privateDocumentPrefix(identity)}staging/${session.id}/${safeChunkIndex}`, chunk, "application/octet-stream");
      const progress = await deps.appendResumeUploadChunk(identity.account.id, { sessionId: session.id, chunkIndex: safeChunkIndex, storageKey: key, byteSize: chunk.length });
      res.set("Cache-Control", "private, no-store"); res.json(progress);
    } catch (error) { const message = error instanceof Error ? error.message : "We could not save this resume fragment"; res.status(/invalid|incomplete|out of order|too large/i.test(message) ? 400 : 500).json({ error: message }); }
  });
  app.post("/api/documents/uploads/:sessionId/complete", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in with Clerk to upload documents securely" });
      if (!deps.getResumeUploadSession || !deps.completeResumeUploadSession) return res.status(503).json({ error: "Private uploads are temporarily unavailable" });
      const session = await deps.getResumeUploadSession(identity.account.id, req.params.sessionId); if (!session) return res.status(404).json({ error: "This private upload is no longer available" });
      if (session.status === "completed" && session.attachmentId) return res.status(201).json({ id: session.attachmentId, fileName: session.fileName, mimeType: session.mimeType, fileSize: session.expectedSize, url: `/api/documents/${session.attachmentId}` });
      if (session.status !== "active" || session.receivedSize !== session.expectedSize || session.chunks.length !== session.nextChunkIndex) return res.status(400).json({ error: "Your resume upload is incomplete. Please retry it." });
      const pieces = await Promise.all(session.chunks.map(async (chunk, index) => { if (chunk.chunkIndex !== index) throw new Error("Resume upload chunks are incomplete"); const signedUrl = await deps.storageGetSignedUrl(chunk.storageKey); const response = await fetch(signedUrl); if (!response.ok) throw new Error("Resume upload fragment was not found"); return Buffer.from(await response.arrayBuffer()); }));
      const buffer = Buffer.concat(pieces); if (buffer.length !== session.expectedSize) throw new Error("Resume upload size could not be verified");
      const attachment = await createPrivateAttachment(identity, session.fileName, session.mimeType, buffer); await deps.completeResumeUploadSession(identity.account.id, session.id, attachment.id);
      res.status(201).json(attachment);
    } catch (error) { const message = error instanceof Error ? error.message : "We could not finish your resume upload"; res.status(/incomplete|size|PDF|Word|PNG|JPEG|document type/i.test(message) ? 400 : 500).json({ error: message }); }
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
      const { targetRoleUrl, attachmentIds, candidateMessage, fastTrackCode, fastTrackCompanySlug, fastTrackAlias } = req.body as { targetRoleUrl?: string; attachmentIds?: number[]; candidateMessage?: string; fastTrackCode?: string; fastTrackCompanySlug?: string; fastTrackAlias?: string };
      if (!targetRoleUrl || !Array.isArray(attachmentIds) || attachmentIds.length === 0) return res.status(400).json({ error: "A Target Role URL and at least one resume document are required" });
      if (!isValidTargetRoleUrl(targetRoleUrl)) return res.status(400).json({ error: TARGET_ROLE_URL_ERROR });
      const personalPitch = typeof candidateMessage === "string" && candidateMessage.trim() ? candidateMessage.trim().slice(0, 2000) : "No personal note was included with this referral request.";
      const safeFastTrackCode = typeof fastTrackCode === "string" && /^[a-zA-Z0-9-]{16,64}$/.test(fastTrackCode) ? fastTrackCode : undefined;
      const safeFastTrackCompanySlug = typeof fastTrackCompanySlug === "string" && /^[a-z0-9-]{1,48}$/.test(fastTrackCompanySlug) ? fastTrackCompanySlug : undefined;
      const safeFastTrackAlias = typeof fastTrackAlias === "string" && /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(fastTrackAlias) ? fastTrackAlias : undefined;
      if ((fastTrackCompanySlug || fastTrackAlias) && (!safeFastTrackCompanySlug || !safeFastTrackAlias)) return res.status(400).json({ error: "This private referral alias is invalid" });
      if (fastTrackCode && !safeFastTrackCode) return res.status(400).json({ error: "This private referral link is invalid" });
      const result = await deps.createCompanyReferralRequest(identity.account.id, { targetRoleUrl: normalizeTargetRoleUrl(targetRoleUrl), attachmentIds, personalPitch, fastTrackCode: safeFastTrackCode, fastTrackCompanySlug: safeFastTrackCompanySlug, fastTrackAlias: safeFastTrackAlias });
      if (deps.prepareReferrerReviewEmailNotifications) {
        try {
          const reviewLinks = await deps.prepareReferrerReviewEmailNotifications(result.requestId);
          const reviewEmailSender = deps.sendReferrerReviewEmail ?? sendReferrerReviewEmail;
          const origin = `${req.protocol}://${req.get("host")}`;
          const delivery = await Promise.all(reviewLinks.map(link => reviewEmailSender({ to: link.email, companyDomain: link.companyDomain, reviewUrl: `${origin}/email-review/${encodeURIComponent(link.linkToken)}` })));
          const sentCount = delivery.filter(item => item.sent).length;
          record({ actorUserId: identity.account.id, action: "company_referral.review_email_dispatched", outcome: sentCount === reviewLinks.length ? "success" : "failure", resourceType: "referral_request", resourceId: result.requestId, companyDomain: result.companyDomain, metadata: { intendedRecipientCount: reviewLinks.length, sentCount } });
        } catch { record({ actorUserId: identity.account.id, action: "company_referral.review_email_dispatched", outcome: "failure", resourceType: "referral_request", resourceId: result.requestId, companyDomain: result.companyDomain }); }
      }
      const requests = await deps.listJobSeekerCompanyReferrals?.(identity.account.id);
      const lifetimeRequestCount = Array.isArray(requests) ? requests.length : undefined;
      record({ actorUserId: identity.account.id, action: "company_referral.created", outcome: "success", resourceType: "referral_request", resourceId: result.requestId, companyDomain: result.companyDomain, metadata: { attachmentCount: attachmentIds.length, notifiedEmployees: result.notifiedEmployees, creditReserved: true, coverageStatus: result.coverageStatus ?? "covered", fastTrack: Boolean(result.fastTrack) } });
      if (result.coverageStatus === "waiting_for_company_coverage") {
        record({ actorUserId: identity.account.id, action: "company_referral.manual_follow_up_queued", outcome: "success", resourceType: "referral_request", resourceId: result.requestId, companyDomain: result.companyDomain, metadata: { notifiedEmployees: 0, creditReserved: true } });
      }
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
  app.get("/api/referrer-fast-track/me", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in with your verified company email to create a Fast-Track Link" });
      if (!deps.getOrCreateReferrerFastTrackLink) return res.status(503).json({ error: "Fast-Track Links are unavailable right now" });
      const link = await deps.getOrCreateReferrerFastTrackLink(identity.account.id);
      const origin = `${req.protocol}://${req.get("host")}`;
      const url = `${origin}/fast/${encodeURIComponent(link.linkCode)}`;
      const vanityUrl = `${origin}/refer/${encodeURIComponent(link.companyDomain.split(".")[0] || link.companyDomain)}/${encodeURIComponent(link.vanityAlias)}`;
      record({ actorUserId: identity.account.id, action: "referrer_fast_track.link_accessed", outcome: "success", resourceType: "referrer_fast_track", companyDomain: link.companyDomain, metadata: { active: link.isActive } });
      res.set("Cache-Control", "private, no-store");
      res.json({ link: { ...link, url, vanityUrl, suggestedBioCopy: `Private referral requests at ${link.companyDomain} via Skipwait.me.` } });
    } catch (error) { res.status(/verify your company email/i.test(error instanceof Error ? error.message : "") ? 403 : 500).json({ error: error instanceof Error ? error.message : "We could not create your Fast-Track Link" }); }
  });
  app.post("/api/referrer-fast-track/me/deactivate", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to pause your Fast-Track Link" });
      if (!deps.deactivateReferrerFastTrackLink) return res.status(503).json({ error: "Fast-Track Links are unavailable right now" });
      const result = await deps.deactivateReferrerFastTrackLink(identity.account.id);
      record({ actorUserId: identity.account.id, action: "referrer_fast_track.link_paused", outcome: "success", resourceType: "referrer_fast_track", metadata: { deactivated: result.deactivated } });
      res.set("Cache-Control", "private, no-store");
      res.json(result);
    } catch { res.status(500).json({ error: "We could not pause your Fast-Track Link" }); }
  });
  app.get("/api/referrer-fast-track/:linkCode", async (req, res) => {
    try {
      if (!deps.getPublicReferrerFastTrackLink) return res.status(503).json({ error: "Fast-Track Links are unavailable right now" });
      const link = await deps.getPublicReferrerFastTrackLink(req.params.linkCode);
      if (!link) return res.status(404).json({ error: "This private referral link is no longer active" });
      record({ action: "referrer_fast_track.link_resolved", outcome: "success", resourceType: "referrer_fast_track", companyDomain: link.companyDomain, metadata: { public: true } });
      res.set("Cache-Control", "no-store");
      res.json({ link });
    } catch { res.status(500).json({ error: "We could not open this private referral link" }); }
  });
  app.get("/api/referrer-fast-track/vanity/:companySlug/:vanityAlias", async (req, res) => {
    try {
      if (!deps.getPublicReferrerFastTrackVanityLink) return res.status(503).json({ error: "Fast-Track Links are unavailable right now" });
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
    } catch (error) { const message = error instanceof Error ? error.message : "We could not create a starting draft"; res.status(/private resume is unavailable/i.test(message) ? 403 : 500).json({ error: message }); }
  });
  app.post("/api/referral-share-cards/:requestId", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId);
      if (!identity) return res.status(401).json({ error: "Sign in to create a share card" });
      if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral reference" });
      const card = await (deps.getOrCreateReferralShareCard ?? getOrCreateReferralShareCard)(identity.account.id, requestId);
      const shareUrl = `${req.protocol}://${req.get("host")}/share-card/${encodeURIComponent(card.shareToken)}`;
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
      res.set("Cache-Control", "no-store"); res.json({ card: { companyDomain: card.companyDomain, status: "accepted" } });
    } catch { res.status(500).json({ error: "We could not open this share card" }); }
  });
  app.get("/api/referral-share-cards/public/:shareToken/image.png", async (req, res) => {
    try {
      if (!isOpaqueShareToken(req.params.shareToken)) return res.status(404).end();
      const card = await (deps.getPublicReferralShareCard ?? getPublicReferralShareCard)(req.params.shareToken);
      if (!card) return res.status(404).end();
      const companyDomain = escapeHtml(card.companyDomain);
      const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="630" fill="#f8fafc"/><rect x="48" y="48" width="1104" height="534" rx="36" fill="#ffffff" stroke="#dbeafe" stroke-width="3"/><rect x="94" y="100" width="74" height="74" rx="20" fill="#0B57D0"/><path d="M112 137h38M131 118v38" stroke="#fff" stroke-width="7" stroke-linecap="round"/><text x="94" y="232" fill="#0B57D0" font-family="Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="4">SKIPWAIT.ME · PRIVATE REFERRAL</text><text x="94" y="332" fill="#0f172a" font-family="Arial, sans-serif" font-size="64" font-weight="700">Accepted at ${companyDomain}</text><text x="94" y="405" fill="#475569" font-family="Arial, sans-serif" font-size="34">Shared voluntarily. No hiring outcome is implied.</text><line x1="94" y1="478" x2="1106" y2="478" stroke="#dbeafe" stroke-width="3"/><text x="94" y="532" fill="#64748b" font-family="Arial, sans-serif" font-size="28">A factual company-level milestone</text></svg>`;
      const image = await sharp(Buffer.from(svg)).png().toBuffer();
      res.set("Cache-Control", "public, max-age=300"); res.type("png").send(image);
    } catch { res.status(500).end(); }
  });
  app.get("/share-card/:shareToken", async (req, res) => {
    try {
      if (!isOpaqueShareToken(req.params.shareToken)) return res.status(404).type("html").send("<!doctype html><title>Share card unavailable</title><meta name=\"robots\" content=\"noindex\"><body style=\"margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,sans-serif\"><main style=\"min-height:100dvh;display:grid;place-items:center;padding:24px;box-sizing:border-box\"><section style=\"max-width:420px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;padding:28px;text-align:center\"><h1 style=\"margin:0;font-size:26px\">Share card unavailable</h1><p style=\"margin:12px 0 0;color:#475569;line-height:1.5\">This voluntary milestone card may have been removed.</p></section></main></body>");
      const card = await (deps.getPublicReferralShareCard ?? getPublicReferralShareCard)(req.params.shareToken);
      if (!card) return res.status(404).type("html").send("<!doctype html><title>Share card unavailable</title><meta name=\"robots\" content=\"noindex\"><body style=\"margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,sans-serif\"><main style=\"min-height:100dvh;display:grid;place-items:center;padding:24px;box-sizing:border-box\"><section style=\"max-width:420px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;padding:28px;text-align:center\"><h1 style=\"margin:0;font-size:26px\">Share card unavailable</h1><p style=\"margin:12px 0 0;color:#475569;line-height:1.5\">This voluntary milestone card may have been removed.</p></section></main></body>");
      const origin = `${req.protocol}://${req.get("host")}`; const canonicalUrl = `${origin}/share-card/${encodeURIComponent(req.params.shareToken)}`; const imageUrl = `${origin}/api/referral-share-cards/public/${encodeURIComponent(req.params.shareToken)}/image.png`; const companyDomain = escapeHtml(card.companyDomain);
      record({ action: "referral_share_card.viewed", outcome: "success", resourceType: "referral_share_card", companyDomain: card.companyDomain, metadata: { public: true } });
      res.set("Cache-Control", "no-store"); res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Accepted referral at ${companyDomain} | skipwait.me</title><meta name="description" content="A voluntarily shared referral acceptance milestone at ${companyDomain}. No hiring outcome is implied."><link rel="canonical" href="${canonicalUrl}"><meta property="og:type" content="website"><meta property="og:site_name" content="skipwait.me"><meta property="og:title" content="Accepted at ${companyDomain}"><meta property="og:description" content="Shared voluntarily. No hiring outcome is implied."><meta property="og:url" content="${canonicalUrl}"><meta property="og:image" content="${imageUrl}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="Accepted at ${companyDomain}"><meta name="twitter:description" content="Shared voluntarily. No hiring outcome is implied."><meta name="twitter:image" content="${imageUrl}"><style>body{margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,sans-serif}.card{box-sizing:border-box;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px}.panel{width:min(100%,520px);border:1px solid #dbeafe;border-radius:24px;background:#fff;padding:32px;box-shadow:0 16px 40px rgba(15,23,42,.08)}.mark{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:#0B57D0;color:#fff;font-weight:800}.eyebrow{margin:24px 0 0;color:#0B57D0;font-size:12px;font-weight:800;letter-spacing:.14em}.title{margin:12px 0 0;font-size:38px;line-height:1.02;letter-spacing:-.05em}.copy{margin:20px 0 0;color:#475569;font-size:16px;line-height:1.55}.note{margin:20px 0 0;border-radius:14px;background:#eff6ff;padding:14px;color:#1e3a8a;font-size:14px;line-height:1.45}</style></head><body><main class="card"><section class="panel" aria-label="Referral acceptance milestone"><div class="mark">↗</div><p class="eyebrow">SKIPWAIT.ME · PRIVATE REFERRAL</p><h1 class="title">Accepted at ${companyDomain}</h1><p class="copy">A private referral request was accepted at ${companyDomain}.</p><p class="note">Shared voluntarily. No hiring outcome is implied.</p></section></main></body></html>`);
    } catch { res.status(500).type("html").send("<!doctype html><title>Share card unavailable</title>"); }
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
          const origin = `${req.protocol}://${req.get("host")}`;
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
  app.post("/api/company-referrals/:requestId/one-click-review", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId); const decision = req.body?.decision; const declineReason = req.body?.declineReason;
      if (!identity) return res.status(401).json({ error: "Sign in with your verified company email to review this private request" });
      if (!Number.isInteger(requestId) || requestId <= 0 || (decision !== "approved" && decision !== "declined") || (decision === "declined" && !isOneClickDeclineReason(declineReason))) return res.status(400).json({ error: "Choose accept or a concise decline reason" });
      if (!deps.oneClickReviewReferralRequest) return res.status(503).json({ error: "One-click review is unavailable right now" });
      const result = await deps.oneClickReviewReferralRequest(identity.account.id, { requestId, decision, declineReason: decision === "declined" ? declineReason : undefined });
      record({ actorUserId: identity.account.id, action: `company_referral.one_click_${decision}`, outcome: "success", resourceType: "referral_request", resourceId: requestId, companyDomain: result.companyDomain, metadata: { declineReason: result.declineReason ?? null } });
      res.set("Cache-Control", "private, no-store"); res.json({ status: result.status, declineReason: result.declineReason });
    } catch (error) { const message = error instanceof Error ? error.message : "This referral request can no longer be reviewed"; res.status(/verify your work email|no longer available|another verified employee/i.test(message) ? 409 : 500).json({ error: message }); }
  });
  app.post("/api/referrer-review-links/:linkToken/decision", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const linkToken = req.params.linkToken; const decision = req.body?.decision; const declineReason = req.body?.declineReason;
      if (!identity) return res.status(401).json({ error: "Sign in with your verified company email to use this private review link" });
      if (!isOpaqueReviewLinkToken(linkToken) || (decision !== "approved" && decision !== "declined") || (decision === "declined" && !isOneClickDeclineReason(declineReason))) return res.status(400).json({ error: "This private review action is invalid" });
      if (!deps.resolveReferrerReviewEmailLink || !deps.consumeReferrerReviewEmailLink || !deps.oneClickReviewReferralRequest) return res.status(503).json({ error: "Email review is unavailable right now" });
      const link = await deps.resolveReferrerReviewEmailLink(identity.account.id, linkToken);
      const result = await deps.oneClickReviewReferralRequest(identity.account.id, { requestId: link.requestId, decision, declineReason: decision === "declined" ? declineReason : undefined });
      await deps.consumeReferrerReviewEmailLink(identity.account.id, linkToken);
      record({ actorUserId: identity.account.id, action: `company_referral.email_one_click_${decision}`, outcome: "success", resourceType: "referral_request", resourceId: link.requestId, companyDomain: result.companyDomain, metadata: { declineReason: result.declineReason ?? null } });
      res.set("Cache-Control", "private, no-store"); res.json({ status: result.status, declineReason: result.declineReason });
    } catch (error) { const message = error instanceof Error ? error.message : "This private review link is unavailable"; res.status(/private review link|no longer available|another verified employee/i.test(message) ? 409 : 500).json({ error: message }); }
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
      if (!deps.updateReferralProgress) return res.status(503).json({ error: "Referral progress updates are unavailable right now" });
      const result = await deps.updateReferralProgress(actorUserId, { requestId, status });
      record({ actorUserId, action: "company_referral.progress_updated", outcome: "success", resourceType: "referral_request", resourceId: requestId, metadata: { status: result.status } });
      res.json({ progress: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not record this referral progress";
      record({ actorUserId, action: "company_referral.progress_updated", outcome: "denied", resourceType: "referral_request", resourceId: Number.isInteger(requestId) ? requestId : undefined });
      res.status(/only available after the referral is accepted|not available to you/i.test(message) ? 403 : 409).json({ error: message });
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
      const messages = await deps.listReferralConversation(actorUserId, requestId);
      const progress = await deps.getApprovedReferralProgressStatus?.(actorUserId, requestId);
      record({ actorUserId, action: "company_referral.conversation_viewed", outcome: "success", resourceType: "referral_conversation", resourceId: requestId, metadata: { messageCount: messages.length } });
      res.set("Cache-Control", "private, no-store");
      res.json({ messages, progressStatus: progress?.status });
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
