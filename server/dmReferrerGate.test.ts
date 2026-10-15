import { describe, expect, it } from "vitest";
import { decideReferrerDmGate, hasAcceptedLink, resolveReferrerDmGate, type DmGateEventRow, type DmGateProfileRow, type DmGateRequestRow, type DmGateStore, type DmGateUserRow } from "./dmReferrerGate";
import { DM_REFERRER_ACCEPTANCE_ERROR, DM_REFERRER_ACCEPTANCE_SENDER_IS_REFERRER_ERROR, dmSendBlockFor, parseDmSendBlock } from "../shared/directMessages";

type Tables = { users: DmGateUserRow[]; profiles: DmGateProfileRow[]; requests: DmGateRequestRow[]; events: DmGateEventRow[] };

// In-memory tables read with the same plain predicates the drizzle store uses.
function memoryStore(tables: Tables): DmGateStore & { reads: string[] } {
  const reads: string[] = [];
  const post = new Set(["approved", "intro_made", "interview", "offer", "closed"]);
  const accepted = new Set(["approved", "intro_made", "interview", "offer"]);
  return {
    reads,
    usersByIds: async ids => { reads.push("users"); return tables.users.filter(row => ids.includes(row.id)); },
    usersByPersons: async personIds => { reads.push("persons"); return tables.users.filter(row => row.canonicalPersonId !== null && personIds.includes(row.canonicalPersonId)); },
    verifiedProfiles: async userIds => { reads.push("profiles"); return tables.profiles.filter(row => userIds.includes(row.userId) && row.workEmailVerifiedAt !== null); },
    acceptedRequestsBetween: async (a, b) => { reads.push("requests"); return tables.requests.filter(row => post.has(row.status) && row.referrerId !== null && ((a.includes(row.jobSeekerId) && b.includes(row.referrerId)) || (b.includes(row.jobSeekerId) && a.includes(row.referrerId)))); },
    acceptanceEvents: async ids => { reads.push("events"); return tables.events.filter(row => ids.includes(row.referralRequestId) && (accepted.has(row.resultingStatus) || accepted.has(row.fromStatus))); },
  };
}

const verifiedAt = new Date("2026-09-01T00:00:00Z");
const SEEKER = 11, REFERRER = 22, MEMBER = 33, SEEKER_ALIAS = 44, BOTH = 55;
const base = (): Tables => ({
  users: [{ id: SEEKER, canonicalPersonId: 1 }, { id: REFERRER, canonicalPersonId: 2 }, { id: MEMBER, canonicalPersonId: null }, { id: SEEKER_ALIAS, canonicalPersonId: 1 }, { id: BOTH, canonicalPersonId: 5 }],
  profiles: [{ userId: REFERRER, workEmailVerifiedAt: verifiedAt }, { userId: SEEKER, workEmailVerifiedAt: null }, { userId: BOTH, workEmailVerifiedAt: verifiedAt }],
  requests: [],
  events: [],
});

describe("referrer DM gate decision", () => {
  it("leaves two members who are not verified referrers to the member rules", () => {
    expect(decideReferrerDmGate({ senderIsReferrer: false, recipientIsReferrer: false, accepted: true })).toEqual({ kind: "not_referrer_pair" });
  });

  it("opens only on acceptance when either side is a verified referrer", () => {
    expect(decideReferrerDmGate({ senderIsReferrer: false, recipientIsReferrer: true, accepted: true })).toEqual({ kind: "accepted" });
    expect(decideReferrerDmGate({ senderIsReferrer: false, recipientIsReferrer: true, accepted: false })).toEqual({ kind: "acceptance_required", senderRole: "member" });
    expect(decideReferrerDmGate({ senderIsReferrer: true, recipientIsReferrer: false, accepted: false })).toEqual({ kind: "acceptance_required", senderRole: "referrer" });
    expect(decideReferrerDmGate({ senderIsReferrer: true, recipientIsReferrer: true, accepted: false })).toEqual({ kind: "acceptance_required", senderRole: "member" });
  });

  it("maps a blocked gate to the same body the 403 and the thread view carry", () => {
    expect(dmSendBlockFor({ kind: "acceptance_required", senderRole: "member" })).toEqual({ reason: "referrer_acceptance_required", error: DM_REFERRER_ACCEPTANCE_ERROR, senderRole: "member" });
    expect(dmSendBlockFor({ kind: "acceptance_required", senderRole: "referrer" })?.error).toBe(DM_REFERRER_ACCEPTANCE_SENDER_IS_REFERRER_ERROR);
    expect(dmSendBlockFor({ kind: "accepted" })).toBeNull();
    expect(dmSendBlockFor({ kind: "not_referrer_pair" })).toBeNull();
    expect(parseDmSendBlock({ reason: "referrer_acceptance_required", error: DM_REFERRER_ACCEPTANCE_ERROR, senderRole: "member" })).not.toBeNull();
    expect(parseDmSendBlock({ reason: "referrer_acceptance_required", error: DM_REFERRER_ACCEPTANCE_ERROR, senderRole: "admin" })).toBeNull();
    expect(parseDmSendBlock({ reason: "premium_required", error: "x" })).toBeNull();
    expect(parseDmSendBlock(null)).toBeNull();
  });

  it("counts closed only when the request was approved first", () => {
    const closed: DmGateRequestRow = { id: 7, jobSeekerId: SEEKER, referrerId: REFERRER, status: "closed" };
    expect(hasAcceptedLink([SEEKER], [REFERRER], [closed], [])).toBe(false);
    expect(hasAcceptedLink([SEEKER], [REFERRER], [closed], [{ referralRequestId: 7, fromStatus: "pending", resultingStatus: "approved" }])).toBe(true);
    expect(hasAcceptedLink([SEEKER], [REFERRER], [closed], [{ referralRequestId: 8, fromStatus: "pending", resultingStatus: "approved" }])).toBe(false);
  });

  it("accepts a closed request whose only recorded step left an accepted status (approved before events were kept)", () => {
    const closed: DmGateRequestRow = { id: 7, jobSeekerId: SEEKER, referrerId: REFERRER, status: "closed" };
    for (const fromStatus of ["approved", "intro_made", "interview", "offer"]) expect(hasAcceptedLink([SEEKER], [REFERRER], [closed], [{ referralRequestId: 7, fromStatus, resultingStatus: "closed" }])).toBe(true);
    // An unclaimed ask that expired closes straight from pending: no acceptance.
    expect(hasAcceptedLink([SEEKER], [REFERRER], [closed], [{ referralRequestId: 7, fromStatus: "pending", resultingStatus: "closed" }])).toBe(false);
    expect(hasAcceptedLink([SEEKER], [REFERRER], [closed], [{ referralRequestId: 7, fromStatus: "pending", resultingStatus: "declined" }])).toBe(false);
  });

  it("ignores accepted requests that link other people", () => {
    expect(hasAcceptedLink([SEEKER], [REFERRER], [{ id: 1, jobSeekerId: MEMBER, referrerId: REFERRER, status: "approved" }], [])).toBe(false);
    expect(hasAcceptedLink([SEEKER], [REFERRER], [{ id: 1, jobSeekerId: SEEKER, referrerId: null, status: "approved" }], [])).toBe(false);
  });
});

