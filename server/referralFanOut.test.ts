import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EMPTY_REFERRAL_FAN_OUT, summarizeReferralFanOut } from "./referralFanOut";

const empty = { grantsPerRequest: [], grantsPerEmployee: [], requestsPerRoleLink: [] };

describe("summarizeReferralFanOut", () => {
  it("reports zero for every field when nothing has been sent", () => {
    expect(summarizeReferralFanOut(empty)).toEqual({
      requests: 0, reviewGrants: 0, requestsWithGrants: 0, grantsPerRequest: 0,
      largestRequestFanOut: 0, mostNotifiedEmployee: 0, repeatedRoleLinks: 0, requestsOnRepeatedRoleLinks: 0,
    });
  });

  it("counts the employees one request notified", () => {
    const summary = summarizeReferralFanOut({
      grantsPerRequest: [{ requestId: 1, grants: 3 }],
      grantsPerEmployee: [{ referrerId: 10, grants: 1 }, { referrerId: 11, grants: 1 }, { referrerId: 12, grants: 1 }],
      requestsPerRoleLink: [{ targetRoleUrl: "https://acme.com/jobs/1", requests: 1 }],
    });
    expect(summary.reviewGrants).toBe(3);
    expect(summary.requestsWithGrants).toBe(1);
    expect(summary.grantsPerRequest).toBe(3);
    expect(summary.largestRequestFanOut).toBe(3);
  });

  it("names the busiest employee instead of an average, because one flooded referrer is the failure mode", () => {
    const summary = summarizeReferralFanOut({
      grantsPerRequest: [{ requestId: 1, grants: 2 }, { requestId: 2, grants: 2 }, { requestId: 3, grants: 1 }],
      grantsPerEmployee: [{ referrerId: 10, grants: 3 }, { referrerId: 11, grants: 2 }],
      requestsPerRoleLink: [{ targetRoleUrl: "https://a.com/1", requests: 1 }, { targetRoleUrl: "https://a.com/2", requests: 1 }, { targetRoleUrl: "https://a.com/3", requests: 1 }],
    });
    expect(summary.mostNotifiedEmployee).toBe(3);
    expect(summary.largestRequestFanOut).toBe(2);
    expect(summary.grantsPerRequest).toBe(1.7);
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
