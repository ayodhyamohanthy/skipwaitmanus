import { createCipheriv, randomBytes } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

function encryptForTransport(value: Buffer) {
  const key = randomBytes(32); const initializationVector = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, initializationVector);
  const encryptedContent = Buffer.concat([cipher.update(value), cipher.final(), cipher.getAuthTag()]);
  return { encryptedContent: encryptedContent.toString("base64"), encryptionKey: key.toString("base64"), initializationVector: initializationVector.toString("base64") };
}

describe("opaque private-document upload route", () => {
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
});
