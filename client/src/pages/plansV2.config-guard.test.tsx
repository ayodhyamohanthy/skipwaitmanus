// @vitest-environment jsdom
// The numbers on the plans page come from shared/planFamily.ts. Card copy is
// hand-written text, so this pins each number in it to the config value; a
// config change that is not mirrored in the copy fails here.
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FREE_REFERRALS_PER_MONTH, includedReferralList } from "@shared/planFamily";
import PlansV2 from "./PlansV2";

afterEach(cleanup);

describe("PlansV2 numbers follow the config", () => {
  it("included referral counts match the config for every band and level", () => {
    render(<PlansV2 book="INR" />);
    for (const planId of ["early_to_mid", "mid_to_senior", "senior_to_executive"] as const) {
      for (const item of includedReferralList(planId)) {
        const cell = screen.getByTestId(`included-${planId}-${item.level}`);
        expect(cell.textContent).toBe(`${item.count} / month`);
      }
    }
  });

  it("the free allowance line uses the config count", () => {
    render(<PlansV2 book="INR" />);
    expect(document.body.textContent).toContain(`${FREE_REFERRALS_PER_MONTH} free referrals every month`);
  });

  it("the page source has no price literal: fees and top-ups come from the config", () => {
    const src = readFileSync("client/src/pages/PlansV2.tsx", "utf8").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/[₹$]\s?\d/);
    expect(src).not.toMatch(/\b(229|899|1299|449|1799|2599|22900|89900|129900|4900|19900|39900|79900)\b/);
  });
});
