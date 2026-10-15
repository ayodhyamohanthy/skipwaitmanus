import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMx } from "node:dns/promises";
import { drizzle } from "drizzle-orm/mysql2";
import type { Pool } from "mysql2/promise";
import { getDb } from "./db";
import { OTP_RESEND_COOLDOWN_SECONDS, OtpLockedError, createWorkEmailOtpService, hashCode, isValidWorkEmailOtpEmail } from "./workEmailOtp";

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

  it("hashes codes with the email salt so identical codes differ per address", () => {
    expect(hashCode("a@acme.com", "123456")).not.toBe(hashCode("b@acme.com", "123456"));
    expect(hashCode("a@acme.com", "123456")).toHaveLength(64);
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
