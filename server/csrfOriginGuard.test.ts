import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allowedCsrfHosts,
  CROSS_SITE_BLOCKED_MESSAGE,
  csrfOriginGuard,
  hostFromOriginLike,
} from "./csrfOriginGuard";

// The session cookie is SameSite=None in production and cookie auth is the only
// auth on every REST route, so a cross-site form POST could reach endpoints like
// subscription cancellation or account erasure. These tests pin the guard that
// closes that path without breaking provider webhooks.

function buildApp() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(csrfOriginGuard);
  app.post("/api/state-changing", (_req, res) => res.json({ ok: true }));
  app.get("/api/read", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("csrfOriginGuard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CSRF_ALLOWED_ORIGINS;
    delete process.env.PROXY_SHARED_SECRET;
  });

  it("allows same-origin state-changing requests", async () => {
    const response = await request(buildApp())
      .post("/api/state-changing")
      .set("Host", "skipwait.me")
      .set("Origin", "https://skipwait.me")
      .send({ a: "1" });
    expect(response.status).toBe(200);
  });

  it("allows same-origin requests that only carry Referer", async () => {
    const response = await request(buildApp())
      .post("/api/state-changing")
      .set("Host", "skipwait.me")
      .set("Referer", "https://skipwait.me/settings")
      .send({ a: "1" });
    expect(response.status).toBe(200);
  });

  it("blocks a cross-site form POST", async () => {
    const response = await request(buildApp())
      .post("/api/state-changing")
      .set("Host", "skipwait.me")
      .set("Origin", "https://evil.example")
      .send({ cancel: "1" });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe(CROSS_SITE_BLOCKED_MESSAGE);
  });

  it("blocks a cross-site POST whose Referer is used as the fallback", async () => {
    const response = await request(buildApp())
      .post("/api/state-changing")
      .set("Host", "skipwait.me")
      .set("Referer", "https://evil.example/page")
      .send({});
    expect(response.status).toBe(403);
  });

  it("treats a sandboxed opaque origin (`Origin: null`) as cross-site", async () => {
    const response = await request(buildApp())
      .post("/api/state-changing")
      .set("Host", "skipwait.me")
      .set("Origin", "null")
      .send({});
    expect(response.status).toBe(403);
  });

  // Production proxies /api/* through a Cloudflare Pages Function that CANNOT set
  // `Host` (Cloudflare forbids it on an outbound fetch) and therefore forwards the
  // browser's host as `X-Forwarded-Host`. Comparing against the raw `Host` compared
  // `Origin: https://skipwait.me` to `Host: <container>.workers.dev` and 403'd every
  // state-changing request, so the forwarded host is honoured — with
  // PROXY_SHARED_SECRET + x-skipwait-proxy as proof whenever it is configured.
  it("uses the proxy-forwarded host for a request the proxy marked", async () => {
    process.env.PROXY_SHARED_SECRET = "s3cret";
    const response = await request(buildApp())
      .post("/api/state-changing")
      .set("Host", "skipwaitmanus.ayodhya-711.workers.dev")
      .set("X-Forwarded-Host", "skipwait.me")
      .set("X-Skipwait-Proxy", "s3cret")
      .set("Origin", "https://skipwait.me")
      .send({});
    expect(response.status).toBe(200);
  });

  it("ignores an unmarked forwarded host, so a spoofed origin cannot be laundered", async () => {
    process.env.PROXY_SHARED_SECRET = "s3cret";
    const response = await request(buildApp())
      .post("/api/state-changing")
      .set("Host", "skipwait.me")
      .set("X-Forwarded-Host", "evil.example")
      .set("Origin", "https://evil.example")
      .send({});
    expect(response.status).toBe(403);
  });

  it("rejects a forged proxy marker", async () => {
    process.env.PROXY_SHARED_SECRET = "s3cret";
    const response = await request(buildApp())
      .post("/api/state-changing")
      .set("Host", "skipwait.me")
      .set("X-Forwarded-Host", "evil.example")
      .set("X-Skipwait-Proxy", "wrong")
      .set("Origin", "https://evil.example")
      .send({});
    expect(response.status).toBe(403);
  });

  // The property that actually matters: a genuinely cross-site Origin is refused
  // even when the forwarded host is honoured, because a browser cannot attach
  // X-Forwarded-Host to a credentialed cross-site request without a CORS preflight.
  it("still blocks a cross-site origin when the proxy forwarded the request", async () => {
    const response = await request(buildApp())
      .post("/api/state-changing")
      .set("Host", "skipwaitmanus.ayodhya-711.workers.dev")
      .set("X-Forwarded-Host", "skipwait.me")
      .set("Origin", "https://evil.example")
      .send({});
    expect(response.status).toBe(403);
  });

  it("allows provider webhooks and other non-browser callers that send no Origin", async () => {
    const response = await request(buildApp())
      .post("/api/state-changing")
      .set("Host", "skipwait.me")
      .send({ event: "payment.captured" });
    expect(response.status).toBe(200);
  });

  it("never blocks safe methods, even from another origin", async () => {
    const response = await request(buildApp())
      .get("/api/read")
      .set("Host", "skipwait.me")
      .set("Origin", "https://evil.example");
    expect(response.status).toBe(200);
  });

  it("honours an explicit allowlist for extra origins", async () => {
    process.env.CSRF_ALLOWED_ORIGINS =
      "https://staging.skipwait.me, preview.example";
    const allowed = await request(buildApp())
      .post("/api/state-changing")
      .set("Host", "skipwait.me")
      .set("Origin", "https://staging.skipwait.me")
      .send({});
    expect(allowed.status).toBe(200);
    const stillBlocked = await request(buildApp())
      .post("/api/state-changing")
      .set("Host", "skipwait.me")
      .set("Origin", "https://evil.example")
      .send({});
    expect(stillBlocked.status).toBe(403);
  });

  it("parses host and full-origin allowlist entries", () => {
    expect(hostFromOriginLike("https://skipwait.me/settings")).toBe(
      "skipwait.me"
    );
    expect(hostFromOriginLike("https://skipwait.me:8443")).toBe(
      "skipwait.me:8443"
    );
    expect(hostFromOriginLike("not a url")).toBeUndefined();
    expect(hostFromOriginLike(undefined)).toBeUndefined();
    process.env.CSRF_ALLOWED_ORIGINS = "https://a.example, b.example ";
    expect(allowedCsrfHosts()).toEqual(new Set(["a.example", "b.example"]));
  });
});
