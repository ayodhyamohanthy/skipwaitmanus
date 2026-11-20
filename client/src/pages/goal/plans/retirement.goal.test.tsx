import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const entry = readFileSync(new URL("../../Billing.tsx", import.meta.url), "utf8");

describe("released plans retirement (D-048-K-plans)", () => {
  it("renders the released goal billing page without an old/new design switch", () => {
    expect(entry).not.toMatch(/goalSurfaceOn|@\/lib\/goalSurfaces|components\/kit/);
    expect(entry).toContain('export { default } from "./goal/plans/GoalBilling";');
  });
});