import type { Request } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openPasswordTicket, PASSWORD_TICKET_COOKIE, sealPasswordTicket } from "./passwordPending";

const SECRET = "c".repeat(32);
const requestWith = (value: string | undefined) => ({ headers: { cookie: value === undefined ? "" : `${PASSWORD_TICKET_COOKIE}=${value}` } }) as unknown as Request;
const common = { email: "asha@gmail.com", returnTo: "/plans", origin: "sign_in" as const };

afterEach(() => { vi.useRealTimers(); });

describe("the encrypted email-verification ticket", () => {
  it("round-trips each kind and never exposes WorkOS values in the cookie", async () => {
    for (const input of [
      { kind: "pending" as const, token: "pat_secret_token", userId: "user_01", emailVerificationId: "email_verification_01", ...common },
      { kind: "user" as const, userId: "user_01", ...common },
      { kind: "decoy" as const, ...common, origin: "sign_up" as const },
    ]) {
      const { value, ticket } = await sealPasswordTicket(input, SECRET);
      expect(value).not.toMatch(/pat_secret|user_01|asha|plans/);
      expect(await openPasswordTicket(requestWith(value), SECRET)).toEqual(ticket);
    }
  });

  it("seals every kind to the same length, so the cookie does not say which it is", async () => {
    const lengths = new Set<number>();
    for (const input of [
      { kind: "pending" as const, token: "x".repeat(512), userId: "u".repeat(64), emailVerificationId: "e".repeat(64), ...common, email: `${"a".repeat(300)}@gmail.com`, returnTo: `/${"p".repeat(511)}` },
      { kind: "user" as const, userId: "user_01", ...common },
      { kind: "decoy" as const, ...common, email: "x@y.co" },
    ]) lengths.add((await sealPasswordTicket(input, SECRET)).value.length);
    expect(lengths.size).toBe(1);
    expect(Array.from(lengths)[0]).toBeLessThan(3_000);
  });

  it("refuses a missing, tampered, foreign-key or expired ticket", async () => {
    const { value } = await sealPasswordTicket({ kind: "user", userId: "user_01", ...common }, SECRET);
    expect(await openPasswordTicket(requestWith(undefined), SECRET)).toBeNull();
    expect(await openPasswordTicket(requestWith(`${value.slice(0, -4)}AAAA`), SECRET)).toBeNull();
    expect(await openPasswordTicket(requestWith(value), "d".repeat(32))).toBeNull();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 11 * 60_000);
    expect(await openPasswordTicket(requestWith(value), SECRET)).toBeNull();
  });

  it("refuses a ticket whose fields break the contract instead of sealing it", async () => {
    await expect(sealPasswordTicket({ kind: "pending", token: "x".repeat(513), ...common }, SECRET)).rejects.toThrow();
    await expect(sealPasswordTicket({ kind: "user", userId: "", ...common }, SECRET)).rejects.toThrow();
  });
});
