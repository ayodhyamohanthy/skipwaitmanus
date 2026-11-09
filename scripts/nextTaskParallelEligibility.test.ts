// @vitest-environment node
// D-309: many agents may work on many distinct authorized tasks in parallel. The picker's
// runtime already scans past a red or blocked gate; these controls pin that independent
// work is offered, that FIFO still chooses among eligible work, and that the printed
// WAIT/report/CEO text states the real lane-and-dependents hold instead of a global stop.
import { describe, expect, it } from "vitest";
import { IDLE_MS, LAND_SLOT, pickNextTask } from "./nextTaskCore.mjs";
import { renderPick } from "./nextTaskText.mjs";

const NOW = Date.parse("2026-11-09T12:00:00Z");
const HOUR = 3_600_000;
const green = { state: "green", sha: "a".repeat(40), url: "https://ci/run/1" };

type Marker = { verb: string; id: string; who: string; verdict?: string };
type Branch = { tipMs: number; merged: boolean; markers: Marker[]; tipSha?: string };
type Report = { id: string; status: string; who: string; at: number; note: string };
type Task = ReturnType<typeof task>;
type PickOpts = {
  branches?: [string, Branch][]; prs?: [string, string][]; prCi?: [string, string][];
  reports?: Report[]; claimant?: string; ci?: object; avoid?: string[]; register?: unknown[];
};

const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `${id} title`, row: id, packet: "docs/plans/FND-1-toolchain-and-test-collection.md",
  tier: 2, lane: id.toLowerCase(), branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [] as string[], ...extra,
});
const claimBy = (who: string, id: string, hoursAgo = 0.5): Branch =>
  ({ tipMs: NOW - hoursAgo * HOUR, tipSha: "a".repeat(40), merged: false, markers: [{ verb: "Claim", id, who }] });
const pick = (tasks: Task[], opts: PickOpts = {}) =>
  pickNextTask({
    tasks, mainCi: opts.ci ?? green, branches: new Map(opts.branches ?? []), openPrs: new Map(opts.prs ?? []),
    prCi: new Map((opts.prCi ?? []).map(([b, state]) => [b, { state, ...(state === "green" ? { sha: "a".repeat(40) } : {}) }])),
    reports: opts.reports ?? [], mergedHeads: new Map(), now: NOW, claimant: opts.claimant ?? null,
    avoid: new Set(opts.avoid ?? []), register: opts.register ?? [],
  });
const outcome = (picked: ReturnType<typeof pickNextTask>) =>
  ("task" in picked ? { kind: picked.kind, id: picked.task.id } : { kind: picked.kind, id: null });
const ctx = (who: string) => ({ who, date: "2026-11-09", claimed: false });
const redReport = (id: string, who: string): Report => ({ id, status: "red", who, at: NOW - HOUR, note: "red CI" });
const blockedReport = (id: string, who: string): Report => ({ id, status: "blocked", who, at: NOW - HOUR, note: "needs a ruling" });

// One red Tier 2 task A, held by an active claim, with a red pull request: a gate for its lane.
const redA = (owns: string[] = ["server/a.ts"]) => ({
  task: task("A", { lane: "money", owns }),
  branch: ["agent/queue/a", claimBy("Qwen · s1", "A")] as [string, Branch],
  pr: ["agent/queue/a", "https://github.com/o/r/pull/7"] as [string, string],
  ci: ["agent/queue/a", "red"] as [string, string],
});

