import { describe, expect, it } from "vitest";
import {
  AuthenticationException,
  BadRequestException,
  ConflictException,
  GenericServerException,
  NotFoundException,
  OauthException,
  RateLimitExceededException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@workos-inc/node";
import { classifyWorkosPasswordError, describeWorkosError } from "./workosPasswordErrors";

const EMAIL = "asha@gmail.com";
const user = { object: "user", id: "user_01", email: EMAIL, email_verified: false };

describe("WorkOS failures map to typed codes (real SDK exceptions)", () => {
  it("an email that still needs verification becomes the verify step, carrying the pending token", () => {
    const error = new AuthenticationException(403, { code: "email_verification_required", message: "Email ownership must be verified before authentication.", pending_authentication_token: "pat_01", email: EMAIL, email_verification_id: "email_verification_01", user }, "req_1");
    expect(classifyWorkosPasswordError(error, "sign_in")).toEqual({ kind: "verify_email", pendingAuthenticationToken: "pat_01", emailVerificationId: "email_verification_01", userId: "user_01" });
    const bare = new AuthenticationException(400, { code: "email_verification_required", pending_authentication_token: "pat_02" }, "req_2");
    expect(classifyWorkosPasswordError(bare, "sign_up")).toEqual({ kind: "verify_email", pendingAuthenticationToken: "pat_02" });
  });

  it.each([
    ["GenericServerException invalid_credentials", new GenericServerException(400, `Invalid credentials for ${EMAIL}`, { code: "invalid_credentials", message: `Invalid credentials for ${EMAIL}` }, "req_3")],
    ["OauthException invalid_grant", new OauthException(400, "req_4", "invalid_grant", "Invalid credentials.", { error: "invalid_grant" })],
    ["UnauthorizedException 401", new UnauthorizedException("req_5")],
    ["NotFoundException (unknown email answered as missing)", new NotFoundException({ path: "/user_management/authenticate", requestID: "req_6" })],
  ])("%s is invalid_credentials on sign-in", (_label, error) => {
    expect(classifyWorkosPasswordError(error, "sign_in")).toEqual({ kind: "invalid_credentials" });
  });

  it.each([
    ["password_strength_error", new BadRequestException({ code: "password_strength_error", errors: [{ code: "password_too_short", message: "Too short" }], message: "Password does not meet strength requirements.", requestID: "r" })],
    ["password_reset_error", new BadRequestException({ code: "password_reset_error", errors: [{ code: "password_breached" }], message: "Password rejected.", requestID: "r" })],
    ["errors[] password_*", new UnprocessableEntityException({ code: "invalid_request_parameters", errors: [{ code: "password_too_weak", message: "weak" }], requestID: "r" })],
    ["a bare 422", new UnprocessableEntityException({ message: "Unprocessable entity", requestID: "r" })],
  ])("%s is weak_password when setting a password", (_label, error) => {
    expect(classifyWorkosPasswordError(error, "sign_up")).toEqual({ kind: "weak_password" });
    expect(classifyWorkosPasswordError(error, "reset")).toEqual({ kind: "weak_password" });
  });

  it("a spent or unknown reset token is expired, never a password refusal", () => {
    expect(classifyWorkosPasswordError(new NotFoundException({ path: "/user_management/password_reset/confirm", requestID: "r" }), "reset")).toEqual({ kind: "expired" });
    expect(classifyWorkosPasswordError(new BadRequestException({ code: "password_reset_token_expired", errors: [{ code: "password_reset_token_expired" }], message: "Expired", requestID: "r" }), "reset")).toEqual({ kind: "expired" });
    expect(classifyWorkosPasswordError(new GenericServerException(403, "Forbidden", { code: "forbidden" }, "r"), "reset")).toEqual({ kind: "expired" });
    expect(classifyWorkosPasswordError(new BadRequestException({ code: "invalid_token", errors: [], message: "Bad token", requestID: "r" }), "reset")).toEqual({ kind: "expired" });
  });

  it.each([
    ["email_not_available in errors[]", new UnprocessableEntityException({ code: "user_creation_error", errors: [{ code: "email_not_available", message: "This email is not available." }], requestID: "r" })],
    ["email_taken code", new BadRequestException({ code: "email_taken", errors: [{ code: "email_taken" }], message: "taken", requestID: "r" })],
    ["a 409 conflict", new ConflictException({ message: "User already exists", requestID: "r", code: "user_already_exists" })],
  ])("%s is email_taken on sign-up", (_label, error) => {
    expect(classifyWorkosPasswordError(error, "sign_up")).toEqual({ kind: "email_taken" });
  });

  it("password authentication switched off is unavailable, not a wrong password", () => {
    const error = new GenericServerException(400, "Password authentication is not enabled.", { code: "authentication_method_not_allowed" }, "r");
    expect(classifyWorkosPasswordError(error, "sign_in")).toEqual({ kind: "password_sign_in_unavailable" });
    expect(classifyWorkosPasswordError(error, "sign_up")).toEqual({ kind: "password_sign_in_unavailable" });
  });

  it("a WorkOS 429 is rate_limited with its Retry-After, bounded", () => {
    expect(classifyWorkosPasswordError(new RateLimitExceededException("Too many requests", "r", 30), "sign_in")).toEqual({ kind: "rate_limited", retryAfterSeconds: 30 });
    expect(classifyWorkosPasswordError(new RateLimitExceededException("Too many requests", "r", null), "forgot")).toEqual({ kind: "rate_limited", retryAfterSeconds: 60 });
    expect(classifyWorkosPasswordError(new RateLimitExceededException("Too many requests", "r", 999_999), "verify")).toEqual({ kind: "rate_limited", retryAfterSeconds: 3600 });
  });

  it.each([
    ["mfa_challenge", new AuthenticationException(400, { code: "mfa_challenge", pending_authentication_token: "p", user }, "r")],
    ["mfa_enrollment", new AuthenticationException(400, { code: "mfa_enrollment", pending_authentication_token: "p", user }, "r")],
    ["organization_selection_required", new AuthenticationException(400, { code: "organization_selection_required", pending_authentication_token: "p", organizations: [], user }, "r")],
    ["radar_email_challenge", new AuthenticationException(400, { code: "radar_email_challenge", pending_authentication_token: "p", user }, "r")],
    ["sso_required", new AuthenticationException(400, { error: "sso_required", error_description: "SSO required" }, "r")],
    ["organization_authentication_methods_required", new OauthException(400, "r", "organization_authentication_methods_required", "Use SSO", { error: "organization_authentication_methods_required" })],
  ])("%s asks for another sign-in method", (_label, error) => {
    expect(classifyWorkosPasswordError(error, "sign_in")).toEqual({ kind: "use_another_method" });
  });

  it.each([
    ["a network TypeError", new TypeError("fetch failed")],
    ["the SDK's wrapped network error", new Error("Unexpected error: TypeError: fetch failed")],
    ["the SDK's 10 s timeout (an OauthException with status 408)", new OauthException(408, "", "Request timeout", undefined, { error: "Request timeout" })],
    ["a 500", new GenericServerException(500, "Internal", {}, "r")],
    ["a 503 OauthException", new OauthException(503, "r", "server_error", "down", { error: "server_error" })],
    ["a non-error value", "boom"],
    ["null", null],
    ["an unknown 400 on sign-in", new GenericServerException(400, "Something odd", { code: "something_new" }, "r")],
  ])("%s is temporarily_unavailable", (_label, error) => {
    expect(classifyWorkosPasswordError(error, "sign_in")).toEqual({ kind: "temporarily_unavailable" });
  });

  it("a wrong or expired verification code is invalid_code; a missing verification is expired", () => {
    expect(classifyWorkosPasswordError(new BadRequestException({ code: "invalid_one_time_code", errors: [], message: "Invalid code", requestID: "r" }), "verify")).toEqual({ kind: "invalid_code" });
    expect(classifyWorkosPasswordError(new GenericServerException(400, "Invalid code", { code: "email_verification_code_expired" }, "r"), "verify")).toEqual({ kind: "invalid_code" });
    expect(classifyWorkosPasswordError(new UnprocessableEntityException({ message: "bad", requestID: "r" }), "verify")).toEqual({ kind: "invalid_code" });
    expect(classifyWorkosPasswordError(new NotFoundException({ path: "/user_management/users/user_01/email_verification/confirm", requestID: "r" }), "verify")).toEqual({ kind: "expired" });
  });

  it("works on plain error shapes too (no instanceof, so mocked modules classify the same)", () => {
    expect(classifyWorkosPasswordError({ name: "GenericServerException", status: 400, code: "invalid_credentials", rawData: { code: "invalid_credentials" } }, "sign_in")).toEqual({ kind: "invalid_credentials" });
    expect(classifyWorkosPasswordError({ name: "OauthException", status: 400, error: "invalid_grant" }, "sign_in")).toEqual({ kind: "invalid_credentials" });
    expect(classifyWorkosPasswordError({ name: "AuthenticationException", status: 400, code: "email_verification_required", pendingAuthenticationToken: "pat_9", rawData: { code: "email_verification_required", pending_authentication_token: "pat_9", user: { id: "user_9" } } }, "sign_in")).toEqual({ kind: "verify_email", pendingAuthenticationToken: "pat_9", userId: "user_9" });
    expect(classifyWorkosPasswordError({ name: "RateLimitExceededException", status: 429, retryAfter: 12 }, "reset")).toEqual({ kind: "rate_limited", retryAfterSeconds: 12 });
  });
});

describe("describeWorkosError keeps only what is safe to log", () => {
  it("drops the message (it can contain the email) and keeps name, status, code and request id", () => {
    const described = describeWorkosError(new GenericServerException(400, `Invalid credentials for ${EMAIL}`, { code: "invalid_credentials", message: `Invalid credentials for ${EMAIL}`, user }, "req_42"));
    expect(described).toEqual({ name: "GenericServerException", status: 400, code: "invalid_credentials", requestID: "req_42" });
    expect(JSON.stringify(describeWorkosError(new AuthenticationException(400, { code: "email_verification_required", pending_authentication_token: "pat_secret", email: EMAIL, user }, "r")))).not.toMatch(/asha|pat_secret/);
  });

  it("refuses codes that are not plain identifiers", () => {
    expect(describeWorkosError({ name: "X", status: 400, code: `contains ${EMAIL}` }).code).toBeUndefined();
    expect(describeWorkosError("boom")).toEqual({ name: "unknown" });
  });
});
