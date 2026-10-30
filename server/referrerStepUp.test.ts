// D-057-session-gate, packet docs/plans/D-057-session-gate.md §0b.7 (red first).
// The in-session work-email step-up: a Google-first referrer confirms the work
// email they verified on /verify with a fresh code inside the same session, and
// the referrer gate then passes for that account and that session only.
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const identityFns = vi.hoisted(() => ({
  resolveLoginIdentity: vi.fn(),
  saveVerifiedWorkEmail: vi.fn(),
  completeWorkEmailOtpEnrollment: vi.fn(),
  upsertUser: vi.fn(),
}));
// The step-up must never reach an identity, alias, link or merge function. Every
// one of them is a spy here; the route deps below never hand the router any db.
vi.mock("./db", async importOriginal => ({ ...(await importOriginal<typeof import("./db")>()), ...identityFns, getDb: async () => undefined }));

import { registerReferrerStepUpRoutes, type ReferrerStepUpRouteDeps } from "./referrerStepUpRoutes";
import { createMemoryStepUpStore, type StepUpProfile } from "./referrerStepUp";
import type { ReferrerSessionGateDeps } from "./referrerSessionGate";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";
import { OTP_LOCK_AFTER_FAILURES } from "./otpPolicy";
import { STEP_UP_CODE_TTL_MS, STEP_UP_PROOF_TTL_MS } from "../shared/referrerStepUp";

const T0 = Date.UTC(2026, 9, 30, 9, 0, 0);
type Account = { id: number; openId: string; suspended: boolean; sessionsValidAfter: Date };
type TestIdentity = { account: { id: number; openId: string }; sessionKey?: string; sessionAmr?: "work_email_otp" };

