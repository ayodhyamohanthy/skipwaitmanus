import { describe, expect, it, vi } from "vitest";

// D-174/D-385: force the switch on before shared/moneyCopy.ts is imported, so the module-level
// copy picks the no-expiry variant. The switch-off lines stay pinned in shared/moneyCopy.test.ts.
vi.mock("./askNoExpiry", async importOriginal => ({
  ...await importOriginal<typeof import("./askNoExpiry")>(),
  ASK_NO_EXPIRY_ENABLED: true,
}));

import { askCostLine, COVERAGE_WAIT_REASON, COVERAGE_WAIT_REASON_NO_EXPIRY, CREDIT_RULE, CREDIT_RULE_NO_EXPIRY, CREDIT_RULE_SHORT, CREDIT_RULE_SHORT_NO_EXPIRY, CREDIT_RULE_V2, CREDIT_RULE_V2_NO_EXPIRY } from "./moneyCopy";
import { REFERRED_DEADLINE_ENABLED } from "./referral";

// The ask-expiry promise uses "expires"/"expire unclaimed"; CREDIT_ENDED_CAVEAT's "expired" is about
// the credit bucket, which is still true and must stay.
const banned = (text: string) => {
  expect(text).not.toContain("7 days");
  expect(text).not.toContain("90 days");
  expect(text).not.toContain("expires");
  expect(text).not.toContain("expire unclaimed");
};

describe("D-174: money copy with the ask clocks off", () => {
  it("the waiting reason promises no wait cap", () => {
    expect(COVERAGE_WAIT_REASON).toBe(COVERAGE_WAIT_REASON_NO_EXPIRY);
    banned(COVERAGE_WAIT_REASON);
  });

  it("the uncovered-ask detail says it stays open instead of naming a 90-day cap", () => {
    const line = askCostLine({ open: false, balance: 2, cost: 1 });
    banned(line.detail);
    expect(line.detail).toContain("It stays open until someone answers it or you withdraw it.");
  });

  it("the refund detail names only the withdrawal, not a 7-day close", () => {
    const line = askCostLine({ open: true, balance: 2, cost: 1 });
    banned(line.detail);
    expect(line.detail).toContain("withdraw before anyone picks it up");
  });
});

// D-411: the owner approved these exact words on Nov 27 (legal text: Terms, Refund Policy, Plans, Pricing, Support,
// landing FAQ). Any edit to them needs the owner again, so they are pinned verbatim.
const CAVEAT = "only if its original balance or allowance has not expired, ended or been revoked and has room for the refund";
const APPROVED_RULE = "A referral request at a company where no verified employee is available yet waits at no cost, and it does not expire. If it has waited more than 30 days when one becomes able to see it, we ask you to confirm it once before it is sent or charged. The moment a verified employee can see your referral request, 1 is deducted from your balance; if your balance is empty then, we hold the referral request until you add to it. It stays open until someone answers it or you withdraw it. The charge is refunded once if you withdraw before someone picks it up, " + CAVEAT + ". Once someone picks the referral request up, it stays charged, even if they pass.";
const APPROVED_REOPEN = " If an accepted referral request is not marked Referred in time, or the referrer steps back, the referral request reopens to other employees with its charge still on it, and the charge is refunded if it is then withdrawn, " + CAVEAT + ".";
const APPROVED_SHORT = "nothing is used while it waits for coverage, it does not expire, and the charge is refunded once if you withdraw before pickup, " + CAVEAT;
const APPROVED_V2 = "An ask at a company where no verified employee is available yet waits at no cost, and it does not expire. If it has waited more than 30 days when one becomes able to see it, we ask you to confirm it once before it is sent or credits are used. The moment one can see your ask, credits are used by the role's level; if you do not have enough then, we hold the ask until you add more. It stays open until someone answers it or you withdraw it. Credits used on an ask come back once if you withdraw before someone picks the ask up - paid credits never expire, so they always come back; free monthly credits come back only if their month has not ended. Once someone picks the ask up, the credits stay spent, even if they pass.";
const APPROVED_V2_REOPEN = " If an accepted ask is not marked Referred in time, or the referrer steps back, the ask reopens to other employees with those credits still on it, and the credits come back if the ask is then withdrawn.";

describe("D-411: owner-approved no-expiry legal wording", () => {
  it("CREDIT_RULE is the approved text, verbatim", () => {
    expect(CREDIT_RULE).toBe(CREDIT_RULE_NO_EXPIRY);
    expect(CREDIT_RULE).toBe(APPROVED_RULE + (REFERRED_DEADLINE_ENABLED ? APPROVED_REOPEN : ""));
    banned(CREDIT_RULE);
  });

  it("CREDIT_RULE_SHORT is the approved footnote clause, verbatim", () => {
    expect(CREDIT_RULE_SHORT).toBe(CREDIT_RULE_SHORT_NO_EXPIRY);
    expect(CREDIT_RULE_SHORT).toBe(APPROVED_SHORT);
    banned(CREDIT_RULE_SHORT);
  });

  it("CREDIT_RULE_V2 is the approved off-flag text, verbatim", () => {
    expect(CREDIT_RULE_V2).toBe(CREDIT_RULE_V2_NO_EXPIRY);
    expect(CREDIT_RULE_V2).toBe(APPROVED_V2 + (REFERRED_DEADLINE_ENABLED ? APPROVED_V2_REOPEN : ""));
    banned(CREDIT_RULE_V2);
  });
});
