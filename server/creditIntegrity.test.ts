import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Credit-integrity invariants for server/db.ts.
//
// These are source assertions rather than behavioural tests, deliberately.
// The bugs they guard against are lost-update races: a balance is read, a new
// value is computed in JS, and that absolute value is written back. Two
// overlapping requests then both read the same starting balance and both write
// the same result, so one paid action is deducted for two deliveries — or a
// concurrent spend is silently undone. Reproducing that needs two real
// concurrent transactions against MySQL, and db.ts reads its connection through
// a module-level `getDb()` with no injection seam, so a unit test with a fake
// driver could never observe the race it is meant to prevent.
//
// What a test CAN do is pin the shape of the fix: every read that feeds an
// absolute balance write must take a row lock, and the guarded status updates
// that follow must check affectedRows. Removing a `.for("update")` fails here.
// This matches the convention already used by server/mobilePwaAudit.test.ts.

const source = readFileSync(
  fileURLToPath(new URL("./db.ts", import.meta.url)),
  "utf8"
);

/** Body of a top-level `export async function <name>(...)`, up to the next top-level close. */
function functionBody(name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  expect(start, `${name} should exist in db.ts`).toBeGreaterThan(-1);
  const end = source.indexOf("\n}\n", start);
  expect(end, `${name} should have a top-level body`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("credit integrity: absolute balance writes take a row lock", () => {
  it("spendToken locks the wallet row before decrementing it", () => {
    const body = functionBody("spendToken");
    // The debit is computed in JS and written back absolutely, so the read that
    // feeds it must be FOR UPDATE or two concurrent sends deduct one credit.
    expect(body).toMatch(/from\(tokenBalances\)[\s\S]*?\.for\("update"\)/);
  });

  it("grantPendingActionRewards locks the wallet row before crediting it", () => {
    expect(functionBody("grantPendingActionRewards")).toMatch(
      /from\(tokenBalances\)[\s\S]*?\.for\("update"\)/
    );
  });

  it("grantAdminTokenAdjustment locks the wallet row before writing newBalance", () => {
    const body = functionBody("grantAdminTokenAdjustment");
    expect(body).toContain("newBalance");
    expect(body).toMatch(/from\(tokenBalances\)[\s\S]*?\.for\("update"\)/);
  });

  it("refundCreditedPayment locks the wallet row before debiting it", () => {
    expect(functionBody("refundCreditedPayment")).toMatch(
      /from\(tokenBalances\)[\s\S]*?\.for\("update"\)/
    );
  });

  it("every employer credit path locks the employer row", () => {
    for (const name of [
      "fulfillUnlockCreditPurchase",
      "spendEmployerUnlockCredit",
      "sponsorCompanyOpportunity",
    ]) {
      expect(functionBody(name), `${name} must lock employerAccounts`).toMatch(
        /from\(employerAccounts\)[\s\S]*?\.for\("update"\)/
      );
    }
  });
});

describe("credit integrity: idempotency and guarded updates", () => {
  it("fulfillUnlockCreditPurchase re-checks the duplicate AFTER taking the row lock", () => {
    const body = functionBody("fulfillUnlockCreditPurchase");
    const lockIndex = body.indexOf('.for("update")');
    const duplicateIndex = body.indexOf("employer.unlock_credits_fulfilled");
    // Checking before the lock leaves a window where two concurrent deliveries of
    // the same event both see no log row and both credit the pack.
    expect(lockIndex).toBeGreaterThan(-1);
    expect(duplicateIndex).toBeGreaterThan(lockIndex);
  });

  it("resolveRequiresReviewPayment locks the payment and verifies the guarded status update landed", () => {
    const body = functionBody("resolveRequiresReviewPayment");
    expect(body).toMatch(
      /from\(paymentFulfillments\)[\s\S]*?\.for\("update"\)/
    );
    // The wallet credit is an atomic increment, so without this check a losing
    // race would leave the credit applied with no recorded decision.
    expect(body).toContain("affectedRows");
  });

  it("createCompanyReferralRequest returns the reserved credit when the request fails", () => {
    const body = functionBody("createCompanyReferralRequest");
    expect(body).toContain("refundUnspentReferralCredit");
    // The refund has to be reachable from a catch, otherwise a failure after
    // spendToken silently consumes a paid credit.
    expect(body).toMatch(/catch \(error\)[\s\S]*?refundUnspentReferralCredit/);
  });

  it("the compensating refund locks the wallet and records a ledger row", () => {
    const start = source.indexOf("async function refundUnspentReferralCredit(");
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("\n}\n", start));
    expect(body).toMatch(/from\(tokenBalances\)[\s\S]*?\.for\("update"\)/);
    // A credit that moves without a ledger row breaks reconciliation.
    expect(body).toContain("withdrawal_refund");
  });
});
