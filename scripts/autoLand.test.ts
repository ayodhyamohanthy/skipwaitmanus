import { describe, expect, it } from "vitest";
import { CLOUD_ROUTES, autoLandCandidates, autoLandHold, graphqlOrRest, prNumberOf, releaseHoldLine, runAutoLand } from "./autoLand.mjs";

// PICKER-auto-land (D-371): green, in-sync task pull requests land on their own.
const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);
const url = (n: number) => `https://github.com/o/r/pull/${n}`;
const task = (id: string, status = "todo") => ({ id, branch: `agent/queue/${id.toLowerCase()}`, status });

describe("autoLandCandidates", () => {
  const tasks = [task("A"), task("B"), task("C"), task("D", "owner"), task("E"), task("F")];
  const prCi = new Map<string, { state: string; sha?: string }>([
    ["agent/queue/a", { state: "green", sha: SHA }],
    ["agent/queue/b", { state: "green", sha: SHA }],
    ["agent/queue/c", { state: "green", sha: SHA }],
    ["agent/queue/d", { state: "green", sha: SHA }],
    ["agent/queue/e", { state: "running", sha: SHA }],
    ["agent/queue/f", { state: "green" }],
  ]);
  const rows = [
    { id: "A", state: "pr-green", health: "green", pr: url(1) },
    { id: "B", state: "pr-green", health: "red", pr: url(2) }, // reported blocked or red
    { id: "C", state: "re-sync (D-371)", health: "open", pr: url(3) }, // out of sync
    { id: "D", state: "pr-green", health: "green", pr: url(4) }, // parked
    { id: "E", state: "pr-green", health: "green", pr: url(5) }, // CI moved on
    { id: "F", state: "pr-green", health: "green", pr: url(6) }, // no green sha
    { id: "Z", state: "pr-green", health: "green", pr: url(7) }, // no such task
    { id: "A", state: "pr-green", health: "progress", pr: url(8) }, // review still pending under the old rule
  ];

  it("keeps only green rows of open, unparked tasks with a green CI head", () => {
    expect(autoLandCandidates({ rows, tasks, prCi })).toEqual([{ id: "A", number: 1, branch: "agent/queue/a", sha: SHA, quietHours: null }]);
  });

  it("reads the number from a PR URL and nothing else", () => {
    expect(prNumberOf(url(1402))).toBe(1402);
    expect(prNumberOf("https://github.com/o/r/pull/0")).toBeNull();
    expect(prNumberOf("https://github.com/o/r/issues/5")).toBeNull();
    expect(prNumberOf(undefined)).toBeNull();
  });
});

describe("autoLandHold", () => {
  it("holds while main is not green or the pull requests are unknown", () => {
    expect(autoLandHold({ mainCi: { state: "green" }, openPrs: new Map() })).toBeNull();
    expect(autoLandHold({ mainCi: { state: "red" }, openPrs: new Map() })).toContain("main CI is red");
    expect(autoLandHold({ mainCi: { state: "running-after-red" }, openPrs: new Map() })).toContain("running-after-red");
    expect(autoLandHold({ mainCi: { state: "unknown" }, openPrs: new Map() })).toContain("unknown");
    expect(autoLandHold({ mainCi: { state: "green" }, openPrs: null })).toBe("pull requests unreadable");
  });
});

