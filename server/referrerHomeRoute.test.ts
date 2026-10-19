import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerProfileRoutes } from "./profileRoutes";

function app(getReferrerHome: (userId: number) => Promise<unknown>) {
  const a = express();
  registerProfileRoutes(a, { resolveIdentity: async req => req.header("x-test-user") ? { account: { id: Number(req.header("x-test-user")), openId: "o" } } : undefined, getReferrerHome } as never);
  return a;
}

describe("GET /api/referrer/home", () => {
  it("requires sign-in", async () => {
    expect((await request(app(async () => ({}))).get("/api/referrer/home")).status).toBe(401);
  });
  it("returns the caller's own read model, uncached", async () => {
    const seen: number[] = [];
    const res = await request(app(async id => { seen.push(id); return { capacity: { total: 3, usedThisMonth: 1, left: 2 }, routing: { state: "active" }, waiting: 0, expiringSoon: 0 }; })).get("/api/referrer/home").set("x-test-user", "7");
    expect(res.status).toBe(200);
    expect(seen).toEqual([7]);
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.body.home.routing.state).toBe("active");
  });
  it("fails closed with a generic error", async () => {
    const res = await request(app(async () => { throw new Error("db password leaked"); })).get("/api/referrer/home").set("x-test-user", "7");
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("leaked");
  });
});
