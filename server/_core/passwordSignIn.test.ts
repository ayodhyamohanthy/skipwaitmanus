// Seeker email + password on skipwait.me (D-049, D-078): sign-in, sign-up by emailed link, no six-digit code
// anywhere, and logout. WorkOS is a fake with the SDK's real exception classes; the session, identity
// resolver and cookies are the real modules over a mocked db.
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationException, GenericServerException, RateLimitExceededException, UnprocessableEntityException } from "@workos-inc/node";
import { PASSWORD_AUTH_COPY } from "@shared/passwordAuth";
import { createMemoryDurableLimitStore } from "./memoryDurableLimitStore";
import type { DurableLimitStore } from "./durableRateLimit";

type Row = Record<string, unknown> & { id: number; openId: string; email: string; sessionsValidAfter: Date };
const state = vi.hoisted(() => ({ accounts: new Map<string, Row>(), workEmailDomains: new Map<number, string>(), subjects: new Map<number, string[]>(), standings: new Map<string, string>(), standingCalls: [] as Array<[string, string | undefined]>, standingRules: [] as Array<string | undefined>, referrerDomains: new Set<string>(), witnesses: new Set<string>(), nextId: 10 }));
const revokeUserSessions = vi.hoisted(() => vi.fn());
const resolveLoginIdentity = vi.hoisted(() => vi.fn());
const capture = vi.hoisted(() => vi.fn());
const recordActivity = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({})),
  getUserByOpenId: vi.fn(async (openId: string) => state.accounts.get(openId)),
  revokeUserSessions,
  resolveLoginIdentity,
  listWorkosSubjectsForUser: vi.fn(async (userId: number) => state.subjects.get(userId) ?? []),
  getVerifiedWorkEmailAccess: vi.fn(async (userId: number) => (state.workEmailDomains.has(userId) ? { workEmailDomain: state.workEmailDomains.get(userId) } : undefined)),
  recordOperationalActivity: recordActivity,
}));
vi.mock("../sentry", () => ({ captureServerError: capture }));

const wos = vi.hoisted(() => ({
  authenticateWithPassword: vi.fn(), authenticateWithEmailVerification: vi.fn(), createUser: vi.fn(), sendVerificationEmail: vi.fn(),
  verifyEmail: vi.fn(), getEmailVerification: vi.fn(), listUsers: vi.fn(), createPasswordReset: vi.fn(), resetPassword: vi.fn(),
}));
const hosted = vi.hoisted(() => ({ listSessions: vi.fn(), revokeSession: vi.fn(), authenticateWithCode: vi.fn(), getAuthorizationUrl: vi.fn(() => "https://api.workos.com/user_management/authorize") }));

const EMAIL = "asha@gmail.com";
const PASSWORD = "correct horse 1";
const IP = "203.0.113.9";
const UA = "Mozilla/5.0 (test)";
const baseEnv: Record<string, string | undefined> = {
  WORKOS_CLIENT_ID: "client_test", WORKOS_API_KEY: "sk_test_key", WORKOS_COOKIE_PASSWORD: "c".repeat(32), JWT_SECRET: "test-secret-at-least-32-characters-long",
  VITE_APP_ID: "skipwait", WORKOS_REDIRECT_URI: "https://skipwait.me/api/auth/workos/callback", PUBLIC_BASE_URL: "https://skipwait.me",
  SKIPWAIT_ADMIN_EMAIL: undefined, ENABLE_ADMIN_BOOTSTRAP: undefined, WORKOS_POST_SIGNIN_PATH: undefined,
};

const workosUser = (overrides: Record<string, unknown> = {}) => ({ object: "user", id: "user_x", email: EMAIL, emailVerified: true, firstName: "Asha", lastName: "K", profilePictureUrl: null, ...overrides });
const authResponse = (user = workosUser()) => ({ user, accessToken: "not-a-jwt", refreshToken: "refresh", authenticationMethod: "Password" });
const wrongPassword = (email = EMAIL) => new GenericServerException(400, `Invalid credentials for ${email}`, { code: "invalid_credentials", message: `Invalid credentials for ${email}` }, "req_bad");
const needsVerification = (overrides: Record<string, unknown> = {}) => new AuthenticationException(403, { code: "email_verification_required", message: "Email ownership must be verified before authentication.", pending_authentication_token: "pat_secret_token", email: EMAIL, email_verification_id: "email_verification_1", user: { object: "user", id: "user_x", email: EMAIL, email_verified: false }, ...overrides }, "req_v");
const emailTaken = () => new UnprocessableEntityException({ code: "user_creation_error", errors: [{ code: "email_not_available", message: "This email is not available." }], requestID: "req_t" });

