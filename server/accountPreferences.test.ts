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
  it("rejects unknown keys like the rest of the API", () => {
    expect(parsePreferencesPatch({ dateFormat: "iso", userId: 9 })).toEqual({ error: "Unknown setting" });
    expect(parsePreferencesPatch({ admin: true })).toEqual({ error: "Unknown setting" });
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
    expect((await request(app).get("/api/account/preferences").set("x-u", "1")).body.preferences).toEqual({ timeZone: null, dateFormat: null, language: null });
    const saved = await request(app).put("/api/account/preferences").set("x-u", "1").send({ timeZone: "Europe/London", dateFormat: "mdy" });
    expect(saved.body.preferences).toEqual({ timeZone: "Europe/London", dateFormat: "mdy", language: null });
    expect((await request(app).put("/api/account/preferences").set("x-u", "1").send({ dateFormat: "iso", userId: 2 })).status).toBe(400);
    expect((await request(app).get("/api/account/preferences").set("x-u", "2")).body.preferences).toEqual({ timeZone: null, dateFormat: null, language: null });
    expect((await request(app).put("/api/account/preferences").set("x-u", "1").send({ timeZone: "nope" })).status).toBe(400);
  });
});

// D-093.capture §5.1 red-first tests 2, 3 and 5 (C3). The language field, the
// language-only PUT and the signup-language route do not exist on main yet.
describe("language preference (D-093.capture)", () => {
  const identity = async (req: { header(name: string): string | undefined }) =>
    req.header("x-u") ? { account: { id: Number(req.header("x-u")) } } : undefined;

  it("accepts a visible language or a null clear, and refuses an unreviewed one", () => {
    expect(parsePreferencesPatch({ language: "en" })).toEqual({ patch: {}, language: "en" });
    expect(parsePreferencesPatch({ language: null })).toEqual({ patch: {}, language: null });
    expect(parsePreferencesPatch({ language: "te" })).toEqual({ error: "Choose a language we offer" });
    expect(parsePreferencesPatch({ language: "xx" })).toEqual({ error: "Choose a language we offer" });
  });

  it("still refuses signupLanguage as an unknown setting", () => {
    expect(parsePreferencesPatch({ signupLanguage: "te" })).toEqual({ error: "Unknown setting" });
  });

  const appWithLanguage = (calls: { saved: unknown[]; languages: unknown[]; signup: unknown[] }) => {
    const app = express();
    registerAccountPreferenceRoutes(app, {
      resolveIdentity: identity,
      getPreferences: async () => ({ timeZone: null, dateFormat: null }),
      savePreferences: async (id, patch) => { calls.saved.push([id, patch]); return { timeZone: null, dateFormat: null, ...patch }; },
      getLanguage: async () => "en",
      saveLanguage: async (id, code) => { calls.languages.push([id, code]); },
      recordSignupLanguage: async (id, value, now) => { calls.signup.push([id, value, now instanceof Date]); return false; },
    });
    return app;
  };

  it("GET includes language and never signupLanguage", async () => {
    const calls = { saved: [], languages: [], signup: [] };
    const res = await request(appWithLanguage(calls)).get("/api/account/preferences").set("x-u", "1");
    expect(res.status).toBe(200);
    expect(res.body.preferences.language).toBe("en");
    expect(res.body.preferences).not.toHaveProperty("signupLanguage");
    expect(res.get("Cache-Control")).toBe("private, no-store");
  });

  it("a language-only PUT saves the language and never sends an empty preferences patch", async () => {
    const calls = { saved: [], languages: [], signup: [] };
    const res = await request(appWithLanguage(calls)).put("/api/account/preferences").set("x-u", "1").send({ language: "en" });
    expect(res.status).toBe(200);
    expect(res.body.preferences.language).toBe("en");
    expect(calls.saved).toEqual([]);
    expect(calls.languages).toEqual([[1, "en"]]);
  });

  it("POST /api/account/signup-language answers 204 for any body and 401 signed out", async () => {
    const calls = { saved: [], languages: [], signup: [] };
    const app = appWithLanguage(calls);
    expect((await request(app).post("/api/account/signup-language").send({ language: "te-IN" })).status).toBe(401);
    for (const body of [{ language: "te-IN" }, { language: "not a tag" }, {}, { language: 42 }]) {
      const res = await request(app).post("/api/account/signup-language").set("x-u", "1").send(body);
      expect(res.status).toBe(204);
      expect(res.text).toBe("");
    }
    expect(calls.signup[0]).toEqual([1, "te", true]);
    expect(calls.signup[1]).toEqual([1, null, true]);
    expect(calls.signup).toHaveLength(4);
    expect(calls.saved).toEqual([]);
  });
});
