// @vitest-environment node
// D-057-session-gate §0b.8a (red first): the e2e fixture's seeded referrer gets
// referrer access only through the real step-up send/verify handlers, with the
// code captured locally instead of a provider call. The controls:
//   1. the plain seeded test_seed session is refused (403 + /access codeRequired);
//   2. the same account and the same session, after that proof, passes;
//   3. another session, another account, a revoked or an expired proof stays refused;
// and the harness itself is local-only and unreachable from production code.
import express, { type Request } from "express";
import { parse as parseCookieHeader } from "cookie";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("./db", async importOriginal => ({ ...(await importOriginal<typeof import("./db")>()), getDb: async () => undefined }));

import { isLocalSeedHarness, stepUpSeededReferrer, SEED_ACCOUNTS } from "../scripts/seed-test-accounts";
import { registerReferrerStepUpRoutes, type ReferrerStepUpRouteDeps } from "./referrerStepUpRoutes";
import { createMemoryStepUpStore, type StepUpProfile } from "./referrerStepUp";
import type { GateIdentity, ReferrerSessionGateDeps } from "./referrerSessionGate";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";
import { STEP_UP_PROOF_TTL_MS } from "../shared/referrerStepUp";

const REFERRER = SEED_ACCOUNTS.find(account => account.openId === "test_referrer_qa")!;
const codeRequired = { error: "Confirm your work email with a code to continue.", code: "work_email_code_required" };

function world() {
  let now = Date.UTC(2026, 9, 31, 4, 0, 0);
  const accounts = new Map([
    ["test_referrer_qa", { id: 7, openId: "test_referrer_qa", suspended: false, sessionsValidAfter: new Date(now - 86_400_000) }],
    ["test_seeker_qa", { id: 8, openId: "test_seeker_qa", suspended: false, sessionsValidAfter: new Date(now - 86_400_000) }],
    ["other_referrer", { id: 9, openId: "other_referrer", suspended: false, sessionsValidAfter: new Date(now - 86_400_000) }],
  ]);
  const profiles = new Map<number, StepUpProfile>([
    [7, { accountType: "referrer", workEmailDomain: "acme.example", workEmailVerifiedAt: new Date(now - 3_600_000) }],
    [9, { accountType: "referrer", workEmailDomain: "acme.example", workEmailVerifiedAt: new Date(now - 3_600_000) }],
  ]);
  // The seeded app_session_id cookies, each a test_seed session with its own ssid and no amr.
  const sessions = new Map<string, GateIdentity>([
    ["seed-referrer", { account: { id: 7, openId: "test_referrer_qa" }, sessionKey: "app:0f8fad5b-d9cb-469f-a165-70867728950e" }],
    ["seed-referrer-second", { account: { id: 7, openId: "test_referrer_qa" }, sessionKey: "app:7c9e6679-7425-40de-944b-e07fc1f90ae7" }],
    ["seed-seeker", { account: { id: 8, openId: "test_seeker_qa" }, sessionKey: "app:16fd2706-8baf-433b-82eb-8c7fada847da" }],
    ["other-referrer", { account: { id: 9, openId: "other_referrer" }, sessionKey: "app:886313e1-3b8a-4372-9b90-0c9aee199e5d" }],
  ]);
  const store = createMemoryStepUpStore();
  const activity: string[] = [];
  const gate: ReferrerSessionGateDeps = {
    store,
    now: () => now,
    // No seeded cookie carries amr, so path (A) never applies to any of them.
    verifySessionCookie: async token => { const identity = token ? sessions.get(token) : undefined; return identity ? { openId: identity.account.openId } : null; },
    getAccountByOpenId: async openId => accounts.get(openId),
    getProfile: async userId => profiles.get(userId),
    isReferrerOfRequest: async () => true,
  };
  // The same resolver for the harness and the server, from the request's own cookie.
  const resolveIdentity = async (req: Request) => sessions.get(parseCookieHeader(req.headers.cookie ?? "").app_session_id ?? "");
  const routeDeps: Omit<ReferrerStepUpRouteDeps, "sendCode"> = {
    resolveIdentity, gate, now: () => now,
    consumeLimits: async () => undefined,
    lock: { activeUntil: async () => null, recordFailure: async () => undefined },
    recordActivity: async entry => { activity.push(`${entry.action}:${entry.outcome}`); },
    captureError: () => undefined,
  };
  const claim = vi.fn(async (_userId: number, requestId: number) => ({ requestId, claimed: true, companyDomain: "acme.example", jobSeekerId: undefined, revision: 1, replayed: true }));
  // The e2e server stand-in: the same gate wiring and the real private routes.
  const server = express();
  server.use(express.json());
  registerReferrerStepUpRoutes(server, { ...routeDeps, sendCode: async () => { throw new Error("the server must not be asked to deliver in this test"); } });
  registerPrivateReferralRoutes(server, {
    resolveIdentity: async (req: Request) => { const identity = await resolveIdentity(req); return identity ? { ...identity, primaryEmail: null, emailAddresses: [] } : undefined; },
    listCompanyReferralInbox: async () => [],
    listCompanyReferralInboxByState: async () => [],
    listJobSeekerCompanyReferrals: async () => [],
    recordActivity: async () => undefined,
    getBlockedReferralRequestIds: async () => new Set<number>(),
    resolveCompanyIdentities: async () => new Map(),
    getVerifiedWorkEmailAccess: async (userId: number) => profiles.get(userId)?.workEmailDomain ? { workEmailDomain: profiles.get(userId)!.workEmailDomain! } : undefined,
    claimCompanyReferralRequest: claim,
  } as unknown as PrivateReferralRouteDeps);
  const as = (cookie: string) => ({
    claim: () => request(server).post("/api/company-referrals/701/claim").set("Cookie", `app_session_id=${cookie}`).send({}),
    access: () => request(server).get("/api/company-referrals/access").set("Cookie", `app_session_id=${cookie}`),
  });
  return { as, store, gate, routeDeps, accounts, activity, claim, advance: (ms: number) => { now += ms; }, now: () => now };
}

