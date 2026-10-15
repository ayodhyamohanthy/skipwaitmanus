import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { hostedSessionIdFromAccessToken } from "./workosAuth";

const jwt = (claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode("k".repeat(32)));

describe("hostedSessionIdFromAccessToken", () => {
  it("reads the sid from the access token WorkOS returned", async () => {
    expect(hostedSessionIdFromAccessToken(await jwt({ sid: "session_01ABC" }))).toBe("session_01ABC");
  });
  it("returns undefined for anything unusable instead of throwing", async () => {
    expect(hostedSessionIdFromAccessToken(await jwt({ sid: "x" }))).toBeUndefined();
    expect(hostedSessionIdFromAccessToken(await jwt({}))).toBeUndefined();
    expect(hostedSessionIdFromAccessToken("garbage")).toBeUndefined();
    expect(hostedSessionIdFromAccessToken(undefined)).toBeUndefined();
  });
});