function seedAccount(openId: string, overrides: Partial<Row> = {}): Row {
  const row: Row = { id: state.nextId++, openId, name: "Asha", email: EMAIL, loginMethod: "workos", role: "user", suspended: false, sessionsValidAfter: new Date(0), createdAt: new Date(0), updatedAt: new Date(0), lastSignedIn: new Date(0), ...overrides };
  state.accounts.set(openId, row);
  return row;
}

let queued: Array<() => Promise<void>> = [];
/** Runs the work the routes deferred until after their answer (sign-up, the emailed links). */
async function flush(): Promise<void> { while (queued.length) await queued.shift()?.(); }
const mail = vi.hoisted(() => vi.fn());
async function buildApp(options: { store?: DurableLimitStore | null; now?: () => number; responseFloorMs?: number } = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(baseEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  const { createWorkosAuthRoutesRegistrar } = await import("./workosAuth");
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const store = options.store === undefined ? createMemoryDurableLimitStore() : options.store;
  createWorkosAuthRoutesRegistrar({ workos: { userManagement: hosted } as never, password: { client: wos, store, now: options.now, responseFloorMs: options.responseFloorMs ?? 0, defer: task => { queued.push(task); }, sendEmail: mail, witness: { has: async id => state.witnesses.has(id), record: async ({ workosUserId }) => { state.witnesses.add(workosUserId); } }, emailStanding: async (email, lookup) => { state.standingCalls.push([email, lookup?.workosUserId]); state.standingRules.push(lookup?.rule); const standing = state.standings.get(email); if (standing === "throw") throw new Error("Database unavailable"); if (!standing && lookup?.rule !== "social" && state.referrerDomains.has(email.slice(email.indexOf("@") + 1))) return "referrer_work_email"; return (standing ?? "unknown") as never; } } })(app);
  app.get("/session-proof", async (req, res) => {
    const { resolveWorkosIdentity } = await import("./workosAuth");
    const identity = await resolveWorkosIdentity(req);
    return identity ? res.json({ openId: identity.account.openId }) : res.status(401).json({ error: "Unauthorized" });
  });
  return app;
}

type PostOptions = { ip?: string; cookie?: string; origin?: string | null; form?: boolean };
function post(app: express.Express, path: string, body: object | string, options: PostOptions = {}) {
  let call = request(app).post(path).set("X-Forwarded-Proto", "https").set("X-Forwarded-For", options.ip ?? IP).set("User-Agent", UA);
  if (options.origin !== null) call = call.set("Origin", options.origin ?? "https://skipwait.me");
  if (options.cookie) call = call.set("Cookie", options.cookie);
  return options.form ? call.type("form").send(body) : call.send(body);
}
const setCookies = (res: request.Response): string[] => { const value = res.headers["set-cookie"]; return Array.isArray(value) ? value : value ? [value] : []; };
const cookieOf = (res: request.Response, name: string) => setCookies(res).find(value => value.startsWith(`${name}=`));
const pairOf = (setCookie: string | undefined) => (setCookie ?? "").split(";")[0];
const SIGN_IN = "/api/auth/password/sign-in";
const SIGN_UP = "/api/auth/password/sign-up";
const LINK = "https://skipwait.me/reset-password?token=tok_secret";

beforeEach(() => {
  queued = [];
  state.accounts.clear(); state.workEmailDomains.clear(); state.subjects.clear(); state.standings.clear(); state.standingCalls = []; state.standingRules = []; state.referrerDomains.clear(); state.nextId = 10;
  // The usual WorkOS user here already proved the inbox for this password (D-078 ruling 5).
  state.witnesses = new Set(["user_x"]);
  [resolveLoginIdentity, revokeUserSessions, capture, recordActivity, mail, ...Object.values(wos), ...Object.values(hosted)].forEach(fn => fn.mockReset());
  mail.mockResolvedValue({ sent: true, reason: "sent" });
  revokeUserSessions.mockImplementation(async (openId: string) => { const row = state.accounts.get(openId); if (row) row.sessionsValidAfter = new Date(Date.now() + 1000); });
  resolveLoginIdentity.mockImplementation(async (input: { openId: string; email: string }) => state.accounts.get(input.openId) ?? seedAccount(input.openId, { email: input.email }));
  recordActivity.mockResolvedValue(undefined);
  wos.authenticateWithPassword.mockResolvedValue(authResponse());
  wos.createUser.mockResolvedValue(workosUser({ emailVerified: false }));
  wos.listUsers.mockResolvedValue({ data: [] });
  wos.createPasswordReset.mockResolvedValue({ object: "password_reset", id: "password_reset_1", userId: "user_x", email: EMAIL, passwordResetToken: "tok_secret", passwordResetUrl: "https://skipwait.me/reset-password?token=tok_secret", expiresAt: "x", createdAt: "x" });
  hosted.listSessions.mockResolvedValue({ data: [{ id: "session_pw", status: "active" }] });
  hosted.revokeSession.mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("seeker password sign-in", () => {
  it("a correct password for a verified email signs in through the canonical resolver", async () => {
    const app = await buildApp();
    const res = await post(app, SIGN_IN, { email: " Asha@Gmail.com ", password: PASSWORD, returnTo: "/plans" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, step: "signed_in", redirectTo: "/plans" });
    expect(res.headers["cache-control"]).toBe("no-store");
    const session = cookieOf(res, "app_session_id");
    for (const attribute of ["HttpOnly", "SameSite=Lax", "Secure", "Path=/"]) expect(session).toContain(attribute);
    expect(wos.authenticateWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: PASSWORD, ipAddress: IP, userAgent: UA });
    expect(resolveLoginIdentity).toHaveBeenCalledWith(expect.objectContaining({ provider: "workos", subject: "user_x", openId: "workos_user_x", email: EMAIL, emailVerified: true, loginMethod: "workos" }));
    const proof = await request(app).get("/session-proof").set("Cookie", pairOf(session));
    expect(proof.status).toBe(200);
    expect(proof.body).toEqual({ openId: "workos_user_x" });
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.password_sign_in", outcome: "success" }));
  });

  it("builds its own WorkOS client with retries off and a 10 s timeout", async () => {
    const { createPasswordWorkosClient } = await import("./passwordWorkosClient");
    const seen: unknown[] = [];
    class FakeWorkOS { userManagement = { marker: true }; constructor(key: string, options: unknown) { seen.push({ key, options }); } }
    expect(createPasswordWorkosClient({ apiKey: "sk_live_x", clientId: "client_x" }, FakeWorkOS as never)).toEqual({ marker: true });
    expect(seen).toEqual([{ key: "sk_live_x", options: { clientId: "client_x", maxRetries: 0, timeout: 10_000 } }]);
  });

  it("a wrong password and an unknown email are indistinguishable and leak nothing", async () => {
    const app = await buildApp();
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(method => vi.spyOn(console, method).mockImplementation(() => {}));
    wos.authenticateWithPassword.mockRejectedValueOnce(wrongPassword(EMAIL)).mockRejectedValueOnce(wrongPassword("nobody@gmail.com"));
    const wrong = await post(app, SIGN_IN, { email: EMAIL, password: "Wr0ng-password!" });
    const unknown = await post(app, SIGN_IN, { email: "nobody@gmail.com", password: "Wr0ng-password!" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual({ ok: false, code: "invalid_credentials", message: PASSWORD_AUTH_COPY.invalid_credentials });
    expect(unknown.body).toEqual(wrong.body);
    const headers = (res: request.Response) => Object.fromEntries(Object.entries(res.headers).filter(([name]) => name !== "date"));
    expect(headers(unknown)).toEqual(headers(wrong));
    expect(cookieOf(wrong, "app_session_id")).toBeUndefined();
    const everything = JSON.stringify([spies.map(spy => spy.mock.calls), capture.mock.calls, recordActivity.mock.calls]);
    for (const secret of ["Wr0ng-password!", EMAIL, "nobody@gmail.com"]) expect(everything).not.toContain(secret);
  });

  // D-049 / D-078 ruling 2: no six-digit code. An address WorkOS has not verified gets an emailed link that sets the
  // password (which verifies the email) and signs in from /reset-password; nothing is issued before that.
  it("an unverified email gets no session and no code: a link to set the password is emailed instead", async () => {
    const app = await buildApp();
    for (const outcome of ["refused", "let through"] as const) {
      if (outcome === "refused") wos.authenticateWithPassword.mockRejectedValueOnce(needsVerification());
      else wos.authenticateWithPassword.mockResolvedValueOnce(authResponse(workosUser({ emailVerified: false })));
      const res = await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, step: "check_email" });
      expect(res.headers["set-cookie"]).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain("pat_");
      expect(wos.createPasswordReset).not.toHaveBeenCalled();
      await flush();
      expect(wos.createPasswordReset).toHaveBeenCalledWith({ email: EMAIL });
      expect(mail).toHaveBeenLastCalledWith({ to: EMAIL, subject: "Finish signing in to SkipWait", text: expect.stringContaining(LINK) });
      wos.createPasswordReset.mockClear();
    }
    expect(resolveLoginIdentity).not.toHaveBeenCalled();
    expect(wos.sendVerificationEmail).not.toHaveBeenCalled();
  });

  // D-078 ruling 5 (S-5): a password counts only after its setter proved the inbox (a reset confirm or a link
  // sign-up). Anyone else's password for the address, set where nobody proved it, never opens a session.
  it("a correct password whose setter never proved the inbox gets no session, only an emailed link", async () => {
    const app = await buildApp();
    state.witnesses.clear();
    const res = await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD, returnTo: "/plans" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, step: "check_email" });
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(resolveLoginIdentity).not.toHaveBeenCalled();
    expect(revokeUserSessions).not.toHaveBeenCalled();
    await flush();
    expect(wos.createPasswordReset).toHaveBeenCalledWith({ email: EMAIL });
    expect(mail).toHaveBeenCalledWith({ to: EMAIL, subject: "Finish signing in to SkipWait", text: expect.stringContaining(LINK) });
    expect(state.witnesses.size).toBe(0);
    // A referrer's work email is still refused first, and is never emailed.
    state.standings.set("asha@wipro.com", "referrer_work_email");
    wos.authenticateWithPassword.mockResolvedValueOnce(authResponse(workosUser({ id: "user_ref", email: "asha@wipro.com" })));
    expect((await post(app, SIGN_IN, { email: "asha@wipro.com", password: PASSWORD })).body.code).toBe("use_work_email_code");
    await flush();
    expect(mail).toHaveBeenCalledTimes(1);
  });

  it("the six-digit verification routes are gone", async () => {
    const app = await buildApp();
    for (const path of ["/api/auth/password/verify-email", "/api/auth/password/verify-email/resend"]) {
      const res = await post(app, path, { code: "482913" });
      expect(res.status, path).toBe(404);
      expect(res.headers["set-cookie"]).toBeUndefined();
    }
  });

  // D-078 ruling 2: sign-up takes only the email and always answers "check your email" at once; the WorkOS work runs
  // after the answer. A new address gets a WorkOS user with no password, then a link that sets one.
  it("sign-up answers at once with the same step for a new or an existing account, and emails a link either way", async () => {
    const app = await buildApp();
    const fresh = await post(app, SIGN_UP, { email: "New@Gmail.com" });
    expect(Object.values(wos).every(fn => fn.mock.calls.length === 0)).toBe(true);
    wos.listUsers.mockResolvedValueOnce({ data: [] });
    await flush();
    expect(wos.listUsers).toHaveBeenCalledWith({ email: "new@gmail.com", limit: 1 });
    expect(wos.createUser).toHaveBeenCalledWith({ email: "new@gmail.com" });
    expect(wos.createPasswordReset).toHaveBeenCalledWith({ email: "new@gmail.com" });
    expect(mail).toHaveBeenLastCalledWith({ to: "new@gmail.com", subject: "Finish signing in to SkipWait", text: expect.stringContaining(LINK) });

    const existing = await post(app, SIGN_UP, { email: EMAIL });
    wos.listUsers.mockResolvedValueOnce({ data: [workosUser()] });
    const creates = wos.createUser.mock.calls.length;
    await flush();
    expect(wos.createUser.mock.calls.length).toBe(creates);
    expect(wos.createPasswordReset).toHaveBeenLastCalledWith({ email: EMAIL });
    expect(mail).toHaveBeenLastCalledWith({ to: EMAIL, subject: "Finish signing in to SkipWait", text: expect.stringContaining(LINK) });

    for (const res of [fresh, existing]) {
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, step: "check_email" });
      expect(res.headers["set-cookie"]).toBeUndefined();
    }
    const headers = (res: request.Response) => Object.fromEntries(Object.entries(res.headers).filter(([name]) => name !== "date"));
    expect(headers(existing)).toEqual(headers(fresh));
    expect(wos.authenticateWithPassword).not.toHaveBeenCalled();

    const calls = Object.values(wos).map(fn => fn.mock.calls.length);
    for (const body of [{ email: "x@gmail.com", password: "Longpassword1!" }, { email: "x@gmail.com", returnTo: "/plans" }, { email: "nope" }]) {
      const refused = await post(app, SIGN_UP, body);
      expect(refused.status).toBe(400);
      expect(refused.body.code).toBe("invalid_input");
    }
    await flush();
    expect(Object.values(wos).map(fn => fn.mock.calls.length)).toEqual(calls);
  });

  it("an address WorkOS already holds (a race with another sign-up) still gets the link", async () => {
    const app = await buildApp();
    wos.createUser.mockRejectedValueOnce(emailTaken());
    await post(app, SIGN_UP, { email: EMAIL });
    await flush();
    expect(wos.createPasswordReset).toHaveBeenCalledWith({ email: EMAIL });
    expect(mail).toHaveBeenCalledTimes(1);
    expect(capture).not.toHaveBeenCalled();
  });

  // S-12: an undocumented refusal from WorkOS on create is read as "address taken": the link still goes out, and
  // the raw codes reach Sentry without the email.
  it("an unrecognised refusal on create still sends the link, and reports its raw codes without the email", async () => {
    const app = await buildApp();
    wos.createUser.mockRejectedValueOnce(new UnprocessableEntityException({ code: "user_creation_error", errors: [{ code: "some_new_code", message: `${EMAIL} cannot be used` }], requestID: "req_new" }));
    await post(app, SIGN_UP, { email: EMAIL });
    await flush();
    expect(wos.createPasswordReset).toHaveBeenCalledWith({ email: EMAIL });
    expect(mail).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ operation: "sign_up", kind: "unrecognized_refusal", status: 422, requestID: "req_new", codes: "some_new_code,user_creation_error" }));
    expect(JSON.stringify(capture.mock.calls)).not.toContain(EMAIL);
  });

  it("a deferred sign-up failure is reported without personal data and sends nothing", async () => {
    const app = await buildApp();
    wos.listUsers.mockRejectedValueOnce(new GenericServerException(500, `Upstream failed for ${EMAIL}`, { message: `Upstream failed for ${EMAIL}` }, "req_up"));
    expect((await post(app, SIGN_UP, { email: EMAIL })).body).toEqual({ ok: true, step: "check_email" });
    await flush();
    expect(mail).not.toHaveBeenCalled();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(capture.mock.calls)).not.toContain(EMAIL);
  });

  it("failed passwords lock durably and limiter outages fail closed", async () => {
    const app = await buildApp();
    wos.authenticateWithPassword.mockRejectedValue(wrongPassword());
    for (let attempt = 0; attempt < 5; attempt++) expect((await post(app, SIGN_IN, { email: EMAIL, password: `wrong-${attempt}` })).status).toBe(401);
    const locked = await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe("rate_limited");
    expect(Number(locked.headers["retry-after"])).toBeGreaterThan(0);
    expect(wos.authenticateWithPassword).toHaveBeenCalledTimes(5);
    // The pair lock is per (email, IP): the same email from another network still reaches WorkOS.
    expect((await post(app, SIGN_IN, { email: EMAIL, password: "wrong-x" }, { ip: "198.51.100.20" })).status).toBe(401);

    const clock = { now: Date.UTC(2026, 9, 18, 10, 0, 0) };
    const sprayed = await buildApp({ now: () => clock.now });
    for (let attempt = 0; attempt < 30; attempt++) expect((await post(sprayed, SIGN_IN, { email: `user${attempt}@gmail.com`, password: "nope" }, { ip: "198.51.100.7" })).status).toBe(401);
    clock.now += 10 * 60_000;
    const calls = wos.authenticateWithPassword.mock.calls.length;
    const ipLocked = await post(sprayed, SIGN_IN, { email: "fresh@gmail.com", password: "nope" }, { ip: "198.51.100.7" });
    expect(ipLocked.status).toBe(429);
    expect(wos.authenticateWithPassword.mock.calls.length).toBe(calls);
    expect((await post(sprayed, SIGN_IN, { email: "fresh@gmail.com", password: "nope" }, { ip: "198.51.100.8" })).status).toBe(401);

    const noStore = await buildApp({ store: null });
    const unavailable = await post(noStore, SIGN_IN, { email: EMAIL, password: PASSWORD });
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.code).toBe("temporarily_unavailable");

    const throttled = await buildApp();
    wos.authenticateWithPassword.mockReset().mockRejectedValueOnce(new RateLimitExceededException("Too many requests", "r", 42));
    const limited = await post(throttled, SIGN_IN, { email: EMAIL, password: PASSWORD });
    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBe("42");
    expect(limited.body).toEqual(expect.objectContaining({ code: "rate_limited", retryAfterSeconds: 42 }));
  });

  // S-6 (D-078 ruling 7): how long sign-in and sign-up take must not say what the server found for an email.
  it("sign-in and sign-up never answer before the response-time floor, whatever the outcome", async () => {
    const { AUTH_RESPONSE_FLOOR_MS } = await import("./passwordResponses");
    expect(AUTH_RESPONSE_FLOOR_MS).toBeGreaterThanOrEqual(1000);
    const app = await buildApp({ responseFloorMs: 150 });
    const limiterDown = await buildApp({ store: null, responseFloorMs: 150 });
    const cases: Array<[string, () => request.Test, number, string | undefined]> = [
      ["unknown email or wrong password", () => { wos.authenticateWithPassword.mockRejectedValueOnce(wrongPassword()); return post(app, SIGN_IN, { email: EMAIL, password: "Wr0ng-password!" }); }, 401, "invalid_credentials"],
      ["signed in", () => post(app, SIGN_IN, { email: EMAIL, password: PASSWORD }), 200, undefined],
      ["bad input", () => post(app, SIGN_IN, { email: "nope", password: "x" }), 400, "invalid_input"],
      ["sign-up", () => post(app, SIGN_UP, { email: "new@gmail.com" }), 200, undefined],
      // Review F4: the refusals and failures are held too.
      ["WorkOS rate limit", () => { wos.authenticateWithPassword.mockRejectedValueOnce(new RateLimitExceededException("Too many requests", "r", 30)); return post(app, SIGN_IN, { email: EMAIL, password: PASSWORD }); }, 429, "rate_limited"],
      ["limiter down on sign-in", () => post(limiterDown, SIGN_IN, { email: EMAIL, password: PASSWORD }), 503, "temporarily_unavailable"],
      ["limiter down on sign-up", () => post(limiterDown, SIGN_UP, { email: "new@gmail.com" }), 503, "temporarily_unavailable"],
      ["standing lookup throws", () => { state.standings.set("down@gmail.com", "throw"); wos.authenticateWithPassword.mockResolvedValueOnce(authResponse(workosUser({ email: "down@gmail.com" }))); return post(app, SIGN_IN, { email: "down@gmail.com", password: PASSWORD }); }, 503, "temporarily_unavailable"],
      ["cross-site", () => post(app, SIGN_IN, { email: EMAIL, password: PASSWORD }, { origin: "https://evil.example" }), 403, "forbidden_origin"],
      ["referrer work email", () => { state.standings.set("asha@wipro.com", "referrer_work_email"); wos.authenticateWithPassword.mockResolvedValueOnce(authResponse(workosUser({ id: "user_ref", email: "asha@wipro.com" }))); return post(app, SIGN_IN, { email: "asha@wipro.com", password: PASSWORD }); }, 403, "use_work_email_code"],
    ];
    for (const [label, call, status, code] of cases) {
      const started = Date.now();
      const res = await call();
      expect(Date.now() - started, label).toBeGreaterThanOrEqual(145);
      expect(res.status, label).toBe(status);
      if (code) expect(res.body.code, label).toBe(code);
    }
    // Other password routes are not held: forgot already answers before any WorkOS work.
    const started = Date.now();
    expect((await post(app, "/api/auth/password/forgot", { email: EMAIL })).status).toBe(200);
    expect(Date.now() - started).toBeLessThan(145);
  });

  it("password POSTs refuse cross-site and non-JSON requests", async () => {
    const app = await buildApp();
    expect((await post(app, SIGN_IN, `email=${encodeURIComponent(EMAIL)}&password=x`, { form: true })).status).toBe(403);
    for (const path of [SIGN_IN, SIGN_UP, "/api/auth/password/forgot", "/api/auth/password/reset/confirm"]) {
      const evil = await post(app, path, { email: EMAIL, password: PASSWORD }, { origin: "https://evil.example" });
      expect(evil.status, path).toBe(403);
      expect(evil.body.code).toBe("forbidden_origin");
    }
    expect((await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD }, { origin: null })).status).toBe(403);
    expect(Object.values(wos).every(fn => fn.mock.calls.length === 0)).toBe(true);
    expect((await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD })).status).toBe(200);
    expect((await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD, intent: "referrer" })).body.code).toBe("invalid_input");
  });

  it("blocked, suspended and racing accounts get no session", async () => {
    const app = await buildApp();
    resolveLoginIdentity.mockRejectedValueOnce(new Error("IDENTITY_REVIEW_REQUIRED"));
    const review = await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD });
    expect(review.status).toBe(403);
    expect(review.body.code).toBe("account_review");
    resolveLoginIdentity.mockRejectedValueOnce(new Error("ACCOUNT_NOT_ACTIVE"));
    const inactive = await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD });
    expect(inactive.status).toBe(403);
    expect(inactive.body.code).toBe("account_inactive");
    resolveLoginIdentity.mockResolvedValueOnce({ id: 99, openId: "workos_gone", email: EMAIL, sessionsValidAfter: new Date(0) });
    const raced = await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD });
    expect(raced.status).toBe(403);
    expect(raced.body.code).toBe("account_inactive");
    for (const res of [review, inactive, raced]) expect(cookieOf(res, "app_session_id")).toBeUndefined();
  });

  // D-078 ruling 3 (S-2): the refusal is decided by a read-only lookup before the canonical resolver runs, so it
  // writes no alias and no audit row and signs nobody out.
  it("a referrer's own verified work email can never sign in with a password, and the refusal leaves no trace", async () => {
    const app = await buildApp();
    for (const email of ["asha@wipro.com", "asha@in.wipro.com"]) {
      state.standings.set(email, "referrer_work_email");
      const refused = await post(app, SIGN_IN, { email, password: PASSWORD });
      expect(refused.status).toBe(403);
      expect(refused.body.code).toBe("use_work_email_code");
      expect(cookieOf(refused, "app_session_id")).toBeUndefined();
      // D-081: decided before WorkOS is asked anything.
      expect(state.standingCalls.at(-1)).toEqual([email, undefined]);
    }
    expect(wos.authenticateWithPassword).not.toHaveBeenCalled();
    expect(resolveLoginIdentity).not.toHaveBeenCalled();
    expect(revokeUserSessions).not.toHaveBeenCalled();
    // Defence in depth: should the lookup miss, the resolved account's own work domain still refuses.
    state.witnesses.add("user_ref2");
    const referrer = seedAccount("workos_user_ref2", { email: "ravi@wipro.com" });
    state.workEmailDomains.set(referrer.id, "wipro.com");
    wos.authenticateWithPassword.mockResolvedValueOnce(authResponse(workosUser({ id: "user_ref2", email: "ravi@wipro.com" })));
    expect((await post(app, SIGN_IN, { email: "ravi@wipro.com", password: PASSWORD })).body.code).toBe("use_work_email_code");
    const seeker = seedAccount("workos_user_x");
    state.workEmailDomains.set(seeker.id, "wipro.com");
    const personal = await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD });
    expect(personal.status).toBe(200);
    expect(personal.body.step).toBe("signed_in");
  });

  // D-081 (review F-R1): every address at a verified referrer domain is a referrer work email on the password paths.
  // Sign-up looks like any other; an unverified or a normal password sign-in never reaches WorkOS and answers
  // use_work_email_code; nothing is ever emailed to it.
  it("an address at a verified referrer domain never reaches WorkOS or gets an email on any password path", async () => {
    const app = await buildApp({ responseFloorMs: 120 });
    state.referrerDomains.add("wipro.com");
    const fresh = await post(app, SIGN_UP, { email: "new@gmail.com" });
    await flush();
    const calls = Object.values(wos).map(fn => fn.mock.calls.length);
    const mails = mail.mock.calls.length;
    for (const email of ["asha@wipro.com", "someone.else@wipro.com"]) {
      const started = Date.now();
      const signUp = await post(app, SIGN_UP, { email });
      expect(Date.now() - started).toBeGreaterThanOrEqual(115);
      expect(signUp.status).toBe(fresh.status);
      expect(signUp.body).toEqual(fresh.body);
      expect(signUp.headers["set-cookie"]).toBeUndefined();
      // A sign-in WorkOS would have answered with email_verification_required, and a plain one.
      wos.authenticateWithPassword.mockRejectedValueOnce(needsVerification({ email }));
      const signIn = await post(app, SIGN_IN, { email, password: PASSWORD });
      expect(signIn.status).toBe(403);
      expect(signIn.body).toEqual({ ok: false, code: "use_work_email_code", message: PASSWORD_AUTH_COPY.use_work_email_code });
      expect(wos.authenticateWithPassword).not.toHaveBeenCalled();
      wos.authenticateWithPassword.mockReset().mockResolvedValue(authResponse());
    }
    await flush();
    expect(Object.values(wos).map(fn => fn.mock.calls.length)).toEqual(calls);
    expect(mail.mock.calls.length).toBe(mails);
    expect(state.standingRules.every(rule => rule !== "social")).toBe(true);
    // A personal address is unaffected.
    expect((await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD })).body.step).toBe("signed_in");
  });

  // D-078 ruling 3 (S-3): a referrer's work email never reaches WorkOS from sign-up and is never emailed.
  it("sign-up with a referrer's work email makes no WorkOS call and sends nothing, and looks like any other sign-up", async () => {
    const app = await buildApp();
    state.standings.set("asha@wipro.com", "referrer_work_email");
    const fresh = await post(app, SIGN_UP, { email: "new@gmail.com" });
    await flush();
    const calls = Object.values(wos).map(fn => fn.mock.calls.length);
    const mails = mail.mock.calls.length;
    const referrer = await post(app, SIGN_UP, { email: "asha@wipro.com" });
    await flush();
    expect(referrer.status).toBe(fresh.status);
    expect(referrer.body).toEqual(fresh.body);
    expect(Object.values(wos).map(fn => fn.mock.calls.length)).toEqual(calls);
    expect(mail.mock.calls.length).toBe(mails);
    expect(cookieOf(referrer, "app_session_id")).toBeUndefined();
  });

  it("password unavailability is loud and honest; returnTo is validated server-side", async () => {
    const app = await buildApp();
    wos.authenticateWithPassword.mockRejectedValueOnce(new GenericServerException(400, `Password auth is disabled for ${EMAIL}`, { code: "authentication_method_not_allowed" }, "req_9"));
    const off = await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD });
    expect(off.status).toBe(503);
    expect(off.body.code).toBe("password_sign_in_unavailable");
    expect(capture).toHaveBeenCalledTimes(1);
    const [error, context] = capture.mock.calls[0] as [Error, Record<string, unknown>];
    expect(context).toEqual(expect.objectContaining({ operation: "sign_in", kind: "password_sign_in_unavailable", status: 400, code: "authentication_method_not_allowed", requestID: "req_9" }));
    expect(JSON.stringify([error.message, context])).not.toMatch(/asha|@|correct horse/);
    for (const returnTo of ["//evil.example", "https://evil.example", "/api/x", "/sign-in"]) {
      const res = await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD, returnTo });
      expect(res.body.redirectTo, returnTo).toBe("/explore");
    }
  });

  it("logout ends a password session everywhere", async () => {
    const app = await buildApp();
    const signedIn = await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD });
    const session = pairOf(cookieOf(signedIn, "app_session_id"));
    expect((await request(app).get("/session-proof").set("Cookie", session)).status).toBe(200);
    const account = state.accounts.get("workos_user_x");
    state.subjects.set(account?.id ?? -1, ["user_x"]);
    expect((await request(app).post("/api/auth/workos/logout").set("Cookie", session)).body).toEqual({ signedOut: true });
    expect((await request(app).get("/session-proof").set("Cookie", session)).status).toBe(401);
    expect(hosted.listSessions).toHaveBeenCalledWith("user_x");
    expect(hosted.revokeSession).toHaveBeenCalledWith({ sessionId: "session_pw" });
  });
});

describe("without WorkOS configuration (local dev)", () => {
  it("every password route answers 503 password_sign_in_unavailable", async () => {
    vi.resetModules();
    process.env.PUBLIC_BASE_URL = "https://skipwait.me";
    const { registerPasswordAuthRoutes } = await import("./passwordAuthRoutes");
    const app = express();
    app.set("trust proxy", true);
    app.use(express.json());
    registerPasswordAuthRoutes(app, { client: null, store: createMemoryDurableLimitStore() });
    for (const [path, body] of [[SIGN_IN, { email: EMAIL, password: PASSWORD }], [SIGN_UP, { email: EMAIL }], ["/api/auth/password/forgot", { email: EMAIL }]] as const) {
      const res = await post(app, path, body);
      expect(res.status, path).toBe(503);
      expect(res.body.code).toBe("password_sign_in_unavailable");
    }
  });
});