describe("runAutoLand", () => {
  const base = { state: "open", merged: false, draft: false, node_id: "N", mergeable_state: "clean", auto_merge: null };
  function harness(pulls: Record<number, object>, fail: Partial<Record<string, string>> = {}) {
    const calls: string[] = [];
    const lines: string[] = [];
    const io = {
      readPull: async (n: number) => { calls.push(`read ${n}`); if (fail.read) throw new Error(fail.read); return pulls[n]; },
      markReady: async (id: string) => { calls.push(`ready ${id}`); if (fail.ready) throw new Error(fail.ready); },
      updateBranch: async (n: number, sha: string) => { calls.push(`update ${n} ${sha.slice(0, 1)}`); },
      enableAutoMerge: async (id: string) => { calls.push(`auto ${id}`); if (fail.auto) throw new Error(fail.auto); },
      mergeNow: async (n: number, sha: string) => { calls.push(`merge ${n} ${sha.slice(0, 1)}`); },
      log: (line: string) => lines.push(line),
    };
    return { io, calls, lines };
  }
  const c = (number: number, quietHours: number | null = 3) => ({ id: `T${number}`, number, branch: `agent/queue/t${number}`, sha: SHA, quietHours });
  const pr = (number: number, extra: object = {}) => ({ ...base, head: { ref: `agent/queue/t${number}`, sha: SHA }, ...extra });

  it("marks a draft ready, updates a behind branch and turns auto-merge on", async () => {
    const h = harness({ 1: pr(1, { draft: true, mergeable_state: "behind" }) });
    const r = await runAutoLand([c(1)], h.io);
    expect(h.calls).toEqual(["read 1", "ready N", "update 1 a", "auto N"]);
    expect(r).toEqual([{ id: "T1", number: 1, outcome: "queued", detail: "ready, updated with main, auto-merge on" }]);
    expect(h.lines).toEqual(["auto-land: T1 #1 queued (ready, updated with main, auto-merge on)"]);
  });

  it("does nothing more for a PR already queued", async () => {
    const h = harness({ 2: pr(2, { auto_merge: { merge_method: "merge" } }) });
    expect((await runAutoLand([c(2)], h.io))[0].outcome).toBe("already-queued");
    expect(h.calls).toEqual(["read 2"]);
  });

  it("leaves a conflicting, closed, moved or foreign-branch PR alone", async () => {
    const h = harness({
      3: pr(3, { mergeable_state: "dirty" }),
      4: pr(4, { state: "closed" }),
      5: pr(5, { head: { ref: "agent/queue/t5", sha: OTHER } }),
      6: pr(6, { head: { ref: "someone/else", sha: SHA } }),
      7: pr(7, { merged: true }),
    });
    const r = await runAutoLand([c(3), c(4), c(5), c(6), c(7)], h.io);
    expect(r.map(x => x.outcome)).toEqual(["conflict", "skipped", "skipped", "skipped", "skipped"]);
    expect(h.calls.filter(x => !x.startsWith("read"))).toEqual([]);
  });

  it("reports an API failure and still lands the next candidate", async () => {
    const pulls = { 8: pr(8, { draft: true }), 9: pr(9) };
    const h = harness(pulls, { ready: "GraphQL 403" });
    const r = await runAutoLand([c(8), c(9)], h.io);
    expect(r[0]).toEqual({ id: "T8", number: 8, outcome: "error", detail: "GraphQL 403" });
    expect(r[1].outcome).toBe("queued");
    expect(h.calls).toContain("auto N");
  });

  it("leaves a draft alone while its holder was active in the last 2 hours", async () => {
    const h = harness({ 10: pr(10, { draft: true }), 11: pr(11, { draft: true }) });
    const r = await runAutoLand([c(10, 1), c(11, null)], h.io);
    expect(r.map(x => x.outcome)).toEqual(["skipped", "skipped"]);
    expect(r[0].detail).toContain("draft");
    expect(h.calls).toEqual(["read 10", "read 11"]);
  });

  it("merges a clean ready PR over REST when auto-merge cannot be enabled", async () => {
    const h = harness({ 12: pr(12) }, { auto: "GitHub GraphQL answered 403" });
    const r = await runAutoLand([c(12)], h.io);
    expect(r[0]).toEqual({ id: "T12", number: 12, outcome: "queued", detail: "merged" });
    expect(h.calls).toEqual(["read 12", "auto N", "merge 12 a"]);
  });

  it("never merges a behind or draft PR over REST", async () => {
    const h = harness({ 13: pr(13, { mergeable_state: "behind" }) }, { auto: "GitHub GraphQL answered 403" });
    const r = await runAutoLand([c(13)], h.io);
    expect(r[0].outcome).toBe("error");
    expect(h.calls).toEqual(["read 13", "update 13 a", "auto N"]);
  });

  it("does nothing with no candidates", async () => {
    const h = harness({});
    expect(await runAutoLand([], h.io)).toEqual([]);
    expect(h.calls).toEqual([]);
  });
});

// PICKER-auto-land-cloud (D-373 (4), D-376): the cloud route and the release hold.
describe("release hold (D-376)", () => {
  const REL = "c".repeat(40);
  const release = (states: string[], extra: object = {}) => ({ sha: REL, incidents: [1446], lights: states.map((state, i) => ({ number: i + 1, state, sha: REL })), ...extra });
  const red = release(["green", "green", "green", "green", "red", "green", "red"]);
  const green = release(["green", "green", "green", "green", "green", "green", "green"]);
  const tasks = [
    { id: "FIX", branch: "agent/queue/fix", status: "todo", note: `Repairs the release.\nFixes release: ${REL}` },
    { id: "INC", branch: "agent/queue/inc", status: "todo", note: "Fixes incident: #1446" },
    { id: "OTHER", branch: "agent/queue/other", status: "todo" },
  ];
  const prCi = new Map(tasks.map(t => [t.branch, { state: "green", sha: SHA }]));
  const rows = tasks.map((t, i) => ({ id: t.id, state: "pr-green", health: "green", pr: url(20 + i) }));
  const ids = (release: object | null) => autoLandCandidates({ rows, tasks, prCi, release }).map(c => c.id);

  it("lands only a registered release fix while the live release is red", () => {
    expect(ids(red)).toEqual(["FIX", "INC"]);
    expect(releaseHoldLine(red)).toBe(`live release ${REL.slice(0, 8)} is red on lights 5, 7; only a registered release fix lands (D-212, D-376)`);
  });
  it("adds no hold for a green or unreadable release, or for a red light on another SHA", () => {
    expect(ids(green)).toEqual(["FIX", "INC", "OTHER"]);
    expect(ids(null)).toEqual(["FIX", "INC", "OTHER"]);
    expect(ids(release(["green", "green", "green", "red"], { lights: [{ number: 4, state: "red", sha: "d".repeat(40) }] }))).toEqual(["FIX", "INC", "OTHER"]);
    expect(releaseHoldLine(green)).toBeNull();
    expect(releaseHoldLine(null)).toBeNull();
  });
  it("lands nothing while red when no row is a registered fix", () => {
    expect(autoLandCandidates({ rows: rows.slice(2), tasks, prCi, release: red })).toEqual([]);
  });
});