function world() {
  let now = T0 + 60 * 60_000;
  const accounts = new Map<string, Account>([
    // P: Google-first (WorkOS) account, verified acme.com on /verify, no alias.
    ["user_P", { id: 1, openId: "user_P", suspended: false, sessionsValidAfter: new Date(T0 - 86_400_000) }],
    // Q: the second account the standalone code login made for the same address.
    ["workemail_ref@acme.com", { id: 2, openId: "workemail_ref@acme.com", suspended: false, sessionsValidAfter: new Date(T0 - 86_400_000) }],
    // R: a colleague at the same company.
    ["user_R", { id: 3, openId: "user_R", suspended: false, sessionsValidAfter: new Date(T0 - 86_400_000) }],
    // S: a seeker with no work email.
    ["user_S", { id: 4, openId: "user_S", suspended: false, sessionsValidAfter: new Date(T0 - 86_400_000) }],
  ]);
  const profiles = new Map<number, StepUpProfile>([
    [1, { accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date(T0) }],
    [2, { accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date(T0) }],
    [3, { accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date(T0) }],
  ]);
  const byId = (id: number) => [...accounts.values()].find(account => account.id === id)!;
  const identities = new Map<string, TestIdentity>([
    ["P-S1", { account: { id: 1, openId: "user_P" }, sessionKey: "workos:session_S1" }],
    ["P-S2", { account: { id: 1, openId: "user_P" }, sessionKey: "workos:session_S2" }],
    ["P-app", { account: { id: 1, openId: "user_P" }, sessionKey: "app:0f8fad5b-d9cb-469f-a165-70867728950e" }],
    ["P-bearer", { account: { id: 1, openId: "user_P" }, sessionKey: "workos:session_S1" }],
    ["R-S9", { account: { id: 3, openId: "user_R" }, sessionKey: "workos:session_S9" }],
    ["Q-code", { account: { id: 2, openId: "workemail_ref@acme.com" }, sessionKey: "app:7c9e6679-7425-40de-944b-e07fc1f90ae7", sessionAmr: "work_email_otp" }],
    ["S-S5", { account: { id: 4, openId: "user_S" }, sessionKey: "workos:session_S5" }],
  ]);
  // The app_session_id cookies the gate may verify (§0 item 8): token -> session.
  const cookies = new Map<string, { openId: string; amr?: "work_email_otp" }>([
    ["code-cookie-P", { openId: "user_P", amr: "work_email_otp" }],
    ["code-cookie-Q", { openId: "workemail_ref@acme.com", amr: "work_email_otp" }],
    ["plain-cookie-P", { openId: "user_P" }],
  ]);
  const store = createMemoryStepUpStore();
  const sent: Array<{ to: string; code: string }> = [];
  const activity: Array<{ action: string; outcome?: string; metadata?: Record<string, unknown> }> = [];
  const failures = new Map<string, number>();
  const locks = new Map<string, number>();
  const gate: ReferrerSessionGateDeps = {
    store,
    now: () => now,
    verifySessionCookie: async token => (token ? cookies.get(token) ?? null : null),
    getAccountByOpenId: async openId => accounts.get(openId),
    getProfile: async userId => profiles.get(userId),
    isReferrerOfRequest: async (userId, requestId) => userId === 1 && requestId === 701,
  };
  const deps: ReferrerStepUpRouteDeps = {
    resolveIdentity: async req => identities.get(String(req.header("x-test-user"))),
    gate,
    now: () => now,
    sendCode: async ({ to, code }) => { sent.push({ to, code }); return { sent: true, reason: "sent" }; },
    consumeLimits: async () => undefined,
    lock: {
      activeUntil: async (key, ip, at) => { const until = locks.get(`${key}|${ip}`); return until && until > at ? new Date(until) : null; },
      recordFailure: async (key, ip, at) => { const count = (failures.get(`${key}|${ip}`) ?? 0) + 1; failures.set(`${key}|${ip}`, count); if (count >= OTP_LOCK_AFTER_FAILURES) locks.set(`${key}|${ip}`, at + 15 * 60_000); },
    },
    recordActivity: async entry => { activity.push(entry); },
    captureError: () => undefined,
  };
  // Referrer and seeker functions behind the private routes: spies keyed by account.
  const route = {
    claimCompanyReferralRequest: vi.fn(async (userId: number, requestId: number) => ({ requestId, claimed: true, companyDomain: "acme.com", jobSeekerId: undefined, revision: 1, replayed: true })),
    listCompanyReferralInboxByState: vi.fn(async (userId: number, scope: string) => userId === 1 && scope === "completed" ? [{ id: 501, companyDomain: "acme.com", status: "approved" }, { id: 502, companyDomain: "acme.com", status: "referred" }] : userId === 1 ? [{ id: 503, companyDomain: "acme.com", status: "claimed" }] : []),
    listJobSeekerCompanyReferrals: vi.fn(async (userId: number) => userId === 1 ? [{ id: 900, companyDomain: "globex.com", status: "pending", createdAt: new Date(T0).toISOString() }] : []),
    getVerifiedWorkEmailAccess: vi.fn(async (userId: number) => profiles.get(userId)?.workEmailDomain ? { workEmailDomain: profiles.get(userId)!.workEmailDomain! } : undefined),
    updateReferralProgress: vi.fn(async (_userId: number, input: { status: string }) => ({ status: input.status, changed: true })),
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { const cookie = req.header("x-test-cookie"); if (cookie) req.headers.cookie = `app_session_id=${cookie}`; next(); });
  registerReferrerStepUpRoutes(app, deps);
  registerPrivateReferralRoutes(app, {
    resolveIdentity: async req => identities.get(String(req.header("x-test-user"))),
    listCompanyReferralInbox: async () => [],
    recordActivity: async () => undefined,
    getBlockedReferralRequestIds: async () => new Set<number>(),
    resolveCompanyIdentities: async () => new Map(),
    ...route,
  } as unknown as PrivateReferralRouteDeps);
  const as = (who: string, cookie?: string) => ({
    get: (path: string) => { const call = request(app).get(path).set("x-test-user", who); return cookie ? call.set("x-test-cookie", cookie) : call; },
    post: (path: string, body: object = {}) => { const call = request(app).post(path).set("x-test-user", who); return (cookie ? call.set("x-test-cookie", cookie) : call).send(body); },
  });
  const stepUp = async (who: string, email = "ref@acme.com") => {
    const sentRes = await as(who).post("/api/referrer/step-up/send", { email });
    const code = sent.at(-1)?.code ?? "";
    return { sentRes, code, challengeId: sentRes.body.challengeId as string, verify: (override?: string) => as(who).post("/api/referrer/step-up/verify", { challengeId: sentRes.body.challengeId, code: override ?? code }) };
  };
  return { app, as, stepUp, store, sent, activity, accounts, profiles, identities, route, byId, deps, advance: (ms: number) => { now += ms; }, setNow: (value: number) => { now = value; }, now: () => now };
}

const codeRequired = { error: "Confirm your work email with a code to continue.", code: "work_email_code_required" };

beforeEach(() => { Object.values(identityFns).forEach(fn => fn.mockReset()); });

