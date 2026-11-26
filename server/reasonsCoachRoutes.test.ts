import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerReasonsCoachRoutes } from "./reasonsCoachRoutes";
import type { routeChat } from "./_core/modelRouter";
import { REASONS_COACH_GLOBAL_DAILY, REASONS_COACH_LIMIT_MESSAGE, REASONS_COACH_USER_DAILY } from "../shared/reasonsCoach";

const body = { reasons: ["I improved the workflow.", "I know the product.", "I work with designers."] };
function harness({ enabled = true, configured = true, signedIn = true } = {}) {
  const chat = vi.fn<typeof routeChat>(async () => "Which result did you get there?\nYou grew revenue 40%?");
  const resolveIdentity = vi.fn(async () => signedIn ? { account: { id: 42 } } : undefined);
  let userId = 42;
  let now = Date.UTC(2026, 10, 20);
  const app = express();
  registerReasonsCoachRoutes(app, { enabled: () => enabled, configured: () => configured, chat,
    resolveIdentity: async () => { const identity = await resolveIdentity(); return identity ? { account: { id: userId } } : undefined; },
    now: () => now,
  });
  return { app, chat, resolveIdentity, user: (id: number) => { userId = id; }, nextDay: () => { now += 86_400_000; } };
}

describe("POST /api/ask/reasons-coach", () => {
  it("returns 404 before parsing, identity resolution or model access while disabled", async () => {
    const h = harness({ enabled: false });
    const response = await request(h.app).post("/api/ask/reasons-coach").set("Content-Type", "application/json").send("{invalid");
    expect(response.status).toBe(404);
    expect(h.resolveIdentity).not.toHaveBeenCalled();
    expect(h.chat).not.toHaveBeenCalled();
  });
  it("requires authentication and sends no provider request for unconfigured models", async () => {
    const guest = harness({ signedIn: false });
    expect((await request(guest.app).post("/api/ask/reasons-coach").send(body)).status).toBe(401);
    expect(guest.chat).not.toHaveBeenCalled();
    const h = harness({ configured: false });
    expect((await request(h.app).post("/api/ask/reasons-coach").send(body)).body).toEqual({ questions: [] });
    expect(h.chat).not.toHaveBeenCalled();
  });
  it("rejects unknown/private fields and overlong or malformed input before the model", async () => {
    const h = harness();
    for (const input of [{ ...body, resumeId: 7 }, { ...body, email: "private@example.invalid" }, { reasons: ["one"] }]) {
      expect((await request(h.app).post("/api/ask/reasons-coach").send(input)).status).toBe(400);
    }
    expect((await request(h.app).post("/api/ask/reasons-coach").send({ ...body, extra: "x".repeat(5000) })).status).toBe(413);
    expect(h.chat).not.toHaveBeenCalled();
  });
  it("sends only the allowed context, filters generated lines and prevents caching", async () => {
    const h = harness();
    const input = { ...body, roleTitle: "Designer", companyName: "Acme" };
    const response = await request(h.app).post("/api/ask/reasons-coach").send(input);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ questions: ["Which result did you get there?"] });
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(h.chat).toHaveBeenCalledOnce();
    const call = h.chat.mock.calls[0]?.[0];
    expect(call?.user).toBe(JSON.stringify(input));
    expect(call?.fallback).toBe("");
    expect(call?.maxTokens).toBe(240);
    expect(call?.system).toContain("untrusted data");
    expect(JSON.stringify(call)).not.toMatch(/resumeId|private@example|jobLink|userId/);
  });
  it("reserves each user's daily allowance before calls and resets it on a new UTC day", async () => {
    const h = harness();
    for (let i = 0; i < REASONS_COACH_USER_DAILY; i++) expect((await request(h.app).post("/api/ask/reasons-coach").send(body)).status).toBe(200);
    const response = await request(h.app).post("/api/ask/reasons-coach").send(body);
    expect(response.status).toBe(429);
    expect(response.body).toEqual({ error: REASONS_COACH_LIMIT_MESSAGE });
    expect(h.chat).toHaveBeenCalledTimes(REASONS_COACH_USER_DAILY);
    h.nextDay();
    expect((await request(h.app).post("/api/ask/reasons-coach").send(body)).status).toBe(200);
  });
  it("enforces the global cap across different users", async () => {
    const h = harness();
    for (let i = 0; i < REASONS_COACH_GLOBAL_DAILY; i++) {
      h.user(i + 1);
      expect((await request(h.app).post("/api/ask/reasons-coach").send(body)).status).toBe(200);
    }
    h.user(REASONS_COACH_GLOBAL_DAILY + 1);
    expect((await request(h.app).post("/api/ask/reasons-coach").send(body)).status).toBe(429);
    expect(h.chat).toHaveBeenCalledTimes(REASONS_COACH_GLOBAL_DAILY);
  });
});
