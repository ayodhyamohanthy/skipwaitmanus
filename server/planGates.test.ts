import { describe, expect, it } from "vitest";
import { resolvePlanEntitlements, type EntitlementWallet } from "../shared/planEntitlements";
import { AssistantPlanRequiredError, PlanLimitError, showcaseLimitViolation } from "./planGates";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const paid = (plan: string): EntitlementWallet => ({ plan, subscriptionStatus: "active", subscriptionCurrentTermEnd: new Date(NOW.getTime() + 864e5) });
const ent = (plan: string) => resolvePlanEntitlements(plan === "free" ? null : paid(plan), NOW);

describe("server plan gates", () => {
  it("refuses a new piece over the plan's showcase and a pin over its pin limit, never what is already shown", () => {
    const free = ent("free");
    const items = (count: number, pinned = 0) => Array.from({ length: count }, (_, index) => ({ pinned: index < pinned }));
    expect(showcaseLimitViolation(free, items(2), { adding: true, pinning: false })).toBeNull();
    const pieces = showcaseLimitViolation(free, items(3), { adding: true, pinning: false });
    expect(pieces).toBeInstanceOf(PlanLimitError);
    expect(pieces).toMatchObject({ code: "plan_limit", limit: "showcase_pieces", cap: 3, message: "Your Free plan holds 3 pieces of work. Compare plans to show more." });
    expect(showcaseLimitViolation(free, items(1, 1), { adding: false, pinning: true })).toMatchObject({ limit: "showcase_pins", cap: 1, message: "Pin limit reached. Your Free plan pins 1 piece; unpin one first." });
    expect(showcaseLimitViolation(free, items(1, 0), { adding: false, pinning: true })).toBeNull();
    // Unpinning, editing or keeping over-limit pieces from a richer plan is never blocked.
    expect(showcaseLimitViolation(free, items(12, 6), { adding: false, pinning: false })).toBeNull();
    // Unlimited showcases still stop at the abuse ceiling.
    expect(showcaseLimitViolation(ent("momentum"), items(199), { adding: true, pinning: false })).toBeNull();
    expect(showcaseLimitViolation(ent("momentum"), items(200), { adding: true, pinning: false })).toMatchObject({ limit: "showcase_pieces", cap: 200, message: "Showcases hold up to 200 pieces of work." });
    // D-067: no grandfathered 20 pieces; a wallet still marked pro reads as Free.
    expect(showcaseLimitViolation(ent("pro"), items(3), { adding: true, pinning: false })).toMatchObject({ limit: "showcase_pieces", cap: 3 });
    expect(showcaseLimitViolation(ent("start"), items(9), { adding: true, pinning: false })).toBeNull();
  });

  it("assistant refusals carry the kit copy and a stable code", () => {
    const error = new AssistantPlanRequiredError();
    expect(error).toMatchObject({ code: "assistant_plan_required", message: "Assistants are part of Land and Concierge, which are not on sale yet, so ChatGPT, Claude and your own tools cannot connect to this account." });
    // Review round 2 (D-067): nothing sells Land yet, so the refusal (shown by MCP and OAuth clients) never says to upgrade.
    expect(error.message).not.toMatch(/upgrade/i);
  });
});