describe("D-309 parallel eligibility: independent work is offered", () => {
  it("control 1: a claimed red task in a real fix round does not stop a later independent task", () => {
    const a = task("A", { tier: 1, lane: "money", owns: ["server/money.ts"] });
    const b = task("B", { lane: "inbox", owns: ["server/inbox.ts"] });
    // The review lock is mid-fix: a findings verdict, then a real Fix claim (the fixer is active).
    const fixing: [string, Branch] = ["agent/review/a", {
      tipMs: NOW - 0.2 * HOUR, merged: false, markers: [
        { verb: "Review claim", id: "A", who: "Kimi · r1" },
        { verb: "Verdict", id: "A", who: "Kimi · r1", verdict: "findings" },
        { verb: "Fix claim", id: "A", who: "Dev · 9a23" },
      ],
    }];
    const picked = pick([a, b], {
      branches: [["agent/queue/a", claimBy("Qwen · s1", "A")], fixing],
      prs: [["agent/queue/a", "https://github.com/o/r/pull/7"]], prCi: [["agent/queue/a", "red"]],
      claimant: "Mistral · r2",
    });
    expect(outcome(picked)).toEqual({ kind: "build", id: "B" });
  });

  it("control 2 diagnostic: core currently holds an overlapping file; isolated-preparation target remains unmet", () => {
    const shared = redA(["server/shared.ts"]);
    const b = task("B", { lane: "inbox", owns: ["server/shared.ts"] });
    const picked = pick([shared.task, b], {
      branches: [shared.branch], prs: [shared.pr], prCi: [shared.ci], reports: [redReport("A", "Qwen · s1")],
      claimant: "Mistral · r2",
    });
    // The measured cause: core.filesBusy skips B because A owns the same file, so the picker waits on A.
    // D-309 permits bounded overlap on an isolated branch with a truthful integration handoff; aligning
    // core is a separate bounded amendment (this row owns the text and this control only).
    // This is a diagnostic, NOT a passing target contract. The separately executed
    // single-expectation BUILD target fails; keep that gap explicit in the packet.
    expect(picked).toMatchObject({ kind: "wait", gate: "A" });
    expect(outcome(picked)).toEqual({ kind: "wait", id: null });
  });

  it("control 3: FIFO picks the earliest eligible independent task, and --avoid keeps a real hold", () => {
    const a = task("A"), b = task("B"), c = task("C");
    expect(outcome(pick([a, b, c]))).toEqual({ kind: "build", id: "A" });
    const shared = redA();
    const opts = {
      branches: [shared.branch], prs: [shared.pr], prCi: [shared.ci], reports: [redReport("A", "Qwen · s1")],
      claimant: "Mistral · r2",
    };
    // A is gated; B is the earliest eligible independent task, not C.
    expect(outcome(pick([a, b, c], opts))).toEqual({ kind: "build", id: "B" });
    // --avoid skips B for this session and hands C; it never frees A's lane.
    expect(outcome(pick([a, b, c], { ...opts, avoid: ["B"] }))).toEqual({ kind: "build", id: "C" });
  });
});

describe("D-309: the holds that stay unchanged", () => {
  it("control 4: red main, review independence, owner/stale holds and the landing slot behave as before", () => {
    // Red main still selects the one legitimate fix-main, never a lower landing.
    expect(pick([task("A")], { ci: { state: "red", sha: "c".repeat(40), url: "https://ci/run/2" } })).toMatchObject({ kind: "fix-main" });
    expect(pick([task("A")], { ci: { state: "running-after-red" } })).toMatchObject({ kind: "wait", mainRed: true });

    // Same-model review independence: the builder is never handed its own review.
    const m = task("M", { tier: 1, lane: "money" });
    const fixed: [string, Branch] = ["agent/review/m", {
      tipMs: NOW - 0.2 * HOUR, merged: false, markers: [{ verb: "Fixed", id: "M", who: "Dev · 9a23" }],
    }];
    const reviewPick = pick([m], {
      branches: [["agent/queue/m", claimBy("Qwen · s1", "M")], fixed],
      prs: [["agent/queue/m", "https://github.com/o/r/pull/9"]], prCi: [["agent/queue/m", "green"]],
      claimant: "Qwen · s1",
    });
    expect(outcome(reviewPick)).toEqual({ kind: "none", id: null });

    // Owner-parked work stays parked.
    expect(outcome(pick([task("O", { status: "owner" })]))).toEqual({ kind: "none", id: null });

    // An out-of-sync task is handed its re-sync, not its build.
    const register = [
      { id: "D-1", number: 1, date: "2026-11-01", title: "one", affects: [] },
      { id: "D-2", number: 2, date: "2026-11-02", title: "two", affects: ["S"] },
    ];
    expect(pick([task("S", { syncedTo: "D-1" })], { register })).toMatchObject({ kind: "resync", task: { id: "S" } });

    // The landing slot stays one at a time.
    const slot: [string, Branch] = [LAND_SLOT, { tipMs: NOW - 0.1 * HOUR, merged: false, markers: [{ verb: "Land claim", id: "L", who: "Kimi · r1" }] }];
    const l = task("L", { tier: 1, lane: "money" });
    // A passed review whose lock has been quiet for 2 hours is handed its landing; the busy slot then waits.
    const passed: [string, Branch] = ["agent/review/l", {
      tipMs: NOW - 3 * HOUR, merged: false, markers: [
        { verb: "Review claim", id: "L", who: "Kimi · r1" },
        { verb: "Verdict", id: "L", who: "Kimi · r1", verdict: "pass" },
      ],
    }];
    expect(pick([l], {
      branches: [["agent/queue/l", claimBy("Qwen · s1", "L", 3)], passed, slot],
      prs: [["agent/queue/l", "https://github.com/o/r/pull/11"]], prCi: [["agent/queue/l", "green"]],
      claimant: "Mistral · r2",
    })).toMatchObject({ kind: "wait", landing: true });
  });
});

