import { createCipheriv, randomBytes } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

function encryptForTransport(value: Buffer) {
  const key = randomBytes(32); const initializationVector = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, initializationVector);
  const encryptedContent = Buffer.concat([cipher.update(value), cipher.final(), cipher.getAuthTag()]);
  return { encryptedContent: encryptedContent.toString("base64"), encryptionKey: key.toString("base64"), initializationVector: initializationVector.toString("base64") };
}

describe("opaque private-document upload route", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("accepts an authorized encrypted PDF payload, decrypts it only server-side, validates its signature, and stores a private attachment", async () => {
    const app = express(); app.use(express.json({ limit: "50mb" })); let stored: Buffer | undefined;
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => req.header("x-test-user") === "seeker" ? { account: { id: 12, openId: "clerk-seeker" } } : undefined,
      dataUrlToBuffer: () => Buffer.from("unused"), sanitizeDocumentName: value => value,
      storagePut: async (_key, data) => { stored = data; return { key: "private/resume.pdf" }; }, storageGetSignedUrl: async () => "https://signed.example/resume.pdf",
      createReferralAttachment: async (_ownerId, input) => ({ id: 64, fileName: input.fileName, mimeType: input.mimeType, fileSize: input.fileSize, fileKey: input.fileKey }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }),
      listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
    });
    const pdf = Buffer.from("%PDF-1.4\n% encrypted test\n"); const encrypted = encryptForTransport(pdf);
    expect((await request(app).post("/api/documents/opaque").send({ fileName: "resume.pdf", mimeType: "application/pdf", ...encrypted })).status).toBe(401);
    const uploaded = await request(app).post("/api/documents/opaque").set("x-test-user", "seeker").send({ fileName: "resume.pdf", mimeType: "application/pdf", ...encrypted });
    expect(uploaded.status).toBe(201); expect(uploaded.body).toMatchObject({ id: 64, url: "/api/documents/64" }); expect(stored).toEqual(pdf);
    expect((await request(app).post("/api/documents/opaque").set("x-test-user", "seeker").send({ fileName: "resume.pdf", mimeType: "application/pdf", encryptedContent: encrypted.encryptedContent, encryptionKey: encrypted.encryptionKey, initializationVector: Buffer.alloc(12).toString("base64") })).status).toBe(500);
  });

  it("accepts an owner-scoped encrypted fragment, rejects an outsider, and reassembles the verified document only when all bytes arrive", async () => {
    const app = express(); app.use(express.json({ limit: "50mb" })); const sessions = new Map<string, any>(); const privateBytes = new Map<string, Buffer>(); let attachmentId = 70;
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => req.header("x-test-user") === "seeker" ? { account: { id: 12, openId: "clerk-seeker" } } : req.header("x-test-user") === "outsider" ? { account: { id: 13, openId: "clerk-outsider" } } : undefined,
      dataUrlToBuffer: () => Buffer.from("unused"), sanitizeDocumentName: value => value,
      storagePut: async (key, data) => { privateBytes.set(key, data); return { key }; }, storageGetSignedUrl: async key => `https://signed.example/${encodeURIComponent(key)}`,
      createReferralAttachment: async (_ownerId, input) => ({ id: attachmentId++, fileName: input.fileName, mimeType: input.mimeType, fileSize: input.fileSize, fileKey: input.fileKey }), getAccessibleReferralAttachment: async () => undefined,
      createResumeUploadSession: async (ownerId, input) => { const id = "session-1"; sessions.set(id, { id, ownerId, ...input, receivedSize: 0, nextChunkIndex: 0, status: "active", attachmentId: null, chunks: [] }); return { id }; },
      getResumeUploadSession: async (ownerId, id) => { const session = sessions.get(id); return session?.ownerId === ownerId ? session : undefined; },
      appendResumeUploadChunk: async (ownerId, input) => { const session = sessions.get(input.sessionId); if (!session || session.ownerId !== ownerId || input.chunkIndex !== session.nextChunkIndex) throw new Error("Resume upload chunks arrived out of order"); session.chunks.push(input); session.nextChunkIndex += 1; session.receivedSize += input.byteSize; return { nextChunkIndex: session.nextChunkIndex, receivedSize: session.receivedSize, alreadyStored: false }; },
      completeResumeUploadSession: async (ownerId, id, idOfAttachment) => { const session = sessions.get(id); if (session?.ownerId === ownerId) { session.status = "completed"; session.attachmentId = idOfAttachment; } },
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined, listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(privateBytes.get(decodeURIComponent(url.split("/").pop() || "")), { status: 200 })));
    const pdf = Buffer.from("%PDF-1.4\n% fragmented secure test\n"); const started = await request(app).post("/api/documents/uploads").set("x-test-user", "seeker").send({ fileName: "resume.pdf", mimeType: "application/pdf", fileSize: pdf.length });
    expect(started.status).toBe(201); expect((await request(app).post(`/api/documents/uploads/${started.body.sessionId}/chunks`).set("x-test-user", "outsider").send({ chunkIndex: 0, ...encryptForTransport(pdf) })).status).toBe(404);
    const appended = await request(app).post(`/api/documents/uploads/${started.body.sessionId}/chunks`).set("x-test-user", "seeker").send({ chunkIndex: 0, ...encryptForTransport(pdf) }); expect(appended.status).toBe(200);
    const completed = await request(app).post(`/api/documents/uploads/${started.body.sessionId}/complete`).set("x-test-user", "seeker").send({}); expect(completed.status).toBe(201); expect(completed.body).toMatchObject({ fileName: "resume.pdf", fileSize: pdf.length });
    expect((await request(app).post(`/api/documents/uploads/${started.body.sessionId}/complete`).set("x-test-user", "seeker").send({})).body.id).toBe(completed.body.id);
  });
});
