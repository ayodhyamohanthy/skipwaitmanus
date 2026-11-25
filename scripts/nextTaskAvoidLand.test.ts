// @vitest-environment node
// PICKER-avoid-land (#744): a reviewer whose fresh pass (or Land claim) on M gives it an owned
// LAND continuation is never handed M again when it asks to avoid M; it gets eligible work or an
// honest wait. Avoid changes no marker, no identity and releases no lock, and the review,
// landing-slot and blocked-lane exclusions still hold.
import { describe, expect, it } from "vitest";
import { pickNextTask } from "./nextTaskCore.mjs";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const HOUR = 3_600_000;
const green = { state: "green", sha: "a".repeat(40), url: "https://ci/run/1" };

type Marker = { verb: string; id: string; who: string; verdict?: string };
type Branch = { tipSha?: string; tipMs: number; merged: boolean; markers: Marker[] };
const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `${id} title`,
  row: id,
  packet: "docs/plans/FND-1-toolchain-and-test-collection.md",
  tier: 2,
  lane: id,
  branch: `agent/queue/${id.toLowerCase()}`,
  status: "todo",
  dependsOn: [] as string[],
  ...extra,
});

const BUILDER = "DeepSeek · b1";
const REVIEWER = "Mistral · r1";
const OTHER = "Kimi · o1";

// Tier 1 M built by DeepSeek, green open PR, disjoint eligible N (the #744 reproduction).
const M = (extra: Record<string, unknown> = {}) => task("M", { tier: 1, lane: "m", owns: ["scripts/m.mjs"], ...extra });
const N = () => task("N", { lane: "n", owns: ["scripts/n.mjs"] });
const builtM: [string, Branch] = ["agent/queue/m", { tipSha: "a".repeat(40), tipMs: NOW - 3 * HOUR, merged: false, markers: [{ verb: "Claim", id: "M", who: BUILDER }] }];
const lockM = (hoursAgo: number, ...extra: Marker[]): [string, Branch] => ["agent/review/m", {
  tipMs: NOW - hoursAgo * HOUR,
  merged: false,
  markers: [{ verb: "Review claim", id: "M", who: REVIEWER }, { verb: "Verdict", id: "M", who: REVIEWER, verdict: "pass" }, ...extra],
}];
const freshPass = lockM(0.2);
const freshLandClaim = lockM(0.1, { verb: "Land claim", id: "M", who: REVIEWER });
const prM: [string, string] = ["agent/queue/m", "https://github.com/o/r/pull/9"];

const pick = (tasks: ReturnType<typeof task>[], opts: {
  branches?: [string, Branch][];
  prs?: [string, string][];
  prCi?: [string, string][];
  reports?: { id: string; status: string; who: string; at: number; note: string }[];
  claimant: string;
  avoid?: string[];
  register?: { id: string; number: number; date: string; title: string; affects: string[] }[];
}) => pickNextTask({
  tasks,
  mainCi: green,
  branches: new Map(opts.branches ?? []),
  openPrs: new Map(opts.prs ?? [prM]),
  prCi: new Map((opts.prCi ?? [["agent/queue/m", "green"]]).map(([b, state]) => [b, { state, ...(state === "green" ? { sha: "a".repeat(40) } : {}) }])),
  mergedHeads: new Map(),
  reports: opts.reports ?? [],
  now: NOW,
  claimant: opts.claimant,
  avoid: new Set(opts.avoid ?? []),
  register: opts.register ?? null,
});

// The honest none: nothing handed out, no task named, and every skip says why (the avoided task, then the held one).
const AVOIDED = "you asked to avoid it (--avoid)";
const HELD_BY_M = "waits for red or blocked M (same lane or depends on it)";
const expectHonestNone = (result: unknown, skipped: { id: string; reason: string }[]) => {
  expect(result).toEqual({ kind: "none", skipped });
};

