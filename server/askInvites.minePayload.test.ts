import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AskInviteMine } from "../shared/askInvites";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

const CREATED = "2026-10-22T12:00:00.000Z";
const EXPIRES = "2026-10-29T12:00:00.000Z";

afterEach(() => { vi.unstubAllEnvs(); });

describe("D-090 My asks invite payload", () => {
  it("attaches only safe invite fields to visible waiting rows and omits rows without a link", async () => {
    vi.stubEnv("BYOR_LINK_ENABLED", "true");
    const app = express();
    app.use(express.json());
    const listedInviteRequests: number[][] = [];
    const rows = [
      { id: 101, companyDomain: "acme.com", title: "Designer", status: "pending", waitingForCoverage: true, referrerId: null, createdAt: new Date(CREATED), coverageVisibleAt: null, attachmentCount: 0 },
      { id: 102, companyDomain: "acme.com", title: "Researcher", status: "pending", waitingForCoverage: true, referrerId: null, createdAt: new Date(CREATED), coverageVisibleAt: null, attachmentCount: 0 },
      { id: 103, companyDomain: "acme.com", title: "Engineer", status: "pending", waitingForCoverage: false, referrerId: 44, createdAt: new Date(CREATED), coverageVisibleAt: new Date(CREATED), attachmentCount: 0 },
      { id: 104, companyDomain: "acme.com", title: "Blocked", status: "pending", waitingForCoverage: true, referrerId: null, createdAt: new Date(CREATED), coverageVisibleAt: null, attachmentCount: 0 },
    ];
    const invite = { state: "active", createdAt: CREATED, expiresAt: EXPIRES, token: "raw-secret", url: "https://skipwait.me/r/raw-secret", linkTokenHash: "hash-secret", claimedByUserId: 999 } as unknown as AskInviteMine;
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 7, openId: "test" } }),
      listJobSeekerCompanyReferrals: async () => rows,
      listAskInvitesForRequests: async (_userId: number, requestIds: number[]) => {
        listedInviteRequests.push(requestIds);
        return new Map<number, AskInviteMine>([[101, invite], [103, invite], [104, invite]]);
      },
      getBlockedReferralRequestIds: async (_userId: number, requestIds: number[]) => new Set(requestIds.filter(id => id === 104)),
      reconcileExpiredPendingReferrals: async () => ({ expiredRequestIds: [] }),
      hasEverCreatedReferralRequest: async () => true,
      resolveCompanyIdentities: async () => new Map(),
    } as unknown as PrivateReferralRouteDeps);

    const response = await request(app).get("/api/company-referrals/mine");
    expect(response.status).toBe(200);
    expect(listedInviteRequests).toEqual([[101, 102]]);
    const byId = new Map(response.body.requests.map((row: Record<string, unknown>) => [row.id, row]));
    expect(byId.get(101)).toMatchObject({ askInvite: { state: "active", createdAt: CREATED, expiresAt: EXPIRES } });
    expect(Object.keys((byId.get(101) as Record<string, unknown>).askInvite as Record<string, unknown>).sort()).toEqual(["createdAt", "expiresAt", "state"]);
    expect(byId.get(102)).not.toHaveProperty("askInvite");
    expect(byId.get(103)).not.toHaveProperty("askInvite");
    expect(byId.has(104)).toBe(false);
    expect(JSON.stringify(response.body)).not.toMatch(/raw-secret|hash-secret|claimedByUserId|claimer|email|userId/);
  });
});
