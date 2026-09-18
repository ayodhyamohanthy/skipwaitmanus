import { describe, expect, it } from "vitest";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./db.ts", import.meta.url), "utf8");
function fn(start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("payment and recovery wallet concurrency invariants", () => {
  it("claims and locks a reviewed payment before adding credits", () => {
    const body = fn("export async function resolveRequiresReviewPayment", "export async function listRecentPayments");
    expect(body).toContain('.for("update")');
    expect(body.indexOf('status: decision')).toBeLessThan(body.indexOf('balance: sql`${tokenBalances.balance} + ${row.tokenCount}`'));
    expect(body).toContain('eq(paymentFulfillments.status, "requires_review")');
    expect(body).toContain('Number(claimed[0]?.affectedRows ?? 0) !== 1');
    expect(body).toContain('idempotencyKey: `payment-credit-${paymentId}`');
  });

  it("locks both fulfillment and wallet and subtracts atomically on revocation", () => {
    const body = fn("export async function revokeCreditedPaymentCredits", "export async function getRevenueSummary");
    expect(body.match(/\.for\("update"\)/g)).toHaveLength(2);
    expect(body).toContain('balance: sql`${tokenBalances.balance} - ${row.tokenCount}`');
    expect(body).toContain('sql`${tokenBalances.balance} >= ${row.tokenCount}`');
    expect(body).not.toContain("balance: wallet[0].balance - row.tokenCount }).where");
    expect(body).toContain('idempotencyKey: `payment-revoke-${paymentId}`');
  });

  it("uses the unique adjustment as claim and an atomic wallet upsert", () => {
    const body = fn("export async function grantAdminTokenAdjustment", "export async function ensureTokenWallet");
    expect(body.indexOf("tx.insert(adminTokenAdjustments)")).toBeLessThan(body.indexOf("tx.insert(tokenBalances)"));
    expect(body).toContain("onDuplicateKeyUpdate");
    expect(body).toContain('balance: sql`${tokenBalances.balance} + ${input.tokenCount}`');
    expect(body).not.toContain("const newBalance = (wallet[0]?.balance ?? 0) + input.tokenCount");
  });
});
