// Seeker forgot / reset through WorkOS (D-049). Replaces the SkipWait JWT reset whose confirm step never set a
// password but told the person they were signed in. WorkOS creates the token and sets the password; SkipWait emails
// the link to its own /reset-password (D-078 ruling 6) and never logs the token.
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestException, NotFoundException, RateLimitExceededException } from "@workos-inc/node";
import { activeDurableLock } from "./_core/durableRateLimit";
import { createMemoryDurableLimitStore, type MemoryDurableLimitStore } from "./_core/memoryDurableLimitStore";
import { passwordLockKeys } from "./_core/passwordLimits";

type Row = Record<string, unknown> & { id: number; openId: string; email: string; sessionsValidAfter: Date };
const state = vi.hoisted(() => ({ accounts: new Map<string, Row>(), workEmailDomains: new Map<number, string>(), standings: new Map<string, string>(), witnesses: new Set<string>(), recorded: [] as string[], nextId: 10 }));
const resolveLoginIdentity = vi.hoisted(() => vi.fn());
const revokeUserSessions = vi.hoisted(() => vi.fn());
const capture = vi.hoisted(() => vi.fn());
const zepto = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({})),
  getUserByOpenId: vi.fn(async (openId: string) => state.accounts.get(openId)),
  revokeUserSessions,
  resolveLoginIdentity,
  listWorkosSubjectsForUser: vi.fn(async () => []),
  getVerifiedWorkEmailAccess: vi.fn(async (userId: number) => (state.workEmailDomains.has(userId) ? { workEmailDomain: state.workEmailDomains.get(userId) } : undefined)),
  recordOperationalActivity: vi.fn(async () => undefined),
}));
vi.mock("./sentry", () => ({ captureServerError: capture }));
vi.mock("./emailDelivery", () => ({ sendTransactionalEmail: zepto }));

const wos = vi.hoisted(() => ({
  authenticateWithPassword: vi.fn(), authenticateWithEmailVerification: vi.fn(), createUser: vi.fn(), sendVerificationEmail: vi.fn(),
  verifyEmail: vi.fn(), getEmailVerification: vi.fn(), listUsers: vi.fn(), createPasswordReset: vi.fn(), resetPassword: vi.fn(),
}));

const EMAIL = "asha@gmail.com";
const TOKEN = "Z1uX3RbwcIl5fIGJJJCXXisdI";
const FORGOT = "/api/auth/password/forgot";
const CONFIRM = "/api/auth/password/reset/confirm";
const workosUser = (overrides: Record<string, unknown> = {}) => ({ object: "user", id: "user_x", email: EMAIL, emailVerified: true, firstName: "Asha", lastName: "K", profilePictureUrl: null, ...overrides });
const resetObject = (email: string, url = `https://skipwait.me/reset-password?token=${TOKEN}`) => ({ object: "password_reset", id: "password_reset_1", userId: "user_x", email, passwordResetToken: TOKEN, passwordResetUrl: url, expiresAt: "2026-10-18T01:00:00Z", createdAt: "2026-10-18T00:00:00Z" });

function seedAccount(openId: string, overrides: Partial<Row> = {}): Row {
  const row: Row = { id: state.nextId++, openId, name: "Asha", email: EMAIL, loginMethod: "workos", role: "user", suspended: false, sessionsValidAfter: new Date(0), createdAt: new Date(0), updatedAt: new Date(0), lastSignedIn: new Date(0), ...overrides };
  state.accounts.set(openId, row);
  return row;
}

