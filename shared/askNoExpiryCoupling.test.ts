import { describe, expect, it } from "vitest";
import { ASK_NO_EXPIRY_ENABLED, askNoExpiryCouplingError } from "./askNoExpiry";
import { ASK_RECONFIRM_ENABLED } from "./askReconfirm";

// D-193 (5): the clocks may never come off before reconfirm-before-spend is on, or the hourly
// delivery sweep could charge a months-old held request on its first visibility.
describe("D-193 (5): no-expiry is coupled to reconfirm-before-spend", () => {
  it("the shipped pair is allowed", () => {
    expect(askNoExpiryCouplingError(ASK_NO_EXPIRY_ENABLED, ASK_RECONFIRM_ENABLED)).toBeNull();
  });

  it("fails when no-expiry is on and reconfirm is off", () => {
    expect(askNoExpiryCouplingError(true, false)).toMatch(/ASK_RECONFIRM_ENABLED/);
  });

  it("allows reconfirm alone and both together", () => {
    expect(askNoExpiryCouplingError(false, true)).toBeNull();
    expect(askNoExpiryCouplingError(true, true)).toBeNull();
  });
});
