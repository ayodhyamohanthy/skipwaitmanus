import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { PlanLimitError } from "./planGates";
import { registerProfileRoutes, type ProfileRouteDeps } from "./profileRoutes";

describe("showcase plan-limit routes", () => {
  function profileApp(over: Partial<ProfileRouteDeps>) {
    const app = express();
    registerProfileRoutes(app, { resolveIdentity: async req => (req.header("x-test-user") ? { account: { id: 7, openId: "workos-test" } } : undefined), ...over });
    return app;
  }

  it("answers a piece over the plan's showcase with a typed 409", async () => {
    const app = profileApp({ createWorkItem: async () => { throw new PlanLimitError("showcase_pieces", 3, "Your Free plan holds 3 pieces of work. Compare plans to show more."); } });
    const response = await request(app).post("/api/work-items").set("x-test-user", "7").send({ title: "Fourth" });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "Your Free plan holds 3 pieces of work. Compare plans to show more.", code: "plan_limit", limit: "showcase_pieces", cap: 3 });
  });

  it("answers a pin over the plan's pin limit with a typed 409", async () => {
    const app = profileApp({ updateWorkItem: async () => { throw new PlanLimitError("showcase_pins", 1, "Pin limit reached. Your Free plan pins 1 piece; unpin one first."); } });
    const response = await request(app).patch("/api/work-items/4").set("x-test-user", "7").send({ pinned: true });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "plan_limit", limit: "showcase_pins", cap: 1 });
  });
});