let pending: Promise<void>[] = [];
async function buildApp(options: { store?: MemoryDurableLimitStore; now?: () => number } = {}) {
  vi.resetModules();
  Object.assign(process.env, { WORKOS_CLIENT_ID: "client_test", WORKOS_API_KEY: "sk_test_key", WORKOS_COOKIE_PASSWORD: "c".repeat(32), JWT_SECRET: "test-secret-at-least-32-characters-long", VITE_APP_ID: "skipwait", WORKOS_REDIRECT_URI: "https://skipwait.me/api/auth/workos/callback", PUBLIC_BASE_URL: "https://skipwait.me" });
  const { createWorkosAuthRoutesRegistrar } = await import("./_core/workosAuth");
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  createWorkosAuthRoutesRegistrar({
    workos: { userManagement: { listSessions: vi.fn(async () => ({ data: [] })), revokeSession: vi.fn() } } as never,
    password: { client: wos, store: options.store ?? createMemoryDurableLimitStore(), now: options.now, responseFloorMs: 0, defer: task => { pending.push(task()); }, witness: { has: async id => state.witnesses.has(id), record: async ({ workosUserId }) => { state.recorded.push(workosUserId); state.witnesses.add(workosUserId); } }, emailStanding: async email => (state.standings.get(email) ?? "unknown") as never },
  })(app);
  app.get("/session-proof", async (req, res) => {
    const { resolveWorkosIdentity } = await import("./_core/workosAuth");
    const identity = await resolveWorkosIdentity(req);
    return identity ? res.json({ openId: identity.account.openId }) : res.status(401).json({ error: "Unauthorized" });
  });
  return app;
}
function post(app: express.Express, path: string, body: object, ip = "203.0.113.9") {
  return request(app).post(path).set("Origin", "https://skipwait.me").set("X-Forwarded-Proto", "https").set("X-Forwarded-For", ip).send(body);
}
const cookieOf = (res: request.Response, name: string) => { const value = res.headers["set-cookie"]; const list = Array.isArray(value) ? value : value ? [value] : []; return list.find(item => item.startsWith(`${name}=`)); };
const pairOf = (setCookie: string | undefined) => (setCookie ?? "").split(";")[0];

beforeEach(() => {
  pending = [];
  state.accounts.clear(); state.workEmailDomains.clear(); state.standings.clear(); state.witnesses = new Set(["user_x"]); state.recorded = []; state.nextId = 10;
  [resolveLoginIdentity, revokeUserSessions, capture, zepto, ...Object.values(wos)].forEach(fn => fn.mockReset());
  resolveLoginIdentity.mockImplementation(async (input: { openId: string; email: string }) => state.accounts.get(input.openId) ?? seedAccount(input.openId, { email: input.email }));
  revokeUserSessions.mockImplementation(async (openId: string) => { const row = state.accounts.get(openId); if (row) row.sessionsValidAfter = new Date(Date.now() + 1000); });
  wos.authenticateWithPassword.mockResolvedValue({ user: workosUser(), accessToken: "not-a-jwt", refreshToken: "r" });
  zepto.mockResolvedValue({ sent: true, reason: "sent" });
  wos.listUsers.mockResolvedValue({ data: [] });
  wos.createUser.mockImplementation(async ({ email }: { email: string }) => workosUser({ id: "user_new", email, emailVerified: false }));
  wos.createPasswordReset.mockImplementation(async ({ email }: { email: string }) => resetObject(email));
  wos.resetPassword.mockResolvedValue({ user: workosUser() });
});