describe("§0b.7 item 1: a Google-first account completes the step-up with no account change", () => {
  it("unlocks referrer actions for the same account and keeps its history", async () => {
    const w = world();
    const accountsBefore = JSON.stringify([...w.accounts.values()]);
    const profilesBefore = JSON.stringify([...w.profiles.entries()]);
    // Before: a personal-login session shows the record but no referrer action.
    expect((await w.as("P-S1").get("/api/company-referrals/access")).body).toMatchObject({ verifiedCompanyAccess: true, workEmailDomain: "acme.com", codeRequired: true });
    const blocked = await w.as("P-S1").post("/api/company-referrals/701/claim");
    expect(blocked.status).toBe(403);
    expect(blocked.body).toEqual(codeRequired);
    expect(w.route.claimCompanyReferralRequest).not.toHaveBeenCalled();

    const { sentRes, verify } = await w.stepUp("P-S1");
    expect(sentRes.status).toBe(200);
    expect(sentRes.body).toMatchObject({ sent: true });
    expect(sentRes.body.challengeId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(w.sent).toEqual([{ to: "ref@acme.com", code: expect.stringMatching(/^\d{6}$/) }]);
    const verified = await verify();
    expect(verified.status).toBe(200);
    expect(verified.body).toMatchObject({ verified: true });
    expect(new Date(verified.body.expiresAt).getTime()).toBe(w.now() + STEP_UP_PROOF_TTL_MS);
    expect(verified.headers["set-cookie"]).toBeUndefined();

    expect((await w.as("P-S1").get("/api/company-referrals/access")).body).toMatchObject({ verifiedCompanyAccess: true, codeRequired: false });
    const claimed = await w.as("P-S1").post("/api/company-referrals/701/claim");
    expect(claimed.status).toBe(200);
    expect(w.route.claimCompanyReferralRequest).toHaveBeenCalledWith(1, 701);
    // P's own history is still P's: accepted referrals and claims are listed for account 1.
    const completed = await w.as("P-S1").get("/api/company-referrals/inbox?scope=completed");
    expect(completed.status).toBe(200);
    expect(completed.body.requests.map((row: { id: number }) => row.id)).toEqual([501, 502]);
    expect(w.route.listCompanyReferralInboxByState).toHaveBeenCalledWith(1, "completed");

    // No account was made, changed, linked or merged; only the step-up table was written.
    expect(identityFns.resolveLoginIdentity).not.toHaveBeenCalled();
    expect(identityFns.saveVerifiedWorkEmail).not.toHaveBeenCalled();
    expect(identityFns.completeWorkEmailOtpEnrollment).not.toHaveBeenCalled();
    expect(identityFns.upsertUser).not.toHaveBeenCalled();
    expect(JSON.stringify([...w.accounts.values()])).toBe(accountsBefore);
    expect(JSON.stringify([...w.profiles.entries()])).toBe(profilesBefore);
    expect(w.store.rows()).toHaveLength(1);
    expect(w.store.rows()[0]).toMatchObject({ userId: 1, purpose: "referrer_actions", workEmailDomain: "acme.com" });
    // Only digests are kept: never the address, the code or the challenge id.
    const stored = JSON.stringify(w.store.rows());
    expect(stored).not.toContain("ref@acme.com");
    expect(stored).not.toContain(sentRes.body.challengeId);
    expect(stored).not.toContain("workos:session_S1");
    // Activity rows carry the domain only.
    const stepUpActivity = w.activity.filter(row => row.action.startsWith("work_email.step_up_"));
    // The first claim was refused by the gate (denied), then the code was sent and verified.
    expect(stepUpActivity.map(row => row.action)).toEqual(["work_email.step_up_denied", "work_email.step_up_sent", "work_email.step_up_verified"]);
    expect(stepUpActivity[0].metadata).toEqual({ reason: "code_required" });
    expect(stepUpActivity.slice(1).map(row => row.metadata)).toEqual([{ domain: "acme.com" }, { domain: "acme.com" }]);
    expect(JSON.stringify(stepUpActivity)).not.toContain("ref@acme.com");
  });

  it("refuses a signed-out caller (401) and an unverified one (403 not_verified_referrer) without sending", async () => {
    const w = world();
    expect((await request(w.app).post("/api/referrer/step-up/send").send({ email: "ref@acme.com" })).status).toBe(401);
    const seeker = await w.as("S-S5").post("/api/referrer/step-up/send", { email: "me@globex.com" });
    expect(seeker.status).toBe(403);
    expect(seeker.body.code).toBe("not_verified_referrer");
    expect(w.sent).toEqual([]);
  });
});

describe("§0b.7 item 2: a different account never passes P's gate", () => {
  it("ignores Q's fresh proof and Q's code cookie, and refuses Q's challenge", async () => {
    const w = world();
    // Q (the code-login account) has a code session; its code cookie on P's request never counts.
    expect((await w.as("P-S1", "code-cookie-Q").post("/api/company-referrals/701/claim")).status).toBe(403);
    // R makes a proof in its own session, then that proof is not P's.
    const r = await w.stepUp("R-S9");
    expect((await r.verify()).status).toBe(200);
    expect((await w.as("P-S1").post("/api/company-referrals/701/claim")).status).toBe(403);
    // P sending another account's challenge id: refused before the code is looked at.
    const fromQ = await w.stepUp("R-S9");
    const stolen = await w.as("P-S1").post("/api/referrer/step-up/verify", { challengeId: fromQ.challengeId, code: fromQ.code });
    expect(stolen.status).toBe(403);
    expect(stolen.body.code).toBe("step_up_session_mismatch");
    expect(w.route.claimCompanyReferralRequest).not.toHaveBeenCalled();
  });
});

describe("§0b.7 item 3: the same company is not the same person", () => {
  it("does not let R's proof pass P, and holds P to its address of record", async () => {
    const w = world();
    const r = await w.stepUp("R-S9", "colleague@acme.com");
    expect((await r.verify()).status).toBe(200);
    expect((await w.as("P-S1").get("/api/company-referrals/access")).body.codeRequired).toBe(true);
    const p = await w.stepUp("P-S1", "ref@acme.com");
    expect((await p.verify()).status).toBe(200);
    // P now has an address of record; another address at the same domain is refused.
    const other = await w.as("P-S2").post("/api/referrer/step-up/send", { email: "someone.else@acme.com" });
    expect(other.status).toBe(400);
    expect(other.body).toEqual({ code: "step_up_email_mismatch", error: "Use the work email you verified at acme.com." });
    // And a different domain is refused even before any record exists.
    const domain = await w.as("R-S9").post("/api/referrer/step-up/send", { email: "colleague@globex.com" });
    expect(domain.status).toBe(400);
    expect(domain.body.code).toBe("step_up_email_mismatch");
  });
});

describe("§0b.7 item 4: a proof belongs to one session", () => {
  it("does not pass another WorkOS session or another app session, and refuses a cross-session verify", async () => {
    const w = world();
    const s1 = await w.stepUp("P-S1");
    expect((await s1.verify()).status).toBe(200);
    expect((await w.as("P-S2").post("/api/company-referrals/701/claim")).status).toBe(403);
    expect((await w.as("P-app").post("/api/company-referrals/701/claim")).status).toBe(403);
    const pending = await w.stepUp("P-S1");
    const crossed = await w.as("P-S2").post("/api/referrer/step-up/verify", { challengeId: pending.challengeId, code: pending.code });
    expect(crossed.status).toBe(403);
    expect(crossed.body.code).toBe("step_up_session_mismatch");
  });

  it("keeps the proof through an app-cookie renewal, which keeps the ssid", async () => {
    const w = world();
    const app = await w.stepUp("P-app");
    expect((await app.verify()).status).toBe(200);
    // A renewed cookie carries the same ssid (server/_core/sdk.session.test.ts), so the
    // identity's session key, and with it the proof, is unchanged an hour later.
    w.advance(60 * 60_000);
    expect((await w.as("P-app").post("/api/company-referrals/701/claim")).status).toBe(200);
  });
});

describe("§0b.7 item 5: expired, replayed and locked", () => {
  it("fails a proof older than 12 hours", async () => {
    const w = world();
    expect((await (await w.stepUp("P-S1")).verify()).status).toBe(200);
    w.advance(STEP_UP_PROOF_TTL_MS + 1000);
    expect((await w.as("P-S1").post("/api/company-referrals/701/claim")).status).toBe(403);
    expect((await w.as("P-S1").get("/api/company-referrals/access")).body.codeRequired).toBe(true);
  });

  it("fails a code older than 10 minutes", async () => {
    const w = world();
    const s = await w.stepUp("P-S1");
    w.advance(STEP_UP_CODE_TTL_MS + 1000);
    const late = await s.verify();
    expect(late.status).toBe(400);
    expect(late.body.code).toBe("step_up_code_invalid");
    expect((await w.as("P-S1").post("/api/company-referrals/701/claim")).status).toBe(403);
  });

  it("refuses the same challenge and code a second time", async () => {
    const w = world();
    const s = await w.stepUp("P-S1");
    expect((await s.verify()).status).toBe(200);
    const replay = await s.verify();
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe("step_up_code_invalid");
  });

  it("refuses the sixth try and answers the lock with 429", async () => {
    const w = world();
    const s = await w.stepUp("P-S1");
    const wrong = s.code === "000000" ? "111111" : "000000";
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) statuses.push((await s.verify(wrong)).status);
    expect(statuses.slice(0, 4)).toEqual([400, 400, 400, 400]);
    expect(statuses[4]).toBe(429);
    const sixth = await s.verify();
    expect(sixth.status).toBe(429);
    expect(sixth.headers["retry-after"]).toMatch(/^\d+$/);
    expect((await w.as("P-S1").get("/api/company-referrals/access")).body.codeRequired).toBe(true);
    expect(w.store.rows().every(row => row.verifiedAt === null)).toBe(true);
  });
});

