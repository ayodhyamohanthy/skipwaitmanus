import { drizzle } from "drizzle-orm/mysql2";
import { describe, expect, it } from "vitest";
import { oldestStaleAsks } from "./askExpirySweep";
import { isAwaitingLinkReferrer, referrerLinkAssignEvent, REFERRER_LINK_ASSIGN_ACTION, staleLinkAsksQuery } from "./referrerLinkAsk";

describe("personal-link ask marker (D-017)", () => {
  it("waits for the link owner only while assigned through a link and not yet claimed", () => {
    expect(isAwaitingLinkReferrer([REFERRER_LINK_ASSIGN_ACTION])).toBe(true);
    expect(isAwaitingLinkReferrer([REFERRER_LINK_ASSIGN_ACTION, "claim"])).toBe(false);
    expect(isAwaitingLinkReferrer(["claim"])).toBe(false);
    expect(isAwaitingLinkReferrer([])).toBe(false);
    expect(isAwaitingLinkReferrer(["pass", "save"])).toBe(false);
  });

  it("records the ask as created (revision 0) by its seeker, once per ask", () => {
    expect(referrerLinkAssignEvent(501, 7)).toEqual({ referralRequestId: 501, operationKey: "link-assign", actorUserId: 7, action: "link_assign", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 0 });
  });

  it("sweeps only pending, assigned, never-claimed link asks past the cutoff, oldest first", () => {
    const query = staleLinkAsksQuery(drizzle.mock(), new Date("2026-10-08T12:00:00.000Z"), 200).toSQL();
    expect(query.sql).toMatch(/inner join `referralTransitionEvents` `linkAssign` on \(`linkAssign`\.`referralRequestId` = `referralRequests`\.`id` and `linkAssign`\.`action` = \?\)/);
    expect(query.sql).toMatch(/left join `referralTransitionEvents` `linkClaim` on \(`linkClaim`\.`referralRequestId` = `referralRequests`\.`id` and `linkClaim`\.`action` = \?\)/);
    expect(query.sql).toMatch(/`referralRequests`\.`status` = \? and `referralRequests`\.`referrerId` is not null and `referralRequests`\.`createdAt` < \? and `linkClaim`\.`id` is null/);
    expect(query.sql).toMatch(/order by `referralRequests`\.`createdAt` asc, `referralRequests`\.`id` asc limit \?$/);
    expect(query.params).toEqual(["link_assign", "claim", "pending", "2026-10-08 12:00:00.000", 200]);
  });
});

describe("expiry sweep batch", () => {
  const at = (iso: string) => new Date(iso);
  it("merges unclaimed and link asks oldest first, each once, within the batch size", () => {
    const unclaimed = [{ id: 3, jobSeekerId: 7, createdAt: at("2026-10-01T00:00:00Z") }, { id: 5, jobSeekerId: 8, createdAt: at("2026-10-03T00:00:00Z") }];
    const linkAsks = [{ id: 4, jobSeekerId: 9, createdAt: at("2026-10-02T00:00:00Z") }, { id: 3, jobSeekerId: 7, createdAt: at("2026-10-01T00:00:00Z") }];
    expect(oldestStaleAsks([unclaimed, linkAsks], 200)).toEqual([{ id: 3, jobSeekerId: 7 }, { id: 4, jobSeekerId: 9 }, { id: 5, jobSeekerId: 8 }]);
    expect(oldestStaleAsks([unclaimed, linkAsks], 2)).toEqual([{ id: 3, jobSeekerId: 7 }, { id: 4, jobSeekerId: 9 }]);
    expect(oldestStaleAsks([[], []], 200)).toEqual([]);
  });
});