describe("PICKER-avoid-land", () => {
  it("control: without --avoid the passing reviewer continues landing M", () => {
    expect(pick([M(), N()], { branches: [builtM, freshPass], claimant: REVIEWER }))
      .toMatchObject({ kind: "continue", of: "land", task: { id: "M" } });
  });

  it("a fresh pass: the reviewer avoiding M is handed eligible N, never M", () => {
    const result = pick([M(), N()], { branches: [builtM, freshPass], claimant: REVIEWER, avoid: ["M"] });
    expect(result).toMatchObject({ kind: "build", task: { id: "N" } });
    expect(result).not.toHaveProperty("holds");
  });

  it("a fresh Land claim: the lander avoiding M is handed eligible N, never M", () => {
    const result = pick([M(), N()], { branches: [builtM, freshLandClaim], claimant: REVIEWER, avoid: ["M"] });
    expect(result).toMatchObject({ kind: "build", task: { id: "N" } });
    expect(JSON.stringify(result)).not.toContain('"id":"M"');
  });

  it("another session still sees M as the reviewer's (avoid releases no lock and changes no marker)", () => {
    const branches = [builtM, freshPass];
    pick([M(), N()], { branches, claimant: REVIEWER, avoid: ["M"] });
    expect(freshPass[1].markers.map(m => m.verb)).toEqual(["Review claim", "Verdict"]);
    expect(pick([M(), N()], { branches, claimant: OTHER })).toMatchObject({ kind: "build", task: { id: "N" } });
    expect(pick([M()], { branches, claimant: OTHER })).toMatchObject({ kind: "none" });
  });

  it("done-row control: once M is done the original reviewer selects N without --avoid", () => {
    expect(pick([M({ status: "done" }), N()], { branches: [builtM, freshPass], claimant: REVIEWER }))
      .toMatchObject({ kind: "build", task: { id: "N" } });
  });

  it("with nothing else eligible the avoiding reviewer gets an honest none, not M", () => {
    // The reviewer's own LAND continuation is set aside by main's avoid guard; M is skipped as passed, not handed out.
    expectHonestNone(pick([M()], { branches: [builtM, freshPass], claimant: REVIEWER, avoid: ["M"] }), [{ id: "M", reason: `review passed; ${REVIEWER} lands it` }]);
  });

  it("keeps the landing-slot exclusion: a slot held by another session still makes a land wait", () => {
    const slot: [string, Branch] = ["agent/queue/landing", { tipSha: "a".repeat(40), tipMs: NOW - 0.1 * HOUR, merged: false, markers: [{ verb: "Land claim", id: "Q", who: OTHER }] }];
    expect(pick([M(), N()], { branches: [builtM, freshPass, slot], claimant: REVIEWER }))
      .toMatchObject({ kind: "wait", landing: true, holder: OTHER });
    expect(pick([M(), N()], { branches: [builtM, freshPass, slot], claimant: REVIEWER, avoid: ["M"] }))
      .toMatchObject({ kind: "build", task: { id: "N" } });
  });

  it("keeps the review exclusion: avoiding another task never hands the builder its own review", () => {
    const needsReview: [string, Branch] = ["agent/review/m", { tipSha: "a".repeat(40), tipMs: NOW - 3 * HOUR, merged: false, markers: [] }];
    const result = pick([M(), N(), task("Z")], { branches: [builtM, needsReview], claimant: BUILDER, avoid: ["Z"] });
    expect(result).toMatchObject({ kind: "build", task: { id: "N" } });
  });

  it("keeps the blocked-lane exclusion: an avoided blocked M still holds its lane-mate", () => {
    const blocked = { id: "M", status: "blocked", who: BUILDER, at: NOW - 3 * HOUR, note: "awaiting a ruling" };
    const mate = task("L", { lane: "m", owns: ["scripts/l.mjs"] });
    const result = pick([M(), mate, N()], { branches: [builtM, freshPass], reports: [blocked], claimant: REVIEWER, avoid: ["M"] });
    expect(result).toMatchObject({ kind: "build", task: { id: "N" } });
    expectHonestNone(pick([M(), mate], { branches: [builtM, freshPass], reports: [blocked], claimant: REVIEWER, avoid: ["M"] }),
      [{ id: "M", reason: AVOIDED }, { id: "L", reason: HELD_BY_M }]);
  });

  it("keeps the red-lane exclusion: an avoided red M (make green) still holds its lane-mate", () => {
    const redM = task("M", { lane: "m", owns: ["scripts/m.mjs"] });
    const mate = task("L", { lane: "m", owns: ["scripts/l.mjs"] });
    expect(pick([redM, mate, N()], { branches: [builtM], prCi: [["agent/queue/m", "red"]], claimant: REVIEWER, avoid: ["M"] }))
      .toMatchObject({ kind: "build", task: { id: "N" } });
    expect(pick([redM, mate, N()], { branches: [builtM], prCi: [["agent/queue/m", "red"]], claimant: REVIEWER }))
      .toMatchObject({ kind: "green", task: { id: "M" } });
    expectHonestNone(pick([redM, mate], { branches: [builtM], prCi: [["agent/queue/m", "red"]], claimant: REVIEWER, avoid: ["M"] }),
      [{ id: "M", reason: AVOIDED }, { id: "L", reason: HELD_BY_M }]);
  });
});

