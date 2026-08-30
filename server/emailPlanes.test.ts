import { describe, expect, it } from "vitest";
import { CONSUMER_EMAIL_DOMAINS, isCorporateEmailDomain } from "../shared/const";
import { isCompanyEmail, normalizeWorkEmail, workEmailError } from "../client/src/lib/workEmail";

describe("canonical email-plane rules (shared contract)", () => {
  it("classifies consumer domains as non-corporate for the referrer plane", () => {
    expect(isCorporateEmailDomain("gmail.com")).toBe(false);
    expect(isCorporateEmailDomain("Gmail.com")).toBe(false);
    expect(isCorporateEmailDomain("acme.com")).toBe(true);
    expect(isCorporateEmailDomain("skipwait.me")).toBe(true);
    expect(isCorporateEmailDomain("")).toBe(false);
  });

  it("keeps the client helper aligned with the shared list", () => {
    for (const domain of CONSUMER_EMAIL_DOMAINS) expect(isCompanyEmail(`user@${domain}`)).toBe(false);
    expect(isCompanyEmail("ref@acme.com")).toBe(true);
    expect(isCompanyEmail("not-an-email")).toBe(false);
  });

  it("surfaces a clear error for personal domains before any network call", () => {
    expect(workEmailError("seeker@gmail.com")).toContain("company email");
    expect(workEmailError("ref@acme.com")).toBe("");
    expect(normalizeWorkEmail("  REF@Acme.COM ")).toBe("ref@acme.com");
  });
});
