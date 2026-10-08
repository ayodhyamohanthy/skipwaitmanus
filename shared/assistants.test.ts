import { describe, expect, it } from "vitest";
import { SUBSCRIPTION_PLANS } from "./subscriptionPlans";
import { ASSISTANT_GATE_CONFIRMED_MAX_USD_CENTS, ASSISTANT_PLANS, canUseAssistants, normalizeAssistantScopes } from "./assistants";

describe("assistant plan gate", () => {
  it("unlocks Max only; free and Pro stay locked", () => {
    expect(canUseAssistants("max")).toBe(true);
    expect(canUseAssistants("pro")).toBe(false);
    expect(canUseAssistants("free")).toBe(false);
    expect(canUseAssistants(undefined)).toBe(false);
    expect(canUseAssistants("Max ")).toBe(false);
  });

  it("only lists real paid plans", () => {
    for (const plan of ASSISTANT_PLANS) expect(Object.keys(SUBSCRIPTION_PLANS)).toContain(plan);
  });

  it("fails when the Max price changes, so the access rule is re-confirmed on purpose", () => {
    // The founder chose "Max only" while Max was $15/month (1,500 cents).
    // If this fails, someone changed the price book: ask the founder whether
    // assistants still belong to Max before updating this number.
    expect(SUBSCRIPTION_PLANS.max.prices.USD.amount).toBe(1_500);
    expect(ASSISTANT_GATE_CONFIRMED_MAX_USD_CENTS).toBe(1_500);
  });
});

describe("assistant scopes", () => {
  it("always includes search and read, drops unknown scopes, keeps a stable order", () => {
    expect(normalizeAssistantScopes(undefined)).toEqual(["search", "read"]);
    expect(normalizeAssistantScopes(["send", "bogus", "draft", "send", 3])).toEqual(["search", "read", "draft", "send"]);
  });

  it("never turns paid tools into send or the reverse", () => {
    expect(normalizeAssistantScopes(["paid_tools"])).toEqual(["search", "read", "paid_tools"]);
    expect(normalizeAssistantScopes(["send"])).toEqual(["search", "read", "send"]);
  });
});
