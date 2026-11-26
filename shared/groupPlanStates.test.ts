import { describe, expect, expectTypeOf, it } from "vitest";
import {
  GROUP_PLAN_ALLOCATION_STATES, GROUP_PLAN_COMPONENT_STATES, GROUP_PLAN_ERRORS, GROUP_PLAN_ORDER_STATES,
  canTransitionGroupPlanAllocation, canTransitionGroupPlanComponent, canTransitionGroupPlanOrder,
  groupPlanAllocationStateSchema, groupPlanComponentStateSchema, groupPlanCurrencySchema,
  groupPlanEnvironmentSchema, groupPlanErrorSchema, groupPlanFingerprintSchema, groupPlanIdSchema,
  groupPlanInstantSchema, groupPlanMinorSchema, groupPlanOrderStateSchema, groupPlanQuantitySchema,
  groupPlanSiteSchema, groupPlanUserIdSchema,
  type GroupPlanAllocationState, type GroupPlanComponentState, type GroupPlanError, type GroupPlanOrderState,
} from "./groupPlanStates";

const orderStates = ["draft", "quoted", "creating_checkout", "pending_payment", "partially_paid", "paid", "activating", "complete", "requires_review", "cancelled"];
const allocationStates = ["awaiting_payment", "paid", "claimed", "activating", "active", "requires_review", "refunded", "cancelled"];
const componentStates = ["pending", "creating_checkout", "pending_payment", "paid", "requires_review", "cancelled", "refunded"];
const errorCodes = ["group_terms_unconfirmed", "not_available", "not_found", "invalid_transition", "quote_changed", "idempotency_conflict", "payment_unverified", "candidate_proof_required", "consent_required", "delegation_inactive", "approval_expired", "requires_review"];

