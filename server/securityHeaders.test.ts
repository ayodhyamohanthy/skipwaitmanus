import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { globalSecurityHeaders } from "./securityHeaders";

describe("global security headers", () => {
  it("removes server fingerprinting and returns baseline browser protection headers", async () => {
    const app = express(); app.disable("x-powered-by"); app.use(globalSecurityHeaders); app.get("/health", (_req, res) => res.json({ ok: true }));
    const response = await request(app).get("/health");
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers["permissions-policy"]).toContain("camera=()");
  });
});
