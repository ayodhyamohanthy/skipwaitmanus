// S-6 (seeker passwords packet): Server-Timing hands anyone the exact server time of an answer, which on sign-in
// and sign-up says how much work the server did for that email. Auth routes never carry it; other API routes do.
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { apiTiming } from "./apiTiming";

function app() {
  const server = express();
  server.use("/api", apiTiming);
  server.post("/api/auth/password/sign-in", (_req, res) => { res.status(401).json({ ok: false }); });
  server.post("/api/auth/password/sign-up", (_req, res) => { res.json({ ok: true }); });
  server.get("/api/auth/workos/callback", (_req, res) => { res.redirect(302, "/explore"); });
  server.get("/api/health", (_req, res) => { res.json({ ok: true }); });
  return server;
}

describe("Server-Timing on API answers", () => {
  it("is never sent on /api/auth/*", async () => {
    for (const call of [request(app()).post("/api/auth/password/sign-in"), request(app()).post("/api/auth/password/sign-up"), request(app()).get("/api/auth/workos/callback")]) {
      const res = await call;
      expect(res.headers["server-timing"]).toBeUndefined();
    }
  });

  it("is still sent on every other API route", async () => {
    const res = await request(app()).get("/api/health");
    expect(res.headers["server-timing"]).toMatch(/^app;dur=\d+$/);
  });
});