// #976 review (2026-11-03): condition pins. The lane-mate L is an idle Tier 2 task with a green pull request,
// so it is handed out as a land unless something holds its lane: L's land is the observable difference
// between "M holds its lane" and "M does not". An avoided hand-out holds only when it is a red or blocked
// task's (unblock, make green, fix, takeover); any other avoided hand-out releases nothing it did not hold.
describe("PICKER-avoid-land condition pins (#976 review)", () => {
  const L = () => task("L", { lane: "m", owns: ["scripts/l.mjs"] });
  const builtL: [string, Branch] = ["agent/queue/l", { tipSha: "a".repeat(40), tipMs: NOW - 3 * HOUR, merged: false, markers: [{ verb: "Claim", id: "L", who: "Qwen · l1" }] }];
  const prL: [string, string] = ["agent/queue/l", "https://github.com/o/r/pull/10"];
  const landsL = { kind: "land", task: { id: "L" }, tier1: false };
  const STALE_REGISTER = [
    { id: "D-100", number: 100, date: "2026-10-01", title: "packet stamp", affects: [] },
    { id: "D-101", number: 101, date: "2026-10-02", title: "names M", affects: ["M"] },
  ];

  it("red fix holds: an avoided Tier 1 fix on red CI after a failed review keeps L's lane held (honest none)", () => {
    const failed: [string, Branch] = ["agent/review/m", { tipSha: "a".repeat(40), tipMs: NOW - 3 * HOUR, merged: false, markers: [{ verb: "Review claim", id: "M", who: REVIEWER }, { verb: "Verdict", id: "M", who: REVIEWER, verdict: "fail" }] }];
    const opts = { branches: [builtM, failed, builtL], prs: [prM, prL], prCi: [["agent/queue/m", "red"], ["agent/queue/l", "green"]] as [string, string][], claimant: OTHER };
    expect(pick([M(), L()], opts)).toMatchObject({ kind: "fix", task: { id: "M" } });
    expectHonestNone(pick([M(), L()], { ...opts, avoid: ["M"] }), [{ id: "M", reason: AVOIDED }, { id: "L", reason: HELD_BY_M }]);
  });

  it("red takeover holds: an avoided takeover of a task reported red (no pull request, holder quiet) keeps L's lane held (honest none)", () => {
    const red = { id: "M", status: "red", who: BUILDER, at: NOW - 3 * HOUR, note: "tests red" };
    const opts = { branches: [builtM, builtL], prs: [prL], prCi: [["agent/queue/l", "green"]] as [string, string][], reports: [red], claimant: OTHER };
    expect(pick([M({ tier: 2 }), L()], opts)).toMatchObject({ kind: "takeover", task: { id: "M" } });
    expectHonestNone(pick([M({ tier: 2 }), L()], { ...opts, avoid: ["M"] }), [{ id: "M", reason: AVOIDED }, { id: "L", reason: HELD_BY_M }]);
  });

  it("non-red takeover does not hold: an avoided takeover of an idle task that is not red or blocked hands out L's land", () => {
    const opts = { branches: [builtM, builtL], prs: [prL], prCi: [["agent/queue/l", "green"]] as [string, string][], claimant: OTHER };
    expect(pick([M({ tier: 2 }), L()], opts)).toMatchObject({ kind: "takeover", task: { id: "M" } });
    expect(pick([M({ tier: 2 }), L()], { ...opts, avoid: ["M"] })).toMatchObject(landsL);
  });

  it("resync does not hold: an avoided D-202 resync of a task that is not red or blocked hands out L's land", () => {
    const opts = { branches: [builtM, builtL], prs: [prL], prCi: [["agent/queue/l", "green"]] as [string, string][], claimant: OTHER, register: STALE_REGISTER };
    // M's own hand-out is the resync (pinned alone: with L present the picker hands L's land first, an existing ordering this row does not touch).
    expect(pick([M({ tier: 2, syncedTo: "D-100" })], opts)).toMatchObject({ kind: "resync", task: { id: "M" } });
    expect(pick([M({ tier: 2, syncedTo: "D-100" }), L()], { ...opts, avoid: ["M"] })).toMatchObject(landsL);
  });

  it("a red but stale task is handed as a resync (main's D-202 order: stale before red, blocked aside), and a resync holds nothing, avoided or not", () => {
    // nextTaskCore: "an out-of-sync task is handed as a re-sync and holds no lane or file" (D-202). Avoid keeps that.
    const opts = { branches: [builtM, builtL], prs: [prM, prL], prCi: [["agent/queue/m", "red"], ["agent/queue/l", "green"]] as [string, string][], claimant: OTHER, register: STALE_REGISTER };
    expect(pick([M({ tier: 2, syncedTo: "D-100" })], opts)).toMatchObject({ kind: "resync", task: { id: "M" } });
    expect(pick([M({ tier: 2, syncedTo: "D-100" }), L()], { ...opts, avoid: ["M"] })).toMatchObject(landsL);
  });

  it("main's blocked-before-stale order holds: a blocked and stale task is an unblock, never a resync, and avoiding it keeps L's lane held", () => {
    const blocked = { id: "M", status: "blocked", who: BUILDER, at: NOW - 3 * HOUR, note: "awaiting a ruling" };
    const opts = { branches: [builtM, builtL], prs: [prL], prCi: [["agent/queue/l", "green"]] as [string, string][], reports: [blocked], claimant: OTHER, register: STALE_REGISTER };
    expect(pick([M({ tier: 2, syncedTo: "D-100" }), L()], opts)).toMatchObject({ kind: "unblock", task: { id: "M" } });
    expectHonestNone(pick([M({ tier: 2, syncedTo: "D-100" }), L()], { ...opts, avoid: ["M"] }), [{ id: "M", reason: AVOIDED }, { id: "L", reason: HELD_BY_M }]);
  });
});

