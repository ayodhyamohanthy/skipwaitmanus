// The /api/auth/password/* contract (shared/passwordAuth.ts). Seekers only (D-049): no request carries an
// intent, and nothing continues on the hosted WorkOS page (D-030).
import { describe, expect, it } from "vitest";
import * as contract from "@shared/passwordAuth";
import {
  PASSWORD_AUTH_COPY,
  PASSWORD_AUTH_ERROR_CODES,
  appPathSchema,
  passwordAuthErrorSchema,
  passwordForgotAcceptedSchema,
  passwordForgotRequestSchema,
  passwordPolicyChecks,
  passwordPolicyError,
  passwordResetConfirmRequestSchema,
  passwordResetConfirmSuccessSchema,
  passwordSignInRequestSchema,
  passwordSignUpRequestSchema,
  passwordStepSchema,
  resetTokenSchema,
  retryMinutes,
} from "@shared/passwordAuth";

describe("password request contracts are seeker-only and strict", () => {
  it("normalises the email but never the password", () => {
    expect(passwordSignInRequestSchema.parse({ email: "  Asha@Gmail.COM ", password: "  spaced pass  " })).toEqual({ email: "asha@gmail.com", password: "  spaced pass  " });
  });

  // D-078 ruling 2: sign-up takes only the email; the password is set from the emailed link.
  it("sign-up takes only an email", () => {
    expect(passwordSignUpRequestSchema.parse({ email: " Asha@Gmail.com " })).toEqual({ email: "asha@gmail.com" });
    for (const body of [{ email: "asha@gmail.com", password: "Longpassword1!" }, { email: "asha@gmail.com", returnTo: "/plans" }, { email: "asha@gmail.com", intent: "seeker" }, { email: "nope" }, {}]) {
      expect(passwordSignUpRequestSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });

  it.each([
    ["sign-in", passwordSignInRequestSchema],
  ] as const)("%s refuses an intent, unknown fields, bad emails and oversized passwords", (_label, schema) => {
    for (const body of [
      { email: "asha@gmail.com", password: "secret", intent: "seeker" },
      { email: "asha@wipro.com", password: "secret", intent: "referrer" },
      { email: "asha@gmail.com", password: "secret", remember: true },
      { email: "asha@gmail.com" },
      { email: "asha@gmail.com", password: "" },
      { email: "asha@gmail.com", password: "x".repeat(257) },
      { email: "not-an-email", password: "secret" },
      { email: `${"a".repeat(320)}@example.com`, password: "secret" },
      { email: "asha@gmail.com", password: 12345678 },
      { email: "asha@gmail.com", password: "secret", returnTo: "x".repeat(2049) },
    ]) expect(schema.safeParse(body).success, JSON.stringify(body).slice(0, 80)).toBe(false);
  });

  it("no verification-code contract remains (D-049: no six-digit code for seekers)", () => {
    for (const name of ["verifyEmailRequestSchema", "resendVerificationRequestSchema", "VERIFICATION_CODE_PATTERN"]) expect(name in contract, name).toBe(false);
  });

  it("forgot takes only an email", () => {
    expect(passwordForgotRequestSchema.parse({ email: " Asha@Gmail.com" })).toEqual({ email: "asha@gmail.com" });
    expect(passwordForgotRequestSchema.safeParse({ email: "asha@gmail.com", intent: "referrer" }).success).toBe(false);
    expect(passwordForgotRequestSchema.safeParse({ email: "nope" }).success).toBe(false);
  });

  it("accepts a WorkOS-shaped opaque reset token and bounds the reset body", () => {
    for (const token of ["Z1uX3RbwcIl5fIGJJJCXXisdI", "a".repeat(40), "abc.DEF-123_xyz~"]) expect(resetTokenSchema.safeParse(token).success, token).toBe(true);
    for (const token of ["short", "", "has space in it", "a".repeat(4097), "<script>alert(1)</script>"]) expect(resetTokenSchema.safeParse(token).success, token).toBe(false);
    expect(passwordResetConfirmRequestSchema.safeParse({ token: "Z1uX3RbwcIl5fIGJJJCXXisdI", password: "longpassword1!", confirm: "longpassword1!" }).success).toBe(true);
    expect(passwordResetConfirmRequestSchema.safeParse({ token: "Z1uX3RbwcIl5fIGJJJCXXisdI", password: "x", confirm: "x", email: "a@b.co" }).success).toBe(false);
    expect(passwordResetConfirmRequestSchema.safeParse({ token: "Z1uX3RbwcIl5fIGJJJCXXisdI", password: "x".repeat(257), confirm: "x" }).success).toBe(false);
  });
});

describe("password response contracts", () => {
  it("accepts app paths and refuses anything that leaves the app", () => {
    for (const ok of ["/explore", "/plans?x=1", "/premium?role=job_seeker#credits"]) expect(appPathSchema.safeParse(ok).success).toBe(true);
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "/api/auth/workos/logout", "explore", "/a b"]) expect(appPathSchema.safeParse(bad).success).toBe(false);
  });

  it("a step is signed_in with an app path, or check_email with nothing else", () => {
    expect(passwordStepSchema.parse({ ok: true, step: "signed_in", redirectTo: "/plans" })).toEqual({ ok: true, step: "signed_in", redirectTo: "/plans" });
    expect(passwordStepSchema.parse({ ok: true, step: "check_email" })).toEqual({ ok: true, step: "check_email" });
    for (const bad of [
      { ok: true, step: "signed_in", redirectTo: "https://evil.example" },
      { ok: true, step: "signed_in" },
      { ok: true, step: "verify_email" },
      { ok: true, step: "check_email", pendingAuthenticationToken: "pat_1" },
      { ok: true, step: "check_email", redirectTo: "/explore" },
      { ok: true, step: "continue_hosted", redirectTo: "/api/auth/workos/sign-in" },
      { ok: true, redirectTo: "/explore" },
    ]) expect(passwordStepSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    expect(passwordForgotAcceptedSchema.safeParse({ ok: true }).success).toBe(true);
    expect(passwordForgotAcceptedSchema.safeParse({ ok: true, debugToken: "x" }).success).toBe(false);
    expect(passwordResetConfirmSuccessSchema.parse({ ok: true, signedIn: false, redirectTo: "/sign-in" })).toEqual({ ok: true, signedIn: false, redirectTo: "/sign-in" });
    expect(passwordResetConfirmSuccessSchema.safeParse({ ok: true, signedIn: true, redirectTo: "//evil.example" }).success).toBe(false);
  });

  it("round-trips every error code, with plain copy and no hosted continuation", () => {
    expect(PASSWORD_AUTH_ERROR_CODES).toEqual(expect.arrayContaining(["invalid_input", "invalid_credentials", "expired", "weak_password", "rate_limited", "forbidden_origin", "account_review", "account_inactive", "use_work_email_code", "use_another_method", "password_sign_in_unavailable", "temporarily_unavailable"]));
    expect(PASSWORD_AUTH_ERROR_CODES).toHaveLength(12);
    expect(PASSWORD_AUTH_ERROR_CODES).not.toContain("invalid_code");
    expect(PASSWORD_AUTH_ERROR_CODES).not.toContain("continue_hosted");
    for (const code of PASSWORD_AUTH_ERROR_CODES) {
      const body = { ok: false as const, code, message: PASSWORD_AUTH_COPY[code] };
      expect(passwordAuthErrorSchema.parse(JSON.parse(JSON.stringify(body)))).toEqual(body);
      expect(PASSWORD_AUTH_COPY[code].length).toBeGreaterThan(10);
      expect(PASSWORD_AUTH_COPY[code]).not.toMatch(/secure screen|authkit|hosted/i);
    }
    expect(passwordAuthErrorSchema.parse({ ok: false, code: "rate_limited", message: "Wait.", retryAfterSeconds: 900 }).retryAfterSeconds).toBe(900);
    expect(passwordAuthErrorSchema.safeParse({ ok: false, code: "invalid_credentials", message: "x", email: "asha@gmail.com" }).success).toBe(false);
    expect(passwordAuthErrorSchema.safeParse({ ok: false, code: "continue_hosted", message: "x" }).success).toBe(false);
    expect(passwordAuthErrorSchema.safeParse({ ok: false, code: "invalid_credentials", message: "x", redirectTo: "/api/auth/workos/sign-in" }).success).toBe(false);
  });

  it("exports no hosted continuation helpers and no intent", () => {
    expect(Object.keys(contract)).not.toEqual(expect.arrayContaining(["hostedSignInPath"]));
    for (const name of ["hostedSignInPath", "hostedSignInPathSchema", "HOSTED_REASONS", "HOSTED_REASON_COPY", "SIGN_IN_INTENTS", "signInIntentSchema", "passwordResetCheckRequestSchema"]) expect(name in contract, name).toBe(false);
  });
});

describe("setting a password (sign-up and reset only)", () => {
  it("matches the kit's three rules on both sides", () => {
    expect(passwordPolicyError("short1!", "short1!")).toMatch(/10 characters/);
    expect(passwordPolicyError("longpasswordwithoutdigit", "longpasswordwithoutdigit")).toMatch(/number or symbol/);
    expect(passwordPolicyError("longpassword1!", "different2@")).toMatch(/match/);
    expect(passwordPolicyError("longpassword1!", "longpassword1!")).toBeUndefined();
    expect(passwordPolicyChecks("longpassword1!", "longpassword1!").every(rule => rule.passed)).toBe(true);
    expect(passwordPolicyChecks("", "").some(rule => rule.passed)).toBe(false);
  });

  it("never applies the policy to sign-in, so older WorkOS passwords still work", () => {
    expect(passwordSignInRequestSchema.safeParse({ email: "asha@gmail.com", password: "short" }).success).toBe(true);
  });

  it("rounds retry-after up to whole minutes", () => {
    expect(retryMinutes(1)).toBe(1);
    expect(retryMinutes(61)).toBe(2);
    expect(retryMinutes(900)).toBe(15);
    expect(retryMinutes(undefined)).toBe(1);
  });
});