describe("referrer DM gate over stored rows", () => {
  it("blocks both directions before acceptance and opens both after", async () => {
    const tables = base();
    for (const status of ["pending", "declined", "withdrawn"] as const) {
      tables.requests = [{ id: 1, jobSeekerId: SEEKER, referrerId: REFERRER, status }];
      expect(await resolveReferrerDmGate(memoryStore(tables), SEEKER, REFERRER)).toEqual({ kind: "acceptance_required", senderRole: "member" });
      expect(await resolveReferrerDmGate(memoryStore(tables), REFERRER, SEEKER)).toEqual({ kind: "acceptance_required", senderRole: "referrer" });
    }
    for (const status of ["approved", "intro_made", "interview", "offer"] as const) {
      tables.requests = [{ id: 1, jobSeekerId: SEEKER, referrerId: REFERRER, status }];
      expect(await resolveReferrerDmGate(memoryStore(tables), SEEKER, REFERRER)).toEqual({ kind: "accepted" });
      expect(await resolveReferrerDmGate(memoryStore(tables), REFERRER, SEEKER)).toEqual({ kind: "accepted" });
    }
  });

  it("keeps a closed request open only after an approve transition (expired asks also close)", async () => {
    const tables = base();
    tables.requests = [{ id: 9, jobSeekerId: SEEKER, referrerId: REFERRER, status: "closed" }];
    expect((await resolveReferrerDmGate(memoryStore(tables), SEEKER, REFERRER)).kind).toBe("acceptance_required");
    tables.events = [{ referralRequestId: 9, fromStatus: "pending", resultingStatus: "closed" }];
    expect((await resolveReferrerDmGate(memoryStore(tables), SEEKER, REFERRER)).kind).toBe("acceptance_required");
    tables.events = [{ referralRequestId: 9, fromStatus: "pending", resultingStatus: "approved" }];
    expect((await resolveReferrerDmGate(memoryStore(tables), SEEKER, REFERRER)).kind).toBe("accepted");
    tables.events = [{ referralRequestId: 9, fromStatus: "offer", resultingStatus: "closed" }];
    expect((await resolveReferrerDmGate(memoryStore(tables), REFERRER, SEEKER)).kind).toBe("accepted");
  });

  it("treats every users row of a canonical person as that person", async () => {
    const tables = base();
    tables.requests = [{ id: 1, jobSeekerId: SEEKER_ALIAS, referrerId: REFERRER, status: "approved" }];
    expect(await resolveReferrerDmGate(memoryStore(tables), SEEKER, REFERRER)).toEqual({ kind: "accepted" });
    // A verified profile on another row of the same person still makes them a referrer.
    tables.profiles = [{ userId: SEEKER_ALIAS, workEmailVerifiedAt: verifiedAt }];
    tables.requests = [];
    expect(await resolveReferrerDmGate(memoryStore(tables), MEMBER, SEEKER)).toEqual({ kind: "acceptance_required", senderRole: "member" });
  });

  it("gates a verified referrer who also asks as a seeker, in either request direction", async () => {
    const tables = base();
    expect(await resolveReferrerDmGate(memoryStore(tables), MEMBER, BOTH)).toEqual({ kind: "acceptance_required", senderRole: "member" });
    expect(await resolveReferrerDmGate(memoryStore(tables), BOTH, MEMBER)).toEqual({ kind: "acceptance_required", senderRole: "referrer" });
    tables.requests = [{ id: 3, jobSeekerId: BOTH, referrerId: REFERRER, status: "approved" }];
    expect(await resolveReferrerDmGate(memoryStore(tables), REFERRER, BOTH)).toEqual({ kind: "accepted" });
  });

  it("does not read requests for two members who are not verified referrers", async () => {
    const store = memoryStore({ ...base(), users: [{ id: 70, canonicalPersonId: null }, { id: 71, canonicalPersonId: null }] });
    expect(await resolveReferrerDmGate(store, 70, 71)).toEqual({ kind: "not_referrer_pair" });
    expect(store.reads).toEqual(["users", "profiles"]);
  });
});
