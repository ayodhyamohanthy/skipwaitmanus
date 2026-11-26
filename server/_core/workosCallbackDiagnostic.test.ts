// FIX-founder-admin-role follow-up: the owner's Google sign-in failed with "(step authenticate,
// AuthenticationException)". WorkOS raises that only for a closed set of reasons; the 502 names that reason as a
// plain snake_case word and never the message, email or any other value.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { authenticationCodeOf } from "./workosAuth";

const authError = (fields: Record<string, unknown>) => Object.assign(Object.assign(new Error("Pick an org for founder@skipwait.me"), { name: "AuthenticationException" }), fields);

describe("authenticationCodeOf", () => {
  it.each(["email_verification_required", "organization_selection_required", "mfa_enrollment", "radar_email_challenge"])("returns %s from the exception code", code => {
    expect(authenticationCodeOf(authError({ code }))).toBe(code);
  });

  it("reads sso_required from rawData.error, where WorkOS puts it", () => {
    expect(authenticationCodeOf(authError({ rawData: { error: "sso_required", error_description: "x@y.com must use SSO" } }))).toBe("sso_required");
  });

  it.each([
    ["any other error type", Object.assign(new Error("x"), { name: "OauthException", code: "invalid_grant" })],
    ["a code that is not a plain snake_case word", authError({ code: "Weird <script>" })],
    ["an email address as the code", authError({ code: "founder@skipwait.me" })],
    ["a snake_case word WorkOS does not use", authError({ code: "some_other_reason" })],
    ["no code at all", authError({})],
    ["a value that is not an Error", { name: "AuthenticationException", code: "sso_required" }],
  ])("returns nothing for %s", (_name, error) => {
    expect(authenticationCodeOf(error)).toBeNull();
  });
});

describe("the callback 502 body", () => {
  it("is sent as plain text, so no error detail can ever be read as HTML", () => {
    const source = readFileSync(path.join(__dirname, "workosAuth.ts"), "utf8");
    expect(source).toMatch(/res\.status\(502\)\.type\("text\/plain"\)\.send\(`Authentication could not be completed \(step/);
  });
});
