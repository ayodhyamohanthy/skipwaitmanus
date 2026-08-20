import { describe, expect, it } from "vitest";
import { companyCoverageStatus } from "./db";

describe("company coverage cold-start rules", () => {
  it("keeps no-coverage requests identifiable for administrator follow-up", () => {
    expect(companyCoverageStatus(0)).toBe("waiting_for_company_coverage");
  });

  it("identifies covered requests for verified employee delivery", () => {
    expect(companyCoverageStatus(1)).toBe("covered");
    expect(companyCoverageStatus(4)).toBe("covered");
  });
});