// A session holding two owned LAND continuations that avoids the first must be handed the second,
// not fresh work. Before the fix ownWork() returned found[0], the avoid branch nulled it, and the
// normal pass fell through to a new build. The blockedOwn fallback is deliberately unchanged: it
// applies only when nothing else is owned, so an avoided continuation plus an own blocked task
// still hands out eligible fresh work rather than a wait.
describe("multi-owned continuation", () => {
  const SECOND = () => task("SECOND", { tier: 1, lane: "second", owns: ["scripts/second.mjs"] });
  const builtSecond: [string, Branch] = ["agent/queue/second", { tipSha: "a".repeat(40), tipMs: NOW - 3 * HOUR, merged: false, markers: [{ verb: "Claim", id: "SECOND", who: BUILDER }] }];
  const passSecond: [string, Branch] = ["agent/review/second", {
    tipMs: NOW - 0.2 * HOUR,
    merged: false,
    markers: [{ verb: "Review claim", id: "SECOND", who: REVIEWER }, { verb: "Verdict", id: "SECOND", who: REVIEWER, verdict: "pass" }],
  }];
  const prSecond: [string, string] = ["agent/queue/second", "https://github.com/o/r/pull/10"];
  const twoOwned = {
    branches: [builtM, freshPass, builtSecond, passSecond],
    prs: [prM, prSecond],
    prCi: [["agent/queue/m", "green"], ["agent/queue/second", "green"]] as [string, string][],
    claimant: REVIEWER,
  };

  it("control: without --avoid the first owned landing is continued", () => {
    expect(pick([M(), SECOND(), N()], twoOwned)).toMatchObject({ kind: "continue", of: "land", task: { id: "M" } });
  });

  it("avoiding the first owned landing continues the second, not fresh work", () => {
    expect(pick([M(), SECOND(), N()], { ...twoOwned, avoid: ["M"] })).toMatchObject({ kind: "continue", of: "land", task: { id: "SECOND" } });
  });

  it("avoiding both owned landings falls through to fresh work", () => {
    expect(pick([M(), SECOND(), N()], { ...twoOwned, avoid: ["M", "SECOND"] })).toMatchObject({ kind: "build", task: { id: "N" } });
  });

  it("keeps the blockedOwn fallback: an avoided continuation plus an own blocked task still hands out fresh work", () => {
    const ownBlocked = { id: "B", status: "blocked", who: REVIEWER, at: NOW - 2 * HOUR, note: "awaiting a ruling" };
    // B must be the reviewer's own held task, or ownWorkList never populates blockedOwn.
    const claimedB: [string, Branch] = ["agent/queue/b", { tipSha: "b".repeat(40), tipMs: NOW - 4 * HOUR, merged: false, markers: [{ verb: "Claim", id: "B", who: REVIEWER }] }];
    const opts = { branches: [builtM, freshPass, claimedB], prs: [prM], prCi: [["agent/queue/m", "green"]] as [string, string][], reports: [ownBlocked], claimant: REVIEWER };
    const tasks = [M(), task("B", { lane: "b", owns: ["scripts/b.mjs"] }), N()];
    // The owned continuation outranks the own blocked task, so it is continued first.
    expect(pick(tasks, opts)).toMatchObject({ kind: "continue", of: "land", task: { id: "M" } });
    // Avoiding it leaves nothing owned to continue: fresh work, never a wait on the own block.
    const avoided = pick(tasks, { ...opts, avoid: ["M"] });
    expect(avoided).toMatchObject({ kind: "build" });
    expect(avoided).not.toMatchObject({ kind: "wait", own: true });
    expect(avoided.task.id).not.toBe("M");
  });
});
