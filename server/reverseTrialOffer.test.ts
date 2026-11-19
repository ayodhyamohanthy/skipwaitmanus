import { describe, expect, it, vi } from "vitest";
import { planCatalogResponse } from "../shared/billingCatalog";
import { REVERSE_TRIAL } from "../shared/planCatalog";

// D-051 with D-042: the reverse trial is switched off, not removed. This file turns the
// switch on to prove the offer comes back from the same REVERSE_TRIAL numbers, while the
// shipped value stays off (the off payload is pinned in subscriptionManagementContract.test.ts).
vi.mock("../shared/planCatalog", async importOriginal => ({ ...(await importOriginal<typeof import("../shared/planCatalog")>()), REVERSE_TRIAL_ON_OFFER: true }));

const input = { region: "INTL" as const, available: () => false, usdRecurringConfirmed: false, sessionsStaffed: false, indiaGstRegistered: false };

describe("reverse trial switch (D-051)", () => {
  it("ships switched off", async () => {
    const shipped = await vi.importActual<typeof import("../shared/planCatalog")>("../shared/planCatalog");
    expect(shipped.REVERSE_TRIAL_ON_OFFER).toBe(false);
  });

  it("switched on, the public catalog offers it again from the same numbers", () => {
    expect(planCatalogResponse(input).free).toEqual({
      openRequests: 3,
      creditsPerMonth: 3,
      trial: { plan: REVERSE_TRIAL.plan, planLabel: "Momentum", days: REVERSE_TRIAL.days, openRequests: 15, credits: REVERSE_TRIAL.credits },
    });
  });
});
