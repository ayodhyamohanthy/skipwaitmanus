import { describe, expect, it } from "vitest";
import { EMAIL_LINK_VERIFY_PATH, EMAIL_SIGN_IN_LINK_ENABLED, emailSignInLink, parseEmailSignInHash } from "./emailSignIn";

describe("D-406 email sign-in link", () => {
  it("starts switched off until AUTH-email-link-release", () => {
    expect(EMAIL_SIGN_IN_LINK_ENABLED).toBe(false);
  });

  it("puts the email and code only in the fragment, and round-trips", () => {
    const url = emailSignInLink("https://skipwait.me/", { email: "Ana+jobs@Gmail.com", code: "012345", plane: "s" });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://skipwait.me/sign-in");
    expect(parsed.search).toBe("");
    expect(parseEmailSignInHash(parsed.hash)).toEqual({ email: "ana+jobs@gmail.com", code: "012345", plane: "s" });
  });

  it("names the referrer plane and its verify endpoint", () => {
    const link = parseEmailSignInHash(new URL(emailSignInLink("https://skipwait.me", { email: "ref@acme.com", code: "999999", plane: "r" })).hash);
    expect(link?.plane).toBe("r");
    expect(EMAIL_LINK_VERIFY_PATH.r).toBe("/api/auth/otp/verify");
    expect(EMAIL_LINK_VERIFY_PATH.s).toBe("/api/auth/workos/email-code/verify");
  });

  it.each([
    "",
    "#",
    "#passkeys",
    "#email-link",
    "#email-link&e=a%40b.co&c=12345&p=s",
    "#email-link&e=a%40b.co&c=1234567&p=s",
    "#email-link&e=not-an-email&c=123456&p=s",
    "#email-link&e=a%40b.co&c=123456&p=x",
    "#email-linkX&e=a%40b.co&c=123456&p=s",
  ])("rejects a malformed fragment %j", hash => {
    expect(parseEmailSignInHash(hash)).toBeNull();
  });

  it("refuses to build a link from a bad code", () => {
    expect(() => emailSignInLink("https://skipwait.me", { email: "a@b.co", code: "12ab56", plane: "s" })).toThrow();
  });
});
