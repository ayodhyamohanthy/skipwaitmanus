// D-057-session-gate, packet §4.4, §6 items 3-4 and §0b.5 (red first): every
// referrer action route refuses a personal-login session before any database
// function runs, and the route list is pinned against the router's source.
import express from "express";
import { readFileSync } from "node:fs";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { installReferrerSessionGate, REFERRER_ACTION_FUNCTIONS, REFERRER_ACTION_ROUTES, REFERRER_GATE_ALLOWLIST, type ReferrerSessionGateDeps } from "./referrerSessionGate";
import { createMemoryStepUpStore } from "./referrerStepUp";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";
import { registerProfileRoutes } from "./profileRoutes";

type Method = "get" | "post" | "put" | "patch" | "delete";
type Route = { method: Method; path: string; body: string };

/** Every route registered in a router source, with the text of its handler. */
function routesOf(source: string): Route[] {
  const pattern = /app\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g;
  const found = [...source.matchAll(pattern)];
  return found.map((match, index) => {
    const rest = source.slice(match.index, found[index + 1]?.index ?? source.length);
    // A handler ends where the next top-level statement of the register function starts.
    const end = rest.slice(1).search(/\n {2}(?:app\.|const |let |function |for |\/\/)/);
    return { method: match[1] as Method, path: match[2], body: end < 0 ? rest : rest.slice(0, end + 1) };
  });
}

/** Routes that call a referrer action function but are neither gated nor allowlisted with a reason. */
function unlistedReferrerRoutes(source: string): string[] {
  const listed = new Set([...REFERRER_ACTION_ROUTES, ...REFERRER_GATE_ALLOWLIST].map(route => `${route.method} ${route.path}`));
  return routesOf(source)
    .filter(route => REFERRER_ACTION_FUNCTIONS.some(fn => new RegExp(`\\b${fn}\\s*\\(|\\b${fn}\\b\\s*\\?\\?|\\.${fn}\\b`).test(route.body)))
    .map(route => `${route.method} ${route.path}`)
    .filter(key => !listed.has(key));
}

