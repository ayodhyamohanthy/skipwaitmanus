import { describe, expect, it } from "vitest";
import { companyCoverageStatus } from "./db";

describe("company coverage cold-start rules", () => {
  it("preserves the Job Seeker’s credit when no verified employee can receive the request", () => {
    expect(companyCoverageStatus(0)).toBe("waiting_for_company_coverage");
  });

  it("uses the normal credit-backed referral route only when verified employee coverage exists", () => {
    expect(companyCoverageStatus(1)).toBe("covered");
    expect(companyCoverageStatus(4)).toBe("covered");
  });
});
