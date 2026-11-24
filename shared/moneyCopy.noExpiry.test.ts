import { describe, expect, it, vi } from "vitest";

// D-174/D-385: force the switch on before shared/moneyCopy.ts is imported, so the module-level
// copy picks the no-expiry variant. The switch-off lines stay pinned in shared/moneyCopy.test.ts.
vi.mock("./askNoExpiry", async importOriginal => ({
  ...await importOriginal<typeof import("./askNoExpiry")>(),
  ASK_NO_EXPIRY_ENABLED: true,
}));

import { askCostLine, COVERAGE_WAIT_REASON, COVERAGE_WAIT_REASON_NO_EXPIRY } from "./moneyCopy";

// The ask-expiry promise uses "expires"/"expire unclaimed"; CREDIT_ENDED_CAVEAT's "expired" is about
// the credit bucket, which is still true and must stay.
const banned = (text: string) => {
  expect(text).not.toContain("7 days");
  expect(text).not.toContain("90 days");
  expect(text).not.toContain("expires");
  expect(text).not.toContain("expire unclaimed");
};

describe("D-174: money copy with the ask clocks off", () => {
  it("the waiting reason promises no wait cap", () => {
    expect(COVERAGE_WAIT_REASON).toBe(COVERAGE_WAIT_REASON_NO_EXPIRY);
    banned(COVERAGE_WAIT_REASON);
  });

  it("the uncovered-ask detail says it stays open instead of naming a 90-day cap", () => {
    const line = askCostLine({ open: false, balance: 2, cost: 1 });
    banned(line.detail);
    expect(line.detail).toContain("It stays open until someone answers it or you withdraw it.");
  });

  it("the refund detail names only the withdrawal, not a 7-day close", () => {
    const line = askCostLine({ open: true, balance: 2, cost: 1 });
    banned(line.detail);
    expect(line.detail).toContain("withdraw before anyone picks it up");
  });
});