const privateSource = readFileSync(new URL("./privateReferralRoutes.ts", import.meta.url), "utf8");
const profileSource = readFileSync(new URL("./profileRoutes.ts", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");

describe("referrer action route list (§4.4 pin)", () => {
  it("gates or explicitly allowlists every route that calls a referrer action function", () => {
    expect(unlistedReferrerRoutes(privateSource)).toEqual([]);
    expect(unlistedReferrerRoutes(profileSource)).toEqual([]);
  });

  it("fails for a new referrer route that is on neither list", () => {
    const added = `${privateSource}\n  app.post("/api/company-referrals/:requestId/new-referrer-action", async (req, res) => { await deps.claimCompanyReferralRequest(1, 2); });\n`;
    expect(unlistedReferrerRoutes(added)).toEqual(["post /api/company-referrals/:requestId/new-referrer-action"]);
  });

  it("names each listed route exactly as the router registers it, and every allowlist entry has a reason", () => {
    const registered = new Set([...routesOf(privateSource), ...routesOf(profileSource)].map(route => `${route.method} ${route.path}`));
    for (const route of [...REFERRER_ACTION_ROUTES, ...REFERRER_GATE_ALLOWLIST]) expect(registered.has(`${route.method} ${route.path}`), `${route.method} ${route.path}`).toBe(true);
    for (const entry of REFERRER_GATE_ALLOWLIST) expect(entry.reason.length).toBeGreaterThan(10);
    expect(REFERRER_ACTION_ROUTES.map(route => `${route.method} ${route.path}`)).toEqual(expect.arrayContaining([
      "post /api/company-referrals/:requestId/claim",
      "post /api/company-referrals/:requestId/review",
      "post /api/company-referrals/:requestId/one-click-review",
      "get /api/referrer-review-links/:linkToken",
      "post /api/referrer-review-links/:linkToken/decision",
      "post /api/company-referrals/:requestId/save",
      "get /api/company-referrals/:requestId/preview",
      "get /api/company-referrals/inbox",
      "get /api/company-referrals/:requestId",
      "post /api/company-referrals/availability/open",
      "post /api/company-referrals/:requestId/progress",
      "post /api/opportunities",
      "post /api/opportunities/:id/renew",
      "post /api/opportunities/:id/close",
      "put /api/referrer-preferences",
      "put /api/referrer/slack-webhook",
      "get /api/referrer/slack-webhook",
      "delete /api/referrer/slack-webhook",
      "get /api/referrer-fast-track/me",
      "get /api/referrer-impact/me",
      "get /api/referrer/impact-summary",
      "get /api/referrer/home-bundle",
    ]));
  });

  it("is installed in the production server before the private and profile routes (switch only)", () => {
    const install = indexSource.indexOf("registerReferrerStepUpRoutes(app");
    expect(install).toBeGreaterThan(0);
    expect(install).toBeLessThan(indexSource.indexOf("registerPrivateReferralRoutes(app"));
    expect(install).toBeLessThan(indexSource.indexOf("registerProfileRoutes(app"));
  });
});

describe("every listed route refuses a WorkOS session of a verified referrer before any db call (§6 item 3)", () => {
  function harness(kind: "workos" | "code") {
    const spies = new Map<string, ReturnType<typeof vi.fn>>();
    const spy = (name: string) => { let fn = spies.get(name); if (!fn) { fn = vi.fn(async () => { throw new Error(`${name} reached`); }); spies.set(name, fn); } return fn; };
    const identity = kind === "workos"
      ? { account: { id: 1, openId: "user_P" }, sessionKey: "workos:session_S1" }
      : { account: { id: 2, openId: "workemail_ref@acme.com" }, sessionKey: "app:7c9e6679-7425-40de-944b-e07fc1f90ae7", sessionAmr: "work_email_otp" as const };
    const resolveIdentity = async () => identity;
    const deps = new Proxy({ resolveIdentity } as Record<string, unknown>, { get: (target, key: string) => key in target ? target[key] : key === "then" ? undefined : spy(key) });
    const gate: ReferrerSessionGateDeps = {
      store: createMemoryStepUpStore(),
      now: () => Date.now(),
      verifySessionCookie: async () => null,
      getAccountByOpenId: async openId => ({ id: openId === "user_P" ? 1 : 2, suspended: false, sessionsValidAfter: new Date(0) }),
      getProfile: async () => ({ accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date(0) }),
      isReferrerOfRequest: async () => true,
    };
    const app = express();
    app.use(express.json());
    installReferrerSessionGate(app, { resolveIdentity, gate });
    registerPrivateReferralRoutes(app, deps as unknown as PrivateReferralRouteDeps);
    registerProfileRoutes(app, deps as unknown as Parameters<typeof registerProfileRoutes>[1]);
    return { app, spies };
  }
  const concrete = (path: string) => path.replace(":requestId", "701").replace(":linkToken", "tok_abcdefghijklmnop").replace(":id", "9");

  it.each(REFERRER_ACTION_ROUTES.map(route => [route.method, route.path] as const))("%s %s answers 403 work_email_code_required", async (method, path) => {
    const { app, spies } = harness("workos");
    const response = await request(app)[method](concrete(path)).send({});
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Confirm your work email with a code to continue.", code: "work_email_code_required" });
    for (const [name, fn] of spies) expect(fn, name).not.toHaveBeenCalled();
  });

  it.each(REFERRER_ACTION_ROUTES.map(route => [route.method, route.path] as const))("%s %s passes the gate in a code session", async (method, path) => {
    const { app } = harness("code");
    const response = await request(app)[method](concrete(path)).send({});
    expect(response.body?.code).not.toBe("work_email_code_required");
  });
});
