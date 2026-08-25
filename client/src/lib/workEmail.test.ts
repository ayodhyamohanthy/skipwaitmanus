import { describe, expect, it } from "vitest";
import { hasVerifiedWorkEmail, isCompanyEmail, isPersonalEmailDomain, normalizeWorkEmail, workEmailError } from "./workEmail";

describe("work-email referral access gate", () => {
  it("normalizes and accepts company email addresses", () => {
    expect(normalizeWorkEmail(" Employee@Acme.com ")).toBe("employee@acme.com");
    expect(isCompanyEmail("employee@acme.com")).toBe(true);
    expect(workEmailError("employee@acme.com")).toBe("");
  });

  it("rejects malformed and personal email addresses before private referral authentication", () => {
    expect(workEmailError("not-an-email")).toMatch(/valid company email/i);
    expect(workEmailError("person@gmail.com")).toMatch(/personal email providers/i);
    expect(isCompanyEmail("person@outlook.com")).toBe(false);
  });

  it("identifies personal email domains", () => {
    expect(isPersonalEmailDomain("gmail.com")).toBe(true);
    expect(isPersonalEmailDomain("acme.com")).toBe(false);
    expect(isPersonalEmailDomain(undefined)).toBe(false);
  });

  it("requires a verified non-personal email address", () => {
    expect(hasVerifiedWorkEmail([{ emailAddress: "employee@acme.com", verification: { status: "verified" } }])).toBe(true);
    expect(hasVerifiedWorkEmail([{ emailAddress: "employee@acme.com", verification: { status: "unverified" } }])).toBe(false);
    expect(hasVerifiedWorkEmail([{ emailAddress: "person@gmail.com", verification: { status: "verified" } }])).toBe(false);
    expect(hasVerifiedWorkEmail(undefined)).toBe(false);
  });
});