describe("cloud route (D-373 (4))", () => {
  const refused = () => Object.assign(new Error("GitHub GraphQL answered 403"), { status: 403 });
  const base = { state: "open", merged: false, node_id: "N", auto_merge: null };
  const c = (number: number) => ({ id: `T${number}`, number, branch: `agent/queue/t${number}`, sha: SHA, quietHours: 3 });
  const pr = (number: number, extra: object = {}) => ({ ...base, draft: false, mergeable_state: "clean", head: { ref: `agent/queue/t${number}`, sha: SHA }, ...extra });
  function io(pulls: Record<number, object>, { graphql = refused, restFails = [] as number[] } = {}) {
    const calls: string[] = [];
    const rest = (route: { method: string; path: string; body: object }, number: number) => {
      calls.push(`${route.method} ${route.path} ${JSON.stringify(route.body)}`);
      if (restFails.includes(number)) throw new Error("GitHub /ccr answered 422");
    };
    return {
      calls,
      io: {
        readPull: async (n: number) => pulls[n],
        markReady: graphqlOrRest(async () => { calls.push("graphql ready"); throw graphql(); }, async (_id: string, n: number) => rest(CLOUD_ROUTES.ready(n), n)),
        updateBranch: async (n: number) => { calls.push(`update ${n}`); },
        enableAutoMerge: graphqlOrRest(async () => { calls.push("graphql auto"); throw graphql(); }, async (_id: string, n: number) => rest(CLOUD_ROUTES.autoMerge(n), n)),
        mergeNow: async (n: number) => { calls.push(`merge ${n}`); },
        log: () => {},
      },
    };
  }

  it("marks a quiet draft ready and turns auto-merge on over REST when GraphQL is refused", async () => {
    const h = io({ 30: pr(30, { draft: true, mergeable_state: "behind" }) });
    const r = await runAutoLand([c(30)], h.io);
    expect(r).toEqual([{ id: "T30", number: 30, outcome: "queued", detail: "ready, updated with main, auto-merge on" }]);
    expect(h.calls).toEqual([
      "graphql ready", "POST /pulls/30/ccr/ready_for_review {}",
      "update 30",
      "graphql auto", 'PUT /pulls/30/ccr/auto_merge {"merge_method":"merge"}',
    ]);
  });

  it("reports a failed REST route on its own line and still lands the next candidate", async () => {
    const h = io({ 31: pr(31, { mergeable_state: "behind" }), 32: pr(32) }, { restFails: [31] });
    const r = await runAutoLand([c(31), c(32)], h.io);
    expect(r[0]).toEqual({ id: "T31", number: 31, outcome: "error", detail: "GraphQL refused (403); REST route failed: GitHub /ccr answered 422" });
    expect(r[1]).toEqual({ id: "T32", number: 32, outcome: "queued", detail: "auto-merge on" });
    expect(h.calls).not.toContain("merge 31");
  });

  it("never takes the REST route for a GraphQL error other than the proxy's 403", async () => {
    const other = () => Object.assign(new Error("GitHub GraphQL answered 502"), { status: 502 });
    const h = io({ 33: pr(33, { draft: true }) }, { graphql: other });
    const r = await runAutoLand([c(33)], h.io);
    expect(r[0]).toEqual({ id: "T33", number: 33, outcome: "error", detail: "GitHub GraphQL answered 502" });
    expect(h.calls).toEqual(["graphql ready"]);
    const plain = graphqlOrRest(async () => { throw new Error("no status"); }, async () => "rest");
    await expect(plain()).rejects.toThrow("no status");
  });

  it("always asks for a merge commit, never squash or rebase", () => {
    expect(CLOUD_ROUTES.autoMerge(7)).toEqual({ method: "PUT", path: "/pulls/7/ccr/auto_merge", body: { merge_method: "merge" } });
    expect(CLOUD_ROUTES.ready(7)).toEqual({ method: "POST", path: "/pulls/7/ccr/ready_for_review", body: {} });
  });
});
