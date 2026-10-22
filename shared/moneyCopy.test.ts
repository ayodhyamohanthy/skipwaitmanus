import { afterEach, describe, expect, it, vi } from "vitest";

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
