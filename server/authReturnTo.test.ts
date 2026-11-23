// shared/authReturnTo.ts is tested here because vitest does not collect shared/**/*.test.ts.
import { describe, expect, it } from "vitest";
import { safeSignInReturnTo, signInPagePath } from "@shared/authReturnTo";

const ORIGIN = "https://skipwait.me";

describe("signInPagePath: the one same-site sign-in URL generator (D-030, D-049)", () => {
  it("keeps a safe path, query and hash, encoded", () => {
    expect(signInPagePath("/plans?x=1", ORIGIN)).toBe("/sign-in?returnTo=%2Fplans%3Fx%3D1");
    expect(signInPagePath("/premium?role=job_seeker#credits", ORIGIN)).toBe("/sign-in?returnTo=%2Fpremium%3Frole%3Djob_seeker%23credits");
    expect(signInPagePath("/ask", ORIGIN)).toBe("/sign-in?returnTo=%2Fask");
  });

  it("accepts an absolute same-origin URL and keeps only its path", () => {
    expect(signInPagePath("https://skipwait.me/requests?tab=open", ORIGIN)).toBe("/sign-in?returnTo=%2Frequests%3Ftab%3Dopen");
  });

  it("works with the server's callback URL as the origin base", () => {
    expect(signInPagePath("/plans", "https://skipwait.me/api/auth/workos/callback")).toBe("/sign-in?returnTo=%2Fplans");
    expect(signInPagePath("https://other.example/plans", "https://skipwait.me/api/auth/workos/callback")).toBe("/sign-in");
  });

  it.each([
    ["a cross-origin URL", "https://evil.example/plans"],
    ["a protocol-relative URL", "//evil.example"],
    ["a dot-segment escape", "/..//evil.example"],
    ["a backslash", "/\\evil.example"],
    ["a control character", "/plans\u0000x"],
    ["a space", "/a b"],
    ["an API path", "/api/auth/workos/sign-in"],
    ["the sign-in page", "/sign-in"],
    ["the sign-in page with a query", "/sign-in?intent=referrer"],
    ["the sign-in page with a trailing slash", "/sign-in/"],
    ["the sign-in page in capitals", "/SIGN-IN"],
    ["the forgot-password page", "/forgot-password"],
    ["the reset-password page with its token", "/reset-password?token=abc"],
    ["a script URL", "javascript:alert(1)"],
    ["a relative path", "plans"],
    ["an empty string", ""],
    ["an oversized path", `/${"a".repeat(2048)}`],
    ["a non-string", 42],
    ["undefined", undefined],
  ])("drops %s to /sign-in", (_label, value) => {
    expect(signInPagePath(value, ORIGIN)).toBe("/sign-in");
    expect(safeSignInReturnTo(value, ORIGIN)).toBeUndefined();
  });

  it("never produces anything but a same-site /sign-in path", () => {
    for (const value of ["/plans", "https://skipwait.me/x", "//evil", "/sign-in", undefined]) {
      expect(signInPagePath(value, ORIGIN)).toMatch(/^\/sign-in(?:\?returnTo=[^&#]+)?$/);
    }
  });
});
