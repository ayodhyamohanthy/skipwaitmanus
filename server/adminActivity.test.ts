import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ACTIVITY_EXPORT_MAX, csvCell } from "../shared/adminActivity";
import { registerAdminActivityRoutes, type ActivityListInput, type AdminActivityDeps } from "./adminActivity";

// ADMIN-activity-log (D-393): admin-only, no-store, filters reach the store, pages go back by id, export is CSV, reads are logged.
const ADMIN = { account: { id: 1, role: "admin" } };
const identities: Record<string, { account: { id: number; role: string } }> = { admin: ADMIN, seeker: { account: { id: 2, role: "user" } }, referrer: { account: { id: 3, role: "user" } } };
const row = (id: number, extra: Record<string, unknown> = {}) => ({ id, action: "auth.password_sign_in", outcome: "failure", resourceType: "auth", resourceId: null, companyDomain: null, metadata: "{}", createdAt: "2026-11-24T10:00:00.000Z", actorUserId: 7, actorName: "Asha", actorEmail: "asha@gmail.com", ...extra });

function setup(over: Partial<AdminActivityDeps> = {}) {
  const inputs: ActivityListInput[] = [];
  const recorded: Array<{ action: string; metadata: Record<string, unknown> }> = [];
  const all = Array.from({ length: 600 }, (_, index) => row(600 - index));
  const deps: AdminActivityDeps = {
    resolveIdentity: async req => identities[String(req.header("x-test-user"))],
    listOperationalActivity: async input => { inputs.push(input); return all.filter(item => input.before === undefined || item.id < input.before).slice(0, input.limit); },
    resolveActivityPerson: async person => (person === "asha@gmail.com" ? { userIds: [7], emailKey: "a".repeat(32) } : { userIds: [], emailKey: "b".repeat(32) }),
    listPersonRequestTransitions: async (userIds, limit) => [{ id: 1, referralRequestId: 40, action: "lapse", fromStatus: "claimed", resultingStatus: "pending", actorUserId: 7, role: "seeker", createdAt: "2026-11-24T10:00:00.000Z", userIds, limit }],
    record: input => { recorded.push(input); },
    ...over,
  };
  const app = express();
  registerAdminActivityRoutes(app, deps);
  return { app, inputs, recorded };
}

describe("/api/admin/activity", () => {
  it.each(["seeker", "referrer", "nobody"])("refuses a %s with 403 and no-store", async who => {
    const { app, inputs } = setup();
    for (const path of ["/api/admin/activity", "/api/admin/activity/export", "/api/admin/activity/requests?person=7"]) {
      const res = await request(app).get(path).set("x-test-user", who);
      expect(res.status).toBe(403);
      expect(res.headers["cache-control"]).toBe("private, no-store");
    }
    expect(inputs).toEqual([]);
  });

  it("passes every filter to the store and logs the view", async () => {
    const { app, inputs, recorded } = setup();
    const res = await request(app).get("/api/admin/activity?person=asha@gmail.com&family=auth&outcome=failure&from=2026-11-01&to=2026-11-24&limit=50").set("x-test-user", "admin");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(inputs[0]).toEqual({ limit: 51, family: "auth", outcome: "failure", userIds: [7], emailKey: "a".repeat(32), from: new Date("2026-11-01T00:00:00.000Z"), to: new Date("2026-11-25T00:00:00.000Z") });
    expect(recorded).toEqual([expect.objectContaining({ action: "admin.activity_viewed", metadata: expect.objectContaining({ family: "auth", person: true, filtered: true }) })]);
  });

  it("pages back by id with nextBefore and stops at the end", async () => {
    const { app } = setup();
    const first = await request(app).get("/api/admin/activity?limit=250").set("x-test-user", "admin");
    expect(first.body.events).toHaveLength(250);
    expect(first.body.nextBefore).toBe(351);
    const second = await request(app).get(`/api/admin/activity?limit=250&before=${first.body.nextBefore}`).set("x-test-user", "admin");
    expect(second.body.events[0].id).toBe(350);
    const last = await request(app).get("/api/admin/activity?limit=250&before=101").set("x-test-user", "admin");
    expect(last.body.events).toHaveLength(100);
    expect(last.body.nextBefore).toBeNull();
  });

  it("finds a person by account id without an email lookup", async () => {
    const resolveActivityPerson = vi.fn();
    const { app, inputs } = setup({ resolveActivityPerson });
    await request(app).get("/api/admin/activity?person=7").set("x-test-user", "admin");
    expect(resolveActivityPerson).not.toHaveBeenCalled();
    expect(inputs[0]).toMatchObject({ userIds: [7] });
  });

  it("refuses a malformed filter with 400", async () => {
    const { app, inputs } = setup();
    for (const query of ["family=everything", "outcome=maybe", "from=24-11-2026", "limit=9999", "before=-3"]) {
      expect((await request(app).get(`/api/admin/activity?${query}`).set("x-test-user", "admin")).status).toBe(400);
    }
    expect(inputs).toEqual([]);
  });
});

describe("/api/admin/activity/export", () => {
  it("returns the filtered range as CSV, capped, and logs the export", async () => {
    const { app, inputs, recorded } = setup();
    const res = await request(app).get("/api/admin/activity/export?family=auth").set("x-test-user", "admin");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="skipwait-activity-\d{4}-\d{2}-\d{2}\.csv"$/);
    const lines = res.text.trim().split("\r\n");
    expect(lines[0]).toBe("id,createdAt,actorUserId,actorEmail,action,outcome,resourceType,resourceId,companyDomain,metadata");
    expect(lines).toHaveLength(601);
    expect(inputs.every(input => input.family === "auth")).toBe(true);
    expect(recorded).toEqual([expect.objectContaining({ action: "admin.activity_exported", metadata: expect.objectContaining({ rows: 600 }) })]);
  });

  it("never exports more than the cap", async () => {
    const many = Array.from({ length: ACTIVITY_EXPORT_MAX + 400 }, (_, index) => row(ACTIVITY_EXPORT_MAX + 400 - index));
    const { app } = setup({ listOperationalActivity: async input => many.filter(item => input.before === undefined || item.id < input.before).slice(0, input.limit) });
    const res = await request(app).get("/api/admin/activity/export").set("x-test-user", "admin");
    expect(res.text.trim().split("\r\n")).toHaveLength(ACTIVITY_EXPORT_MAX + 1);
  });

  it("neutralises spreadsheet formulas in cells", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(null)).toBe("");
  });
});

describe("/api/admin/activity/requests", () => {
  it("returns the person's request history and logs the read", async () => {
    const { app, recorded } = setup();
    const res = await request(app).get("/api/admin/activity/requests?person=asha@gmail.com").set("x-test-user", "admin");
    expect(res.status).toBe(200);
    expect(res.body.transitions[0]).toMatchObject({ action: "lapse", role: "seeker", userIds: [7], limit: 200 });
    expect(recorded).toEqual([expect.objectContaining({ action: "admin.person_requests_viewed" })]);
  });

  it("asks for a person, and returns nothing for an email with no account", async () => {
    const { app } = setup();
    expect((await request(app).get("/api/admin/activity/requests").set("x-test-user", "admin")).status).toBe(400);
    const none = await request(app).get("/api/admin/activity/requests?person=stranger@gmail.com").set("x-test-user", "admin");
    expect(none.body.transitions).toEqual([]);
  });
});