describe("§0b.7 item 6: logout, revocation, suspension and employer change end the proof", () => {
  const blockedAfter = async (mutate: (w: ReturnType<typeof world>) => void | Promise<void>) => {
    const w = world();
    expect((await (await w.stepUp("P-S1")).verify()).status).toBe(200);
    expect((await w.as("P-S1").post("/api/company-referrals/701/claim")).status).toBe(200);
    w.advance(1000);
    await mutate(w);
    w.advance(1000);
    const after = await w.as("P-S1").post("/api/company-referrals/701/claim");
    const access = await w.as("P-S1").get("/api/company-referrals/access");
    return { w, after, access };
  };

  it("logout and revokeUserSessions move sessionsValidAfter", async () => {
    const { after, access } = await blockedAfter(w => { w.accounts.get("user_P")!.sessionsValidAfter = new Date(w.now()); });
    expect(after.status).toBe(403);
    expect(after.body).toEqual(codeRequired);
    expect(access.body.codeRequired).toBe(true);
  });

  it("logout also marks the proof revoked", async () => {
    const { w, after } = await blockedAfter(async w => { await w.store.revokeForUser(1, "logout", new Date(w.now())); });
    expect(after.status).toBe(403);
    expect(w.store.rows().find(row => row.verifiedAt)?.revokedReason).toBe("logout");
  });

  it("suspension ends it, and unsuspension never revives it", async () => {
    const { w, after } = await blockedAfter(w => { const p = w.accounts.get("user_P")!; p.suspended = true; p.sessionsValidAfter = new Date(w.now()); });
    expect(after.status).toBe(403);
    w.accounts.get("user_P")!.suspended = false;
    expect((await w.as("P-S1").post("/api/company-referrals/701/claim")).status).toBe(403);
  });

  it("an employer change (a new workEmailDomain) ends it", async () => {
    const { after, access } = await blockedAfter(w => { w.profiles.set(1, { accountType: "referrer", workEmailDomain: "globex.com", workEmailVerifiedAt: new Date(w.now()) }); });
    expect(after.status).toBe(403);
    expect(access.body.codeRequired).toBe(true);
  });

  it("a re-enrolment that moves workEmailVerifiedAt ends it", async () => {
    const { after } = await blockedAfter(w => { w.profiles.set(1, { accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date(w.now()) }); });
    expect(after.status).toBe(403);
  });
});