describe("Group Plan reusable primitives", () => {
  it("accepts UUID identifiers without coercing other identifier shapes", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(groupPlanIdSchema.parse(id)).toBe(id);
    for (const invalid of ["", "order-1", id.replaceAll("-", ""), ` ${id}`, 1, null]) {
      expect(groupPlanIdSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("matches signed user ids, unsigned quantities and safe minor-unit storage bounds", () => {
    for (const value of [1, 2_147_483_647]) expect(groupPlanUserIdSchema.parse(value)).toBe(value);
    for (const value of [1, 501, 4_294_967_295]) expect(groupPlanQuantitySchema.parse(value)).toBe(value);
    for (const value of [0, 1, Number.MAX_SAFE_INTEGER]) expect(groupPlanMinorSchema.parse(value)).toBe(value);
    expect(groupPlanUserIdSchema.safeParse(2_147_483_648).success).toBe(false);
    expect(groupPlanQuantitySchema.safeParse(4_294_967_296).success).toBe(false);
    expect(groupPlanUserIdSchema.safeParse(0).success).toBe(false);
    expect(groupPlanQuantitySchema.safeParse(0).success).toBe(false);
    for (const schema of [groupPlanUserIdSchema, groupPlanQuantitySchema, groupPlanMinorSchema]) {
      for (const invalid of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.MAX_VALUE, NaN, Infinity, -Infinity, "1", 1n, null]) {
        expect(schema.safeParse(invalid).success).toBe(false);
      }
      expectTypeOf(schema.parse(1)).toEqualTypeOf<number>();
    }
  });

  it("accepts only lowercase SHA-256 fingerprints", () => {
    const digest = "0123456789abcdef".repeat(4);
    expect(groupPlanFingerprintSchema.parse(digest)).toBe(digest);
    for (const invalid of [digest.toUpperCase(), digest.slice(1), `${digest}0`, "g".repeat(64), ` ${digest}`, null]) {
      expect(groupPlanFingerprintSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("round-trips UTC milliseconds and checks calendar validity and exact precision", () => {
    const instant = "2024-02-29T23:59:59.123Z";
    expect(groupPlanInstantSchema.parse(JSON.parse(JSON.stringify(instant)))).toBe(instant);
    for (const invalid of ["2026-02-29T00:00:00.000Z", "2026-11-26T24:00:00.000Z", "2026-11-26T00:00:00Z", "2026-11-26T00:00:00.12Z", "2026-11-26T00:00:00.1234Z", "2026-11-26T00:00:00.000+00:00", "2026-11-26T00:00:00.000", "2026-11-26", new Date(instant), null]) {
      expect(groupPlanInstantSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("keeps provider site names separate from the closed billing environment and currency", () => {
    for (const site of ["skipwait", "skipwait-test", "a", "a".repeat(50)]) expect(groupPlanSiteSchema.parse(site)).toBe(site);
    for (const invalid of ["", "a".repeat(51), "SkipWait", " skipwait", "skipwait.chargebee.com", "https://skipwait", "site_name", null]) {
      expect(groupPlanSiteSchema.safeParse(invalid).success).toBe(false);
    }
    for (const environment of ["test", "live"]) expect(groupPlanEnvironmentSchema.parse(environment)).toBe(environment);
    for (const invalid of ["skipwait-test", "production", "TEST", "", null]) expect(groupPlanEnvironmentSchema.safeParse(invalid).success).toBe(false);
    for (const currency of ["INR", "USD"]) expect(groupPlanCurrencySchema.parse(currency)).toBe(currency);
    for (const invalid of ["EUR", "inr", "usd", "", null]) expect(groupPlanCurrencySchema.safeParse(invalid).success).toBe(false);
    expectTypeOf(groupPlanEnvironmentSchema.parse("test")).toEqualTypeOf<"test" | "live">();
    expectTypeOf(groupPlanCurrencySchema.parse("INR")).toEqualTypeOf<"INR" | "USD">();
  });
});

describe("Group Plan closed states and errors", () => {
  it("pins the complete public vocabulary", () => {
    expect(GROUP_PLAN_ORDER_STATES).toEqual(orderStates);
    expect(GROUP_PLAN_ALLOCATION_STATES).toEqual(allocationStates);
    expect(GROUP_PLAN_COMPONENT_STATES).toEqual(componentStates);
    expect(GROUP_PLAN_ERRORS).toEqual(errorCodes);
    expectTypeOf(groupPlanOrderStateSchema.parse("draft")).toEqualTypeOf<GroupPlanOrderState>();
    expectTypeOf(groupPlanAllocationStateSchema.parse("paid")).toEqualTypeOf<GroupPlanAllocationState>();
    expectTypeOf(groupPlanComponentStateSchema.parse("pending")).toEqualTypeOf<GroupPlanComponentState>();
    expectTypeOf(groupPlanErrorSchema.parse("not_found")).toEqualTypeOf<GroupPlanError>();
  });

  it.each([
    { schema: groupPlanOrderStateSchema, values: orderStates },
    { schema: groupPlanAllocationStateSchema, values: allocationStates },
    { schema: groupPlanComponentStateSchema, values: componentStates },
    { schema: groupPlanErrorSchema, values: errorCodes },
  ])("accepts every declared value and rejects undeclared or mistyped values", ({ schema, values }) => {
    for (const value of values) expect(schema.parse(JSON.parse(JSON.stringify(value)))).toBe(value);
    for (const invalid of ["", "unknown", "PAID", " paid", "terms_unconfirmed", 1, null, {}, []]) {
      expect(schema.safeParse(invalid).success).toBe(false);
    }
  });

  it("does not mix state vocabularies", () => {
    expect(groupPlanOrderStateSchema.safeParse("refunded").success).toBe(false);
    expect(groupPlanAllocationStateSchema.safeParse("complete").success).toBe(false);
    expect(groupPlanComponentStateSchema.safeParse("partially_paid").success).toBe(false);
  });
});

describe("Group Plan monotonic transitions", () => {
  it("supports initial and multi-component settlement before independent activation", () => {
    const orders: readonly GroupPlanOrderState[] = ["draft", "quoted", "creating_checkout", "pending_payment", "partially_paid", "paid", "activating", "complete"];
    const allocations: readonly GroupPlanAllocationState[] = ["awaiting_payment", "paid", "claimed", "activating", "active"];
    const components: readonly GroupPlanComponentState[] = ["pending", "creating_checkout", "pending_payment", "paid"];
    for (const [index, state] of orders.entries()) {
      const next = orders[index + 1];
      if (next !== undefined) expect(canTransitionGroupPlanOrder(state, next)).toBe(true);
    }
    for (const [index, state] of allocations.entries()) {
      const next = allocations[index + 1];
      if (next !== undefined) expect(canTransitionGroupPlanAllocation(state, next)).toBe(true);
    }
    for (const [index, state] of components.entries()) {
      const next = components[index + 1];
      if (next !== undefined) expect(canTransitionGroupPlanComponent(state, next)).toBe(true);
    }
    expect(canTransitionGroupPlanOrder("pending_payment", "paid")).toBe(true);
  });

  it("replays every state and keeps cancelled/refunded states terminal", () => {
    for (const state of GROUP_PLAN_ORDER_STATES) {
      expect(canTransitionGroupPlanOrder(state, state)).toBe(true);
      expect(canTransitionGroupPlanOrder("cancelled", state)).toBe(state === "cancelled");
    }
    for (const state of GROUP_PLAN_ALLOCATION_STATES) {
      expect(canTransitionGroupPlanAllocation(state, state)).toBe(true);
      expect(canTransitionGroupPlanAllocation("cancelled", state)).toBe(state === "cancelled");
      expect(canTransitionGroupPlanAllocation("refunded", state)).toBe(state === "refunded");
    }
    for (const state of GROUP_PLAN_COMPONENT_STATES) {
      expect(canTransitionGroupPlanComponent(state, state)).toBe(true);
      expect(canTransitionGroupPlanComponent("cancelled", state)).toBe(state === "cancelled");
      expect(canTransitionGroupPlanComponent("refunded", state)).toBe(state === "refunded");
    }
  });

  it("cannot skip payment/claim or regress paid and activated money to checkout", () => {
    expect(canTransitionGroupPlanOrder("draft", "paid")).toBe(false);
    expect(canTransitionGroupPlanOrder("pending_payment", "complete")).toBe(false);
    for (const from of ["partially_paid", "paid", "activating", "complete"] satisfies GroupPlanOrderState[]) {
      for (const to of ["draft", "quoted", "creating_checkout", "pending_payment"] satisfies GroupPlanOrderState[]) expect(canTransitionGroupPlanOrder(from, to)).toBe(false);
    }
    expect(canTransitionGroupPlanAllocation("awaiting_payment", "claimed")).toBe(false);
    expect(canTransitionGroupPlanAllocation("paid", "activating")).toBe(false);
    for (const from of ["paid", "claimed", "activating", "active"] satisfies GroupPlanAllocationState[]) expect(canTransitionGroupPlanAllocation(from, "awaiting_payment")).toBe(false);
    expect(canTransitionGroupPlanAllocation("active", "paid")).toBe(false);
    expect(canTransitionGroupPlanComponent("pending", "paid")).toBe(false);
    for (const to of ["pending", "creating_checkout", "pending_payment"] satisfies GroupPlanComponentState[]) expect(canTransitionGroupPlanComponent("paid", to)).toBe(false);
  });

  it("parks failures and permits proof-checked review settlement without restarting checkout", () => {
    for (const state of ["creating_checkout", "pending_payment", "partially_paid", "paid", "activating", "complete"] satisfies GroupPlanOrderState[]) expect(canTransitionGroupPlanOrder(state, "requires_review")).toBe(true);
    for (const state of ["awaiting_payment", "paid", "claimed", "activating", "active"] satisfies GroupPlanAllocationState[]) expect(canTransitionGroupPlanAllocation(state, "requires_review")).toBe(true);
    for (const state of ["pending", "creating_checkout", "pending_payment", "paid"] satisfies GroupPlanComponentState[]) expect(canTransitionGroupPlanComponent(state, "requires_review")).toBe(true);
    for (const state of GROUP_PLAN_ORDER_STATES) expect(canTransitionGroupPlanOrder("requires_review", state)).toBe(["requires_review", "paid", "cancelled"].includes(state));
    for (const state of GROUP_PLAN_ALLOCATION_STATES) expect(canTransitionGroupPlanAllocation("requires_review", state)).toBe(["requires_review", "paid", "refunded", "cancelled"].includes(state));
    for (const state of GROUP_PLAN_COMPONENT_STATES) expect(canTransitionGroupPlanComponent("requires_review", state)).toBe(["requires_review", "paid", "refunded", "cancelled"].includes(state));
  });

  it("records refunds before claim/grant and after activation without allowing later grants", () => {
    for (const state of ["awaiting_payment", "paid", "claimed", "activating", "active"] satisfies GroupPlanAllocationState[]) expect(canTransitionGroupPlanAllocation(state, "refunded")).toBe(true);
    for (const state of ["pending_payment", "paid"] satisfies GroupPlanComponentState[]) expect(canTransitionGroupPlanComponent(state, "refunded")).toBe(true);
    expect(canTransitionGroupPlanOrder("complete", "cancelled")).toBe(true);
    expect(canTransitionGroupPlanAllocation("active", "cancelled")).toBe(true);
    expect(canTransitionGroupPlanComponent("paid", "cancelled")).toBe(true);
  });
});
