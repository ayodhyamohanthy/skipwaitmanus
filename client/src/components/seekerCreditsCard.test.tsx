// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SeekerCreditsCard, type SeekerCredits } from "./SeekerCreditsCard";

/*
 * D-067: the monthly Pro/Max plans are removed completely and /plans sells no
 * plan until the D-046 passes go on sale, so the seeker credits card never
 * promises an upgrade, names a plan by its storage id, or names a retired plan.
 * A retired pro/max wallet reads as Free, as it does on the server.
 */

afterEach(cleanup);

const credits = (overrides: Partial<SeekerCredits>): SeekerCredits => ({
  plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 3, purchasedCreditsRemaining: 0, totalAvailable: 3, cycleKey: "2026-10", subscriptionStatus: null, subscriptionCurrentTermEnd: null, ...overrides,
});

describe("Seeker credits card: card validation (D-079)", () => {
  it("D-127: a locked payload renders the ordinary card - card validation moved to first purchase, never sign-up", () => {
    render(<SeekerCreditsCard credits={credits({ monthlyAllowance: 0, monthlyCreditsRemaining: 0, totalAvailable: 0, freeCreditsLocked: true, cardValidated: false })} />);
    expect(screen.queryByText(/Validate your card/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Validate your card/ })).toBeNull();
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("a validated wallet renders the ordinary card (no locked line, no validate CTA)", () => {
    render(<SeekerCreditsCard credits={credits({ cardValidated: true, freeCreditsLocked: false })} />);
    expect(screen.queryByText(/Validate your card/)).toBeNull();
    expect(screen.getByRole("link", { name: /Ask another referral/ })).toBeTruthy();
  });

  it("a payload without the new fields reads as unlocked (older servers)", () => {
    render(<SeekerCreditsCard credits={credits({})} />);
    expect(screen.queryByRole("button", { name: /Validate your card/ })).toBeNull();
  });
});

describe("Seeker credits card after D-067", () => {
  it("offers only the credit it can sell when Free runs out: no upgrade, no /plans link", () => {
    render(<SeekerCreditsCard credits={credits({ monthlyCreditsRemaining: 0, totalAvailable: 0 })} />);
    expect(screen.getByRole("link", { name: /Add a credit for \$1/ }).getAttribute("href")).toBe("/premium?role=job_seeker");
    expect(document.querySelector("a[href^='/plans']")).toBeNull();
    expect(document.body.textContent).not.toMatch(/upgrade|more monthly referrals/i);
    expect(screen.getByText(/3 of 3 free credits used this month/)).toBeTruthy();
  });

  it("names a catalog pass by its catalog label and never calls its credits free", () => {
    render(<SeekerCreditsCard credits={credits({ plan: "land_focus", monthlyAllowance: 120, monthlyCreditsRemaining: 105, totalAvailable: 105, subscriptionStatus: "active", subscriptionCurrentTermEnd: "2026-11-06T00:00:00.000Z" })} />);
    expect(screen.getByText("Land Focus plan")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/land_focus/);
    expect(screen.getByText(/15 of 120 plan credits used this month/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/free credits/i);
    expect(screen.getByText(/Plan renews/)).toBeTruthy();
  });

  it.each(["pro", "max"])("reads a stale %s summary as Free and never names the retired plan", plan => {
    render(<SeekerCreditsCard credits={credits({ plan, monthlyAllowance: 3, monthlyCreditsRemaining: 1, totalAvailable: 1, subscriptionStatus: "active", subscriptionCurrentTermEnd: "2026-11-06T00:00:00.000Z" })} />);
    expect(screen.getByText("Free plan")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\bpro\b|\bmax\b/i);
    expect(screen.getByText(/2 of 3 free credits used this month/)).toBeTruthy();
    expect(screen.queryByText(/Plan renews/)).toBeNull();
  });
});
