import { describe, expect, it } from "vitest";
import {
  HOSTED_REASON_COPY,
  HOSTED_REASONS,
  PASSWORD_AUTH_COPY,
  PASSWORD_AUTH_ERROR_CODES,
  appPathSchema,
  hostedSignInPath,
  hostedSignInPathSchema,
  passwordAuthErrorSchema,
  passwordPolicyChecks,
  passwordPolicyError,
  passwordResetConfirmRequestSchema,
  passwordResetConfirmSuccessSchema,
  passwordSignInRequestSchema,
  passwordSignInSuccessSchema,
  retryMinutes,
} from "@shared/passwordAuth";

describe("password sign-in request contract", () => {
  it("normalises the email but never the password", () => {
    const parsed = passwordSignInRequestSchema.parse({ email: "  Asha@Wipro.COM ", password: "  spaced pass  ", intent: "referrer" });
    expect(parsed).toEqual({ email: "asha@wipro.com", password: "  spaced pass  ", intent: "referrer" });
  });

  it.each([
    [{ email: "asha@wipro.com" }, "missing password"],
    [{ email: "asha@wipro.com", password: "" }, "empty password"],
    [{ email: "asha@wipro.com", password: "x".repeat(257) }, "oversized password"],
    [{ email: "not-an-email", password: "secret" }, "invalid email"],
    [{ email: `${"a".repeat(320)}@example.com`, password: "secret" }, "oversized email"],
    [{ email: "asha@wipro.com", password: "secret", intent: "admin" }, "unknown intent"],
    [{ email: "asha@wipro.com", password: "secret", remember: true }, "unknown field"],
    [{ email: "asha@wipro.com", password: 12345678 }, "non-string password"],
  ])("rejects %j (%s)", (body, _label) => {
    expect(passwordSignInRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("response contracts", () => {
  it("accepts app paths and refuses anything that leaves the app", () => {
    for (const ok of ["/explore", "/referrer-setup", "/premium?role=referrer&quantity=7"]) expect(appPathSchema.safeParse(ok).success).toBe(true);
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "/api/auth/workos/logout", "explore", "/a b"]) expect(appPathSchema.safeParse(bad).success).toBe(false);
  });

  it("only allows the hosted AuthKit start route as a continuation", () => {
    expect(hostedSignInPathSchema.safeParse(hostedSignInPath({ returnTo: "/explore", email: "asha@wipro.com" })).success).toBe(true);
    for (const bad of ["/api/auth/workos/logout", "https://api.workos.com/user_management/authorize", "/explore"]) expect(hostedSignInPathSchema.safeParse(bad).success).toBe(false);
  });

  it("round-trips success and every error code, and rejects unknown fields", () => {
    expect(passwordSignInSuccessSchema.parse({ ok: true, redirectTo: "/explore" })).toEqual({ ok: true, redirectTo: "/explore" });
    for (const code of PASSWORD_AUTH_ERROR_CODES) {
      const body = { ok: false as const, code, message: PASSWORD_AUTH_COPY[code] };
      expect(passwordAuthErrorSchema.parse(JSON.parse(JSON.stringify(body)))).toEqual(body);
    }
    expect(passwordAuthErrorSchema.safeParse({ ok: false, code: "invalid_credentials", message: "x", email: "asha@wipro.com" }).success).toBe(false);
    expect(passwordAuthErrorSchema.safeParse({ ok: false, code: "nope", message: "x" }).success).toBe(false);
    expect(passwordAuthErrorSchema.safeParse({ ok: false, code: "continue_hosted", message: "x", redirectTo: "https://evil.example" }).success).toBe(false);
    expect(passwordResetConfirmSuccessSchema.safeParse({ ok: true, signedIn: true, redirectTo: "//evil.example" }).success).toBe(false);
  });

  it("has copy for every code and hosted reason", () => {
    for (const code of PASSWORD_AUTH_ERROR_CODES) expect(PASSWORD_AUTH_COPY[code].length).toBeGreaterThan(10);
    for (const reason of HOSTED_REASONS) expect(HOSTED_REASON_COPY[reason].length).toBeGreaterThan(10);
  });
});

describe("hosted continuation URL", () => {
  it("keeps returnTo first, then provider, then a valid login hint", () => {
    expect(hostedSignInPath({ returnTo: "/explore", email: " Asha@Wipro.com " })).toBe("/api/auth/workos/sign-in?returnTo=%2Fexplore&login_hint=asha%40wipro.com");
    expect(hostedSignInPath({ returnTo: "/referrer-setup", provider: "google" })).toBe("/api/auth/workos/sign-in?returnTo=%2Freferrer-setup&provider=google");
    expect(hostedSignInPath({ returnTo: "/explore", email: "not an email" })).toBe("/api/auth/workos/sign-in?returnTo=%2Fexplore");
  });
});

describe("kit reset policy", () => {
  it("matches the kit's three rules on both sides", () => {
    expect(passwordPolicyError("short1!", "short1!")).toMatch(/10 characters/);
    expect(passwordPolicyError("longpasswordwithoutdigit", "longpasswordwithoutdigit")).toMatch(/number or symbol/);
    expect(passwordPolicyError("longpassword1!", "different2@")).toMatch(/match/);
    expect(passwordPolicyError("longpassword1!", "longpassword1!")).toBeUndefined();
    expect(passwordPolicyChecks("longpassword1!", "longpassword1!").every(rule => rule.passed)).toBe(true);
    expect(passwordPolicyChecks("", "").some(rule => rule.passed)).toBe(false);
  });

  it("bounds the reset body and refuses unknown fields", () => {
    const token = "a".repeat(40);
    expect(passwordResetConfirmRequestSchema.safeParse({ token, password: "longpassword1!", confirm: "longpassword1!" }).success).toBe(true);
    expect(passwordResetConfirmRequestSchema.safeParse({ token, password: "x", confirm: "x", email: "a@b.co" }).success).toBe(false);
    expect(passwordResetConfirmRequestSchema.safeParse({ token: "short", password: "x", confirm: "x" }).success).toBe(false);
  });

  it("rounds retry-after up to whole minutes", () => {
    expect(retryMinutes(1)).toBe(1);
    expect(retryMinutes(61)).toBe(2);
    expect(retryMinutes(undefined)).toBe(1);
  });
});