describe("D-309: the printed WAIT, report and CEO text state the real hold", () => {
  it("control 5: an honest WAIT names the held task and says no independent work was found", () => {
    const shared = redA();
    const b = task("B", { lane: "money" }); // same lane: held with A
    const picked = pick([shared.task, b], {
      branches: [shared.branch], prs: [shared.pr], prCi: [shared.ci], reports: [redReport("A", "Qwen · s1")],
      claimant: "Mistral · r2",
    });
    expect(picked).toMatchObject({ kind: "wait", gate: "A" });
    const text = renderPick(picked, ctx("Mistral · r2"));
    expect(text).toContain("WAIT");
    expect(text).toContain("A");
    expect(text).toContain("no other eligible independent work");
    expect(text).not.toContain("A priority must be green before anything below it is touched");
    expect(text).not.toContain("Do not start anything ranked below A.");

    // A blocked task whose blocker is this session: the same honest wording, never a global ban.
    const blocked = pick([shared.task, b], {
      branches: [shared.branch], prs: [shared.pr], prCi: [shared.ci], reports: [blockedReport("A", "Mistral · r2")],
      claimant: "Mistral · r2",
    });
    expect(blocked).toMatchObject({ kind: "wait", blocked: true, gate: "A" });
    const blockedText = renderPick(blocked, ctx("Mistral · r2"));
    expect(blockedText).toContain("no other eligible independent work");
    expect(blockedText).not.toContain("Do not start anything ranked below A.");
  });

  it("control 6: report, unblock and CEO guidance state the lane hold; red-main safety is preserved", () => {
    const build = renderPick({ kind: "build", task: task("N"), ciRunning: false }, { who: "Qwen · s1", date: "2026-11-09", claimed: true });
    expect(build).toContain("lane");
    expect(build).not.toContain("holds every lower priority");

    const unblock = renderPick({
      kind: "unblock", task: task("A"), lock: "agent/architect/a", lockExists: false,
      report: blockedReport("A", "Qwen · s1"),
    }, ctx("Mistral · r2"));
    expect(unblock).toContain("lane");
    expect(unblock).not.toContain("Every lower priority waits on it");

    const ceo = renderPick({ kind: "ceo", skipped: [], board: [] }, ctx("Claude Code · s9"));
    expect(ceo).toContain("independent");
    expect(ceo).not.toContain("before anything lower moves");

    const mainRed = renderPick({ kind: "wait", mainRed: true, reason: "main is red" }, ctx("Qwen · s1"));
    expect(mainRed).toContain("do not push to main until main is green");
    expect(mainRed).toContain("Do not start other work");
  });
});

// IDLE_MS is the picker's 2-hour quiet window; the fixtures above rely on it to keep a claim active.
expect(IDLE_MS).toBe(2 * HOUR);