describe("forgot password (SkipWait emails the WorkOS reset link)", () => {
  it("is neutral, and only real seeker accounts get a WorkOS reset", async () => {
    const app = await buildApp();
    const spies = (["log", "info", "warn", "error"] as const).map(method => vi.spyOn(console, method).mockImplementation(() => {}));
    state.standings.set("code@gmail.com", "verified_seeker");
    state.standings.set("ref@wipro.com", "referrer_work_email");
    wos.listUsers.mockImplementation(async ({ email }: { email: string }) => ({ data: [EMAIL, "ref@wipro.com"].includes(email) ? [workosUser({ email })] : [] }));
    const responses: request.Response[] = [];
    for (const email of [EMAIL, "code@gmail.com", "ref@wipro.com", "nobody@gmail.com"]) responses.push(await post(app, FORGOT, { email }));
    await Promise.all(pending);
    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(res.headers["cache-control"]).toBe("no-store");
    }
    expect(wos.createPasswordReset.mock.calls).toEqual([[{ email: EMAIL }], [{ email: "code@gmail.com" }]]);
    // A code-only seeker gets a WorkOS user (no password) first, then the reset that sets one.
    expect(wos.createUser.mock.calls).toEqual([[{ email: "code@gmail.com" }]]);
    expect(wos.createUser.mock.invocationCallOrder[0]).toBeLessThan(wos.createPasswordReset.mock.invocationCallOrder[1]);
    // D-078 ruling 6: SkipWait sends the link, always to its own reset page, never the hosted one.
    expect(zepto.mock.calls).toEqual([EMAIL, "code@gmail.com"].map(to => [{ to, subject: "Set or reset your SkipWait password", text: expect.stringContaining(`https://skipwait.me/reset-password?token=${TOKEN}`) }]));
    const everything = JSON.stringify([responses.map(res => res.body), spies.map(spy => spy.mock.calls), capture.mock.calls]);
    expect(everything).not.toContain(TOKEN);
    expect(everything).not.toContain("reset-password?token");
  });

  it("limits durably per email and per network", async () => {
    const app = await buildApp();
    for (let attempt = 0; attempt < 3; attempt++) expect((await post(app, FORGOT, { email: EMAIL }, "198.51.100.30")).status).toBe(200);
    const perEmail = await post(app, FORGOT, { email: EMAIL }, "198.51.100.31");
    expect(perEmail.status).toBe(429);
    expect(perEmail.body.code).toBe("rate_limited");
    expect(Number(perEmail.headers["retry-after"])).toBeGreaterThan(0);
    for (let attempt = 0; attempt < 10; attempt++) expect((await post(app, FORGOT, { email: `u${attempt}@gmail.com` }, "198.51.100.40")).status).toBe(200);
    expect((await post(app, FORGOT, { email: "z@gmail.com" }, "198.51.100.40")).status).toBe(429);
    expect((await post(app, FORGOT, { email: "not-an-email" })).status).toBe(400);
  });

  it("a misconfigured WorkOS reset URL is reported, not hidden", async () => {
    const app = await buildApp();
    wos.listUsers.mockResolvedValue({ data: [workosUser()] });
    const fine = await post(app, FORGOT, { email: EMAIL });
    await Promise.all(pending);
    expect(capture).not.toHaveBeenCalled();
    wos.createPasswordReset.mockImplementationOnce(async ({ email }: { email: string }) => resetObject(email, `https://exemplary-refuge-51.authkit.app/reset-password?token=${TOKEN}`));
    const hostedLink = await post(app, FORGOT, { email: EMAIL }, "198.51.100.50");
    await Promise.all(pending);
    expect(hostedLink.body).toEqual(fine.body);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(capture.mock.calls)).not.toMatch(new RegExp(`${TOKEN}|${EMAIL}|authkit\\.app`));
    // The emailed link is SkipWait's own page either way (D-030: never the hosted authkit.app page).
    for (const [message] of zepto.mock.calls as Array<[{ text: string }]>) {
      expect(message.text).toContain(`https://skipwait.me/reset-password?token=${TOKEN}`);
      expect(message.text).not.toContain("authkit.app");
    }
  });

  it("a reset link is emailed at most 3 times an hour per address, across forgot, sign-up and sign-in", async () => {
    const app = await buildApp();
    wos.listUsers.mockResolvedValue({ data: [workosUser()] });
    for (let attempt = 0; attempt < 3; attempt++) expect((await post(app, FORGOT, { email: EMAIL }, `198.51.100.${60 + attempt}`)).status).toBe(200);
    await Promise.all(pending);
    expect(zepto).toHaveBeenCalledTimes(3);
    expect((await post(app, "/api/auth/password/sign-up", { email: EMAIL })).body).toEqual({ ok: true, step: "check_email" });
    await Promise.all(pending);
    expect(zepto).toHaveBeenCalledTimes(3);
    expect(wos.createPasswordReset).toHaveBeenCalledTimes(3);
  });

  it("a link that could not be sent is reported, never silent, and never with the token or email", async () => {
    const app = await buildApp();
    wos.listUsers.mockResolvedValue({ data: [workosUser()] });
    zepto.mockResolvedValueOnce({ sent: false, reason: "delivery_failed" });
    expect((await post(app, FORGOT, { email: EMAIL })).status).toBe(200);
    await Promise.all(pending);
    expect(capture).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ operation: "reset_email", kind: "delivery_failed" }));
    expect(JSON.stringify(capture.mock.calls)).not.toMatch(new RegExp(`${TOKEN}|${EMAIL}`));
  });
});

