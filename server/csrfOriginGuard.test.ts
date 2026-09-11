import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedCsrfHosts, csrfOriginGuard, hostFromOriginLike } from "./csrfOriginGuard";

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
  afterEach(() => { vi.restoreAllMocks(); delete process.env.CSRF_ALLOWED_ORIGINS; });

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
    expect(response.body.error).toContain("another site");
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

  it("does not trust a spoofed X-Forwarded-Host to launder the origin check", async () => {
    const response = await request(buildApp())
      .post("/api/state-changing")
      .set("Host", "skipwait.me")
      .set("X-Forwarded-Host", "evil.example")
      .set("Origin", "https://evil.example")
      .send({});
    expect(response.status).toBe(403);
  });

  it("allows provider webhooks and other non-browser callers that send no Origin", async () => {
    const response = await request(buildApp()).post("/api/state-changing").set("Host", "skipwait.me").send({ event: "payment.captured" });
    expect(response.status).toBe(200);
  });

  it("never blocks safe methods, even from another origin", async () => {
    const response = await request(buildApp()).get("/api/read").set("Host", "skipwait.me").set("Origin", "https://evil.example");
    expect(response.status).toBe(200);
  });

  it("honours an explicit allowlist for extra origins", async () => {
    process.env.CSRF_ALLOWED_ORIGINS = "https://staging.skipwait.me, preview.example";
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
    expect(hostFromOriginLike("https://skipwait.me/settings")).toBe("skipwait.me");
    expect(hostFromOriginLike("https://skipwait.me:8443")).toBe("skipwait.me:8443");
    expect(hostFromOriginLike("not a url")).toBeUndefined();
    expect(hostFromOriginLike(undefined)).toBeUndefined();
    process.env.CSRF_ALLOWED_ORIGINS = "https://a.example, b.example ";
    expect(allowedCsrfHosts()).toEqual(new Set(["a.example", "b.example"]));
  });
});
