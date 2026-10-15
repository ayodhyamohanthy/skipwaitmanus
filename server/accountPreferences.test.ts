import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { parsePreferencesPatch, registerAccountPreferenceRoutes } from "./accountPreferences";

describe("parsePreferencesPatch", () => {
  it("accepts valid zones (including legacy ids), formats and null clears", () => {
    expect(parsePreferencesPatch({ timeZone: "Asia/Kolkata", dateFormat: "dmy" })).toEqual({ patch: { timeZone: "Asia/Kolkata", dateFormat: "dmy" } });
    expect(parsePreferencesPatch({ timeZone: "Asia/Calcutta" })).toEqual({ patch: { timeZone: "Asia/Calcutta" } });
    expect(parsePreferencesPatch({ timeZone: null, dateFormat: null })).toEqual({ patch: { timeZone: null, dateFormat: null } });
  });
  it("rejects bad zones, formats, empty and non-object bodies", () => {
    for (const body of [{ timeZone: "Mars/Base" }, { timeZone: 5 }, { timeZone: "x".repeat(80) }, { dateFormat: "dd/mm" }, {}, [], null, "x"]) expect("error" in parsePreferencesPatch(body)).toBe(true);
  });
  it("ignores unknown keys", () => {
    expect(parsePreferencesPatch({ dateFormat: "iso", userId: 9, admin: true })).toEqual({ patch: { dateFormat: "iso" } });
  });
});

describe("account preference routes", () => {
  const store = new Map<number, { timeZone: string | null; dateFormat: "dmy" | "mdy" | "iso" | null }>();
  const app = express();
  registerAccountPreferenceRoutes(app, {
    resolveIdentity: async req => req.header("x-u") ? { account: { id: Number(req.header("x-u")) } } : undefined,
    getPreferences: async id => store.get(id) ?? { timeZone: null, dateFormat: null },
    savePreferences: async (id, patch) => { const next = { ...(store.get(id) ?? { timeZone: null, dateFormat: null }), ...patch }; store.set(id, next); return next; },
  });
  it("requires sign-in", async () => {
    expect((await request(app).get("/api/account/preferences")).status).toBe(401);
    expect((await request(app).put("/api/account/preferences").send({ dateFormat: "iso" })).status).toBe(401);
  });
  it("defaults to device, saves for the caller only, and rejects bad input", async () => {
    expect((await request(app).get("/api/account/preferences").set("x-u", "1")).body.preferences).toEqual({ timeZone: null, dateFormat: null });
    const saved = await request(app).put("/api/account/preferences").set("x-u", "1").send({ timeZone: "Europe/London", dateFormat: "mdy", userId: 2 });
    expect(saved.body.preferences).toEqual({ timeZone: "Europe/London", dateFormat: "mdy" });
    expect((await request(app).get("/api/account/preferences").set("x-u", "2")).body.preferences).toEqual({ timeZone: null, dateFormat: null });
    expect((await request(app).put("/api/account/preferences").set("x-u", "1").send({ timeZone: "nope" })).status).toBe(400);
  });
});
