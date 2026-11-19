// D-057-session-gate (red first): the gate and the guarded handlers must agree on
// what a request id is. The handlers read `Number(req.params.requestId)`, which
// takes "0x2bd", "701.0", "+701", "7.01e2" and " 701" as request 701. A gate that
// let those spellings through as "not an id" would hand a plain (no-proof)
// session the referrer action for request 701.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { installReferrerSessionGate, type ReferrerSessionGateDeps } from "./referrerSessionGate";
import { createMemoryStepUpStore } from "./referrerStepUp";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

const codeRequired = { error: "Confirm your work email with a code to continue.", code: "work_email_code_required" };

function harness() {
  const spies = new Map<string, ReturnType<typeof vi.fn>>();
  const spy = (name: string) => { let fn = spies.get(name); if (!fn) { fn = vi.fn(async (_userId?: number, requestId?: unknown) => ({ requestId, claimed: true, companyDomain: "acme.com", revision: 1, replayed: true, status: "referred", changed: true })); spies.set(name, fn); } return fn; };
  // A verified referrer signed in with a plain session: no `amr`, no step-up proof.
  const identity = { account: { id: 1, openId: "user_P" }, sessionKey: "workos:session_S1" };
  const resolveIdentity = async () => identity;
  const deps = new Proxy({ resolveIdentity, getBlockedReferralRequestIds: async () => new Set<number>(), isRequestBlocked: async () => false } as Record<string, unknown>, {
    get: (target, key: string) => key in target ? target[key] : key === "then" ? undefined : spy(key),
  });
  const gate: ReferrerSessionGateDeps = {
    store: createMemoryStepUpStore(),
    now: () => Date.now(),
    verifySessionCookie: async () => null,
    getAccountByOpenId: async () => ({ id: 1, suspended: false, sessionsValidAfter: new Date(0) }),
    getProfile: async () => ({ accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date(0) }),
    isReferrerOfRequest: async (userId, requestId) => userId === 1 && requestId === 701,
  };
  const app = express();
  app.use(express.json());
  installReferrerSessionGate(app, { resolveIdentity, gate });
  registerPrivateReferralRoutes(app, deps as unknown as PrivateReferralRouteDeps);
  return { app, spies };
}

// Every spelling below is request 701 to Number(); none matches /^\d+$/.
const ALIASES = ["0x2bd", "701.0", "+701", "7.01e2", "%20701", "0b1010111101", "0o1275"];
const ACTIONS: Array<{ method: "get" | "post"; path: (id: string) => string }> = [
  { method: "post", path: id => `/api/company-referrals/${id}/claim` },
  { method: "post", path: id => `/api/company-referrals/${id}/review` },
  { method: "post", path: id => `/api/company-referrals/${id}/one-click-review` },
  { method: "post", path: id => `/api/company-referrals/${id}/save` },
  { method: "post", path: id => `/api/company-referrals/${id}/progress` },
  { method: "get", path: id => `/api/company-referrals/${id}/preview` },
  { method: "get", path: id => `/api/company-referrals/${id}` },
];

describe("the gate guards every request-id spelling the handler accepts", () => {
  it("each alias really is request 701 to the handler's own parse", () => {
    for (const alias of ALIASES) expect(Number(decodeURIComponent(alias)), alias).toBe(701);
  });

  for (const action of ACTIONS) {
    it.each(ALIASES)(`${action.method.toUpperCase()} ${action.path(":id")} with %s answers 403 before the handler runs`, async alias => {
      const { app, spies } = harness();
      const response = await request(app)[action.method](action.path(alias)).send({ decision: "approved", status: "referred", declineReason: "role_mismatch" });
      expect(response.status).toBe(403);
      expect(response.body).toEqual(codeRequired);
      for (const [name, fn] of spies) expect(fn, name).not.toHaveBeenCalled();
    });
  }

  it("still gates the canonical id, and leaves the static sibling paths to their own routes", async () => {
    const { app } = harness();
    expect((await request(app).post("/api/company-referrals/701/claim").send({})).status).toBe(403);
    // /api/company-referrals/inbox has its own gate entry; "access" is the verdict, never a request id.
    expect((await request(app).get("/api/company-referrals/inbox")).body).toEqual(codeRequired);
    expect((await request(app).get("/api/company-referrals/access")).body?.code).not.toBe("work_email_code_required");
  });

  it("a value no parse reads as a positive id reaches the handler's own 400, not an action", async () => {
    const { app, spies } = harness();
    for (const bad of ["abc", "0", "-1", "Infinity"]) {
      const response = await request(app).post(`/api/company-referrals/${bad}/claim`).send({});
      expect([400, 403], bad).toContain(response.status);
    }
    expect(spies.get("claimCompanyReferralRequest") ?? vi.fn()).not.toHaveBeenCalled();
  });
});
