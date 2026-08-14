import type { Express, Request } from "express";

type Account = { id: number; openId: string };
type Identity = { account: Account; primaryEmail?: { emailAddress: string; verification?: { status?: string } | null } | null };
type Attachment = { id: number; fileName: string; mimeType: string; fileSize: number; fileKey?: string };

export type PrivateReferralRouteDeps = {
  resolveIdentity: (req: Request) => Promise<Identity | undefined>;
  dataUrlToBuffer: (dataUrl: string) => Buffer;
  sanitizeDocumentName: (fileName: string) => string;
  storagePut: (key: string, data: Buffer, mimeType: string) => Promise<{ key: string }>;
  storageGetSignedUrl: (key: string) => Promise<string>;
  createReferralAttachment: (ownerId: number, input: { fileName: string; fileKey: string; mimeType: string; fileSize: number }) => Promise<Attachment>;
  getAccessibleReferralAttachment: (userId: number, attachmentId: number) => Promise<(Attachment & { ownerId: number; referrerId?: number | null }) | undefined>;
  saveVerifiedWorkEmail: (userId: number, email: string) => Promise<{ workEmailDomain?: string | null } | undefined>;
  createCompanyReferralRequest: (userId: number, input: { targetRoleUrl: string; personalPitch: string; attachmentIds: number[] }) => Promise<{ requestId: number; companyDomain: string; notifiedEmployees: number }>;
  listCompanyReferralInbox: (userId: number) => Promise<unknown[]>;
  claimCompanyReferralRequest: (userId: number, requestId: number) => Promise<{ requestId: number; claimed: boolean }>;
  getClaimedCompanyReferralDetail: (userId: number, requestId: number) => Promise<({ attachments: Attachment[] } & Record<string, unknown>) | undefined>;
};

export function registerPrivateReferralRoutes(app: Express, deps: PrivateReferralRouteDeps) {
  app.post("/api/documents", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in with Clerk to upload documents securely" });
      const { fileName, mimeType, dataUrl } = req.body as { fileName?: string; mimeType?: string; dataUrl?: string };
      if (!fileName || !mimeType || !dataUrl) return res.status(400).json({ error: "Document details are required" });
      const buffer = deps.dataUrlToBuffer(dataUrl); if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: "Documents must be smaller than 10 MB" });
      const safeName = deps.sanitizeDocumentName(fileName); const { key } = await deps.storagePut(`skipwait/private-referrals/${identity.account.openId}/${Date.now()}-${safeName}`, buffer, mimeType);
      const attachment = await deps.createReferralAttachment(identity.account.id, { fileName, fileKey: key, mimeType, fileSize: buffer.length });
      res.status(201).json({ id: attachment.id, fileName, mimeType, fileSize: buffer.length, url: `/api/documents/${attachment.id}` });
    } catch { res.status(500).json({ error: "We could not upload that document. Please try again." }); }
  });
  app.get("/api/documents/:attachmentId", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req); const attachmentId = Number(req.params.attachmentId);
      if (!identity) return res.status(401).send("Sign in with Clerk to view this document"); if (!Number.isInteger(attachmentId) || attachmentId <= 0) return res.status(400).send("Invalid document reference");
      const attachment = await deps.getAccessibleReferralAttachment(identity.account.id, attachmentId); if (!attachment) return res.status(404).send("Document not found");
      const url = await deps.storageGetSignedUrl(attachment.fileKey || ""); res.set("Cache-Control", "private, no-store"); res.redirect(307, url);
    } catch { res.status(502).send("We could not retrieve that document. Please try again."); }
  });
  app.post("/api/company-referrals/verify-work-email", async (req, res) => {
    try { const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in with Clerk to verify a work email" }); if (!identity.primaryEmail || identity.primaryEmail.verification?.status !== "verified") return res.status(403).json({ error: "Verify your primary work email in Clerk before joining the private employee pool" }); const profile = await deps.saveVerifiedWorkEmail(identity.account.id, identity.primaryEmail.emailAddress); res.json({ verified: true, workEmailDomain: profile?.workEmailDomain }); } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : "We could not verify your work email" }); }
  });
  app.post("/api/company-referrals", async (req, res) => {
    try { const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in with Clerk before sending a private company request" }); const { targetRoleUrl, attachmentIds } = req.body as { targetRoleUrl?: string; attachmentIds?: number[] }; if (!targetRoleUrl || !Array.isArray(attachmentIds) || attachmentIds.length === 0) return res.status(400).json({ error: "A Target Role URL and at least one resume document are required" }); res.status(201).json(await deps.createCompanyReferralRequest(identity.account.id, { targetRoleUrl, attachmentIds, personalPitch: "Private referral request submitted through skipwait.me." })); } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "We could not send this private referral request" }); }
  });
  app.get("/api/company-referrals/inbox", async (req, res) => { try { const identity = await deps.resolveIdentity(req); if (!identity) return res.status(401).json({ error: "Sign in with Clerk to view employee requests" }); res.json({ requests: await deps.listCompanyReferralInbox(identity.account.id) }); } catch { res.status(500).json({ error: "We could not load private company requests" }); } });
  app.get("/api/company-referrals/:requestId", async (req, res) => { try { const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId); if (!identity) return res.status(401).json({ error: "Sign in with Clerk to view this request" }); if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral request" }); const request = await deps.getClaimedCompanyReferralDetail(identity.account.id, requestId); if (!request) return res.status(404).json({ error: "This private request is not assigned to your verified employee account" }); res.json({ request: { ...request, attachments: request.attachments.map(attachment => ({ ...attachment, url: `/api/documents/${attachment.id}` })) } }); } catch { res.status(500).json({ error: "We could not load this private referral request" }); } });
  app.post("/api/company-referrals/:requestId/claim", async (req, res) => { try { const identity = await deps.resolveIdentity(req); const requestId = Number(req.params.requestId); if (!identity) return res.status(401).json({ error: "Sign in with Clerk to claim a referral request" }); if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: "Invalid referral request" }); res.json(await deps.claimCompanyReferralRequest(identity.account.id, requestId)); } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "This referral request is no longer available" }); } });
}
