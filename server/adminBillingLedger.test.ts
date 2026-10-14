import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerAdminBillingLedgerRoutes, type LedgerRows } from "./adminBillingLedger";

const admin = { account: { id: 1, role: "admin" as const } };
const member = { account: { id: 2, role: "user" as const } };
const at = (s: string) => new Date(s);
const empty = (): LedgerRows => ({ intents: [], payments: [], transactions: [], parked: [] });

function appFor(rows: LedgerRows, identity: typeof admin | typeof member | null = admin, loadRows = vi.fn(async () => rows)) {
  const app = express();
  registerAdminBillingLedgerRoutes(app, { resolveIdentity: async () => identity ?? undefined, loadRows, now: () => new Date("2026-10-15T00:00:00Z") });
  return { app, loadRows };
}

describe("admin billing ledger", () => {
  it("rejects non-admins and anonymous callers without touching the database", async () => {
    for (const who of [member, null]) {
      const { app, loadRows } = appFor(empty(), who);
      await request(app).get("/api/admin/billing/ledger").expect(403);
      expect(loadRows).not.toHaveBeenCalled();
    }
  });

  it("defaults to the last 24h, treats since as inclusive and until as exclusive", async () => {
    const { app, loadRows } = appFor(empty());
    const res = await request(app).get("/api/admin/billing/ledger").expect(200);
    expect(res.body.since).toBe("2026-10-14T00:00:00.000Z");
    expect(res.body.until).toBe("2026-10-15T00:00:00.000Z");
    expect(loadRows).toHaveBeenCalledWith({ since: new Date("2026-10-14T00:00:00Z"), until: new Date("2026-10-15T00:00:00Z"), limit: 200 });
  });

  it("validates the window and limit", async () => {
    const { app } = appFor(empty());
    await request(app).get("/api/admin/billing/ledger?since=nope").expect(400);
    await request(app).get("/api/admin/billing/ledger?since=2026-10-02T00:00:00Z&until=2026-10-01T00:00:00Z").expect(400);
    await request(app).get("/api/admin/billing/ledger?since=2026-08-01T00:00:00Z&until=2026-10-01T00:00:00Z").expect(400);
    await request(app).get("/api/admin/billing/ledger?limit=0").expect(400);
    await request(app).get("/api/admin/billing/ledger?limit=501").expect(400);
  });

  it("maps every source into ordered events without emails", async () => {
    const rows: LedgerRows = {
      intents: [{ createdAt: at("2026-10-14T10:00:00Z"), userId: 7, role: "job_seeker", checkoutIntentId: "ci1", hostedPageId: "hp1", plan: "pro", itemPriceId: "pro-INR", amount: 49900, currency: "INR", status: "pending" }],
      payments: [{ createdAt: at("2026-10-14T10:05:00Z"), id: 3, userId: 7, role: "job_seeker", provider: "chargebee", providerEventId: "ev1", providerInvoiceId: "inv1", providerHostedPageId: "hp1", checkoutIntentId: "ci1", tokenCount: 5, amount: 49900, currency: "INR", status: "credited", reconciliationReason: null, lastCheckedAt: null, creditedAt: at("2026-10-14T10:05:01Z") }],
      transactions: [
        { createdAt: at("2026-10-14T10:05:01Z"), id: 11, userId: 7, role: "job_seeker", tokenCount: 5, kind: "purchase", source: "purchased_balance", referenceType: "payment_fulfillment", referenceId: "3", idempotencyKey: "payment-credit-3", reversesTransactionId: null, balanceAfter: 5 },
        { createdAt: at("2026-10-14T11:00:00Z"), id: 12, userId: 7, role: "job_seeker", tokenCount: -5, kind: "admin_adjustment", source: "payment_refund", referenceType: "payment_fulfillment", referenceId: "3", idempotencyKey: "payment-refund-3", reversesTransactionId: null, balanceAfter: 0 },
        { createdAt: at("2026-10-14T12:00:00Z"), id: 13, userId: 7, role: "job_seeker", tokenCount: -1, kind: "direct_request", source: null, referenceType: "referral_request", referenceId: "9", idempotencyKey: null, reversesTransactionId: null, balanceAfter: 4 },
      ],
      parked: [{ createdAt: at("2026-10-14T09:00:00Z"), id: 50, action: "billing.payment_unmatched", resourceId: "inv-x", metadata: JSON.stringify({ eventId: "ev-x", reason: "unknown_order", amount: 9900, currency: "INR", secret: "drop-me" }) }],
    };
    const { app } = appFor(rows);
    const res = await request(app).get("/api/admin/billing/ledger").expect(200);
    expect(res.body.events.map((e: { type: string }) => e.type)).toEqual(["parked_event", "checkout_intent", "payment_fulfillment", "credit_grant", "refund_reversal", "credit_revoke"]);
    expect(res.body.counts.parked_event).toBe(1);
    const parked = res.body.events[0];
    expect(parked).toMatchObject({ providerInvoiceId: "inv-x", eventId: "ev-x", reason: "unknown_order", amount: 9900 });
    expect(JSON.stringify(res.body)).not.toContain("drop-me");
    expect(res.body.events[2]).toMatchObject({ hostedPageId: "hp1", providerInvoiceId: "inv1", status: "credited" });
    expect(res.body.truncated).toBe(false);
  });

  it("reports truncation and a nextSince that loses nothing", async () => {
    const tx = (id: number, time: string) => ({ createdAt: at(time), id, userId: 1, role: "job_seeker", tokenCount: 1, kind: "purchase", source: null, referenceType: null, referenceId: null, idempotencyKey: null, reversesTransactionId: null, balanceAfter: 1 });
    const rows = { ...empty(), transactions: [tx(1, "2026-10-14T01:00:00Z"), tx(2, "2026-10-14T02:00:00Z"), tx(3, "2026-10-14T03:00:00Z")] };
    const { app } = appFor(rows);
    const res = await request(app).get("/api/admin/billing/ledger?limit=2").expect(200);
    expect(res.body.truncated).toBe(true);
    expect(res.body.nextSince).toBe("2026-10-14T02:00:00.000Z");
    expect(res.body.events.map((e: { txId: number }) => e.txId)).toEqual([1]);
  });

  it("tolerates unreadable parked metadata", async () => {
    const rows = { ...empty(), parked: [{ createdAt: at("2026-10-14T09:00:00Z"), id: 1, action: "billing.refund_needs_review", resourceId: "inv", metadata: "{not json" }] };
    const { app } = appFor(rows);
    const res = await request(app).get("/api/admin/billing/ledger").expect(200);
    expect(res.body.events[0]).toMatchObject({ type: "parked_event", eventId: null });
  });
});
