import { afterEach, describe, expect, it, vi } from "vitest";
import { ASK_TTL_DAYS, COVERAGE_WAIT_DAYS } from "./referral";
import { askCostLanding, askCostLine } from "./moneyCopy";

/*
 * D-038-reconcile F3 (R-2, D-042): the credit rule may promise the reopen path
 * only while part B can deliver it. The routes answer 409 and the timers job
 * skips its part B steps while REFERRED_DEADLINE_ENABLED is false, so the
 * sentence must be absent then and present once the lander turns the switch on.
 */

const REOPEN = /not marked Referred in time/;

async function ruleWithSwitch(enabled: boolean): Promise<string> {
  vi.resetModules();
  vi.doMock("./referral", async () => {
    const actual = await vi.importActual<typeof import("./referral")>("./referral");
    return { ...actual, REFERRED_DEADLINE_ENABLED: enabled };
  });
  const { CREDIT_RULE } = await import("./moneyCopy");
  return CREDIT_RULE;
}

afterEach(() => { vi.resetModules(); vi.doUnmock("./referral"); });

// Item 3 of D-048-p3-live-review: the drawer's cost line lives here, one
// function for every surface that quotes a price (flat 1 credit today, so
// D-132-audit can make it level-aware without touching the drawer).
describe("askCostLine", () => {
  it("says nothing is used while a company has no available employee", () => {
    const cost = askCostLine({ open: false, balance: 7 });
    expect(cost.line).toBe("No credit used until a verified employee can see it");
    expect(cost.detail).toContain(`${COVERAGE_WAIT_DAYS} days`);
    expect(cost.blockedReason).toBeNull();
  });

  it("states the balance when it is known", () => {
    expect(askCostLine({ open: true, balance: 2 }).line).toBe("Uses 1 of your 2 credits");
    expect(askCostLine({ open: true, balance: 1 }).line).toBe("Uses 1 of your 1 credit");
    expect(askCostLine({ open: true, balance: 2 }).detail).toContain(`${ASK_TTL_DAYS} days`);
  });

  it("never invents a balance while it loads, and blocks a wallet with none", () => {
    expect(askCostLine({ open: true, balance: null }).line).toBe("Uses 1 credit");
    const none = askCostLine({ open: true, balance: 0 });
    expect(none.line).toBe("You have no credits left");
    expect(none.blockedReason).toContain("Add a credit pack");
  });

  it("describes the waiting case when availability is not known yet", () => {
    expect(askCostLine({ open: null, balance: null }).line).toBe("Uses 1 credit when a verified employee can see it");
  });
});

describe("CREDIT_RULE follows the part B switch", () => {
  it("promises nothing about reopening while the switch is off", async () => {
    const rule = await ruleWithSwitch(false);
    expect(rule).not.toMatch(REOPEN);
    expect(rule).not.toContain("steps back");
    // The rest of the rule, the part the product does deliver, stays intact.
    // D-042: a 48-hour claim or allocation lapse moves no ledger row (D-076 (1)) — the credit comes
    // back only if the reopened ask is then withdrawn or expires unclaimed, and never if a colleague
    // picks it up. The rule may not promise a return at the lapse itself.
    expect(rule).not.toMatch(/48-hour hold lapses/);
    expect(rule).not.toMatch(/lapse/i);
  });

  it("states the reopen path when the switch is on", async () => {
    const rule = await ruleWithSwitch(true);
    expect(rule).toMatch(REOPEN);
    expect(rule).toContain("steps back");
  });
});

describe("level-aware ask cost (D-132 item 7)", () => {
  it("default cost is 1 credit: every existing line is unchanged", () => {
    expect(askCostLine({ open: true, balance: 2 }).line).toBe("Uses 1 of your 2 credits");
    expect(askCostLine({ open: null, balance: null }).line).toBe("Uses 1 credit when a verified employee can see it");
    expect(askCostLine({ open: false, balance: 7 }).detail).toContain("1 credit is used");
  });
  it("a level cost is stated in the same line", () => {
    expect(askCostLine({ open: true, balance: 8, cost: 5 }).line).toBe("Uses 5 of your 8 credits");
    expect(askCostLine({ open: null, balance: null, cost: 5 }).line).toBe("Uses 5 credits when a verified employee can see it");
    expect(askCostLine({ open: false, balance: 8, cost: 5 }).detail).toContain("5 credits are used");
  });
  it("short of credits names the gap and blocks", () => {
    const line = askCostLine({ open: true, balance: 3, cost: 5 });
    expect(line.line).toBe("This ask costs 5 credits. You have 3. Add 2 more.");
    expect(line.blockedReason).toBe("This ask costs 5 credits. You have 3. Add 2 more.");
  });
  it("landing copy: flat wording with the flag off, level wording with it on, never 'costs the same' under levels", () => {
    expect(askCostLanding(false).fairRule).toContain("1 credit");
    expect(askCostLanding(false).stepBody).toContain("Every ask costs the same");
    const on = askCostLanding(true);
    for (const text of [on.stepBody, on.waitBody, on.fairRule]) { expect(text).not.toMatch(/costs the same|\b1 credit only\b/); }
    expect(on.fairRule).toContain("its job level");
  });
});
