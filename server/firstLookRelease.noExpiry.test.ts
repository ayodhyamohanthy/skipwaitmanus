import { MySqlDialect } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { firstLookShelfLifeCondition } from "./firstLookRelease";

// D-174: with the ask clocks off nothing owns an old ask, so its lapsed first look must still
// release to the rest of the company (D-220) instead of staying with a poster who never answered.
const NOW = new Date("2026-10-16T12:00:00.000Z");

describe("D-174: the first-look release shelf-life bound", () => {
  it("switch on: no bound, so an old ask still releases", () => {
    expect(firstLookShelfLifeCondition(NOW, true)).toEqual([]);
  });

  it("switch off: today's 7-day bound is unchanged", () => {
    const [condition] = firstLookShelfLifeCondition(NOW, false);
    expect(condition).toBeDefined();
    const query = new MySqlDialect().sqlToQuery(condition!);
    expect(query.sql).toContain("createdAt");
    expect(query.params).toEqual(["2026-10-09 12:00:00.000"]);
  });
});