describe("§0b.7 item 7: seeker access is unchanged", () => {
  it("keeps P's seeker routes open in the same session with no step-up", async () => {
    const w = world();
    const mine = await w.as("P-S1").get("/api/company-referrals/mine");
    expect(mine.status).toBe(200);
    expect(mine.body.requests.map((row: { id: number }) => row.id)).toEqual([900]);
    expect((await w.as("S-S5").get("/api/company-referrals/mine")).status).toBe(200);
    // Progress on an ask where P is the seeker never asks for the referrer code.
    expect((await w.as("P-S1").post("/api/company-referrals/702/progress", { status: "interviewing" })).status).not.toBe(403);
    // Progress where P is the referrer does.
    expect((await w.as("P-S1").post("/api/company-referrals/701/progress", { status: "intro_made" })).body).toEqual(codeRequired);
  });
});

describe("§0b.7 item 8 / §0 item 8: the same-account code cookie still passes", () => {
  it("P Bearer + P code cookie passes; P Bearer + Q code cookie fails; Bearer alone fails", async () => {
    const w = world();
    expect((await w.as("P-bearer", "code-cookie-P").post("/api/company-referrals/701/claim")).status).toBe(200);
    expect((await w.as("P-bearer", "code-cookie-Q").post("/api/company-referrals/701/claim")).status).toBe(403);
    expect((await w.as("P-bearer", "plain-cookie-P").post("/api/company-referrals/701/claim")).status).toBe(403);
    expect((await w.as("P-bearer").post("/api/company-referrals/701/claim")).status).toBe(403);
    // A code session's own claim passes, and /access says so.
    expect((await w.as("Q-code").get("/api/company-referrals/access")).body.codeRequired).toBe(false);
    expect((await w.as("Q-code").post("/api/company-referrals/701/claim")).status).toBe(200);
  });
});
