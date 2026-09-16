import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

const adminIdentity = () => ({ account: { id: 9, openId: "workos-admin", role: "admin" as const } });
const memberIdentity = () => ({ account: { id: 8, openId: "workos-member", role: "user" as const } });

describe("admin payment credit revocation and revenue routes", () => {
  it("disables the legacy route and never claims money was refunded", async () => {
    const app=express(); app.use(express.json()); registerPrivateReferralRoutes(app,{resolveIdentity:async()=>adminIdentity()});
    const response=await request(app).post("/api/admin/payments/review/41/refund").send({});
    expect(response.status).toBe(410); expect(response.body.refunded).not.toBe(true); expect(response.body.error).toMatch(/did not refund provider money/i);
  });
  it("names ledger-only revocation honestly", async () => {
    const app=express(); app.use(express.json());
    registerPrivateReferralRoutes(app,{resolveIdentity:async()=>adminIdentity(),revokeCreditedPaymentCredits:async()=>({paymentId:41,creditsRevoked:true,tokenCount:4,userId:7,role:"job_seeker",provider:"chargebee",amount:39600,currency:"INR"})});
    const response=await request(app).post("/api/admin/payments/review/41/revoke-credits").send({note:"support correction"});
    expect(response.status).toBe(200); expect(response.body).toEqual({creditsRevoked:true,paymentId:41}); expect(response.body.refunded).toBeUndefined();
  });
  it("denies non-administrators on credit revocation and revenue endpoints", async () => {
    const app=express(); app.use(express.json()); let called=false;
    registerPrivateReferralRoutes(app,{resolveIdentity:async()=>memberIdentity(),revokeCreditedPaymentCredits:async()=>{called=true; throw new Error("no");},getRevenueSummary:async()=>({byProvider:[],totalsByCurrency:[],refundedTotalByCurrency:[],recordedAt:new Date()})});
    expect((await request(app).post("/api/admin/payments/review/41/revoke-credits").send({})).status).toBe(403); expect((await request(app).get("/api/admin/revenue")).status).toBe(403); expect(called).toBe(false);
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