describe("every reset path skips a referrer's work email (D-078 ruling 3, S-3)", () => {
  it("requestWorkosPasswordReset makes no WorkOS call and sends nothing for a referrer's work email", async () => {
    await buildApp();
    const { requestWorkosPasswordReset } = await import("./passwordLinks");
    const ctx = { emailStanding: async (email: string) => (email === "asha@wipro.com" ? "referrer_work_email" : "unknown") as never, store: createMemoryDurableLimitStore(), now: () => Date.now(), sendEmail: zepto };
    await requestWorkosPasswordReset(ctx, wos, "asha@wipro.com", "reset");
    expect(wos.createPasswordReset).not.toHaveBeenCalled();
    expect(zepto).not.toHaveBeenCalled();
    await requestWorkosPasswordReset(ctx, wos, EMAIL, "reset");
    expect(wos.createPasswordReset).toHaveBeenCalledWith({ email: EMAIL });
    expect(zepto).toHaveBeenCalledTimes(1);
  });
});

describe("reset password (WorkOS sets it; this browser signs in, every other session out)", () => {
  it("sets the password in WorkOS, signs this browser in and every other session out", async () => {
    const app = await buildApp();
    const old = pairOf(cookieOf(await post(app, "/api/auth/password/sign-in", { email: EMAIL, password: "old password 1" }), "app_session_id"));
    expect((await request(app).get("/session-proof").set("Cookie", old)).status).toBe(200);
    const res = await post(app, CONFIRM, { token: TOKEN, password: "Newpassword1!", confirm: "Newpassword1!" });
    expect(wos.resetPassword).toHaveBeenCalledWith({ token: TOKEN, newPassword: "Newpassword1!" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, signedIn: true, redirectTo: "/explore" });
    expect(revokeUserSessions).toHaveBeenCalledWith("workos_user_x");
    const fresh = pairOf(cookieOf(res, "app_session_id"));
    expect((await request(app).get("/session-proof").set("Cookie", old)).status).toBe(401);
    expect((await request(app).get("/session-proof").set("Cookie", fresh)).status).toBe(200);
    expect(state.recorded).toEqual(["user_x"]);
  });

  // D-078 ruling 5: the emailed link is how a new password becomes usable. Sign-in before it: a link; after it: in.
  it("a password becomes usable only once its link is used: sign-in, then reset, then sign-in", async () => {
    const app = await buildApp();
    state.witnesses.clear();
    wos.authenticateWithPassword.mockResolvedValue({ user: workosUser({ id: "user_new" }), accessToken: "not-a-jwt", refreshToken: "r" });
    const before = await post(app, "/api/auth/password/sign-in", { email: EMAIL, password: "Newpassword1!" });
    expect(before.body).toEqual({ ok: true, step: "check_email" });
    expect(cookieOf(before, "app_session_id")).toBeUndefined();
    await Promise.all(pending);
    expect(zepto).toHaveBeenCalledTimes(1);
    wos.resetPassword.mockResolvedValueOnce({ user: workosUser({ id: "user_new" }) });
    const reset = await post(app, CONFIRM, { token: TOKEN, password: "Newpassword1!", confirm: "Newpassword1!" });
    expect(reset.body).toEqual({ ok: true, signedIn: true, redirectTo: "/explore" });
    expect(state.recorded).toEqual(["user_new"]);
    const after = await post(app, "/api/auth/password/sign-in", { email: EMAIL, password: "Newpassword1!" });
    expect(after.body).toEqual({ ok: true, step: "signed_in", redirectTo: "/explore" });
  });

  it("a successful reset lifts the password lock and failure count on that email (S-8)", async () => {
    const store = createMemoryDurableLimitStore();
    const clock = { now: Date.UTC(2026, 9, 18, 10, 0, 0) };
    const app = await buildApp({ store, now: () => clock.now });
    const emailLock = passwordLockKeys(EMAIL, "unused")[2];
    const wrong = new BadRequestException({ code: "invalid_credentials", errors: [], message: "Invalid credentials", requestID: "r" });
    const fail = async (attempt: number) => post(app, "/api/auth/password/sign-in", { email: EMAIL, password: `wrong-${attempt}` }, `198.51.100.${100 + attempt}`);
    wos.authenticateWithPassword.mockRejectedValue(wrong);
    // 20 wrong passwords in an hour from many networks lock the email (10 per 15-minute sign-in window).
    for (let attempt = 0; attempt < 10; attempt++) expect((await fail(attempt)).status).toBe(401);
    clock.now += 15 * 60_000;
    for (let attempt = 10; attempt < 20; attempt++) expect((await fail(attempt)).status).toBe(401);
    expect((await activeDurableLock([emailLock], { store, now: clock.now })).locked).toBe(true);
    expect((await post(app, CONFIRM, { token: TOKEN, password: "Newpassword1!", confirm: "Newpassword1!" })).body.signedIn).toBe(true);
    expect(await activeDurableLock([emailLock], { store, now: clock.now })).toEqual({ locked: false });
    // The hour's failure count went too: one more wrong password no longer re-locks the email.
    clock.now += 15 * 60_000;
    expect((await fail(20)).status).toBe(401);
    expect(await activeDurableLock([emailLock], { store, now: clock.now })).toEqual({ locked: false });
  });

  it("reset failures are honest", async () => {
    const app = await buildApp();
    wos.resetPassword.mockRejectedValueOnce(new NotFoundException({ path: "/user_management/password_reset/confirm", requestID: "r" }));
    const spent = await post(app, CONFIRM, { token: TOKEN, password: "Newpassword1!", confirm: "Newpassword1!" });
    expect(spent.status).toBe(400);
    expect(spent.body.code).toBe("expired");
    wos.resetPassword.mockRejectedValueOnce(new BadRequestException({ code: "password_strength_error", errors: [{ code: "password_breached" }], message: "Too weak", requestID: "r" }));
    const weak = await post(app, CONFIRM, { token: TOKEN, password: "Password123!", confirm: "Password123!" });
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe("weak_password");
    wos.resetPassword.mockRejectedValueOnce(new RateLimitExceededException("Too many requests", "r", 20));
    const limited = await post(app, CONFIRM, { token: TOKEN, password: "Newpassword1!", confirm: "Newpassword1!" });
    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBe("20");
    const calls = wos.resetPassword.mock.calls.length;
    for (const body of [{ token: TOKEN, password: "short1!", confirm: "short1!" }, { token: TOKEN, password: "Newpassword1!", confirm: "Different1!" }]) {
      const refused = await post(app, CONFIRM, body);
      expect(refused.status).toBe(400);
      expect(refused.body.code).toBe("weak_password");
    }
    expect((await post(app, CONFIRM, { token: "bad token!", password: "Newpassword1!", confirm: "Newpassword1!" })).status).toBe(400);
    expect(wos.resetPassword.mock.calls.length).toBe(calls);

    resolveLoginIdentity.mockRejectedValueOnce(new Error("IDENTITY_REVIEW_REQUIRED"));
    const blocked = await post(app, CONFIRM, { token: TOKEN, password: "Newpassword1!", confirm: "Newpassword1!" });
    expect(blocked.body).toEqual({ ok: true, signedIn: false, redirectTo: "/sign-in" });
    expect(cookieOf(blocked, "app_session_id")).toBeUndefined();
    expect(state.recorded).toEqual([]);

    // D-078 ruling 3 (S-2): a referrer's work email is refused before the resolver and before any revocation,
    // with the work-email-code answer, so the refusal links nothing and signs nobody out.
    resolveLoginIdentity.mockClear(); revokeUserSessions.mockClear();
    state.standings.set("asha@wipro.com", "referrer_work_email");
    wos.resetPassword.mockResolvedValueOnce({ user: workosUser({ id: "user_ref", email: "asha@wipro.com" }) });
    const workEmail = await post(app, CONFIRM, { token: TOKEN, password: "Newpassword1!", confirm: "Newpassword1!" });
    expect(workEmail.status).toBe(403);
    expect(workEmail.body.code).toBe("use_work_email_code");
    expect(cookieOf(workEmail, "app_session_id")).toBeUndefined();
    expect(resolveLoginIdentity).not.toHaveBeenCalled();
    expect(revokeUserSessions).not.toHaveBeenCalled();
    expect(state.recorded).toEqual([]);

    expect((await request(app).get(`/api/auth/password/reset/verify?token=${TOKEN}`)).status).toBe(404);
  });
});
