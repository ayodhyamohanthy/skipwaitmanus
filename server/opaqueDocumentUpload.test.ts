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
      resolveIdentity: async req => req.header("x-test-user") === "seeker" ? { account: { id: 12, openId: "workos-seeker" } } : undefined,
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
      resolveIdentity: async req => req.header("x-test-user") === "seeker" ? { account: { id: 12, openId: "workos-seeker" } } : req.header("x-test-user") === "outsider" ? { account: { id: 13, openId: "workos-outsider" } } : undefined,
      dataUrlToBuffer: () => Buffer.from("unused"), sanitizeDocumentName: value => value,
      storagePut: async (key, data) => { privateBytes.set(key, data); return { key }; }, storageGetSignedUrl: async key => `https://signed.example/${encodeURIComponent(key)}`,
      createReferralAttachment: async (_ownerId, input) => ({ id: attachmentId++, fileName: input.fileName, mimeType: input.mimeType, fileSize: input.fileSize, fileKey: input.fileKey }), getAccessibleReferralAttachment: async () => undefined,
      createResumeUploadSession: async (ownerId, input) => { const id = "session-1"; sessions.set(id, { id, ownerId, ...input, receivedSize: 0, nextChunkIndex: 0, status: "active", attachmentId: null, chunks: [] }); return { id }; },
      getResumeUploadSession: async (ownerId, id) => { const session = sessions.get(id); return session?.ownerId === ownerId ? session : undefined; },
      appendResumeUploadChunk: async (ownerId, input) => { const session = sessions.get(input.sessionId); if (!session || session.ownerId !== ownerId || input.chunkIndex !== session.nextChunkIndex) throw new Error("Resume upload chunks arrived out of order"); session.chunks.push(input); session.nextChunkIndex += 1; session.receivedSize += input.byteSize; return { nextChunkIndex: session.nextChunkIndex, receivedSize: session.receivedSize, alreadyStored: false }; },
      claimResumeUploadFinalization: async (ownerId, id, finalizationOwner) => { const session = sessions.get(id); if (!session || session.ownerId !== ownerId) return { outcome: "missing" as const }; if (session.status === "completed") return { outcome: "completed" as const, session }; if (session.status === "finalizing") return { outcome: "finalizing" as const, session }; session.status = "finalizing"; session.finalizationOwner = finalizationOwner; return { outcome: "claimed" as const, session }; },
      completeResumeUploadSession: async (ownerId, id, finalizationOwner, input) => { const session = sessions.get(id); if (!session || session.ownerId !== ownerId || session.finalizationOwner !== finalizationOwner) throw new Error("lease changed"); const attachment = { id: attachmentId++, ...input }; session.status = "completed"; session.attachmentId = attachment.id; return attachment; },
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined, listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(privateBytes.get(decodeURIComponent(url.split("/").pop() || "")), { status: 200 })));
    const pdf = Buffer.from("%PDF-1.4\n% fragmented secure test\n"); const started = await request(app).post("/api/documents/uploads").set("x-test-user", "seeker").send({ fileName: "resume.pdf", mimeType: "application/pdf", fileSize: pdf.length });
    expect(started.status).toBe(201); expect((await request(app).post(`/api/documents/uploads/${started.body.sessionId}/chunks`).set("x-test-user", "outsider").send({ chunkIndex: 0, ...encryptForTransport(pdf) })).status).toBe(404);
    const appended = await request(app).post(`/api/documents/uploads/${started.body.sessionId}/chunks`).set("x-test-user", "seeker").send({ chunkIndex: 0, ...encryptForTransport(pdf) }); expect(appended.status).toBe(200);
    const completions = await Promise.all(Array.from({ length: 10 }, () => request(app).post(`/api/documents/uploads/${started.body.sessionId}/complete`).set("x-test-user", "seeker").send({})));
    expect(completions.every(response => response.status === 201)).toBe(true);
    expect(new Set(completions.map(response => response.body.id)).size).toBe(1);
    expect(completions[0].body).toMatchObject({ fileName: "resume.pdf", fileSize: pdf.length });
    expect((await request(app).post(`/api/documents/uploads/${started.body.sessionId}/complete`).set("x-test-user", "seeker").send({})).body.id).toBe(completions[0].body.id);
  });

  it("reassembles upload chunks through direct byte reads when signed URLs are relative DB routes", async () => {
    // Regression: the DB storage fallback resolves to a relative
    // /api/documents/by-key route that server-side fetch cannot parse
    // ("Failed to parse URL"). Completion must read bytes directly and never
    // leak that internal error to the Job Seeker.
    const app = express(); app.use(express.json({ limit: "50mb" })); const sessions = new Map<string, any>(); const privateBytes = new Map<string, Buffer>(); let attachmentId = 80;
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => req.header("x-test-user") === "seeker" ? { account: { id: 12, openId: "workos-seeker" } } : undefined,
      dataUrlToBuffer: () => Buffer.from("unused"), sanitizeDocumentName: value => value,
      storagePut: async (key, data) => { privateBytes.set(key, data); return { key }; },
      storageGetSignedUrl: async key => `/api/documents/by-key/${encodeURIComponent(key)}`,
      storageGetBytes: async key => privateBytes.get(key),
      createReferralAttachment: async (_ownerId, input) => ({ id: attachmentId++, fileName: input.fileName, mimeType: input.mimeType, fileSize: input.fileSize, fileKey: input.fileKey }), getAccessibleReferralAttachment: async () => undefined,
      createResumeUploadSession: async (ownerId, input) => { const id = "session-relative"; sessions.set(id, { id, ownerId, ...input, receivedSize: 0, nextChunkIndex: 0, status: "active", attachmentId: null, chunks: [] }); return { id }; },
      getResumeUploadSession: async (ownerId, id) => { const session = sessions.get(id); return session?.ownerId === ownerId ? session : undefined; },
      appendResumeUploadChunk: async (ownerId, input) => { const session = sessions.get(input.sessionId); if (!session || session.ownerId !== ownerId || input.chunkIndex !== session.nextChunkIndex) throw new Error("Resume upload chunks arrived out of order"); session.chunks.push(input); session.nextChunkIndex += 1; session.receivedSize += input.byteSize; return { nextChunkIndex: session.nextChunkIndex, receivedSize: session.receivedSize, alreadyStored: false }; },
      claimResumeUploadFinalization: async (ownerId, id, finalizationOwner) => { const session = sessions.get(id); if (!session || session.ownerId !== ownerId) return { outcome: "missing" as const }; if (session.status === "completed") return { outcome: "completed" as const, session }; if (session.status === "finalizing") return { outcome: "finalizing" as const, session }; session.status = "finalizing"; session.finalizationOwner = finalizationOwner; return { outcome: "claimed" as const, session }; },
      completeResumeUploadSession: async (ownerId, id, finalizationOwner, input) => { const session = sessions.get(id); if (!session || session.ownerId !== ownerId || session.finalizationOwner !== finalizationOwner) throw new Error("lease changed"); const attachment = { id: attachmentId++, ...input }; session.status = "completed"; session.attachmentId = attachment.id; return attachment; },
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined, listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
    });
    // No fetch stub: any server-side HTTP read would throw, proving the
    // direct-read path is used.
    const pdf = Buffer.from("%PDF-1.4\n% relative-url reassembly test\n");
    const started = await request(app).post("/api/documents/uploads").set("x-test-user", "seeker").send({ fileName: "resume.pdf", mimeType: "application/pdf", fileSize: pdf.length });
    expect(started.status).toBe(201);
    expect((await request(app).post(`/api/documents/uploads/${started.body.sessionId}/chunks`).set("x-test-user", "seeker").send({ chunkIndex: 0, ...encryptForTransport(pdf) })).status).toBe(200);
    const completed = await request(app).post(`/api/documents/uploads/${started.body.sessionId}/complete`).set("x-test-user", "seeker").send({});
    expect(completed.status).toBe(201); expect(completed.body).toMatchObject({ fileName: "resume.pdf", fileSize: pdf.length });
  });

  it("returns a user-safe error when an upload fragment is missing", async () => {
    const app = express(); app.use(express.json({ limit: "50mb" })); const sessions = new Map<string, any>();
    sessions.set("session-missing", { id: "session-missing", ownerId: 12, fileName: "resume.pdf", mimeType: "application/pdf", expectedSize: 10, receivedSize: 10, nextChunkIndex: 1, status: "active", attachmentId: null, chunks: [{ chunkIndex: 0, storageKey: "missing-key", byteSize: 10 }] });
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => req.header("x-test-user") === "seeker" ? { account: { id: 12, openId: "workos-seeker" } } : undefined,
      dataUrlToBuffer: () => Buffer.from("unused"), sanitizeDocumentName: value => value,
      storagePut: async key => ({ key }),
      storageGetSignedUrl: async key => `/api/documents/by-key/${encodeURIComponent(key)}`,
      storageGetBytes: async () => undefined,
      createReferralAttachment: async () => ({ id: 81, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 10, fileKey: "k" }), getAccessibleReferralAttachment: async () => undefined,
      createResumeUploadSession: async (ownerId, input) => { const id = "session-missing"; sessions.set(id, { id, ownerId, ...input, expectedSize: 10, receivedSize: 10, nextChunkIndex: 1, status: "active", attachmentId: null, chunks: [{ chunkIndex: 0, storageKey: "missing-key", byteSize: 10 }] }); return { id }; },
      getResumeUploadSession: async (ownerId, id) => { const session = sessions.get(id); return session?.ownerId === ownerId ? session : undefined; },
      appendResumeUploadChunk: async () => { throw new Error("unexpected"); },
      claimResumeUploadFinalization: async () => ({ outcome: "claimed" as const }),
      completeResumeUploadSession: async () => ({ id: 81, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 10, fileKey: "k" }),
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined, listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
    });
    const completed = await request(app).post("/api/documents/uploads/session-missing/complete").set("x-test-user", "seeker").send({});
    expect(completed.status).toBe(500);
    expect(completed.body.error).toMatch(/fragment was not found/i);
    expect(completed.body.error).not.toMatch(/Failed to parse URL/i);
  });
  it("reuses a client upload identity when the browser starts the same upload twice", async () => {
    const app = express(); app.use(express.json()); const sessions = new Map<string, any>();
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 12, openId: "workos-seeker" } }), dataUrlToBuffer: () => Buffer.from("unused"), sanitizeDocumentName: value => value,
      storagePut: async key => ({ key }), storageGetSignedUrl: async key => key, createReferralAttachment: async (_ownerId, input) => ({ id: 1, ...input }), getAccessibleReferralAttachment: async () => undefined,
      createResumeUploadSession: async (ownerId, input) => { const id = input.sessionId || "generated"; const existing = sessions.get(id); if (existing) return existing; const session = { id, ownerId, ...input, status: "active", receivedSize: 0, nextChunkIndex: 0, attachmentId: null, chunks: [] }; sessions.set(id, session); return session; },
      getResumeUploadSession: async () => undefined, appendResumeUploadChunk: async () => ({ nextChunkIndex: 1, receivedSize: 1, alreadyStored: false }), claimResumeUploadFinalization: async () => ({ outcome: "missing" as const }), completeResumeUploadSession: async () => ({ id: 1, fileName: "resume.pdf", fileKey: "k", mimeType: "application/pdf", fileSize: 1 }),
      saveVerifiedWorkEmail: async () => ({}), createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined, listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
    });
    const body = { clientUploadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 99 };
    const [first, second] = await Promise.all([request(app).post("/api/documents/uploads").send(body), request(app).post("/api/documents/uploads").send(body)]);
    expect(first.status).toBe(201); expect(second.status).toBe(201); expect(first.body.sessionId).toBe(second.body.sessionId); expect(sessions.size).toBe(1);
  });

});
