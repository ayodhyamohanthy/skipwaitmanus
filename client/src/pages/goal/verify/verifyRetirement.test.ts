import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../Verify.tsx", import.meta.url), "utf8");

describe("verification retirement (D-048-K-verify)", () => {
  it("renders the released goal verification page without a design switch", () => {
    expect(source).toContain("<GoalVerify");
    expect(source).not.toMatch(/goalSurfaceOn|VerifyLayout|VerifyProgress|VerifiedPanel|components\/kit/);
  });
});
