import { describe, expect, it } from "vitest";
import { tokenBalances, subscriptionCheckoutIntents } from "../drizzle/schema";
import { isBillablePlanId, resolveItemPrice } from "../shared/billingCatalog";
import { PLAN_FAMILY_IDS } from "../shared/planFamily";
import { kitPlanCheckoutRequestSchema, subscriptionChangeRequestSchema } from "../shared/subscriptionManagement";

// Storage support is not permission to sell through either legacy plan route.
describe("dormant banded plan storage", () => {
  it.each(PLAN_FAMILY_IDS)("stores %s without making a legacy checkout sell it", planId => {
    expect(tokenBalances.plan.enumValues).toContain(planId);
    expect(subscriptionCheckoutIntents.plan.enumValues).toContain(planId);
    expect(isBillablePlanId(planId)).toBe(false);
    expect(resolveItemPrice(`skipwait_${planId}_monthly-INR`)).toBeUndefined();
    expect(kitPlanCheckoutRequestSchema.safeParse({ planId, interval: "monthly", currency: "INR", billingCountry: "IN", role: "job_seeker" }).success).toBe(false);
    expect(subscriptionChangeRequestSchema.safeParse({ planId, interval: "monthly", role: "job_seeker" }).success).toBe(false);
  });
});
