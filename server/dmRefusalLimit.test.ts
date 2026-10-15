// SQL contract for the refused-send counter (server/dmRefusalLimit.ts), built
// with drizzle.mock() so no database is needed.
import { drizzle } from "drizzle-orm/mysql2";
import { describe, expect, it } from "vitest";
import { DM_REFUSAL_LIMIT_PER_HOUR, dmRefusalCountQuery, isDmRefusalLimited } from "./dmRefusalLimit";

describe("refused direct-message counter", () => {
  it("counts this sender's denied dm.sent rows from the last hour, on the database clock", () => {
    expect(dmRefusalCountQuery(drizzle.mock(), 11).toSQL()).toEqual({
      sql: "select count(*) from `operationalActivityLogs` where (`operationalActivityLogs`.`actorUserId` = ? and `operationalActivityLogs`.`action` = ? and `operationalActivityLogs`.`outcome` = ? and `operationalActivityLogs`.`createdAt` > (NOW() - INTERVAL 1 HOUR))",
      params: [11, "dm.sent", "denied"],
    });
  });

  it("limits from the tenth refusal in the window", () => {
    expect(DM_REFUSAL_LIMIT_PER_HOUR).toBe(10);
    expect(isDmRefusalLimited(9)).toBe(false);
    expect(isDmRefusalLimited(10)).toBe(true);
  });
});
