import { MySqlDialect } from "drizzle-orm/mysql-core";
import { describe, expect, it, vi } from "vitest";

// D-174/D-385 §3: with the clocks off an unclaimed visible ask keeps its open-request slot until it
// is claimed or withdrawn, so the slot predicate must drop its age windows. The switch-off SQL stays
// pinned byte-for-byte in openAskSlots.test.ts.
vi.mock("../shared/askNoExpiry", async importOriginal => ({
  ...await importOriginal<typeof import("../shared/askNoExpiry")>(),
  ASK_NO_EXPIRY_ENABLED: true,
}));

import { openAskCondition } from "./planGates";

const NOW = new Date("2026-10-14T12:00:00.000Z");

describe("D-174: the open-ask slot predicate with the clocks off", () => {
  it("counts a visible unclaimed ask at any age", () => {
    const query = new MySqlDialect().sqlToQuery(openAskCondition(7, NOW.getTime()));
    expect(query.sql).not.toContain("coverageVisibleAt");
    expect(query.params).toEqual([7, "pending", false, "2026-09-21 00:00:00.000", "claim"]);
  });
});
