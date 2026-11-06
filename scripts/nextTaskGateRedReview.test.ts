// @vitest-environment node
// PICKER-gate-red-review-route (D-286): a Tier 1 pull request whose only red is the review gate's own failure is
// handed its REVIEW, the one stage that can clear it, instead of MAKE GREEN. Every other red keeps today's answer.
// The gate is untouched: the classifier only reads data (CI state + the failed run's job list) and fails closed.
import { describe, expect, it } from "vitest";
import { GATE_STEP, gateOnlyRedFromJobs, pickNextTask } from "./nextTaskCore.mjs";

const NOW = Date.parse("2026-11-07T10:00:00+05:30");
const HOUR = 3_600_000;
const HEAD = "a".repeat(40);
const OLD = "b".repeat(40);
const green = { state: "green", sha: "c".repeat(40), url: "https://ci/main" };

type Marker = { verb: string; id: string; who: string; verdict?: string };
type Branch = { tipMs: number; tipSha?: string; merged: boolean; markers: Marker[] };
const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `${id} title`,
  row: id,
  packet: "docs/plans/FND-1-toolchain-and-test-collection.md",
  tier: 1,
  lane: id.toLowerCase(),
  branch: `agent/queue/${id.toLowerCase()}`,
  status: "todo",
  dependsOn: [] as string[],
  owns: [`server/${id.toLowerCase()}.ts`],
  ...extra,
});

const BUILDER = "DeepSeek · b1";
const ME = "Hark · me1";
const branchOf = (id: string) => `agent/queue/${id.toLowerCase()}`;
// Built by BUILDER, idle for 3 hours, tip HEAD, open pull request.
const built = (id: string, tipSha = HEAD): [string, Branch] => [branchOf(id), { tipMs: NOW - 3 * HOUR, tipSha, merged: false, markers: [{ verb: "Claim", id, who: BUILDER }] }];
const pr = (id: string): [string, string] => [branchOf(id), "https://github.com/o/r/pull/952"];

type Ci = { state: string; sha?: string; url?: string; gateOnly?: boolean };
const redCi = (extra: Partial<Ci> = {}): Ci => ({ state: "red", sha: HEAD, url: "https://ci/run/9", ...extra });

const pick = (tasks: ReturnType<typeof task>[], opts: { ci?: Ci; branches?: [string, Branch][]; claimant?: string }) =>
  pickNextTask({
    tasks,
    mainCi: green,
    branches: new Map(opts.branches ?? [built(tasks[0].id)]),
    openPrs: new Map([pr(tasks[0].id)]),
    prCi: new Map([[branchOf(tasks[0].id), opts.ci ?? redCi()]]),
    mergedHeads: new Map(),
    reports: [],
    now: NOW,
    claimant: opts.claimant ?? ME,
    avoid: new Set(),
    register: null,
  });

describe("PICKER-gate-red-review-route: the picker's stage decision", () => {
  it("(a) a Tier 1 head red only at the review gate is handed its REVIEW, not MAKE GREEN", () => {
    expect(pick([task("T")], { ci: redCi({ gateOnly: true }) })).toMatchObject({ kind: "review", task: { id: "T" } });
  });

  it("(b) the same head red for any other reason is still MAKE GREEN", () => {
    expect(pick([task("T")], { ci: redCi() })).toMatchObject({ kind: "green", task: { id: "T" } });
    expect(pick([task("T")], { ci: redCi({ gateOnly: false }) })).toMatchObject({ kind: "green" });
  });

  it("(c) errored CI, or a gate-only reading of a different or unknown head, never becomes a REVIEW", () => {
    expect(pick([task("T")], { ci: { state: "error", gateOnly: true } }).kind).not.toBe("review");
    // the gate-only run is for an older head than the branch tip: stale evidence, fail closed
    expect(pick([task("T")], { ci: redCi({ gateOnly: true, sha: OLD }) })).toMatchObject({ kind: "green" });
    // the branch tip is unknown: nothing proves the run is for this head
    const noTip: [string, Branch] = [branchOf("T"), { tipMs: NOW - 3 * HOUR, merged: false, markers: [{ verb: "Claim", id: "T", who: BUILDER }] }];
    expect(pick([task("T")], { ci: redCi({ gateOnly: true }), branches: [noTip] })).toMatchObject({ kind: "green" });
  });

  it("(d) a session of the model that built the head is never handed the review", () => {
    const result = pick([task("T")], { ci: redCi({ gateOnly: true }), claimant: "DeepSeek · b2" });
    expect(result.kind).not.toBe("review");
    expect(result.kind).not.toBe("green");
  });

  it("(d2) a model that fixed the head is never handed the review either", () => {
    const lock: [string, Branch] = ["agent/review/t", { tipMs: NOW - 3 * HOUR, merged: false, markers: [{ verb: "Fix claim", id: "T", who: "Qoder · f1" }, { verb: "Fixed", id: "T", who: "Qoder · f1" }] }];
    const result = pick([task("T")], { ci: redCi({ gateOnly: true }), branches: [built("T"), lock], claimant: "Qoder · f2" });
    expect(result.kind).not.toBe("review");
  });

  it("the builder holding a gate-only red head is not told to make it green; an ordinary red still is", () => {
    expect(pick([task("T")], { ci: redCi(), claimant: BUILDER })).toMatchObject({ kind: "continue", of: "green" });
    const result = pick([task("T")], { ci: redCi({ gateOnly: true }), claimant: BUILDER });
    expect(result.kind).not.toBe("continue");
    expect(result.kind).not.toBe("green");
  });

  it("(e) a green head's REVIEW hand-out is unchanged", () => {
    expect(pick([task("T")], { ci: { state: "green", sha: HEAD, url: "https://ci/run/1" } })).toMatchObject({ kind: "review", task: { id: "T" } });
  });

  it("a gate-only red head whose review is under way or already passed keeps its existing stage", () => {
    const claimed: [string, Branch] = ["agent/review/t", { tipMs: NOW - 10 * 60_000, merged: false, markers: [{ verb: "Review claim", id: "T", who: "Kimi · r1" }] }];
    expect(pick([task("T")], { ci: redCi({ gateOnly: true }), branches: [built("T"), claimed] }).kind).not.toBe("review");
    const needsFix: [string, Branch] = ["agent/review/t", { tipMs: NOW - 3 * HOUR, merged: false, markers: [{ verb: "Review claim", id: "T", who: "Kimi · r1" }, { verb: "Verdict", id: "T", who: "Kimi · r1", verdict: "fail" }] }];
    expect(pick([task("T")], { ci: redCi({ gateOnly: true }), branches: [built("T"), needsFix] })).toMatchObject({ kind: "fix" });
  });

  it("a Tier 2 row's red is untouched", () => {
    expect(pick([task("T", { tier: 2 })], { ci: redCi({ gateOnly: true }) })).toMatchObject({ kind: "green" });
  });
});