describe("control 1: the plain seeded test_seed session is refused", () => {
  it("answers 403 work_email_code_required and /access says codeRequired", async () => {
    const w = world();
    const refused = await w.as("seed-referrer").claim();
    expect(refused.status).toBe(403);
    expect(refused.body).toEqual(codeRequired);
    expect((await w.as("seed-referrer").access()).body.codeRequired).toBe(true);
    expect(w.claim).not.toHaveBeenCalled();
    expect(w.store.rows()).toEqual([]);
  });
});

describe("control 2: the same account and session, after the real send/verify, passes", () => {
  it("drives send then verify with the locally captured code, and the session then passes", async () => {
    const w = world();
    const proof = await stepUpSeededReferrer({ cookie: "seed-referrer", email: REFERRER.email }, w.routeDeps, () => undefined);
    expect(proof.deliveredTo).toBe(REFERRER.email);
    expect(Date.parse(proof.expiresAt)).toBe(w.now() + STEP_UP_PROOF_TTL_MS);
    // One challenge row, consumed into a proof bound to this account and this session only.
    expect(w.store.rows()).toHaveLength(1);
    expect(w.store.rows()[0]).toMatchObject({ userId: 7, workEmailDomain: "acme.example", revokedAt: null });
    expect(w.store.rows()[0].verifiedAt).not.toBeNull();
    expect(w.activity).toEqual(["work_email.step_up_sent:success", "work_email.step_up_verified:success"]);
    const passed = await w.as("seed-referrer").claim();
    expect(passed.status).toBe(200);
    expect(w.claim).toHaveBeenCalledWith(7, 701);
    expect((await w.as("seed-referrer").access()).body.codeRequired).toBe(false);
  });

  it("refuses to proceed when the send or verify is refused, instead of writing anything by hand", async () => {
    const w = world();
    await expect(stepUpSeededReferrer({ cookie: "no-such-session", email: REFERRER.email }, w.routeDeps, () => undefined)).rejects.toThrow(/send answered 401/);
    await expect(stepUpSeededReferrer({ cookie: "seed-referrer", email: "someone@globex.example" }, w.routeDeps, () => undefined)).rejects.toThrow(/send answered 400/);
    await expect(stepUpSeededReferrer({ cookie: "seed-seeker", email: "qa.seeker@example.com" }, w.routeDeps, () => undefined)).rejects.toThrow(/send answered 403/);
    expect(w.store.rows().filter(row => row.verifiedAt)).toEqual([]);
    expect((await w.as("seed-referrer").claim()).status).toBe(403);
  });
});

