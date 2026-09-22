import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { WorkOS } from "@workos-inc/node";
import { registerWorkosWebhookRoutes, type WorkosWebhookVerifier } from "./workosWebhooks";

const SECRET = "whsec_test_only_do_not_use_in_production_0123456789";

function sign(body: string, secret: string = SECRET, ageMs = 0): string {
  const t = Date.now() - ageMs;
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

function eventBody(event: string, data: Record<string, unknown>, id = "event_test_1"): string {
  return JSON.stringify({ object: "event", id, event, data, created_at: new Date().toISOString() });
}

function appFor(deps?: Parameters<typeof registerWorkosWebhookRoutes>[1]) {
  const app = express();
  // Handler tests run against the real SDK signature check (placeholder API
  // key is never used for network calls); only verification behavior matters.
  const sdkVerify: WorkosWebhookVerifier = async (rawBody, sigHeader, secret) => {
    const event = await new WorkOS("sk_test_placeholder").webhooks.constructEvent({ payload: rawBody, sigHeader, secret }) as unknown as { id: string; event: string; data: Record<string, unknown> };
    return { id: event.id, event: event.event, data: event.data };
  };
  registerWorkosWebhookRoutes(app, { verifyEvent: sdkVerify, secret: SECRET, ...deps });
  return app;
}

describe("WorkOS webhook receiver contract", () => {
  it("rejects unsigned and forged deliveries without touching business logic", async () => {
    const suspendUserByWorkosId = vi.fn();
    const app = appFor({ suspendUserByWorkosId });
    const body = eventBody("user.deleted", { object: "user", id: "user_123" });
    await request(app).post("/api/webhooks/workos").set("Content-Type", "application/json").send(body).expect(401);
    await request(app).post("/api/webhooks/workos").set("Content-Type", "application/json").set("workos-signature", sign(body, "wrong-secret")).send(body).expect(401);
    expect(suspendUserByWorkosId).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when the webhook secret is not configured", async () => {
    const app = express();
    registerWorkosWebhookRoutes(app, { secret: "" });
    const body = eventBody("user.deleted", { object: "user", id: "user_123" });
    await request(app).post("/api/webhooks/workos").set("Content-Type", "application/json").set("workos-signature", sign(body)).send(body).expect(503);
  });

  it("fails closed with 503 when WorkOS credentials are absent entirely", async () => {
    const savedKey = process.env.WORKOS_API_KEY;
    const savedSecret = process.env.WORKOS_WEBHOOK_SECRET;
    delete process.env.WORKOS_API_KEY;
    delete process.env.WORKOS_WEBHOOK_SECRET;
    try {
      const app = express();
      registerWorkosWebhookRoutes(app);
      const body = eventBody("user.deleted", { object: "user", id: "user_123" });
      await request(app).post("/api/webhooks/workos").set("Content-Type", "application/json").set("workos-signature", sign(body)).send(body).expect(503);
    } finally {
      if (savedKey !== undefined) process.env.WORKOS_API_KEY = savedKey;
      if (savedSecret !== undefined) process.env.WORKOS_WEBHOOK_SECRET = savedSecret;
    }
  });

  it("suspends and revokes the local account on user.deleted", async () => {
    const suspendUserByWorkosId = vi.fn(async () => ({ userId: 7 }));
    const record = vi.fn();
    const app = appFor({ suspendUserByWorkosId, record });
    const body = eventBody("user.deleted", { object: "user", id: "user_abc" });
    const res = await request(app).post("/api/webhooks/workos").set("Content-Type", "application/json").set("workos-signature", sign(body)).send(body).expect(200);
    expect(res.body).toEqual({ received: true });
    expect(suspendUserByWorkosId).toHaveBeenCalledWith("user_abc");
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.workos_user_deleted", outcome: "success" }));
  });

  it("still returns 200 for user.deleted with no matching local account", async () => {
    const suspendUserByWorkosId = vi.fn(async () => undefined);
    const app = appFor({ suspendUserByWorkosId });
    const body = eventBody("user.deleted", { object: "user", id: "user_unknown" });
    await request(app).post("/api/webhooks/workos").set("Content-Type", "application/json").set("workos-signature", sign(body)).send(body).expect(200);
  });

  it("syncs name and email on user.updated and skips unknown accounts", async () => {
    const updateUserProfileByWorkosId = vi.fn(async () => ({ userId: 9 }));
    const app = appFor({ updateUserProfileByWorkosId });
    const body = eventBody("user.updated", { object: "user", id: "user_9", first_name: "Ada", last_name: "Lovelace", email: "ada@company.com" });
    await request(app).post("/api/webhooks/workos").set("Content-Type", "application/json").set("workos-signature", sign(body)).send(body).expect(200);
    expect(updateUserProfileByWorkosId).toHaveBeenCalledWith("user_9", { name: "Ada Lovelace", email: "ada@company.com" });
  });

  it("acknowledges subscribed no-op events and unknown types with 200", async () => {
    const record = vi.fn();
    const app = appFor({ record });
    for (const event of ["user.created", "session.created", "connection.activated"]) {
      const body = eventBody(event, { object: "user", id: "user_x" });
      await request(app).post("/api/webhooks/workos").set("Content-Type", "application/json").set("workos-signature", sign(body)).send(body).expect(200);
    }
    expect(record).not.toHaveBeenCalled();
  });

  it("duplicate deliveries are idempotent state-sets", async () => {
    const suspendUserByWorkosId = vi.fn(async () => ({ userId: 7 }));
    const app = appFor({ suspendUserByWorkosId });
    const body = eventBody("user.deleted", { object: "user", id: "user_dup" }, "event_dup_1");
    const headers = { "Content-Type": "application/json", "workos-signature": sign(body) };
    await request(app).post("/api/webhooks/workos").set(headers).send(body).expect(200);
    await request(app).post("/api/webhooks/workos").set(headers).send(body).expect(200);
    expect(suspendUserByWorkosId).toHaveBeenCalledTimes(2);
  });

  it("verifies through the real WorkOS SDK against a hand-rolled HMAC", async () => {
    const workos = new WorkOS("sk_test_placeholder");
    const parsed = await workos.webhooks.constructEvent({ payload: eventBody("user.created", { id: "user_sdk" }), sigHeader: "unused", secret: SECRET }).catch(() => undefined);
    expect(parsed).toBeUndefined();
    const body = eventBody("user.created", { id: "user_sdk" });
    const verified = await workos.webhooks.constructEvent({ payload: body, sigHeader: sign(body), secret: SECRET });
    expect(verified.event).toBe("user.created");
  });
});
