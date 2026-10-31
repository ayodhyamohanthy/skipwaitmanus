// D-057-session-gate (§0b.5): `/access` gains codeRequired, and the shared contract still
// round-trips a server answer unchanged (server/referrerAccessContract.test.ts). An older
// server that sends no codeRequired is read as "no code required", never as a new key.
import { describe, expect, it } from "vitest";
import { referrerAccessResponseSchema } from "./referrerAccess";

const base = { verifiedCompanyAccess: true, workEmailDomain: "acme.com", companyName: "Acme", companyInitials: "AC" };

describe("referrer access contract: codeRequired", () => {
  it("adds no codeRequired key when the server sent none (an older server reads as not required)", () => {
    const parsed = referrerAccessResponseSchema.parse(base);
    expect(parsed).toEqual(base);
    expect("codeRequired" in parsed).toBe(false);
  });

  it("round-trips codeRequired true and false exactly as the server sent them", () => {
    expect(referrerAccessResponseSchema.parse({ ...base, codeRequired: true })).toEqual({ ...base, codeRequired: true });
    expect(referrerAccessResponseSchema.parse({ ...base, codeRequired: false })).toEqual({ ...base, codeRequired: false });
  });

  it("never reads an unverified answer as code required", () => {
    expect(referrerAccessResponseSchema.parse({ verifiedCompanyAccess: false, codeRequired: true }).codeRequired).toBe(false);
  });

  it("still rejects a codeRequired that is not a boolean", () => {
    expect(referrerAccessResponseSchema.safeParse({ ...base, codeRequired: "true" }).success).toBe(false);
  });
});
