// SQL contract for the DM referrer gate's drizzle store (D-012 item 3). The
// gate tests in dmReferrerGate.test.ts run on an in-memory store; this file
// pins the real queries (built with drizzle.mock(), no database) so a swapped
// column, a wrong status list or a dropped filter cannot pass unnoticed.
import { drizzle } from "drizzle-orm/mysql2";
import { describe, expect, it } from "vitest";
import { postApprovalReferralStatuses } from "../shared/referral";
import { dmGateQueries } from "./dmReferrerGate";

const ACCEPTED = ["approved", "referred", "intro_made", "interview", "offer"];
const queries = () => dmGateQueries(drizzle.mock());

describe("DM referrer gate SQL (drizzle store contract)", () => {
  it("reads each side's own users rows by id, then sibling rows by canonical person", () => {
    expect(queries().usersByIds([11, 44]).toSQL()).toEqual({ sql: "select `id`, `canonicalPersonId` from `users` where `users`.`id` in (?, ?)", params: [11, 44] });
    expect(queries().usersByPersons([1, 2]).toSQL()).toEqual({ sql: "select `id`, `canonicalPersonId` from `users` where `users`.`canonicalPersonId` in (?, ?)", params: [1, 2] });
  });

  it("counts only profiles with a verified work email as referrers", () => {
    expect(queries().verifiedProfiles([11, 22]).toSQL()).toEqual({ sql: "select `userId`, `workEmailVerifiedAt` from `profiles` where (`profiles`.`userId` in (?, ?) and `profiles`.`workEmailVerifiedAt` is not null)", params: [11, 22] });
  });

  it("reads post-approval requests linking the two people in either direction", () => {
    const built = queries().acceptedRequestsBetween([11, 44], [22]).toSQL();
    expect(built.sql).toBe("select `id`, `jobSeekerId`, `referrerId`, `status` from `referralRequests` where (`referralRequests`.`status` in (?, ?, ?, ?, ?, ?) and ((`referralRequests`.`jobSeekerId` in (?, ?) and `referralRequests`.`referrerId` in (?)) or (`referralRequests`.`jobSeekerId` in (?) and `referralRequests`.`referrerId` in (?, ?))))");
    // a = [11, 44], b = [22]: (jobSeekerId IN a AND referrerId IN b) OR (jobSeekerId IN b AND referrerId IN a).
    expect(built.params).toEqual([...postApprovalReferralStatuses, 11, 44, 22, 22, 11, 44]);
    expect(postApprovalReferralStatuses).toEqual([...ACCEPTED, "closed"]);
  });

  it("reads transition events of closed requests that entered or left an accepted status", () => {
    expect(queries().acceptanceEvents([7, 9]).toSQL()).toEqual({
      sql: "select `referralRequestId`, `fromStatus`, `resultingStatus` from `referralTransitionEvents` where (`referralTransitionEvents`.`referralRequestId` in (?, ?) and (`referralTransitionEvents`.`resultingStatus` in (?, ?, ?, ?, ?) or `referralTransitionEvents`.`fromStatus` in (?, ?, ?, ?, ?)))",
      params: [7, 9, ...ACCEPTED, ...ACCEPTED],
    });
  });
});
