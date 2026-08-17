import { describe, expect, it } from "vitest";
import { isCompanyEmail, normalizeWorkEmail, workEmailError } from "./workEmail";

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
});
