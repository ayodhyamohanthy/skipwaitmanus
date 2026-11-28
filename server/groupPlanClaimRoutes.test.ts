// GROUP-claim routes (§6.6): the deep link resolves for display, the signed-in POST binds.
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { GROUP_CLAIM_TOKEN_TTL_MS } from "./groupPlanClaim";
import { registerGroupClaimRoutes, type GroupClaimRouteDeps } from "./groupPlanClaimRoutes";

const NOW = new Date("2026-11-25T10:00:00.000Z");
const RAW = "gpc_secret_token_value";
const EMAIL = "asha@example.test";

function setup(over: Partial<GroupClaimRouteDeps> = {}, signedIn = true) {
  const activity: Array<Record<string, unknown>> = [];
  const allocation = {
    id: 21, groupPurchaseId: 7, buyerUserId: 3, recipientEmail: EMAIL, status: "paid" as const,
    canonicalPersonId: null, claimedByUserId: null, claimedAt: null,
  };
  const state = { allocation: { ...allocation }, consumed: [] as string[] };
  const deps: GroupClaimRouteDeps = {
    store: {
      findAllocationByEmail: async () => undefined,
      getById: async () => state.allocation as never,
      bindClaim: async ({ canonicalPersonId, userId, now }) => {
        if (state.allocation.status !== "paid" || state.allocation.canonicalPersonId != null) return false;
        Object.assign(state.allocation, { status: "claimed", canonicalPersonId, claimedByUserId: userId, claimedAt: now });
        return true;
      },
      accountState: async () => ({ suspended: false, deleted: false }),
      readToken: async () => ({ allocationId: 21, expiresAt: new Date(NOW.getTime() + GROUP_CLAIM_TOKEN_TTL_MS), consumedAt: null }),
      consumeToken: async hash => { state.consumed.push(hash); return true; },
      recordEvent: async () => undefined,
    },
    resolveClaimCaller: async () => (signedIn ? { userId: 11, canonicalPersonId: 5, verifiedEmails: [EMAIL] } : undefined),
    now: () => NOW.getTime(),
    recordActivity: async input => { activity.push(input); },
    ...over,
  };
  const app = express();
  registerGroupClaimRoutes(app, deps);
  return { app, deps, state, activity };
}

describe("GET resolves without consuming", () => {
  it("returns ids only: no address, no token, no session state", async () => {
    const { app } = setup();
    const res = await request(app).get(`/api/group/claim/${RAW}`);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.body).toEqual({ allocationId: 21, returnPath: "/claim", signInRequired: true });
    expect(JSON.stringify(res.body)).not.toContain(EMAIL);
    expect(JSON.stringify(res.body)).not.toContain(RAW);
  });

  it("answers a generic 404 for an unknown, used or expired token, and never echoes the token", async () => {
    const readers = [
      async () => undefined,
      async () => ({ allocationId: 21, expiresAt: new Date(NOW.getTime() + 1000), consumedAt: NOW }),
      async () => ({ allocationId: 21, expiresAt: new Date(NOW.getTime() - 1), consumedAt: null }),
    ];
    for (const readToken of readers) {
      const base = setup();
      const app = express();
      registerGroupClaimRoutes(app, { ...base.deps, store: { ...base.deps.store, readToken } });
      const res = await request(app).get(`/api/group/claim/${RAW}`);
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain(RAW);
    }
  });
});

describe("POST binds the signed-in candidate", () => {
  it("needs a signed-in caller and hands back a token-free return path", async () => {
    const { app } = setup({}, false);
    const res = await request(app).post(`/api/group/claim/${RAW}`).send({});
    expect(res.status).toBe(401);
    expect(res.body.returnPath).toBe("/claim");
    expect(JSON.stringify(res.body)).not.toContain(RAW);
  });

  it("binds once and reports the same person's second attempt as already claimed", async () => {
    const { app, state } = setup();
    const first = await request(app).post(`/api/group/claim/${RAW}`).send({});
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true, allocationId: 21, alreadyClaimed: false });
    expect(state.allocation.canonicalPersonId).toBe(5);
    expect(state.consumed).toHaveLength(1);
    const again = await request(app).post(`/api/group/claim/${RAW}`).send({});
    expect(again.status).toBe(200);
    expect(again.body.alreadyClaimed).toBe(true);
  });

  it("refuses a caller whose verified alias is not the allocation's address", async () => {
    const { app } = setup({ resolveClaimCaller: async () => ({ userId: 12, canonicalPersonId: 6, verifiedEmails: ["other@example.test"] }) });
    const res = await request(app).post(`/api/group/claim/${RAW}`).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("email_mismatch");
    expect(JSON.stringify(res.body)).not.toContain(EMAIL);
  });

  it("records the refusal by id and reason, never the address or the token", async () => {
    const { app, activity } = setup({ resolveClaimCaller: async () => ({ userId: 12, canonicalPersonId: 6, verifiedEmails: [] }) });
    await request(app).post(`/api/group/claim/${RAW}`).send({});
    const logged = JSON.stringify(activity);
    expect(logged).toContain("group.claim.denied");
    expect(logged).not.toContain(EMAIL);
    expect(logged).not.toContain(RAW);
  });
});
