import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerAskDraftRoutes } from "./askDraftRoutes";
import type { AskDraft } from "../shared/askDraft";

function buildApp() {
  const store = new Map<number, AskDraft>();
  const app = express();
  registerAskDraftRoutes(app, {
    resolveIdentity: async req => { const id = Number(req.header("x-test-user")); return id ? { account: { id } } : undefined; },
    getAskDraft: async userId => store.get(userId) ?? null,
    saveAskDraft: async (userId, input) => { const draft = { ...input, updatedAt: new Date(0).toISOString() }; store.set(userId, draft); return draft; },
    deleteAskDraft: async userId => { store.delete(userId); },
  });
  return app;
}
const good = { companySlug: "wipro", targetRoleUrl: "https://careers.wipro.com/job/product-designer-123", note: "I led a redesign." };

describe("/api/ask-drafts", () => {
  it("requires sign-in on every method", async () => {
    const app = buildApp();
    expect((await request(app).get("/api/ask-drafts")).status).toBe(401);
    expect((await request(app).put("/api/ask-drafts").send(good)).status).toBe(401);
    expect((await request(app).delete("/api/ask-drafts")).status).toBe(401);
  });
  it("saves, replaces and returns only the caller's own draft", async () => {
    const app = buildApp();
    expect((await request(app).get("/api/ask-drafts").set("x-test-user", "11")).body).toEqual({ draft: null });
    const saved = await request(app).put("/api/ask-drafts").set("x-test-user", "11").send({ ...good, note: "  trimmed  " });
    expect(saved.status).toBe(200);
    expect(saved.body.draft).toMatchObject({ companySlug: "wipro", note: "trimmed" });
    expect(saved.headers["cache-control"]).toBe("private, no-store");
    expect((await request(app).get("/api/ask-drafts").set("x-test-user", "22")).body).toEqual({ draft: null });
    await request(app).put("/api/ask-drafts").set("x-test-user", "22").send({ ...good, note: "mine" });
    expect((await request(app).get("/api/ask-drafts").set("x-test-user", "11")).body.draft.note).toBe("trimmed");
    await request(app).delete("/api/ask-drafts").set("x-test-user", "22");
    expect((await request(app).get("/api/ask-drafts").set("x-test-user", "11")).body.draft).not.toBeNull();
    expect((await request(app).get("/api/ask-drafts").set("x-test-user", "22")).body.draft).toBeNull();
  });
  it("rejects a body naming a user, a bad slug, a non-job link or an oversize note", async () => {
    const app = buildApp();
    for (const body of [{ ...good, userId: 22 }, { ...good, companySlug: "Not A Slug" }, { ...good, targetRoleUrl: "not a link" }, { ...good, note: "x".repeat(601) }, { companySlug: "wipro" }]) {
      expect((await request(app).put("/api/ask-drafts").set("x-test-user", "11").send(body)).status, JSON.stringify(body)).toBe(400);
    }
  });
});
