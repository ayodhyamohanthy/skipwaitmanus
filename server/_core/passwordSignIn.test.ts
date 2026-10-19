// Seeker email + password on skipwait.me (D-049): sign-in, sign-up, the email-verification step WorkOS
// requires, and logout. WorkOS is a fake with the SDK's real exception classes; the session, identity
// resolver and cookies are the real modules over a mocked db.
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationException, BadRequestException, GenericServerException, RateLimitExceededException, UnprocessableEntityException } from "@workos-inc/node";
import { PASSWORD_AUTH_COPY } from "@shared/passwordAuth";
import { createMemoryDurableLimitStore } from "./memoryDurableLimitStore";
import type { DurableLimitStore } from "./durableRateLimit";

type Row = Record<string, unknown> & { id: number; openId: string; email: string; sessionsValidAfter: Date };
const state = vi.hoisted(() => ({ accounts: new Map<string, Row>(), workEmailDomains: new Map<number, string>(), subjects: new Map<number, string[]>(), standings: new Map<string, string>(), standingCalls: [] as Array<[string, string | undefined]>, nextId: 10 }));
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

let pending: Promise<void>[] = [];
async function buildApp(options: { store?: DurableLimitStore | null; now?: () => number } = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(baseEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  const { createWorkosAuthRoutesRegistrar } = await import("./workosAuth");
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const store = options.store === undefined ? createMemoryDurableLimitStore() : options.store;
  createWorkosAuthRoutesRegistrar({ workos: { userManagement: hosted } as never, password: { client: wos, store, now: options.now, defer: task => { pending.push(task()); }, emailStanding: async (email, lookup) => { state.standingCalls.push([email, lookup?.workosUserId]); return (state.standings.get(email) ?? "unknown") as never; } } })(app);
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
const attributesOf = (setCookie: string | undefined) => (setCookie ?? "").split(";").slice(1).map(part => part.trim()).filter(part => !part.startsWith("Expires=")).sort();
const SIGN_IN = "/api/auth/password/sign-in";
const SIGN_UP = "/api/auth/password/sign-up";
const VERIFY = "/api/auth/password/verify-email";
const RESEND = "/api/auth/password/verify-email/resend";

beforeEach(() => {
  pending = [];
  state.accounts.clear(); state.workEmailDomains.clear(); state.subjects.clear(); state.standings.clear(); state.standingCalls = []; state.nextId = 10;
  [resolveLoginIdentity, revokeUserSessions, capture, recordActivity, ...Object.values(wos), ...Object.values(hosted)].forEach(fn => fn.mockReset());
  revokeUserSessions.mockImplementation(async (openId: string) => { const row = state.accounts.get(openId); if (row) row.sessionsValidAfter = new Date(Date.now() + 1000); });
  resolveLoginIdentity.mockImplementation(async (input: { openId: string; email: string }) => state.accounts.get(input.openId) ?? seedAccount(input.openId, { email: input.email }));
  recordActivity.mockResolvedValue(undefined);
  wos.authenticateWithPassword.mockResolvedValue(authResponse());
  wos.authenticateWithEmailVerification.mockResolvedValue(authResponse());
  wos.createUser.mockResolvedValue(workosUser({ emailVerified: false }));
  wos.sendVerificationEmail.mockResolvedValue({ user: workosUser({ emailVerified: false }) });
  wos.verifyEmail.mockResolvedValue({ user: workosUser() });
  wos.getEmailVerification.mockResolvedValue({ object: "email_verification", id: "email_verification_1", userId: "user_x", email: EMAIL, code: "999999", expiresAt: "2026-10-18T00:10:00Z", createdAt: "x", updatedAt: "x" });
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

  it("an unverified email never gets a session; the verification step replaces it", async () => {
    const app = await buildApp();
    wos.authenticateWithPassword.mockRejectedValueOnce(needsVerification());
    const res = await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, step: "verify_email" });
    const ticket = cookieOf(res, "pw_verify");
    for (const attribute of ["HttpOnly", "Path=/api/auth/password", "Max-Age=600", "Secure", "SameSite=Lax"]) expect(ticket).toContain(attribute);
    expect(ticket).not.toContain("pat_secret_token");
    expect(JSON.stringify(res.body)).not.toContain("pat_");
    expect(cookieOf(res, "app_session_id")).toBeUndefined();
    expect(resolveLoginIdentity).not.toHaveBeenCalled();

    wos.authenticateWithPassword.mockResolvedValueOnce(authResponse(workosUser({ emailVerified: false })));
    const unverifiedSuccess = await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD });
    expect(unverifiedSuccess.body).toEqual({ ok: true, step: "verify_email" });
    expect(wos.sendVerificationEmail).toHaveBeenCalledWith({ userId: "user_x" });
    expect(cookieOf(unverifiedSuccess, "app_session_id")).toBeUndefined();
    expect(resolveLoginIdentity).not.toHaveBeenCalled();
  });

  it("a correct code finishes sign-in; wrong, exhausted, expired or tampered tickets do not", async () => {
    const app = await buildApp();
    wos.authenticateWithPassword.mockRejectedValueOnce(needsVerification());
    const ticket = pairOf(cookieOf(await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD, returnTo: "/plans" }), "pw_verify"));
    const done = await post(app, VERIFY, { code: "482913" }, { cookie: ticket });
    expect(done.status).toBe(200);
    expect(done.body).toEqual({ ok: true, step: "signed_in", redirectTo: "/plans" });
    expect(wos.authenticateWithEmailVerification).toHaveBeenCalledWith({ code: "482913", pendingAuthenticationToken: "pat_secret_token", ipAddress: IP, userAgent: UA });
    expect(cookieOf(done, "app_session_id")).toBeDefined();
    expect(cookieOf(done, "pw_verify")).toMatch(/^pw_verify=;/);

    wos.authenticateWithPassword.mockResolvedValueOnce(authResponse(workosUser({ emailVerified: false })));
    const userTicket = pairOf(cookieOf(await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD }), "pw_verify"));
    const viaUser = await post(app, VERIFY, { code: "111111" }, { cookie: userTicket });
    expect(wos.verifyEmail).toHaveBeenCalledWith({ userId: "user_x", code: "111111" });
    expect(viaUser.body).toEqual({ ok: true, step: "signed_in", redirectTo: "/explore" });

    wos.authenticateWithPassword.mockRejectedValueOnce(needsVerification());
    const third = pairOf(cookieOf(await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD }), "pw_verify"));
    wos.authenticateWithEmailVerification.mockRejectedValue(new BadRequestException({ code: "invalid_one_time_code", errors: [], message: "Invalid code", requestID: "r" }));
    const before = wos.authenticateWithEmailVerification.mock.calls.length;
    for (let attempt = 0; attempt < 5; attempt++) {
      const wrong = await post(app, VERIFY, { code: "000000" }, { cookie: third });
      expect(wrong.status).toBe(400);
      expect(wrong.body.code).toBe("invalid_code");
      expect(cookieOf(wrong, "app_session_id")).toBeUndefined();
    }
    const sixth = await post(app, VERIFY, { code: "000000" }, { cookie: third });
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers["retry-after"])).toBeGreaterThan(0);
    expect(wos.authenticateWithEmailVerification.mock.calls.length - before).toBe(5);

    const tampered = await post(app, VERIFY, { code: "482913" }, { cookie: `${third.slice(0, -4)}AAAA` });
    expect(tampered.status).toBe(400);
    expect(tampered.body.code).toBe("expired");
    expect((await post(app, VERIFY, { code: "482913" })).body.code).toBe("expired");

    wos.authenticateWithPassword.mockRejectedValueOnce(needsVerification());
    const late = pairOf(cookieOf(await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD }), "pw_verify"));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 11 * 60_000);
    const expired = await post(app, VERIFY, { code: "482913" }, { cookie: late });
    expect(expired.status).toBe(400);
    expect(expired.body.code).toBe("expired");
  });

  it("resend sends a new WorkOS code at most once every 30 seconds", async () => {
    const app = await buildApp();
    wos.authenticateWithPassword.mockRejectedValueOnce(needsVerification());
    const ticket = pairOf(cookieOf(await post(app, SIGN_IN, { email: EMAIL, password: PASSWORD }), "pw_verify"));
    const first = await post(app, RESEND, {}, { cookie: ticket });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true, step: "verify_email" });
    expect(wos.sendVerificationEmail).toHaveBeenCalledWith({ userId: "user_x" });
    const again = await post(app, RESEND, {}, { cookie: ticket });
    expect(again.status).toBe(429);
    expect(wos.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect((await post(app, RESEND, {})).body.code).toBe("expired");
  });

  it("sign-up never reveals whether the email already has an account", async () => {
    const app = await buildApp();
    wos.authenticateWithPassword.mockRejectedValueOnce(needsVerification({ pending_authentication_token: "pat_new", user: { object: "user", id: "user_new", email: "new@gmail.com", email_verified: false } }));
    const fresh = await post(app, SIGN_UP, { email: "New@Gmail.com", password: "Longpassword1!" });
    expect(wos.createUser).toHaveBeenCalledWith({ email: "new@gmail.com", password: "Longpassword1!", ipAddress: IP, userAgent: UA });
    expect(fresh.status).toBe(200);
    expect(fresh.body).toEqual({ ok: true, step: "verify_email" });

    wos.createUser.mockRejectedValueOnce(emailTaken());
    wos.authenticateWithPassword.mockRejectedValueOnce(wrongPassword());
    const taken = await post(app, SIGN_UP, { email: EMAIL, password: "Longpassword1!" });
    expect(taken.status).toBe(fresh.status);
    expect(taken.body).toEqual(fresh.body);
    const freshTicket = cookieOf(fresh, "pw_verify");
    const takenTicket = cookieOf(taken, "pw_verify");
    expect(attributesOf(takenTicket)).toEqual(attributesOf(freshTicket));
    expect(pairOf(takenTicket).length).toBe(pairOf(freshTicket).length);
    expect(cookieOf(taken, "app_session_id")).toBeUndefined();
    await Promise.all(pending);
    expect(wos.createPasswordReset).toHaveBeenCalledWith({ email: EMAIL });
    // The decoy ticket never verifies.
    const decoy = await post(app, VERIFY, { code: "482913" }, { cookie: pairOf(takenTicket) });
    expect(decoy.body.code).toBe("invalid_code");

    wos.createUser.mockRejectedValueOnce(emailTaken());
    wos.authenticateWithPassword.mockResolvedValueOnce(authResponse());
    const owner = await post(app, SIGN_UP, { email: EMAIL, password: PASSWORD, returnTo: "/plans" });
    expect(owner.body).toEqual({ ok: true, step: "signed_in", redirectTo: "/plans" });
    expect(cookieOf(owner, "app_session_id")).toBeDefined();

    const calls = wos.createUser.mock.calls.length;
    const weak = await post(app, SIGN_UP, { email: "x@gmail.com", password: "short" });
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe("weak_password");
    expect(wos.createUser.mock.calls.length).toBe(calls);

    wos.createUser.mockRejectedValueOnce(new BadRequestException({ code: "password_strength_error", errors: [{ code: "password_breached" }], message: "Too weak", requestID: "r" }));
    const refused = await post(app, SIGN_UP, { email: "y@gmail.com", password: "Password123!" });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("weak_password");

    wos.createUser.mockRejectedValueOnce(new AuthenticationException(400, { error: "sso_required", error_description: "This domain signs in with SSO" }, "r"));
    const sso = await post(app, SIGN_UP, { email: "z@corp.example", password: "Password123!" });
    expect(sso.status).toBe(403);
    expect(sso.body.code).toBe("use_another_method");
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

  it("password POSTs refuse cross-site and non-JSON requests", async () => {
    const app = await buildApp();
    expect((await post(app, SIGN_IN, `email=${encodeURIComponent(EMAIL)}&password=x`, { form: true })).status).toBe(403);
    for (const path of [SIGN_IN, SIGN_UP, VERIFY, RESEND, "/api/auth/password/forgot", "/api/auth/password/reset/confirm"]) {
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
      wos.authenticateWithPassword.mockResolvedValueOnce(authResponse(workosUser({ id: "user_ref", email })));
      const refused = await post(app, SIGN_IN, { email, password: PASSWORD });
      expect(refused.status).toBe(403);
      expect(refused.body.code).toBe("use_work_email_code");
      expect(cookieOf(refused, "app_session_id")).toBeUndefined();
      expect(state.standingCalls.at(-1)).toEqual([email, "user_ref"]);
    }
    expect(resolveLoginIdentity).not.toHaveBeenCalled();
    expect(revokeUserSessions).not.toHaveBeenCalled();
    // Defence in depth: should the lookup miss, the resolved account's own work domain still refuses.
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

  // D-078 ruling 3 (S-3): a referrer's work email never reaches WorkOS from sign-up and is never emailed.
  it("sign-up with a referrer's work email makes no WorkOS call and sends nothing, and looks like any other sign-up", async () => {
    const app = await buildApp();
    state.standings.set("asha@wipro.com", "referrer_work_email");
    wos.authenticateWithPassword.mockRejectedValueOnce(needsVerification({ user: { object: "user", id: "user_new", email: "new@gmail.com", email_verified: false } }));
    const fresh = await post(app, SIGN_UP, { email: "new@gmail.com", password: "Longpassword1!" });
    const calls = Object.values(wos).map(fn => fn.mock.calls.length);
    const referrer = await post(app, SIGN_UP, { email: "asha@wipro.com", password: "Longpassword1!" });
    await Promise.all(pending);
    expect(referrer.status).toBe(fresh.status);
    expect(referrer.body).toEqual(fresh.body);
    expect(Object.values(wos).map(fn => fn.mock.calls.length)).toEqual(calls);
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
    for (const [path, body] of [[SIGN_IN, { email: EMAIL, password: PASSWORD }], [SIGN_UP, { email: EMAIL, password: "Longpassword1!" }], ["/api/auth/password/forgot", { email: EMAIL }]] as const) {
      const res = await post(app, path, body);
      expect(res.status, path).toBe(503);
      expect(res.body.code).toBe("password_sign_in_unavailable");
    }
  });
});
