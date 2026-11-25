import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AskInviteMine } from "../shared/askInvites";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

const CREATED = "2026-10-22T12:00:00.000Z";
const EXPIRES = "2026-10-29T12:00:00.000Z";

afterEach(() => { vi.unstubAllEnvs(); });

describe("D-090 My asks invite payload", () => {
  it("attaches only safe invite fields, including the delivered state after the insider takes the ask", async () => {
    vi.stubEnv("BYOR_LINK_ENABLED", "true");
    const app = express();
    app.use(express.json());
    const listedInviteRequests: number[][] = [];
    const rows = [
      { id: 101, companyDomain: "acme.com", title: "Designer", status: "pending", waitingForCoverage: true, referrerId: null, createdAt: new Date(CREATED), coverageVisibleAt: null, attachmentCount: 0 },
      { id: 102, companyDomain: "acme.com", title: "Researcher", status: "pending", waitingForCoverage: true, referrerId: null, createdAt: new Date(CREATED), coverageVisibleAt: null, attachmentCount: 0 },
      { id: 103, companyDomain: "acme.com", title: "Engineer", status: "pending", waitingForCoverage: false, referrerId: 44, createdAt: new Date(CREATED), coverageVisibleAt: new Date(CREATED), attachmentCount: 0 },
      { id: 104, companyDomain: "acme.com", title: "Blocked", status: "pending", waitingForCoverage: true, referrerId: null, createdAt: new Date(CREATED), coverageVisibleAt: null, attachmentCount: 0 },
      { id: 105, companyDomain: "acme.com", title: "Stale link", status: "pending", waitingForCoverage: false, referrerId: 44, createdAt: new Date(CREATED), coverageVisibleAt: new Date(CREATED), attachmentCount: 0 },
    ];
    const invite = (state: AskInviteMine["state"]) => ({ state, createdAt: CREATED, expiresAt: EXPIRES, token: "raw-secret", url: "https://skipwait.me/r/raw-secret", linkTokenHash: "hash-secret", claimedByUserId: 999 });
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 7, openId: "test" } }),
      listJobSeekerCompanyReferrals: async () => rows,
      listAskInvitesForRequests: async (_userId: number, requestIds: number[]) => {
        listedInviteRequests.push(requestIds);
        return new Map<number, AskInviteMine>([[101, invite("active")], [103, invite("delivered")], [104, invite("active")], [105, invite("active")]]);
      },
      getBlockedReferralRequestIds: async (_userId: number, requestIds: number[]) => new Set(requestIds.filter(id => id === 104)),
      reconcileExpiredPendingReferrals: async () => ({ expiredRequestIds: [] }),
      hasEverCreatedReferralRequest: async () => true,
      resolveCompanyIdentities: async () => new Map(),
    } as unknown as PrivateReferralRouteDeps);

    const response = await request(app).get("/api/company-referrals/mine");
    expect(response.status).toBe(200);
    expect(listedInviteRequests).toEqual([[101, 102, 103, 105]]);
    const byId = new Map(response.body.requests.map((row: Record<string, unknown>) => [row.id, row]));
    expect(byId.get(101)).toMatchObject({ askInvite: { state: "active", createdAt: CREATED, expiresAt: EXPIRES } });
    expect(Object.keys((byId.get(101) as Record<string, unknown>).askInvite as Record<string, unknown>).sort()).toEqual(["createdAt", "expiresAt", "state"]);
    expect(byId.get(102)).not.toHaveProperty("askInvite");
    // The row the insider took is no longer waiting; item 27 still needs its delivered line.
    expect(byId.get(103)).toMatchObject({ askInvite: { state: "delivered", createdAt: CREATED, expiresAt: EXPIRES } });
    expect(byId.has(104)).toBe(false);
    // A live/claimed state cannot describe a row that already has a referrer; never invent one.
    expect(byId.get(105)).not.toHaveProperty("askInvite");
    expect(JSON.stringify(response.body)).not.toMatch(/raw-secret|hash-secret|claimedByUserId|claimer|email|userId/);
  });
});