describe("control 3: another session, another account, revoked or expired stays refused", () => {
  const afterProof = async () => {
    const w = world();
    await stepUpSeededReferrer({ cookie: "seed-referrer", email: REFERRER.email }, w.routeDeps, () => undefined);
    expect((await w.as("seed-referrer").claim()).status).toBe(200);
    return w;
  };

  it("another session of the same seeded account is refused", async () => {
    const w = await afterProof();
    expect((await w.as("seed-referrer-second").claim()).body).toEqual(codeRequired);
    expect((await w.as("seed-referrer-second").access()).body.codeRequired).toBe(true);
  });

  it("another account (a second referrer at the same company, and the seeded seeker) is refused", async () => {
    const w = await afterProof();
    expect((await w.as("other-referrer").claim()).body).toEqual(codeRequired);
    expect((await w.as("seed-seeker").claim()).body).toEqual(codeRequired);
  });

  it("a revoked proof (logout) is refused", async () => {
    const w = await afterProof();
    w.advance(1000);
    await w.store.revokeForUser(7, "logout", new Date(w.now()));
    expect((await w.as("seed-referrer").claim()).body).toEqual(codeRequired);
  });

  it("a revoked session chain (sessionsValidAfter moved) is refused", async () => {
    const w = await afterProof();
    w.advance(1000);
    w.accounts.get("test_referrer_qa")!.sessionsValidAfter = new Date(w.now());
    w.advance(1000);
    expect((await w.as("seed-referrer").claim()).body).toEqual(codeRequired);
  });

  it("an expired proof (older than 12 hours) is refused", async () => {
    const w = await afterProof();
    w.advance(STEP_UP_PROOF_TTL_MS + 1000);
    expect((await w.as("seed-referrer").claim()).body).toEqual(codeRequired);
    expect((await w.as("seed-referrer").access()).body.codeRequired).toBe(true);
  });
});

describe("the harness is local-only and cannot change production authorization", () => {
  it("runs only with NODE_ENV=test against a localhost database", () => {
    expect(isLocalSeedHarness({ NODE_ENV: "test", DATABASE_URL: "mysql://root:e2e@127.0.0.1:3306/skipwait" })).toBe(true);
    expect(isLocalSeedHarness({ NODE_ENV: "test", DATABASE_URL: "mysql://root:e2e@localhost:3306/skipwait" })).toBe(true);
    expect(isLocalSeedHarness({ NODE_ENV: "production", DATABASE_URL: "mysql://root:e2e@127.0.0.1:3306/skipwait" })).toBe(false);
    expect(isLocalSeedHarness({ DATABASE_URL: "mysql://root:e2e@127.0.0.1:3306/skipwait" })).toBe(false);
    expect(isLocalSeedHarness({ NODE_ENV: "test", DATABASE_URL: "mysql://u:p@db.example.com:3306/skipwait" })).toBe(false);
    expect(isLocalSeedHarness({ NODE_ENV: "test" })).toBe(false);
  });

  it("keeps test_seed a test identity: no amr, no relabel, no alias", () => {
    const source = readFileSync(new URL("../scripts/seed-test-accounts.ts", import.meta.url), "utf8");
    expect(source).toContain('loginMethod: "test_seed"');
    expect(source).not.toMatch(/amr\s*:/);
    expect(source).not.toMatch(/work_email_otp|workemail_|saveVerifiedWorkEmail|resolveLoginIdentity|verifiedLoginAliases|referrerStepUps/);
  });

  it("no server, shared or client source imports the seeder", () => {
    const root = new URL("..", import.meta.url).pathname;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) { if (name !== "node_modules") walk(path); continue; }
        if (!/\.(ts|tsx|mjs|js)$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
        if (readFileSync(path, "utf8").includes("seed-test-accounts")) offenders.push(path.slice(root.length));
      }
    };
    for (const dir of ["server", "shared", "client/src"]) walk(join(root, dir));
    expect(offenders).toEqual([]);
  });
});
