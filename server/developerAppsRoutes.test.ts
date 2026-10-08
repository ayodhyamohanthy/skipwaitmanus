import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerDeveloperAppsRoutes } from "./developerAppsRoutes";

/**
 * Developer-app registration. The parts worth testing are the ones where being
 * wrong is a security problem rather than a cosmetic one: who may read an app,
 * what a redirect URL may be, and where the client secret goes.
 */

function build(overrides: Record<string, unknown> = {}) {
  const app = express();
  app.use(express.json());
  registerDeveloperAppsRoutes(app, {
    resolveIdentity: async () => ({ account: { id: 7 } }),
    listApps: async () => [],
    createApp: async () => ({ id: 1 }),
    ...overrides,
  } as Parameters<typeof registerDeveloperAppsRoutes>[1]);
  return app;
}

const validBody = {
  name: "Instinct",
  kind: "agent",
  websiteUrl: "https://instinct.example",
  redirectUrls: ["https://instinct.example/oauth/skipwait"],
  description: "An assistant that helps people apply for referrals with consent.",
  scopes: ["companies:read"],
  agreedToTerms: true,
};

describe("developer app registration", () => {
  it("refuses an unauthenticated read", async () => {
    const app = build({ resolveIdentity: async () => undefined });
    expect((await request(app).get("/api/developer/apps")).status).toBe(401);
  });

  it("scopes the list to the caller's own apps", async () => {
    const listApps = vi.fn(async () => []);
    const app = build({ listApps });
    await request(app).get("/api/developer/apps");
    expect(listApps).toHaveBeenCalledWith(7);
  });

  it("rejects a non-https redirect URL", async () => {
    // An unvalidated redirect URL is how an authorization code is delivered to
    // someone who is not the app.
    const app = build();
    const response = await request(app).post("/api/developer/apps").send({ ...validBody, redirectUrls: ["http://evil.example/cb"] });
    expect(response.status).toBe(400);
    expect(response.body.field).toContain("redirectUrls");
  });

  it("allows http on localhost only, for development", async () => {
    const app = build();
    const response = await request(app).post("/api/developer/apps").send({ ...validBody, redirectUrls: ["http://localhost:3000/cb"] });
    expect(response.status).toBe(201);
  });

  it("requires an explicit terms agreement", async () => {
    const app = build();
    const response = await request(app).post("/api/developer/apps").send({ ...validBody, agreedToTerms: false });
    expect(response.status).toBe(400);
  });

  it("rejects an unknown scope rather than silently dropping it", async () => {
    const app = build();
    const response = await request(app).post("/api/developer/apps").send({ ...validBody, scopes: ["companies:read", "admin:everything"] });
    expect(response.status).toBe(400);
  });

  it("returns the client secret exactly once, at creation", async () => {
    const app = build();
    const created = await request(app).post("/api/developer/apps").send(validBody);
    expect(created.status).toBe(201);
    expect(created.body.clientSecret).toMatch(/^sws_[0-9a-f]{64}$/);
  });

  it("stores a hash, never the secret itself", async () => {
    const createApp = vi.fn(async () => ({ id: 1 }));
    const app = build({ createApp });
    const created = await request(app).post("/api/developer/apps").send(validBody);
    const stored = createApp.mock.calls[0][0] as { clientSecretHash: string };
    expect(stored.clientSecretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.clientSecretHash).not.toContain(created.body.clientSecret);
    expect(JSON.stringify(stored)).not.toContain(created.body.clientSecret);
  });

  it("never exposes the secret hash when listing", async () => {
    const app = build({
      listApps: async () => [{
        id: 1, name: "Instinct", kind: "agent", status: "in_review",
        scopes: '["companies:read"]', redirectUrls: '["https://x.example/cb"]',
        isTestMode: true, clientId: "swc_abc", reviewNote: null, createdAt: new Date(),
      }],
    });
    const response = await request(app).get("/api/developer/apps");
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toMatch(/clientSecretHash|sws_/);
  });

  it("sends anything that acts or spends to human review", async () => {
    const app = build();
    const response = await request(app).post("/api/developer/apps").send({ ...validBody, scopes: ["asks:send"] });
    expect(response.status).toBe(201);
    expect(response.body.needsReview).toBe(true);
  });

  it("starts every app in test mode and in review", async () => {
    const createApp = vi.fn(async () => ({ id: 1 }));
    const app = build({ createApp });
    await request(app).post("/api/developer/apps").send(validBody);
    const stored = createApp.mock.calls[0][0] as { status: string; isTestMode: boolean };
    expect(stored.status).toBe("in_review");
    expect(stored.isTestMode).toBe(true);
  });

  it("survives a malformed JSON column rather than 500ing the list", async () => {
    const app = build({
      listApps: async () => [{
        id: 1, name: "Broken", kind: "app", status: "in_review",
        scopes: "not json", redirectUrls: "{oops", isTestMode: true,
        clientId: "swc_x", reviewNote: null, createdAt: new Date(),
      }],
    });
    const response = await request(app).get("/api/developer/apps");
    expect(response.status).toBe(200);
    expect(response.body.apps[0].scopes).toEqual([]);
  });
});
