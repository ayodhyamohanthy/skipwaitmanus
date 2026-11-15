import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { CSP_ENFORCED, CSP_POLICY, contentSecurityPolicyHeader, globalSecurityHeaders } from "./securityHeaders";

describe("global security headers", () => {
  it("removes server fingerprinting and returns baseline browser protection headers", async () => {
    const app = express(); app.disable("x-powered-by"); app.use(globalSecurityHeaders); app.get("/health", (_req, res) => res.json({ ok: true }));
    const response = await request(app).get("/health");
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers["permissions-policy"]).toContain("camera=()");
  });

  it("points the report-only CSP at /api/csp-report and keeps its directives (D-100.csp-report)", async () => {
    const app = express(); app.use(globalSecurityHeaders); app.get("/health", (_req, res) => res.json({ ok: true }));
    const response = await request(app).get("/health");
    const policy = response.headers["content-security-policy-report-only"];
    expect(policy).toBe("default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; report-uri /api/csp-report");
    expect(response.headers["content-security-policy"]).toBeUndefined();
  });

  it("answers POST /api/csp-report itself, before any later middleware or body parser, with no cookie", async () => {
    const app = express(); app.use(globalSecurityHeaders);
    app.use(express.json()); app.use((_req, res) => { res.cookie("leak", "1"); res.status(500).end(); });
    const response = await request(app)
      .post("/api/csp-report")
      .set("Content-Type", "application/csp-report")
      .send(JSON.stringify({ "csp-report": { "document-uri": "https://skipwait.me/", "blocked-uri": "inline", "effective-directive": "script-src-elem" } }));
    expect(response.status).toBe(204);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("passes other methods and paths through to the app", async () => {
    const app = express(); app.use(globalSecurityHeaders);
    app.get("/api/csp-report", (_req, res) => res.status(404).json({ error: "not_found" }));
    app.post("/api/other", (_req, res) => res.status(201).end());
    expect((await request(app).get("/api/csp-report")).status).toBe(404);
    expect((await request(app).post("/api/other")).status).toBe(201);
  });

  describe("enforcing CSP behind CSP_ENFORCED (D-100.csp-enforce)", () => {
    it("ships switched off, so production still sends only the report-only header", async () => {
      expect(CSP_ENFORCED).toBe(false);
      const app = express(); app.use(globalSecurityHeaders); app.get("/", (_req, res) => res.send("ok"));
      const response = await request(app).get("/");
      expect(response.headers["content-security-policy-report-only"]).toBe(CSP_POLICY);
      expect(response.headers["content-security-policy"]).toBeUndefined();
    });

    it("names the report-only header while the switch is off", () => {
      expect(contentSecurityPolicyHeader(false)).toEqual({ name: "Content-Security-Policy-Report-Only", value: CSP_POLICY });
    });

    it("names the enforcing header with the very same policy once the switch is on", () => {
      expect(contentSecurityPolicyHeader(true)).toEqual({ name: "Content-Security-Policy", value: CSP_POLICY });
    });

    it("keeps reporting to /api/csp-report and the locked-down directives in the enforced policy", () => {
      const { value } = contentSecurityPolicyHeader(true);
      for (const directive of ["default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'", "report-uri /api/csp-report"]) {
        expect(value).toContain(directive);
      }
      expect(value).not.toMatch(/unsafe-(inline|eval)/);
      expect(value).not.toContain("*");
    });
  });
});
