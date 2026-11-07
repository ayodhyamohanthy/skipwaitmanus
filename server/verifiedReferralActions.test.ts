import { describe, expect, it } from "vitest";
import { assessReferralAction, buildReferralBrief, VRA_SHADOW_ENABLED } from "./verifiedReferralActions";

const now = "2026-10-22T14:00:00.000Z";
const context = { actorUserId: 2, companyDomain: "example.org", now };
const row = () => ({ requestId: 12, seekerUserId: 1, referrerUserId: 2,
  companyDomain: "example.org", roleTitle: "Engineer", status: "approved",
  acceptedEvent: { id: 80, requestId: 12, actorUserId: 2, resultingStatus: "approved", createdAt: "2026-10-22T12:00:00.000Z" },
  access: { active: true, revoked: false }, note: "My confirmed note" });
const consent = () => ({ requestId: 12, seekerUserId: 1, recipientUserId: 2,
  version: 1, brief: true, note: false });

describe("VRA dark shadow foundation", () => {
  it("is off with no activation parameter", () => expect(VRA_SHADOW_ENABLED).toBe(false));
  it("records only a shadow candidate, never employer verification or reward", () => {
    expect(assessReferralAction(context, row())).toEqual({ state: "shadow_candidate", requestId: 12,
      acceptanceEventId: 80, externallyVerified: false, rewardAuthorized: false });
  });
  it.each(["pending", "intro_made", "interview", "offer", "withdrawn"])("does not reinterpret %s as an approved acceptance", status => {
    expect(assessReferralAction(context, { ...row(), status }).state).toBe("unavailable");
  });
  it.each([
    { referrerUserId: 3 }, { companyDomain: "foreign.org" },
    { acceptedEvent: null }, { access: { active: false, revoked: false } },
    { access: { active: true, revoked: true } },
    { acceptedEvent: { ...row().acceptedEvent, actorUserId: 3 } },
    { acceptedEvent: { ...row().acceptedEvent, createdAt: "2026-10-23T12:00:00.000Z" } },
    { acceptedEvent: { ...row().acceptedEvent, resultingStatus: "intro_made" } },
    { verified: true }, { resumeUrl: "https://example.org/private.pdf" },
    { companyDomain: "example.org?secret=1" },
  ])("fails closed on foreign, fake, stale or unrecognized evidence %j", patch => {
    expect(assessReferralAction(context, { ...row(), ...patch }).state).toBe("unavailable");
  });
  it("does not grant anything after 24 hours", () => {
    const result = assessReferralAction({ ...context, now: "2026-10-26T14:00:00.000Z" }, row());
    expect(result.rewardAuthorized).toBe(false);
    expect(result.externallyVerified).toBe(false);
  });
  it("fails closed on malformed/read-failure inputs without echoing them", () => {
    expect(assessReferralAction(context, null)).toEqual({ state: "unavailable", externallyVerified: false, rewardAuthorized: false });
    expect(assessReferralAction({ ...context, actorUserId: 0 }, row()).state).toBe("unavailable");
  });
  it("creates only an allowlisted brief, omitting note by default", () => {
    expect(buildReferralBrief(context, row(), consent())).toEqual({ requestId: 12,
      companyDomain: "example.org", roleTitle: "Engineer" });
  });
  it("includes the note only with exact explicit consent", () => {
    expect(buildReferralBrief(context, row(), { ...consent(), note: true })?.note).toBe("My confirmed note");
  });
  it.each([{ requestId: 13 }, { seekerUserId: 3 }, { recipientUserId: 3 },
    { version: 2 }, { brief: false }, { resume: true }])("refuses invalid scoped consent %j", patch => {
    expect(buildReferralBrief(context, row(), { ...consent(), ...patch })).toBeNull();
  });
  it("never builds a brief from revoked, unaccepted or foreign records", () => {
    expect(buildReferralBrief(context, { ...row(), acceptedEvent: null }, consent())).toBeNull();
    expect(buildReferralBrief({ ...context, actorUserId: 9 }, row(), consent())).toBeNull();
    expect(buildReferralBrief(context, { ...row(), access: { active: true, revoked: true } }, consent())).toBeNull();
  });
  it("returns independent projections on replay without mutating evidence", () => {
    const input = row(); const snapshot = JSON.stringify(input);
    const a = buildReferralBrief(context, input, consent());
    const b = buildReferralBrief(context, input, consent());
    expect(a).toEqual(b); expect(a).not.toBe(b);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});


describe("VRA adversarial provenance and privacy", () => {
  it("rejects an acceptance event borrowed from a different ask", () => {
    expect(assessReferralAction(context, { ...row(), acceptedEvent: {
      ...row().acceptedEvent, requestId: 99 } }).state).toBe("unavailable");
  });
  it("rejects same-company insiders who are not the authorized recipient", () => {
    expect(buildReferralBrief({ ...context, actorUserId: 3 }, row(), consent())).toBeNull();
  });
  it("never serializes synthetic personal fields absent explicit note consent", () => {
    const brief = buildReferralBrief(context, { ...row(), note: "Synthetic Person fixture@example.invalid SYNTHETIC-CONTACT" }, consent());
    expect(JSON.stringify(brief)).not.toMatch(/Synthetic Person|fixture@|SYNTHETIC-CONTACT/);
  });
  it.each(["candidateName", "email", "profile", "attachments", "proofToken"])("refuses unrecognized personal field %s instead of projecting it", key => {
    expect(buildReferralBrief(context, { ...row(), [key]: "private" }, consent())).toBeNull();
  });
  it.each(["2026-10-23T11:59:59.999Z", "2026-10-23T12:00:00.000Z", "2026-10-23T12:00:00.001Z"])("does not invent verification or rewards across the 24h boundary %s", now => {
    const a = assessReferralAction({ ...context, now }, row());
    expect(a).toEqual(assessReferralAction({ ...context, now }, row()));
    expect(a.externallyVerified).toBe(false); expect(a.rewardAuthorized).toBe(false);
  });
  it("rejects user proof instead of treating it as verified evidence", () => {
    expect(assessReferralAction(context, { ...row(), proof: { verified: true } }).state).toBe("unavailable");
  });
});
