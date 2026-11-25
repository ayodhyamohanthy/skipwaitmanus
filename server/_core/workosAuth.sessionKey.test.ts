// D-057-session-gate (§0b.2; red first): a Bearer identity's session key is the
// verified WorkOS access token's own sid, and it never carries the amr claim.
import { describe, expect, it } from "vitest";
import { sessionKeyFromWorkosClaims } from "./workosAuth";

describe("sessionKeyFromWorkosClaims", () => {
  it("keys a verified access token by its hosted session id", () => {
    expect(sessionKeyFromWorkosClaims({ sid: "session_01ABC" })).toBe("workos:session_01ABC");
  });
  it("has no key without a hosted sid, whatever else the token says", () => {
    expect(sessionKeyFromWorkosClaims({ sid: "nope", sub: "user_1" })).toBeUndefined();
    expect(sessionKeyFromWorkosClaims({ sub: "user_1", amr: "work_email_otp" })).toBeUndefined();
  });
});
