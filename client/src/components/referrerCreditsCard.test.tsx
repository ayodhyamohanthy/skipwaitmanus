// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReferrerCreditsCard } from "./ReferrerCreditsCard";

/*
 * D-055: referrers never pay. The /queue credits card is context only: it never
 * offers a purchase or an "allowance" upgrade, whatever the balance says.
 */

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn().mockResolvedValue("test-token") }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, getToken }) }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const summary = (overrides: { totalAvailable: number; monthlyCreditsRemaining: number; purchasedCreditsRemaining?: number }) => ({
  plan: "free", monthlyAllowance: 3, purchasedCreditsRemaining: 0, cycleKey: "2026-10", subscriptionStatus: null, subscriptionCurrentTermEnd: null, ...overrides,
});

describe("Referrer credits card (D-055: no purchase)", () => {
  it.each([
    ["has nothing left", { totalAvailable: 0, monthlyCreditsRemaining: 0 }],
    ["has credits left", { totalAvailable: 2, monthlyCreditsRemaining: 2 }],
    ["holds credits bought before the switch-off", { totalAvailable: 4, monthlyCreditsRemaining: 0, purchasedCreditsRemaining: 4 }],
  ])("never offers a purchase when the referrer %s", async (_label, balance) => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ summary: summary(balance) }) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReferrerCreditsCard />);
    expect(await screen.findByRole("region", { name: "Referral credits" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/credits/summary?role=referrer", expect.anything());
    expect(document.querySelector("a[href^='/plans'], a[href^='/premium']")).toBeNull();
    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(document.body.textContent).not.toMatch(/increase your referral allowance|upgrade|buy|purchase more/i);
  });
});