type Step = { name: string; conclusion: string | null };
const job = (name: string, conclusion: string | null, steps: Step[] = []) => ({ name, conclusion, status: "completed", steps });
const ok = (name: string): Step => ({ name, conclusion: "success" });
const bad = (name: string): Step => ({ name, conclusion: "failure" });
const skipped = (name: string): Step => ({ name, conclusion: "skipped" });
const greenJobs = () => [
  job("unit + component + route tests", "success", [ok("Run tests")]),
  job("production build", "success", [ok("Build")]),
  job("e2e journeys", "success", [ok("Run journeys")]),
];
const typecheck = (steps: Step[]) => job("typecheck", steps.some(s => s.conclusion === "failure") ? "failure" : "success", steps);
const gateOnlyJobs = () => [
  typecheck([ok("Typecheck"), ok("Design tokens"), ok("Deploy trigger coverage"), bad(GATE_STEP), skipped("Scope check (declared file ownership)")]),
  ...greenJobs(),
];

describe("PICKER-gate-red-review-route: reading the failed run's job list", () => {
  it("the run is gate-only red when the review gate step is the one failed step and every other job passed", () => {
    expect(gateOnlyRedFromJobs(gateOnlyJobs())).toBe(true);
  });

  it("any other failed step in the same job keeps it a normal red", () => {
    for (const other of ["Typecheck", "Design tokens", "Deploy trigger coverage", "Scope check (declared file ownership)"]) {
      expect(gateOnlyRedFromJobs([typecheck([bad(other), bad(GATE_STEP)]), ...greenJobs()])).toBe(false);
      expect(gateOnlyRedFromJobs([typecheck([ok("Typecheck"), bad(other)]), ...greenJobs()])).toBe(false);
    }
  });

  it("a failed or unfinished job other than typecheck keeps it a normal red", () => {
    for (const conclusion of ["failure", "cancelled", "timed_out", null]) {
      const jobs = [typecheck([ok("Typecheck"), bad(GATE_STEP)]), job("production build", conclusion, [ok("Build")]), ...greenJobs().slice(0, 1)];
      expect(gateOnlyRedFromJobs(jobs)).toBe(false);
    }
  });

  it("fails closed on an unreadable, empty or stepless job list", () => {
    expect(gateOnlyRedFromJobs(undefined)).toBe(false);
    expect(gateOnlyRedFromJobs(null)).toBe(false);
    expect(gateOnlyRedFromJobs({})).toBe(false);
    expect(gateOnlyRedFromJobs([])).toBe(false);
    expect(gateOnlyRedFromJobs([job("typecheck", "failure"), ...greenJobs()])).toBe(false);
    expect(gateOnlyRedFromJobs([{ name: "typecheck", conclusion: "failure" }, ...greenJobs()])).toBe(false);
    expect(gateOnlyRedFromJobs([typecheck([ok("Typecheck")]), ...greenJobs()])).toBe(false); // nothing failed at all
  });

  it("accepts the GitHub list shape ({ jobs: [...] }) and ignores a same-named step in another job", () => {
    expect(gateOnlyRedFromJobs({ jobs: gateOnlyJobs() })).toBe(true);
    expect(gateOnlyRedFromJobs([job("production build", "failure", [bad(GATE_STEP)]), typecheck([ok("Typecheck")]), ...greenJobs().slice(0, 1)])).toBe(false);
  });
});
