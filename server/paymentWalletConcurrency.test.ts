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

  it("refuses a review decision the parked reason does not allow before writing anything (P0-refund-review)", () => {
    const body = fn("export async function resolveRequiresReviewPayment", "export async function listRecentPayments");
    expect(body.indexOf("paymentReviewRefusal(paymentReviewKind(row), decision)")).toBeGreaterThan(body.indexOf('.for("update")'));
    expect(body.indexOf("throw new PaymentReviewRefusedError(refusal)")).toBeLessThan(body.indexOf("status: decision"));
    // drizzle wraps every driver error (DrizzleQueryError, the mysql2 error as its cause), so the
    // duplicate check must read through the wrapper: the ledger's cause-walking isDuplicateKey.
    expect(body).toContain("if (!isDuplicateKey(error)) throw error;");
    const takeBack = fs.readFileSync(new URL("./paymentRefundReview.ts", import.meta.url), "utf8");
    expect(takeBack).toContain("if (!isDuplicateKey(error)) throw error;");
    for (const text of [body, takeBack]) expect(text).not.toMatch(/\.code === "ER_DUP_ENTRY"|isDuplicateKeyError/);
  });

  it("tags the webhook's pack credit with its payment, the shape the admin credit writes", () => {
    const body = fn("export async function fulfillChargebeePayment", "export async function listRequiresReviewPayments");
    expect(body).toContain('kind: "purchase", source: "purchased_balance", referenceType: "payment_fulfillment", referenceId: String(intent[0].id), idempotencyKey: `payment-credit-${intent[0].id}`');
    expect(body).not.toContain('kind: "purchase" });');
  });

  it("lists parked payments with their credit time and why they are parked", () => {
    const body = fn("export async function listRequiresReviewPayments", "export async function resolveRequiresReviewPayment");
    expect(body).toContain("creditedAt: paymentFulfillments.creditedAt");
    expect(body).toContain("reviewKind: paymentReviewKind(row)");
    // What Chargebee refunded, from the refund records of the listed payments only.
    expect(body).toContain('eq(operationalActivityLogs.action, "billing.refund_needs_review"), eq(operationalActivityLogs.resourceType, "payment_fulfillment"), inArray(operationalActivityLogs.resourceId, ids)');
    expect(body).toContain("refunds: refunds.get(row.id) ?? null");
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
