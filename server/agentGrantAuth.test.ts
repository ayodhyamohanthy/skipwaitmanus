// D-178.grant (D-290 R1): one verifier for both agent transports. An OAuth
// connection is a D-141 grant with a `swa_` key; a legacy `sw_` token keeps
// today's behaviour. Scope, expiry and pause-all are checked here, once, so
// MCP and REST can never disagree.
import { createHash } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { AGENT_ERROR, AGENT_KEY_PATTERN, AGENT_LIMIT_DEFAULTS } from "../shared/seekerAgents";
import { AGENT_BEARER_RE, mintAgentKey, resolveAgentBearer, type AgentBearerStore, type AgentGrantFacts } from "./agentGrantAuth";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const NOW = new Date("2026-11-24T09:00:00.000Z");
const GRANT_KEY = mintAgentKey();
const LEGACY_KEY = `sw_${"a".repeat(32)}`;

const activeGrant = (over: Partial<AgentGrantFacts> = {}): AgentGrantFacts => ({
  id: 41, userId: 7, name: "Claude (self-declared)", canLookup: true, canDraft: true,
  expiresAt: new Date("2026-12-01T09:00:00.000Z"), revokedAt: null, ...over,
});

function setup(over: Partial<AgentBearerStore> = {}, allowed = true) {
  const touched: Array<{ id: number; at: Date }> = [];
  const store: AgentBearerStore = {
    findGrantByKeyHash: async hash => (hash === sha256(GRANT_KEY) ? activeGrant() : undefined),
    isPaused: async () => false,
    touchGrantLastUsed: async (id, at) => { touched.push({ id, at }); },
    verifyLegacyBearer: async hash => (hash === sha256(LEGACY_KEY) ? { userId: 7, tokenId: 3 } : null),
    ...over,
  };
  return { store, touched, resolve: (token: string) => resolveAgentBearer(token, { store, allowed: () => allowed, now: () => NOW.getTime() }) };
}

describe("agent key format", () => {
  it("mints keys the shared pattern accepts and never repeats one", () => {
    const keys = new Set(Array.from({ length: 50 }, () => mintAgentKey()));
    expect(keys.size).toBe(50);
    for (const key of keys) {
      expect(AGENT_KEY_PATTERN.test(key)).toBe(true);
      expect(AGENT_BEARER_RE.test(key)).toBe(true);
    }
  });
  it("accepts the legacy sw_ bearer shape and nothing else", () => {
    expect(AGENT_BEARER_RE.test(LEGACY_KEY)).toBe(true);
    for (const bad of ["", "sw_short", `swa_${"A".repeat(64)}`, `swa_${"a".repeat(63)}`, `xv_${"a".repeat(32)}`, `Bearer ${GRANT_KEY}`]) expect(AGENT_BEARER_RE.test(bad)).toBe(false);
  });
});

describe("one verifier for both transports", () => {
  it("resolves an active grant with its scopes and records the use", async () => {
    const { touched, resolve } = setup();
    const result = await resolve(GRANT_KEY);
    expect(result).toMatchObject({ ok: true, capKey: 41, principal: { kind: "grant", grantId: 41, userId: 7, canLookup: true, canDraft: true } });
    expect(touched).toEqual([{ id: 41, at: NOW }]);
  });
  it("refuses a malformed or unknown key before any grant is trusted", async () => {
    const { resolve } = setup();
    for (const bad of ["nope", `swa_${"b".repeat(64)}`]) {
      const result = await resolve(bad);
      expect(result).toMatchObject({ ok: false, status: 401 });
    }
  });
  it("refuses a revoked grant", async () => {
    const { resolve } = setup({ findGrantByKeyHash: async () => activeGrant({ revokedAt: NOW }) });
    expect(await resolve(GRANT_KEY)).toMatchObject({ ok: false, status: 401, error: AGENT_ERROR.revoked });
  });
  it("refuses an expired grant at the boundary", async () => {
    const { resolve } = setup({ findGrantByKeyHash: async () => activeGrant({ expiresAt: new Date(NOW.getTime() - 1) }) });
    expect(await resolve(GRANT_KEY)).toMatchObject({ ok: false, status: 401, error: AGENT_ERROR.expired });
  });
  it("refuses every grant of a paused seeker, while a legacy token keeps today's behaviour", async () => {
    const { resolve } = setup({ isPaused: async () => true });
    expect(await resolve(GRANT_KEY)).toMatchObject({ ok: false, status: 403, error: AGENT_ERROR.paused });
    // D-290 R1/A4: a legacy sw_ token keeps exactly today's behaviour.
    expect(await resolve(LEGACY_KEY)).toMatchObject({ ok: true, principal: { kind: "legacy" } });
  });
  it("answers Not found for an owner outside the allow-list on both shapes", async () => {
    const { resolve } = setup({}, false);
    expect(await resolve(GRANT_KEY)).toMatchObject({ ok: false, status: 404, error: "Not found" });
    expect(await resolve(LEGACY_KEY)).toMatchObject({ ok: false, status: 404, error: "Not found" });
  });
  it("keeps a legacy sw_ token working, keyed by its token id", async () => {
    const { resolve } = setup();
    const result = await resolve(LEGACY_KEY);
    expect(result).toMatchObject({ ok: true, capKey: 3, principal: { kind: "legacy", userId: 7, tokenId: 3 } });
    expect(result.ok && "grant" in result.principal && (result.principal as { canDraft?: boolean }).canDraft).toBeFalsy();
  });
  it("refuses an unknown legacy token", async () => {
    const { resolve } = setup();
    expect(await resolve(`sw_${"c".repeat(32)}`)).toMatchObject({ ok: false, status: 401 });
  });
});

describe("an agent key is never a session", () => {
  it("authenticates none of the session, money or referrer routes", async () => {
    const { resolve } = setup();
    const app = express();
    // A session route reads only the session cookie, exactly like resolveIdentity.
    const sessionGuarded = (_req: express.Request, res: express.Response) => res.status(401).json({ error: "Sign in first" });
    for (const path of [
      "/api/credits/summary", "/api/credits/ledger", "/api/chargebee/banded/offer", "/api/billing/state",
      "/api/auth/workos/sign-in", "/api/auth/otp/send", "/api/referrer/impact-card", "/api/referrer/step-up/send",
      "/api/company-referrals", "/api/seeker/agents", "/api/admin/payments/review", "/api/documents/1", "/api/dms",
    ]) app.get(path, sessionGuarded);
    const result = await resolve(GRANT_KEY);
    expect(result.ok).toBe(true);
    for (const path of ["/api/credits/summary", "/api/credits/ledger", "/api/chargebee/banded/offer", "/api/billing/state", "/api/auth/workos/sign-in", "/api/auth/otp/send", "/api/referrer/impact-card", "/api/referrer/step-up/send", "/api/company-referrals", "/api/seeker/agents", "/api/admin/payments/review", "/api/documents/1", "/api/dms"]) {
      const res = await request(app).get(path).set("Authorization", `Bearer ${GRANT_KEY}`).set("Cookie", `app_session_id=${GRANT_KEY}`);
      expect(res.status, path).toBe(401);
    }
  });
});

describe("defaults an OAuth grant starts from", () => {
  it("starts at the shared D-141 defaults until the seeker changes them", () => {
    expect(AGENT_LIMIT_DEFAULTS).toEqual({ creditsPerAsk: 10, creditsPerDay: 20, creditsPerWeek: 50, asksPerDay: 3 });
  });
});
