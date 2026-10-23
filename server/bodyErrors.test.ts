import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { jsonBodyError } from "./bodyErrors";

describe("jsonBodyError", () => {
  const app = express();
  const parser = express.json({ limit: "1kb" });
  app.use((req, res, next) => parser(req, res, error => (error ? res.status(jsonBodyError(error).status).json(jsonBodyError(error).body) : next())));
  app.post("/x", (_req, res) => res.json({ ok: true }));
  it("answers 400 for malformed JSON", async () => {
    const res = await request(app).post("/x").set("content-type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not valid JSON/);
  });
  it("still answers 413 for a body over the limit", async () => {
    const res = await request(app).post("/x").set("content-type", "application/json").send(JSON.stringify({ a: "x".repeat(2000) }));
    expect(res.status).toBe(413);
  });
});
