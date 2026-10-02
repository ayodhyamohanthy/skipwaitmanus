import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EMPTY_REFERRAL_FAN_OUT, parseReferralCreationNotice, summarizeReferralFanOut } from "./referralFanOut";

const empty = { grantsPerRequest: [], grantsPerEmployee: [], requestsPerRoleLink: [], creations: [] };

describe("summarizeReferralFanOut", () => {
  it("reports zero for every field when nothing has been sent", () => {
    expect(summarizeReferralFanOut(empty)).toEqual({
      requests: 0, creationsScanned: 0, employeeNotifications: 0, largestRequestFanOut: 0, fastTrackRequests: 0,
      reviewGrants: 0, requestsWithGrants: 0, grantsPerRequest: 0, mostEmailedEmployee: 0,
      repeatedRoleLinks: 0, requestsOnRepeatedRoleLinks: 0,
    });
  });

  it("measures reach in notifications, not in review links", () => {
    // Every eligible employee gets an in-app notice; only employees whose verified
    // address is at that exact domain get a single-use link. Links alone understate reach.
    const summary = summarizeReferralFanOut({
      grantsPerRequest: [{ requestId: 1, grants: 2 }],
      grantsPerEmployee: [{ referrerId: 10, grants: 1 }, { referrerId: 11, grants: 1 }],
      requestsPerRoleLink: [{ targetRoleUrl: "https://acme.com/jobs/1", requests: 1 }],
      creations: [{ notifiedEmployees: 2, fastTrack: false }],
    });
    expect(summary.employeeNotifications).toBe(2);
    expect(summary.largestRequestFanOut).toBe(2);
    expect(summary.reviewGrants).toBe(2);
  });

  it("keeps the notification ceiling separate from the email ceiling", () => {
    const summary = summarizeReferralFanOut({
      grantsPerRequest: [{ requestId: 1, grants: 40 }, { requestId: 2, grants: 1 }],
      grantsPerEmployee: [{ referrerId: 10, grants: 9 }, { referrerId: 11, grants: 2 }],
      requestsPerRoleLink: [{ targetRoleUrl: "https://a.com/1", requests: 1 }, { targetRoleUrl: "https://a.com/2", requests: 1 }],
      creations: [{ notifiedEmployees: 120, fastTrack: false }, { notifiedEmployees: 1, fastTrack: true }],
    });
    expect(summary.largestRequestFanOut).toBe(120);
    expect(summary.employeeNotifications).toBe(121);
    expect(summary.mostEmailedEmployee).toBe(9);
    expect(summary.reviewGrants).toBe(41);
    expect(summary.grantsPerRequest).toBe(20.5);
    expect(summary.fastTrackRequests).toBe(1);
    expect(summary.creationsScanned).toBe(2);
  });

  it("counts a role link reused by several requests without double-counting requests", () => {
    const summary = summarizeReferralFanOut({
      ...empty,
      requestsPerRoleLink: [
        { targetRoleUrl: "https://acme.com/jobs/designer", requests: 3 },
        { targetRoleUrl: "https://acme.com/jobs/engineer", requests: 1 },
        { targetRoleUrl: null, requests: 2 },
      ],
    });
    expect(summary.requests).toBe(6);
    expect(summary.repeatedRoleLinks).toBe(1);
    expect(summary.requestsOnRepeatedRoleLinks).toBe(3);
  });

  it("never treats a request with no role link as a reused link", () => {
    // Grouping on a nullable column makes NULL look like a cluster; reporting it as one
    // would invent fan-out that no referrer ever received.
    const summary = summarizeReferralFanOut({ ...empty, requestsPerRoleLink: [{ targetRoleUrl: null, requests: 9 }] });
    expect(summary.requests).toBe(9);
    expect(summary.repeatedRoleLinks).toBe(0);
    expect(summary.requestsOnRepeatedRoleLinks).toBe(0);
  });

  it("keeps link variants the database grouped apart, so fragmentation stays visible", () => {
    // Normalization belongs upstream at the identity boundary. Folding here would hide
    // exactly the split a per-role cap has to fix.
    const summary = summarizeReferralFanOut({
      ...empty,
      requestsPerRoleLink: [{ targetRoleUrl: "https://acme.com/jobs/1", requests: 1 }, { targetRoleUrl: "https://acme.com/jobs/1?utm_source=referral", requests: 1 }],
    });
    expect(summary.repeatedRoleLinks).toBe(0);
    expect(summary.requests).toBe(2);
  });

  it("shares one zero shape between the responses produced without a database", () => {
    // /api/admin/flow-health has two database-free paths. If either hand-writes its own
    // zeros, adding a field here silently changes what an admin sees depending on wiring.
    for (const file of ["./db.ts", "./privateReferralRoutes.ts"]) {
      expect(readFileSync(new URL(file, import.meta.url), "utf8"), file).toContain("fanOut: EMPTY_REFERRAL_FAN_OUT");
    }
    expect(Object.values(EMPTY_REFERRAL_FAN_OUT).every(value => value === 0)).toBe(true);
  });
});

describe("parseReferralCreationNotice", () => {
  it("reads the recorded fan-out and dispatch mode", () => {
    expect(parseReferralCreationNotice('{"attachmentCount":1,"notifiedEmployees":37,"creditReserved":true,"coverageStatus":"covered","fastTrack":false}'))
      .toEqual({ notifiedEmployees: 37, fastTrack: false });
    expect(parseReferralCreationNotice('{"notifiedEmployees":1,"fastTrack":true}')).toEqual({ notifiedEmployees: 1, fastTrack: true });
  });

  it("drops rows that cannot state a whole non-negative employee count", () => {
    // A row the writer no longer produces must shrink the scanned window, not fabricate
    // a reach number, so an admin never decides on a count the log did not record.
    for (const metadata of [null, "", "not json", "[]", '"12"', "42", "{}", '{"notifiedEmployees":"12"}', '{"notifiedEmployees":12.5}', '{"notifiedEmployees":-3}', '{"notifiedEmployees":null}']) {
      expect(parseReferralCreationNotice(metadata as string | null), JSON.stringify(metadata)).toBeUndefined();
    }
  });

  it("treats a missing or non-boolean fastTrack flag as broadcast", () => {
    expect(parseReferralCreationNotice('{"notifiedEmployees":4}')).toEqual({ notifiedEmployees: 4, fastTrack: false });
    expect(parseReferralCreationNotice('{"notifiedEmployees":4,"fastTrack":"true"}')).toEqual({ notifiedEmployees: 4, fastTrack: false });
    expect(parseReferralCreationNotice('{"notifiedEmployees":0}')).toEqual({ notifiedEmployees: 0, fastTrack: false });
  });
});
