import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openAskSlots } from "@shared/openAskSlots";
import { planEntitlementsFor } from "@shared/planEntitlements";
import { parseSummary } from "./billingApi";

// The /plans and /billing edge contract for GET /api/credits/summary. The ledger
// block (shared/creditLedger.ts) and the open-ask slots (shared/openAskSlots.ts)
// are the server's; the harness fixtures carry the same shapes, so a drift fails
// here before it reaches a screen.
const fixture = (stem: string) => {
  const body = JSON.parse(readFileSync(new URL(`../../../../scripts/kit-screens/fixtures/${stem}.json`, import.meta.url), "utf8")) as { routes: Array<{ path: string; body: unknown }> };
  const route = body.routes.find(candidate => candidate.path.includes("/api/credits/summary"));
  if (!route) throw new Error(`${stem} has no credits summary`);
  return route.body as { summary: Record<string, unknown> };
};

describe("credit summary contract", () => {
  it("parses the ledger block the server sends", () => {
    const summary = parseSummary(fixture("20_billing__default"));
    expect(summary?.ledger).toMatchObject({ balance: 9, buckets: { cycle: 7, purchased: 2 }, creditsPerMonth: 10, carryover: 1, cycle: { granted: 10, used: 3 } });
    expect(summary?.totalAvailable).toBe(summary?.ledger?.balance);
  });

  it("parses the caller's open-ask slots exactly as the server builds them", () => {
    expect(parseSummary(fixture("20_billing__default"))?.slots).toEqual(openAskSlots(planEntitlementsFor("pro"), 4));
    expect(parseSummary(fixture("19_plans__default"))?.slots).toMatchObject({ open: 3, cap: 3, full: true });
  });

  it("reads a missing or malformed ledger as not loaded, never as numbers, and keeps the rest", () => {
    const { summary } = fixture("20_billing__free");
    const { ledger: _omitted, ...withoutLedger } = summary;
    expect(parseSummary({ summary: withoutLedger })?.ledger).toBeNull();
    const garbled = parseSummary({ summary: { ...summary, ledger: { balance: -1 }, slots: { open: -2 } } });
    expect(garbled?.ledger).toBeNull();
    expect(garbled?.slots).toBeNull();
    expect(garbled?.totalAvailable).toBe(2);
  });

  it("every plans and billing fixture carries a ledger that matches its balance", () => {
    for (const stem of ["19_plans__default", "19_plans__step2-upgrade-to-momentum", "20_billing__default", "20_billing__free", "20_billing__cancelling", "20_billing__payment-issue"]) {
      const summary = parseSummary(fixture(stem));
      expect(summary?.ledger?.balance, stem).toBe(summary?.totalAvailable);
      expect(summary?.slots, stem).not.toBeNull();
    }
  });
});
