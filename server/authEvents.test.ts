import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import type { OperationalActivityInput } from "./db";
import { AUTH_EVENT_BUDGET_PER_MINUTE, authEmailKey, authEventContext, createAuthEventRecorder, isEmailShape, maskEmail, reduceUserAgent, truncateIp } from "./authEvents";

// ADMIN-activity-log (D-393): every sign-in event is logged with no secret, a masked unknown email and a coarse device.
const SECRET = "test-jwt-secret-for-auth-events";
const req = (headers: Record<string, string> = {}, ip = "203.0.113.77"): Request =>
  ({ ip, header: (name: string) => headers[name.toLowerCase()], headers }) as unknown as Request;
const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

function recorder(findUserId: (email: string) => Promise<number | undefined> = async () => undefined) {
  const rows: OperationalActivityInput[] = [];
  const capture = vi.fn();
  const record = createAuthEventRecorder({ record: async row => { rows.push(row); }, findVerifiedUserIdByEmail: findUserId, secret: () => SECRET, capture });
  return { rows, capture, record };
}

describe("masking and reduction", () => {
  it("masks an email to its first letter and domain", () => {
    expect(maskEmail("Asha.Rao@Gmail.com")).toBe("a***@gmail.com");
    expect(maskEmail("x@example.org")).toBe("x***@example.org");
    expect(maskEmail("not-an-email")).toBeUndefined();
  });

  it("checks an address shape in linear time, even on a hostile string", () => {
    expect(isEmailShape("asha.rao@mail.example.co.in")).toBe(true);
    for (const bad of ["asha@", "asha@example", "asha@example..com", "a b@example.com", "a@b@c.com", `a@${"b".repeat(320)}.com`]) expect(isEmailShape(bad)).toBe(false);
    const hostile = `a@${".".repeat(50_000)}!`;
    const started = performance.now();
    expect(isEmailShape(hostile.slice(0, 320))).toBe(false);
    expect(isEmailShape(`a@${"b.".repeat(150)}`)).toBe(false);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it("keys an email with an HMAC that groups case and spacing variants and reveals nothing", () => {
    const key = authEmailKey(" Asha.Rao@gmail.com ", SECRET);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(authEmailKey("asha.rao@gmail.com", SECRET)).toBe(key);
    expect(authEmailKey("asha.rao@gmail.com", "another-secret")).not.toBe(key);
    expect(key).not.toContain("asha");
  });

  it("truncates IPv4 to /24 and IPv6 to /48, and drops anything else", () => {
    expect(truncateIp("203.0.113.77")).toBe("203.0.113.0/24");
    expect(truncateIp("::ffff:198.51.100.9")).toBe("198.51.100.0/24");
    expect(truncateIp("2001:db8:abcd:12::1")).toBe("2001:db8:abcd::/48");
    expect(truncateIp("2001:db8::1")).toBe("2001:db8:0::/48");
    expect(truncateIp("unknown")).toBeUndefined();
    expect(truncateIp("")).toBeUndefined();
  });

  it("reduces a user agent to browser family, OS family and device type", () => {
    expect(reduceUserAgent(CHROME_MAC)).toEqual({ browser: "Chrome", os: "macOS", device: "desktop" });
    expect(reduceUserAgent(SAFARI_IPHONE)).toEqual({ browser: "Safari", os: "iOS", device: "mobile" });
    expect(reduceUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0")).toEqual({ browser: "Edge", os: "Windows", device: "desktop" });
    expect(reduceUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36")).toEqual({ browser: "Chrome", os: "Android", device: "mobile" });
    expect(reduceUserAgent("curl/8.5.0")).toEqual({ browser: "Other", os: "Other", device: "bot" });
    expect(reduceUserAgent(undefined)).toEqual({ browser: "Other", os: "Other", device: "unknown" });
  });

  it("reads a coarse country only when it is a two-letter code", () => {
    expect(authEventContext(req({ "cf-ipcountry": "IN", "user-agent": CHROME_MAC }))).toEqual({ ip: "203.0.113.0/24", country: "IN", browser: "Chrome", os: "macOS", device: "desktop" });
    expect(authEventContext(req({ "cf-ipcountry": "<script>" })).country).toBeUndefined();
  });
});

describe("recordAuthEvent", () => {
  it("records a success with the account, the method and the coarse context, and no email", async () => {
    const { rows, record } = recorder();
    await record(req({ "cf-ipcountry": "IN", "user-agent": CHROME_MAC }), { action: "auth.password_sign_in", outcome: "success", userId: 41, email: "asha@gmail.com", method: "password", plane: "seeker" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: 41, action: "auth.password_sign_in", outcome: "success", resourceType: "auth" });
    expect(rows[0].metadata).toEqual({ method: "password", plane: "seeker", emailKey: authEmailKey("asha@gmail.com", SECRET), ip: "203.0.113.0/24", country: "IN", browser: "Chrome", os: "macOS", device: "desktop" });
  });

  it("attributes a failed attempt to an existing account through its verified email, without storing the email", async () => {
    const { rows, record } = recorder(async email => (email === "asha@gmail.com" ? 41 : undefined));
    await record(req(), { action: "auth.password_sign_in", outcome: "failure", reason: "wrong_password", email: "Asha@Gmail.com", method: "password" });
    expect(rows[0].actorUserId).toBe(41);
    expect(rows[0].metadata).toMatchObject({ reason: "wrong_password", emailKey: authEmailKey("asha@gmail.com", SECRET) });
    expect(rows[0].metadata).not.toHaveProperty("maskedEmail");
  });

  it("stores only a masked email and its key when no account has that email", async () => {
    const { rows, record } = recorder();
    await record(req(), { action: "auth.password_sign_in", outcome: "failure", reason: "wrong_password", email: "stranger@gmail.com" });
    expect(rows[0].actorUserId).toBeUndefined();
    expect(rows[0].metadata).toMatchObject({ maskedEmail: "s***@gmail.com", emailKey: authEmailKey("stranger@gmail.com", SECRET) });
    expect(JSON.stringify(rows[0])).not.toContain("stranger");
  });

  it("never stores a secret: unknown fields are dropped and an unknown reason becomes other", async () => {
    const { rows, record } = recorder();
    const sneaky = { action: "auth.work_email_code_verified", outcome: "failure", reason: "123456", email: "a@acme.com", code: "123456", password: "hunter2", token: "tok_abc", companyDomain: "acme.com" } as unknown as Parameters<typeof record>[1];
    await record(req({ cookie: "app_session_id=abc", authorization: "Bearer xyz" }), sneaky);
    const stored = JSON.stringify(rows[0]);
    for (const secret of ["123456", "hunter2", "tok_abc", "app_session_id", "Bearer", "xyz"]) expect(stored).not.toContain(secret);
    expect(rows[0].metadata).toMatchObject({ reason: "other" });
    expect(rows[0].companyDomain).toBe("acme.com");
  });

  it("never throws and reports a failed write", async () => {
    const capture = vi.fn();
    const record = createAuthEventRecorder({ record: async () => { throw new Error("db down"); }, findVerifiedUserIdByEmail: async () => undefined, secret: () => SECRET, capture });
    await expect(record(req(), { action: "auth.sign_out", outcome: "success", userId: 3 })).resolves.toBeUndefined();
    expect(capture).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ lane: "auth-events", action: "auth.sign_out" }));
  });

  it("still records when the account lookup fails, as an unknown email", async () => {
    const { rows, record } = recorder(async () => { throw new Error("lookup down"); });
    await record(req(), { action: "auth.password_sign_in", outcome: "failure", reason: "wrong_password", email: "asha@gmail.com" });
    expect(rows[0]).toMatchObject({ actorUserId: undefined, metadata: expect.objectContaining({ maskedEmail: "a***@gmail.com" }) });
  });

  it("records without a request (a deferred step) and without a secret configured", async () => {
    const rows: OperationalActivityInput[] = [];
    const record = createAuthEventRecorder({ record: async row => { rows.push(row); }, findVerifiedUserIdByEmail: async () => undefined, secret: () => undefined, capture: vi.fn() });
    await record(undefined, { action: "auth.password_forgot", outcome: "success", email: "asha@gmail.com" });
    expect(rows[0].metadata).toEqual({ maskedEmail: "a***@gmail.com" });
  });
});

// CodeQL js/missing-rate-limiting on PR #1566: a flood of sign-in attempts or refused requests must not become one
// database write (and alias lookup) per request.
describe("recordAuthEvent write budget", () => {
  it("writes at most the budget per minute for one action, outcome and network, then resumes the next minute", async () => {
    let clock = Date.parse("2026-11-24T16:00:00Z");
    const rows: OperationalActivityInput[] = [];
    const lookups = vi.fn(async () => undefined);
    const capture = vi.fn();
    const record = createAuthEventRecorder({ record: async row => { rows.push(row); }, findVerifiedUserIdByEmail: lookups, secret: () => SECRET, capture, now: () => clock });
    const flood = () => record(req({}, "203.0.113.77"), { action: "auth.admin_sign_in", outcome: "denied", reason: "not_allowed", email: "x@gmail.com" });
    for (let i = 0; i < AUTH_EVENT_BUDGET_PER_MINUTE + 50; i += 1) await flood();
    expect(rows).toHaveLength(AUTH_EVENT_BUDGET_PER_MINUTE);
    expect(lookups).toHaveBeenCalledTimes(AUTH_EVENT_BUDGET_PER_MINUTE);
    expect(capture).toHaveBeenCalledTimes(1);
    // Another network, or another outcome, has its own budget.
    await record(req({}, "198.51.100.4"), { action: "auth.admin_sign_in", outcome: "denied", reason: "not_allowed" });
    await record(req({}, "203.0.113.77"), { action: "auth.password_sign_in", outcome: "success", userId: 3 });
    expect(rows).toHaveLength(AUTH_EVENT_BUDGET_PER_MINUTE + 2);
    clock += 60_000;
    await flood();
    expect(rows).toHaveLength(AUTH_EVENT_BUDGET_PER_MINUTE + 3);
  });
});
