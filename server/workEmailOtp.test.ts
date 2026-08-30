import { describe, expect, it, vi } from "vitest";
import { createWorkEmailOtpService, hashCode, isValidWorkEmailOtpEmail } from "./workEmailOtp";

// In-memory drizzle-like stand-in for the otp table.
function memoryTable() {
  const rows: Array<{ id: number; email: string; codeHash: string; attempts: number; expiresAt: Date; consumedAt: Date | null; createdAt: Date }> = [];
  let nextId = 1;
  const select = () => ({
    from: () => ({
      where: () => rows,
    }),
  });
  return {
    rows,
    select,
    insert: () => ({ values: (row: { email: string; codeHash: string; expiresAt: Date; createdAt: Date }) => { rows.push({ id: nextId++, attempts: 0, consumedAt: null, ...row }); } }),
    update: () => ({ set: () => ({ where: () => {} }) }),
  };
}

vi.mock("./db", () => ({
  getDb: async () => null,
}));

describe("work email OTP validation", () => {
  it("accepts plausible addresses and rejects malformed ones", () => {
    expect(isValidWorkEmailOtpEmail("ref@acme.com")).toBe(true);
    expect(isValidWorkEmailOtpEmail("REF@ACME.COM")).toBe(true);
    expect(isValidWorkEmailOtpEmail("not-an-email")).toBe(false);
    expect(isValidWorkEmailOtpEmail("")).toBe(false);
    expect(isValidWorkEmailOtpEmail("a@b")).toBe(false);
  });

  it("hashes codes with the email salt so identical codes differ per address", () => {
    expect(hashCode("a@acme.com", "123456")).not.toBe(hashCode("b@acme.com", "123456"));
    expect(hashCode("a@acme.com", "123456")).toHaveLength(64);
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
