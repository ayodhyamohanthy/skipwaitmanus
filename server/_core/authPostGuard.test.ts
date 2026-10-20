import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { isTrustedAuthPost } from "./authPostGuard";

function app() {
  const server = express();
  server.use(express.json());
  server.use(express.urlencoded({ extended: true }));
  server.post("/guarded", (req, res) => res.status(isTrustedAuthPost(req) ? 200 : 403).end());
  return server;
}

const previous = { PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL, WORKOS_REDIRECT_URI: process.env.WORKOS_REDIRECT_URI };
afterEach(() => {
  for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

describe("password POST login-CSRF guard", () => {
  it("accepts a same-origin JSON POST by Origin or by Sec-Fetch-Site", async () => {
    const res = await request(app()).post("/guarded").set("Host", "localhost:3000").set("Origin", "http://localhost:3000").send({ a: 1 });
    expect(res.status).toBe(200);
    const noOrigin = await request(app()).post("/guarded").set("Sec-Fetch-Site", "same-origin").send({ a: 1 });
    expect(noOrigin.status).toBe(200);
  });

  it("accepts the configured public origin behind the proxy", async () => {
    process.env.WORKOS_REDIRECT_URI = "https://skipwait.me/api/auth/workos/callback";
    delete process.env.PUBLIC_BASE_URL;
    const res = await request(app()).post("/guarded").set("Host", "container.internal:3000").set("Origin", "https://skipwait.me").send({ a: 1 });
    expect(res.status).toBe(200);
  });

  it.each([
    ["a cross-site origin", { Origin: "https://evil.example" }],
    ["an opaque origin", { Origin: "null" }],
    ["a look-alike origin", { Origin: "https://skipwait.me.evil.example" }],
    ["no origin and a cross-site fetch", { "Sec-Fetch-Site": "cross-site" }],
    ["no browser evidence at all", {}],
  ])("refuses %s", async (_label, headers) => {
    process.env.WORKOS_REDIRECT_URI = "https://skipwait.me/api/auth/workos/callback";
    const res = await request(app()).post("/guarded").set("Host", "skipwait.me").set(headers).send({ a: 1 });
    expect(res.status).toBe(403);
  });

  it("refuses an HTML-form (urlencoded) POST even from the same origin", async () => {
    const res = await request(app()).post("/guarded").set("Host", "localhost:3000").set("Origin", "http://localhost:3000").type("form").send("email=a%40b.co&password=x");
    expect(res.status).toBe(403);
  });
});

describe("publicOutboundOrigin for outbound links", () => {
  async function helper() { const mod = await import("./authPostGuard"); return mod.publicOutboundOrigin; }
  function fakeReq(host: string, forwardedHost?: string) {
    return { protocol: "https", get: (h: string) => (h === "host" ? (forwardedHost ?? host) : undefined) } as unknown as import("express").Request;
  }
  it("uses the configured public origin and never the request host, even with a spoofed host", async () => {
    process.env.WORKOS_REDIRECT_URI = "https://skipwait.me/api/auth/workos/callback"; delete process.env.PUBLIC_BASE_URL;
    expect((await helper())(fakeReq("evil.example"))).toBe("https://skipwait.me");
    process.env.PUBLIC_BASE_URL = "https://www.skipwait.me";
    expect((await helper())(fakeReq("evil.example"))).toBe("https://www.skipwait.me");
  });
  it("refuses to build an outbound origin from request headers in production", async () => {
    delete process.env.PUBLIC_BASE_URL; delete process.env.WORKOS_REDIRECT_URI;
    const prevEnv = process.env.NODE_ENV; process.env.NODE_ENV = "production";
    try { expect(() => (globalThis as never)).not.toThrow(); expect(async () => {}).toBeTruthy();
      const fn = await helper(); expect(() => fn(fakeReq("evil.example"))).toThrow(/not configured/);
    } finally { process.env.NODE_ENV = prevEnv; }
  });
  it("falls back to the request host outside production for local development", async () => {
    delete process.env.PUBLIC_BASE_URL; delete process.env.WORKOS_REDIRECT_URI;
    const prevEnv = process.env.NODE_ENV; process.env.NODE_ENV = "development";
    try { expect((await helper())(fakeReq("localhost:3000"))).toBe("https://localhost:3000"); } finally { process.env.NODE_ENV = prevEnv; }
  });
});
