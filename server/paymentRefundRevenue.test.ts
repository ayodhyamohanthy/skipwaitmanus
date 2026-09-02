import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

const adminIdentity = () => ({ account: { id: 9, openId: "workos-admin", role: "admin" as const } });
const memberIdentity = () => ({ account: { id: 8, openId: "workos-member", role: "user" as const } });

describe("admin payment refund and revenue routes", () => {
  it("refunds a credited payment: wallet deducted, transaction inserted, activity recorded, status refunded", async () => {
    const app = express(); app.use(express.json());
    let wallet = 10;
    let status = "credited";
    const ledger: Array<{ userId: number; role: string; tokenCount: number; kind: string }> = [];
    const activity: Array<{ action: string; actorUserId?: number; resourceId?: string | number; metadata?: Record<string, unknown> }> = [];
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async () => adminIdentity(),
      refundCreditedPayment: async (adminUserId, paymentId, note) => {
        expect(adminUserId).toBe(9); expect(paymentId).toBe(41); expect(note).toBe("Customer requested a refund");
        expect(status).toBe("credited");
        wallet = Math.max(0, wallet - 4);
        ledger.push({ userId: 7, role: "job_seeker", tokenCount: -4, kind: "admin_adjustment" });
        status = "refunded";
        return { paymentId, refunded: true, tokenCount: 4, userId: 7, role: "job_seeker", provider: "chargebee", amount: 39_600, currency: "INR" };
      },
      recordActivity: async input => { activity.push(input); },
    });
    const response = await request(app).post("/api/admin/payments/review/41/refund").send({ note: "Customer requested a refund" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ refunded: true, paymentId: 41 });
    expect(wallet).toBe(6);
    expect(ledger).toEqual([{ userId: 7, role: "job_seeker", tokenCount: -4, kind: "admin_adjustment" }]);
    expect(status).toBe("refunded");
    expect(activity).toContainEqual(expect.objectContaining({ actorUserId: 9, action: "payment.refunded", outcome: "success", resourceType: "payment_fulfillment", resourceId: 41, metadata: expect.objectContaining({ provider: "chargebee", amount: 39_600, currency: "INR", tokenCount: 4, note: "Customer requested a refund" }) }));
  });

  it("returns 409 when the payment is pending or requires review and cannot be refunded", async () => {
    const app = express(); app.use(express.json());
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async () => adminIdentity(),
      refundCreditedPayment: async () => { throw new Error("This payment cannot be refunded"); },
    });
    const response = await request(app).post("/api/admin/payments/review/41/refund").send({});
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("This payment cannot be refunded");
  });

  it("denies non-administrators on refund and revenue endpoints before any db call", async () => {
    const app = express(); app.use(express.json());
    let refundCalled = false;
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async () => memberIdentity(),
      refundCreditedPayment: async () => { refundCalled = true; return { paymentId: 41, refunded: true, tokenCount: 4, userId: 7, role: "job_seeker", provider: "chargebee", amount: 39_600, currency: "INR" }; },
      getRevenueSummary: async () => ({ byProvider: [], totalsByCurrency: [], refundedTotalByCurrency: [], recordedAt: new Date() }),
    });
    expect((await request(app).post("/api/admin/payments/review/41/refund").send({})).status).toBe(403);
    expect((await request(app).get("/api/admin/revenue")).status).toBe(403);
    expect(refundCalled).toBe(false);
  });

  it("returns revenue aggregates and records the admin revenue view", async () => {
    const app = express(); app.use(express.json());
    const activity: Array<{ action: string; actorUserId?: number; outcome?: string }> = [];
    const summary = { byProvider: [{ provider: "chargebee", currency: "INR", totalAmount: 118_800, count: 12 }], totalsByCurrency: [{ currency: "INR", totalAmount: 118_800, count: 12 }], refundedTotalByCurrency: [{ currency: "INR", totalAmount: 9_900, count: 1 }], recordedAt: new Date("2026-09-02T00:00:00.000Z") };
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async () => adminIdentity(),
      getRevenueSummary: async () => summary,
      recordActivity: async input => { activity.push(input); },
    });
    const response = await request(app).get("/api/admin/revenue");
    expect(response.status).toBe(200);
    expect(response.body.revenue).toMatchObject({ totalsByCurrency: [{ currency: "INR", totalAmount: 118_800, count: 12 }], byProvider: [{ provider: "chargebee", currency: "INR", totalAmount: 118_800, count: 12 }], refundedTotalByCurrency: [{ currency: "INR", totalAmount: 9_900, count: 1 }] });
    expect(activity).toContainEqual(expect.objectContaining({ actorUserId: 9, action: "admin.revenue_viewed", outcome: "success" }));
  });

  it("lists recent credited and refunded payments through the review endpoint credited scope", async () => {
    const app = express(); app.use(express.json());
    const activity: Array<{ metadata?: Record<string, unknown> }> = [];
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async () => adminIdentity(),
      listRecentPayments: async limit => { expect(limit).toBe(20); return [{ id: 42, status: "refunded", provider: "chargebee", userId: 7, role: "job_seeker", tokenCount: 4, amount: 39_600, currency: "INR", createdAt: "2026-09-01T00:00:00.000Z", userEmail: "avery@example.com" }]; },
      recordActivity: async input => { activity.push(input); },
    });
    const response = await request(app).get("/api/admin/payments/review?scope=credited&limit=20");
    expect(response.status).toBe(200);
    expect(response.body.payments).toHaveLength(1);
    expect(response.body.payments[0].status).toBe("refunded");
    expect(activity).toContainEqual(expect.objectContaining({ action: "admin.payment_reviews_viewed", metadata: expect.objectContaining({ scope: "credited", queueCount: 1 }) }));
  });
});
