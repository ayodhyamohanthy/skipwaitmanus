// @vitest-environment node
// QA-auto-issues (D-409, owner Nov 26: automated testers raise bugs before users hit them): live QA turns each failing
// route or sign-in into ONE GitHub issue labelled bug + automated, comments on it when it fails again, and closes it
// when a later run of that role passes. Pure planning, so every case runs without GitHub.
import { describe, expect, it } from "vitest";
import { bugsFromSummary, keyOf, planIssueActions } from "./qa-file-bugs.mjs";

const route = (over: Record<string, unknown> = {}) => ({ route: "/explore", width: 1280, status: 200, title: "Explore", finalPath: "/explore", sideways: false, capture: null, navigationError: null, pageErrors: [], consoleErrors: [], failedRequests: [], clientErrors: [], fails: [], findings: [], ...over });
const summary = (roles: unknown[]) => ({ origin: "https://skipwait.me", release: { api: "a".repeat(40), web: "b".repeat(40) }, roles });
const RUN = "https://github.com/o/r/actions/runs/1";

describe("bugsFromSummary", () => {
  it("files nothing for a clean run", () => {
    expect(bugsFromSummary(summary([{ role: "seeker", signIn: { ok: true, status: 200 }, routes: [route(), route({ width: 390 })] }]))).toEqual([]);
  });

  it("files one bug per role and route, merging both widths, for a failure, a 5xx, a 4xx, a console error or sideways scroll", () => {
    const bugs = bugsFromSummary(summary([{ role: "seeker", signIn: { ok: true, status: 200 }, routes: [
      route({ fails: ["document answered 502"], status: 502 }),
      route({ width: 390, failedRequests: ["500 /api/x"], clientErrors: ["400 GET /api/y"], consoleErrors: ["boom"], sideways: true }),
      route({ route: "/plans" }),
    ] }]));
    expect(bugs).toHaveLength(1);
    expect(bugs[0].key).toBe(keyOf("seeker", "/explore"));
    expect(bugs[0].title).toBe("Live QA: seeker /explore — document answered 502");
    for (const text of ["1280", "390", "document answered 502", "500 /api/x", "400 GET /api/y", "boom", "scrolls sideways at 390", "a".repeat(8), "b".repeat(8)]) expect(bugs[0].body).toContain(text);
  });

  it("files a sign-in failure for the role, and nothing for its routes", () => {
    const bugs = bugsFromSummary(summary([{ role: "referrer", signIn: { ok: false, status: 401, message: "secrets do not match" }, routes: [] }]));
    expect(bugs.map(b => [b.key, b.title])).toEqual([[keyOf("referrer", "sign-in"), "Live QA: referrer sign-in fails (401)"]]);
  });

  it("files a run-level bug when no summary was written", () => {
    expect(bugsFromSummary(null).map(b => b.key)).toEqual([keyOf("run", "no-summary")]);
  });
});

describe("planIssueActions", () => {
  const open = (key: string, number: number) => ({ number, title: "x", body: `body\n<!-- live-qa-key: ${key} -->` });
  const failing = summary([{ role: "seeker", signIn: { ok: true, status: 200 }, routes: [route({ fails: ["uncaught error: x"] })] }]);

  it("creates an issue for a new bug, with bug and automated labels and the key marker", () => {
    const [action] = planIssueActions({ summary: failing, openIssues: [], runUrl: RUN });
    expect(action).toMatchObject({ kind: "create", labels: ["bug", "automated"] });
    expect(action.body).toContain(`<!-- live-qa-key: ${keyOf("seeker", "/explore")} -->`);
    expect(action.body).toContain(RUN);
  });

  it("comments on the open issue instead of opening a duplicate", () => {
    expect(planIssueActions({ summary: failing, openIssues: [open(keyOf("seeker", "/explore"), 7)], runUrl: RUN }))
      .toEqual([expect.objectContaining({ kind: "comment", number: 7 })]);
  });

  it("closes an open issue when its role ran and the route now passes", () => {
    const clean = summary([{ role: "seeker", signIn: { ok: true, status: 200 }, routes: [route()] }]);
    expect(planIssueActions({ summary: clean, openIssues: [open(keyOf("seeker", "/explore"), 7)], runUrl: RUN }))
      .toEqual([expect.objectContaining({ kind: "close", number: 7 })]);
  });

  it("never closes an issue for a role this run did not check, or whose sign-in failed", () => {
    const referrerOnly = summary([{ role: "referrer", signIn: { ok: true, status: 200 }, routes: [route()] }]);
    expect(planIssueActions({ summary: referrerOnly, openIssues: [open(keyOf("seeker", "/explore"), 7)], runUrl: RUN })).toEqual([]);
    const seekerDown = summary([{ role: "seeker", signIn: { ok: false, status: 429, message: "rate limited" }, routes: [] }]);
    const actions = planIssueActions({ summary: seekerDown, openIssues: [open(keyOf("seeker", "/explore"), 7)], runUrl: RUN });
    expect(actions.some(a => a.kind === "close")).toBe(false);
  });

  it("never touches issues without its key marker", () => {
    const clean = summary([{ role: "seeker", signIn: { ok: true, status: 200 }, routes: [route()] }]);
    expect(planIssueActions({ summary: clean, openIssues: [{ number: 9, title: "human bug", body: "no marker" }], runUrl: RUN })).toEqual([]);
  });

  it("closes the run-level issue once a summary exists again", () => {
    const clean = summary([{ role: "seeker", signIn: { ok: true, status: 200 }, routes: [route()] }]);
    expect(planIssueActions({ summary: clean, openIssues: [open(keyOf("run", "no-summary"), 3)], runUrl: RUN }))
      .toEqual([expect.objectContaining({ kind: "close", number: 3 })]);
  });
});
