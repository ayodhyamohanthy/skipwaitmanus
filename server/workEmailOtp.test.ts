import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { resolveMx } from "node:dns/promises";
import { drizzle } from "drizzle-orm/mysql2";
import type { Pool } from "mysql2/promise";
import { getDb } from "./db";
import { OTP_HMAC_SINCE, OTP_RESEND_COOLDOWN_SECONDS, OtpLockedError, createWorkEmailOtpService, hashCode, isValidOtpLoginEmail, isValidWorkEmailOtpEmail, otpEmailMessage } from "./workEmailOtp";

vi.mock("./db", async () => {
  const { isCorporateEmailDomain } = await import("../shared/const");
  return { getDb: vi.fn(), isWorkEmailDomain: isCorporateEmailDomain };
});
vi.mock("node:dns/promises", () => ({ resolveMx: vi.fn(), resolve4: vi.fn() }));

beforeEach(() => {
  vi.mocked(getDb).mockResolvedValue(null);
  vi.mocked(resolveMx).mockResolvedValue([{ exchange: "mail.acme.com", priority: 10 }]);
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

function connectedDatabase() {
  const query = vi.fn(async (_query: { sql: string }, _params: unknown[]) => [{ affectedRows: 1, insertId: 1 }, []]);
  const db = drizzle({ client: { query } as unknown as Pool });
  vi.mocked(getDb).mockResolvedValue(db);
  return { query, db };
}

describe("work email OTP validation", () => {
  it("accepts only plausible company addresses and rejects malformed or consumer ones", () => {
    expect(isValidWorkEmailOtpEmail("ref@acme.com")).toBe(true);
    expect(isValidWorkEmailOtpEmail("REF@ACME.COM")).toBe(true);
    // Referrer-plane OTP is work-email-only: consumer inboxes never receive codes.
    expect(isValidWorkEmailOtpEmail("seeker@gmail.com")).toBe(false);
    expect(isValidWorkEmailOtpEmail("person@outlook.com")).toBe(false);
    expect(isValidWorkEmailOtpEmail("not-an-email")).toBe(false);
    expect(isValidWorkEmailOtpEmail("")).toBe(false);
    expect(isValidWorkEmailOtpEmail("a@b")).toBe(false);
  });

  it("seeker plane accepts consumer mailboxes while the referrer plane stays work-email-only", () => {
    // FOUNDER-LOCKED login rule: job seekers sign in with personal email, referrers with work email only.
    expect(isValidOtpLoginEmail("asha@gmail.com", { seeker: true })).toBe(true);
    expect(isValidOtpLoginEmail("a.sha+jobs@gmail.com", { seeker: true })).toBe(true);
    expect(isValidOtpLoginEmail("person@outlook.com", { seeker: true })).toBe(true);
    expect(isValidOtpLoginEmail("ref@acme.com", { seeker: true })).toBe(true);
    expect(isValidOtpLoginEmail("not-an-email", { seeker: true })).toBe(false);
    expect(isValidOtpLoginEmail("", { seeker: true })).toBe(false);
    expect(isValidOtpLoginEmail("asha@gmail.com")).toBe(false);
    expect(isValidOtpLoginEmail("ref@acme.com")).toBe(true);
  });

  it("hashes codes with the email salt so identical codes differ per address", () => {
    expect(hashCode("a@acme.com", "123456")).not.toBe(hashCode("b@acme.com", "123456"));
    expect(hashCode("a@acme.com", "123456")).toHaveLength(64);
  });
});

describe("work email OTP message", () => {
  it("leads the subject with the code so the phone can offer it without opening the email", () => {
    const message = otpEmailMessage("482913");
    expect(message.subject).toBe("482913 is your skipwait.me verification code");
    expect(message.subject.startsWith("482913")).toBe(true);
    expect(message.text).toContain("Your skipwait.me verification code is 482913.");
    expect(message.text).toContain("expires in 10 minutes");
  });
});

describe("work email OTP delivery", () => {
  it("stores a code when delivery succeeds after nine seconds", async () => {
    vi.useFakeTimers();
    const { db } = connectedDatabase();
    const insert = vi.spyOn(db, "insert");
    const sendEmail = vi.fn(() => new Promise<{ sent: boolean; reason: string }>(resolve => {
      setTimeout(() => resolve({ sent: true, reason: "sent" }), 9_000);
    }));
    const pending = createWorkEmailOtpService({ sendEmail }).sendCode("ref@acme.com");
    await vi.advanceTimersByTimeAsync(9_000);
    expect(await pending).toEqual({ sent: true, reason: "sent" });
    expect(insert).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses a 30 second resend cooldown and reports how long to wait", async () => {
    expect(OTP_RESEND_COOLDOWN_SECONDS).toBe(30);
    const { query } = connectedDatabase();
    query.mockImplementation(async () => [{ affectedRows: 0, insertId: 0 }, []]);
    const result = await createWorkEmailOtpService({ sendEmail: vi.fn(async () => ({ sent: true, reason: "sent" })), now: () => 1_000_000 }).sendCode("ref@acme.com", { ip: "1.2.3.4" });
    expect(result.sent).toBe(false); expect(result.reason).toBe("rate_limited");
    expect(result.retryAfterSeconds).toBeGreaterThan(0); expect(result.retryAfterSeconds).toBeLessThanOrEqual(600);
  });

  it("refuses to check a code while the email and IP pair is locked, and says when it ends", async () => {
    const { query } = connectedDatabase();
    const until = new Date(5_000_000 + 10 * 60_000);
    query.mockImplementation(async (q: { sql: string }) => q.sql.includes("MAX(expiresAt)") ? [[{ until }], []] : [{ affectedRows: 1, insertId: 1 }, []]);
    const error = await createWorkEmailOtpService({ now: () => 5_000_000 }).verifyCode("ref@acme.com", "123456", { ip: "1.2.3.4" }).catch(reason => reason);
    expect(error).toBeInstanceOf(OtpLockedError);
    expect(error.retryAfterSeconds).toBe(600);
    expect(error.lockedUntil.getTime()).toBe(until.getTime());
    // The code itself was never looked up while locked.
    expect(query.mock.calls.some(([q]) => (q as { sql: string }).sql.includes("FROM workEmailOtpCodes"))).toBe(false);
  });

  it.each(["delivery_failed", "not_configured"])("does not store a code after %s", async reason => {
    const { db } = connectedDatabase();
    const insert = vi.spyOn(db, "insert");
    const sendEmail = vi.fn(async () => ({ sent: false, reason }));
    expect(await createWorkEmailOtpService({ sendEmail }).sendCode("ref@acme.com")).toEqual({ sent: false, reason });
    expect(insert).not.toHaveBeenCalled();
  });

  it("normalizes a rejected delivery promise without storing a code", async () => {
    const { db } = connectedDatabase();
    const insert = vi.spyOn(db, "insert");
    const sendEmail = vi.fn(async () => { throw new Error("network unavailable"); });
    await expect(createWorkEmailOtpService({ sendEmail }).sendCode("ref@acme.com")).resolves.toEqual({ sent: false, reason: "delivery_failed" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("seeker send accepts a gmail address and stores the code, while the referrer plane still refuses it", async () => {
    const { db } = connectedDatabase();
    const insert = vi.spyOn(db, "insert");
    const sendEmail = vi.fn(async () => ({ sent: true, reason: "sent" }));
    const service = createWorkEmailOtpService({ sendEmail });
    await expect(service.sendCode("asha@gmail.com", { ip: "1.2.3.4", seeker: true })).resolves.toEqual({ sent: true, reason: "sent" });
    expect(sendEmail).toHaveBeenCalledWith({ to: "asha@gmail.com", code: expect.stringMatching(/^\d{6}$/) });
    expect(insert).toHaveBeenCalledOnce();
    sendEmail.mockClear(); insert.mockClear();
    await expect(service.sendCode("asha@gmail.com", { ip: "1.2.3.4" })).resolves.toEqual({ sent: false, reason: "invalid_email" });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("seeker verify reaches the code store for a gmail address, referrer plane short-circuits it", async () => {
    const { query } = connectedDatabase();
    const service = createWorkEmailOtpService({ now: () => 5_000_000 });
    expect(await service.verifyCode("asha@gmail.com", "123456", { ip: "1.2.3.4", seeker: true })).toBe(false);
    const seekerLookedUp = query.mock.calls.some(([q]) => (q as { sql: string }).sql.includes("FROM workEmailOtpCodes"));
    expect(seekerLookedUp).toBe(true);
    query.mockClear();
    expect(await service.verifyCode("asha@gmail.com", "123456", { ip: "1.2.3.4" })).toBe(false);
    const referrerLookedUp = query.mock.calls.some(([q]) => (q as { sql: string }).sql.includes("FROM workEmailOtpCodes"));
    expect(referrerLookedUp).toBe(false);
  });

  it("does not leave a timeout running after immediate delivery", async () => {
    vi.useFakeTimers();
    connectedDatabase();
    const sendEmail = vi.fn(async () => ({ sent: true, reason: "sent" }));
    await expect(createWorkEmailOtpService({ sendEmail }).sendCode("ref@acme.com")).resolves.toEqual({ sent: true, reason: "sent" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("work email OTP service input contract", () => {
  it("rejects invalid input before any storage or delivery call", async () => {
    const sendEmail = vi.fn();
    const service = createWorkEmailOtpService({ sendEmail: sendEmail as never });
    const result = await service.sendCode("not-an-email");
    expect(result).toEqual({ sent: false, reason: "invalid_email" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("rejects malformed codes during verification without storage access", async () => {
    const service = createWorkEmailOtpService();
    expect(await service.verifyCode("ref@acme.com", "12")).toBe(false);
    expect(await service.verifyCode("not-an-email", "123456")).toBe(false);
  });
});

// D-100.otp-hmac: a six-digit code has a million values, so a stored SHA-256 of `email:code`
// is recoverable offline by anyone holding a row. The stored hash is an HMAC under a server key.
describe("work email OTP code hash (D-100.otp-hmac)", () => {
  const legacySha256 = (email: string, code: string) => createHash("sha256").update(`${email.toLowerCase()}:${code}`).digest("hex");
  const cutoff = Date.parse(OTP_HMAC_SINCE);

  function databaseWithCode(row: { codeHash: string; attempts?: number; createdAt: Date }) {
    const { query, db } = connectedDatabase();
    query.mockImplementation(async (q: { sql: string }) => {
      if (q.sql.includes("MAX(expiresAt)")) return [[{ until: null }], []];
      if (q.sql.includes("SELECT") && q.sql.includes("FROM workEmailOtpCodes")) return [[{ id: 7, codeHash: row.codeHash, attempts: row.attempts ?? 0, createdAt: row.createdAt }], []];
      return [{ affectedRows: 1, insertId: 1 }, []];
    });
    return { query, db };
  }
  const attemptCounted = (query: ReturnType<typeof connectedDatabase>["query"]) =>
    query.mock.calls.some(([q]) => /update `workEmailOtpCodes` set `attempts`/i.test((q as { sql: string }).sql));
  const consumed = (query: ReturnType<typeof connectedDatabase>["query"]) =>
    query.mock.calls.some(([q]) => /update `workEmailOtpCodes` set `consumedAt`/i.test((q as { sql: string }).sql));

  it("has a valid ISO cutoff for the legacy form", () => {
    expect(Number.isFinite(cutoff)).toBe(true);
    expect(new Date(cutoff).toISOString()).toBe(OTP_HMAC_SINCE);
  });

  it("stores a keyed HMAC, never SHA-256 of email:code, at the same 64-hex width", async () => {
    expect(hashCode("ref@acme.com", "123456")).not.toBe(legacySha256("ref@acme.com", "123456"));
    expect(hashCode("ref@acme.com", "123456")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCode("ref@acme.com", "123456", "key-a")).not.toBe(hashCode("ref@acme.com", "123456", "key-b"));
    expect(hashCode("REF@ACME.COM", "123456")).toBe(hashCode("ref@acme.com", "123456"));
    const { query } = connectedDatabase();
    const sendEmail = vi.fn(async (_input: { to: string; code: string }) => ({ sent: true, reason: "sent" }));
    await createWorkEmailOtpService({ sendEmail }).sendCode("ref@acme.com", { ip: "1.2.3.4" });
    const code = sendEmail.mock.calls[0][0].code;
    const insertCall = query.mock.calls.find(([q]) => /insert into `workEmailOtpCodes`/i.test((q as { sql: string }).sql));
    expect(insertCall).toBeDefined();
    const params = (insertCall?.[1] ?? []) as unknown[];
    const stored = params.find(value => typeof value === "string" && /^[0-9a-f]{64}$/.test(value));
    expect(stored).toBe(hashCode("ref@acme.com", code));
    expect(stored).not.toBe(legacySha256("ref@acme.com", code));
  });

  it("verifies the right code against an HMAC row and consumes it", async () => {
    const { query } = databaseWithCode({ codeHash: hashCode("ref@acme.com", "123456"), createdAt: new Date(cutoff + 60_000) });
    expect(await createWorkEmailOtpService({ now: () => cutoff + 120_000 }).verifyCode("ref@acme.com", "123456", { ip: "1.2.3.4" })).toBe(true);
    expect(consumed(query)).toBe(true);
    expect(attemptCounted(query)).toBe(false);
  });

  it("still verifies a legacy SHA-256 row created before the cutoff", async () => {
    const { query } = databaseWithCode({ codeHash: legacySha256("ref@acme.com", "123456"), createdAt: new Date(cutoff - 60_000) });
    expect(await createWorkEmailOtpService({ now: () => cutoff + 60_000 }).verifyCode("ref@acme.com", "123456", { ip: "1.2.3.4" })).toBe(true);
    expect(consumed(query)).toBe(true);
  });

  it("refuses a legacy-form hash on a row created after the cutoff and counts the attempt", async () => {
    const { query } = databaseWithCode({ codeHash: legacySha256("ref@acme.com", "123456"), createdAt: new Date(cutoff + 60_000) });
    expect(await createWorkEmailOtpService({ now: () => cutoff + 120_000 }).verifyCode("ref@acme.com", "123456", { ip: "1.2.3.4" })).toBe(false);
    expect(consumed(query)).toBe(false);
    expect(attemptCounted(query)).toBe(true);
  });

  it("a wrong code still counts an attempt on an HMAC row", async () => {
    const { query } = databaseWithCode({ codeHash: hashCode("ref@acme.com", "123456"), createdAt: new Date(cutoff + 60_000) });
    expect(await createWorkEmailOtpService({ now: () => cutoff + 120_000 }).verifyCode("ref@acme.com", "654321", { ip: "1.2.3.4" })).toBe(false);
    expect(consumed(query)).toBe(false);
    expect(attemptCounted(query)).toBe(true);
  });
});
