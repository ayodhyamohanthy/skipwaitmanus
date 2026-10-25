// @vitest-environment jsdom
// PlansV2 render for the FROZEN banded model (owner freeze Oct 25 2026,
// phonemsg-01M5SNVZEY1P8K169J48T2HGTJ). Number-to-config pins live in
// plansV2.config-guard.test.tsx; this file pins the page structure and the
// read-only checkout state.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BAND_LEVELS, LEVEL_DISPLAY_NAME, PLAN_FAMILY } from "@shared/planFamily";
import PlansV2 from "./PlansV2";

afterEach(cleanup);

describe("PlansV2 frozen banded render", () => {
  it("opens with 'Choose your referrers.' and renders one card per frozen band", () => {
    render(<PlansV2 book="INR" />);
    expect(screen.getByRole("heading", { level: 1, name: "Choose your referrers." })).toBeTruthy();
    for (const plan of PLAN_FAMILY) {
      expect(screen.getByRole("region", { name: plan.label })).toBeTruthy();
    }
  });

  it("names the band's referrer levels on every card", () => {
    render(<PlansV2 book="INR" />);
    for (const plan of PLAN_FAMILY) {
      const row = screen.getByTestId(`band-${plan.id}`);
      for (const level of BAND_LEVELS[plan.id]) {
        expect(row.textContent).toContain(LEVEL_DISPLAY_NAME[level]);
      }
    }
  });

  it("renders the extra-referrals table with one price cell per level", () => {
    render(<PlansV2 book="INR" />);
    for (const level of ["early", "mid", "senior", "executive"] as const) {
      expect(screen.getByTestId(`topup-${level}`).textContent).toMatch(/^₹/);
    }
  });

  it("USD book renders dollar prices", () => {
    render(<PlansV2 book="USD" />);
    for (const level of ["early", "mid", "senior", "executive"] as const) {
      expect(screen.getByTestId(`topup-${level}`).textContent).toMatch(/^\$/);
    }
  });

  it("shows the founding-member terms (caps counted as issued, lock while active, lapse ends lock)", () => {
    render(<PlansV2 book="INR" />);
    const terms = screen.getByRole("region", { name: "Founding-member terms" });
    expect(terms.textContent).toContain("does not reopen its spot");
    expect(terms.textContent).toContain("continuously active");
    expect(terms.textContent).toContain("the lock ends");
  });

  it("read-only: a plan button never opens checkout, it explains billing is not switched on", () => {
    render(<PlansV2 book="INR" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(PLAN_FAMILY.length);
    fireEvent.click(buttons[0]);
    expect(screen.getByRole("status").textContent).toContain("Checkout is not switched on yet");
    expect(document.body.textContent).not.toContain("checkoutUrl");
  });
});
