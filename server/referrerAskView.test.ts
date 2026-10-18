import { describe, expect, it } from "vitest";
import { isOpenAskAttachment, lockedAskAttachmentSchema, openAskAttachmentSchema, referrerAskAttachmentSchema, toLockedAskAttachment, toOpenAskAttachment } from "../shared/referrerAskView";
import { buildClaimedAskDetailView, claimResponseView } from "./referrerAskView";

/* Contract for what a referrer receives about an ask (shared/referrerAskView.ts + server/referrerAskView.ts, D-019(e)). */

const FILE = { id: 77, fileName: "Avery_Lee_Resume.pdf", mimeType: "application/pdf", fileSize: 2048 };
const ROW = { id: 501, title: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design-1", companyDomain: "acme.com", jobFunction: "Design", candidateMessage: "My note.", attachments: [{ ...FILE, fileKey: "private/avery.pdf" }] };
// What a careless store row might add; none of it may pass the allow-list.
const EXTRA = { candidateName: "Avery Lee", jobSeekerId: 7, seekerEmail: "avery@example.com", avatarUrl: "https://cdn.example/avery.png", linkedinUrl: "https://linkedin.com/in/avery", grantVersion: 2, grantExpiresAt: "2026-11-01" };

describe("attachment views", () => {
  it("a locked file is counted, never named, linked or identified by its file id", () => {
    const locked = toLockedAskAttachment(FILE);
    expect(locked).toEqual({ mimeType: "application/pdf", fileSize: 2048, availability: "after_claim" });
    expect(locked).not.toHaveProperty("id");
    expect(locked).not.toHaveProperty("fileName");
    expect(locked).not.toHaveProperty("url");
    expect(lockedAskAttachmentSchema.parse(locked)).toEqual(locked);
    expect(isOpenAskAttachment(referrerAskAttachmentSchema.parse(locked))).toBe(false);
  });

  it("an open file is named, and linked only while document access is active", () => {
    expect(toOpenAskAttachment(FILE, true)).toEqual({ ...FILE, url: "/api/documents/77" });
    expect(toOpenAskAttachment(FILE, false)).toEqual({ ...FILE, url: null });
    expect(isOpenAskAttachment(referrerAskAttachmentSchema.parse(toOpenAskAttachment(FILE, true)))).toBe(true);
  });

  it("parsing strips unknown keys and refuses a locked file without its marker", () => {
    expect(referrerAskAttachmentSchema.parse({ ...toLockedAskAttachment(FILE), fileKey: "private/avery.pdf" })).not.toHaveProperty("fileKey");
    expect(referrerAskAttachmentSchema.parse({ id: 77, availability: "after_claim" })).toEqual({ availability: "after_claim" });
    expect(lockedAskAttachmentSchema.safeParse({ mimeType: "application/pdf", fileSize: 1 }).success).toBe(false);
    expect(openAskAttachmentSchema.safeParse({ id: 77, url: "/api/documents/77" }).success).toBe(false);
    expect(openAskAttachmentSchema.safeParse({ id: -1, fileName: "a.pdf", url: null }).success).toBe(false);
  });
});

describe("claimed detail view (the ask assigned to this referrer)", () => {
  it.each(["pending", undefined])("before acceptance (status %s): no name, files locked, note kept", status => {
    const built = buildClaimedAskDetailView({ ...ROW, ...EXTRA, status, referrerId: 2, revision: 2, documentAccessActive: true });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.view).not.toHaveProperty("candidateName");
    expect(built.view.candidateMessage).toBe("My note.");
    expect(built.view.attachments).toEqual([toLockedAskAttachment(FILE)]);
    expect(JSON.stringify(built.view)).not.toMatch(/Avery|jobSeekerId|seekerEmail|avatar|linkedin|grantVersion|grantExpiresAt|fileKey|documentAccessActive/);
  });

  it.each(["approved", "intro_made", "interview", "offer"] as const)("after acceptance (%s): name, note and named, linked files", status => {
    const built = buildClaimedAskDetailView({ ...ROW, ...EXTRA, status, referrerId: 2, revision: 5, documentAccessActive: true });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.view).toMatchObject({ status, candidateName: "Avery Lee", candidateMessage: "My note.", referrerId: 2, revision: 5 });
    expect(built.view.attachments).toEqual([toOpenAskAttachment(FILE, true)]);
    expect(JSON.stringify(built.view)).not.toMatch(/jobSeekerId|seekerEmail|avatar|linkedin|grantVersion|grantExpiresAt|fileKey|documentAccessActive/);
  });

  it("after acceptance without active document access the files stay named but unlinked", () => {
    const built = buildClaimedAskDetailView({ ...ROW, status: "approved", referrerId: 2, candidateName: "Avery Lee", documentAccessActive: false });
    expect(built.ok && built.view.attachments).toEqual([toOpenAskAttachment(FILE, false)]);
    const missingFlag = buildClaimedAskDetailView({ ...ROW, status: "approved", referrerId: 2, candidateName: "Avery Lee" });
    expect(missingFlag.ok && missingFlag.view.attachments).toEqual([toOpenAskAttachment(FILE, false)]);
  });

  it("normalizes an unknown job function to null and fails closed on a malformed row", () => {
    const built = buildClaimedAskDetailView({ ...ROW, status: "pending", jobFunction: "Astrology" });
    expect(built.ok && built.view.jobFunction).toBeNull();
    expect(buildClaimedAskDetailView({ ...ROW, status: "hired" }).ok).toBe(false);
    expect(buildClaimedAskDetailView({ ...ROW, status: "pending", attachments: [{ id: 77 }] }).ok).toBe(false);
    expect(buildClaimedAskDetailView({ title: "No id" }).ok).toBe(false);
  });
});

describe("claim response", () => {
  it("never carries the seeker's account id", () => {
    expect(claimResponseView({ requestId: 501, claimed: true, jobSeekerId: 7, companyDomain: "acme.com", revision: 2, replayed: false })).toEqual({ requestId: 501, claimed: true, companyDomain: "acme.com", revision: 2, replayed: false });
  });
});
