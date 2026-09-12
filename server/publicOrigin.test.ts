import { afterEach, describe, expect, it } from "vitest";
import { publicAppOrigin } from "./publicOrigin";

// Absolute URLs that leave the server (one-click review links, Slack triage
// messages, share-card OG URLs, payment redirects) must not be derivable from a
// request header. `req.protocol` follows the client-supplied X-Forwarded-Proto
// once trust proxy is on, so a caller could force those links to plain http —
// and a review link's token alone authorises an approve/decline decision.

const fakeReq = (protocol: string, host: string) => ({
  protocol,
  get: (name: string) => (name.toLowerCase() === "host" ? host : undefined),
});

const ENV_KEYS = ["PUBLIC_APP_ORIGIN", "WORKOS_REDIRECT_URI"] as const;
const saved = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("publicAppOrigin", () => {
  it("prefers an explicit PUBLIC_APP_ORIGIN", () => {
    process.env.PUBLIC_APP_ORIGIN = "https://skipwait.me";
    delete process.env.WORKOS_REDIRECT_URI;
    expect(publicAppOrigin(fakeReq("http", "spoofed.example"))).toBe(
      "https://skipwait.me"
    );
  });

  it("tolerates a trailing slash on the configured origin", () => {
    process.env.PUBLIC_APP_ORIGIN = "https://skipwait.me/";
    expect(publicAppOrigin(fakeReq("http", "spoofed.example"))).toBe(
      "https://skipwait.me"
    );
  });

  it("falls back to the configured WorkOS redirect origin", () => {
    delete process.env.PUBLIC_APP_ORIGIN;
    process.env.WORKOS_REDIRECT_URI =
      "https://skipwait.me/api/auth/workos/callback";
    expect(publicAppOrigin(fakeReq("https", "skipwait.me"))).toBe(
      "https://skipwait.me"
    );
  });

  it("keeps links https even when the request claims to be plain http", () => {
    delete process.env.PUBLIC_APP_ORIGIN;
    process.env.WORKOS_REDIRECT_URI =
      "https://skipwait.me/api/auth/workos/callback";
    // This is the attack: X-Forwarded-Proto: http makes req.protocol "http".
    const origin = publicAppOrigin(fakeReq("http", "skipwait.me"));
    expect(origin).toBe("https://skipwait.me");
    expect(origin.startsWith("https://")).toBe(true);
  });

  it("ignores a spoofed Host once a canonical origin is configured", () => {
    delete process.env.PUBLIC_APP_ORIGIN;
    process.env.WORKOS_REDIRECT_URI =
      "https://skipwait.me/api/auth/workos/callback";
    expect(publicAppOrigin(fakeReq("https", "evil.example"))).toBe(
      "https://skipwait.me"
    );
  });

  it("falls back to the request for local development on arbitrary ports", () => {
    delete process.env.PUBLIC_APP_ORIGIN;
    delete process.env.WORKOS_REDIRECT_URI;
    expect(publicAppOrigin(fakeReq("http", "localhost:3000"))).toBe(
      "http://localhost:3000"
    );
  });

  it("falls back to the request when the configured redirect URI is malformed", () => {
    delete process.env.PUBLIC_APP_ORIGIN;
    process.env.WORKOS_REDIRECT_URI = "not-a-url";
    expect(publicAppOrigin(fakeReq("http", "localhost:3000"))).toBe(
      "http://localhost:3000"
    );
  });
});
