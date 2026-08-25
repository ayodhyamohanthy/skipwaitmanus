import { describe, expect, it } from "vitest";
import { decodeOAuthState, encodeOAuthState, OAUTH_STATE_COOKIE, ONE_YEAR_MS } from "./const";

describe("OAuth login state encoding", () => {
  it("keeps the nonce-bound cookie host-only and the session lifetime at one year", () => {
    expect(OAUTH_STATE_COOKIE).toBe("__Host-oauth_state");
    expect(ONE_YEAR_MS).toBe(365 * 24 * 60 * 60 * 1000);
  });

  it("round-trips the callback redirect URI together with the CSRF nonce", () => {
    const state = { redirectUri: "https://skipwait.me/api/oauth/callback", nonce: "nonce-1" };
    const encoded = encodeOAuthState(state);

    expect(encoded).not.toContain("skipwait.me");
    expect(decodeOAuthState(encoded)).toEqual(state);
    expect(decodeOAuthState(encodeOAuthState({ redirectUri: "https://skipwait.me/api/oauth/callback" }))).toEqual({ redirectUri: "https://skipwait.me/api/oauth/callback" });
  });

  it("treats a legacy bare redirect URI as state without a nonce", () => {
    expect(decodeOAuthState(btoa("https://skipwait.me/api/oauth/callback"))).toEqual({ redirectUri: "https://skipwait.me/api/oauth/callback" });
    expect(decodeOAuthState(btoa(JSON.stringify({ redirectUri: 42 })))).toEqual({ redirectUri: '{"redirectUri":42}' });
  });

  it("returns nonce-free state instead of throwing on attacker-supplied garbage so the CSRF guard rejects it", () => {
    expect(decodeOAuthState("not-base64-!!")).toEqual({ redirectUri: "" });
    expect(decodeOAuthState("not-base64-!!").nonce).toBeUndefined();
  });
});
