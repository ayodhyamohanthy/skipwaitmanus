// @vitest-environment node
// PICKER-avoid-land (#744): a reviewer whose fresh pass (or Land claim) on M gives it an owned
// LAND continuation is never handed M again when it asks to avoid M; it gets eligible work or an
// honest wait. Avoid changes no marker, no identity and releases no lock, and the review,
// landing-slot and blocked-lane exclusions still hold.
import { describe, expect, it } from "vitest";
import { pickNextTask } from "./nextTaskCore.mjs";

const NOW = Date.parse("Tue 2026-10-20 5:30 PM IST (UTC+05:30)");
const HOUR = 3_600_000;
const green = { state: "green", sha: "a".repeat(40), url: "https://ci/run/1" };

type Marker = { verb: string; id: string; who: string; verdict?: string };
type Branch = { tipMs: number; merged: boolean; markers: Marker[] };
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
const builtM: [string, Branch] = ["agent/queue/m", { tipMs: NOW - 3 * HOUR, merged: false, markers: [{ verb: "Claim", id: "M", who: BUILDER }] }];
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
}) => pickNextTask({
  tasks,
  mainCi: green,
  branches: new Map(opts.branches ?? []),
  openPrs: new Map(opts.prs ?? [prM]),
  prCi: new Map((opts.prCi ?? [["agent/queue/m", "green"]]).map(([b, state]) => [b, { state }])),
  mergedHeads: new Map(),
  reports: opts.reports ?? [],
  now: NOW,
  claimant: opts.claimant,
  avoid: new Set(opts.avoid ?? []),
});

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
    expect(pick([M()], { branches: [builtM, freshPass], claimant: REVIEWER, avoid: ["M"] }))
      .toMatchObject({ kind: "none" });
  });

  it("keeps the landing-slot exclusion: a slot held by another session still makes a land wait", () => {
    const slot: [string, Branch] = ["agent/queue/landing", { tipMs: NOW - 0.1 * HOUR, merged: false, markers: [{ verb: "Land claim", id: "Q", who: OTHER }] }];
    expect(pick([M(), N()], { branches: [builtM, freshPass, slot], claimant: REVIEWER }))
      .toMatchObject({ kind: "wait", landing: true, holder: OTHER });
    expect(pick([M(), N()], { branches: [builtM, freshPass, slot], claimant: REVIEWER, avoid: ["M"] }))
      .toMatchObject({ kind: "build", task: { id: "N" } });
  });

  it("keeps the review exclusion: avoiding another task never hands the builder its own review", () => {
    const needsReview: [string, Branch] = ["agent/review/m", { tipMs: NOW - 3 * HOUR, merged: false, markers: [] }];
    const result = pick([M(), N(), task("Z")], { branches: [builtM, needsReview], claimant: BUILDER, avoid: ["Z"] });
    expect(result).toMatchObject({ kind: "build", task: { id: "N" } });
  });

  it("keeps the blocked-lane exclusion: an avoided blocked M still holds its lane-mate", () => {
    const blocked = { id: "M", status: "blocked", who: BUILDER, at: NOW - 3 * HOUR, note: "awaiting a ruling" };
    const mate = task("L", { lane: "m", owns: ["scripts/l.mjs"] });
    const result = pick([M(), mate, N()], { branches: [builtM, freshPass], reports: [blocked], claimant: REVIEWER, avoid: ["M"] });
    expect(result).toMatchObject({ kind: "build", task: { id: "N" } });
    expect(pick([M(), mate], { branches: [builtM, freshPass], reports: [blocked], claimant: REVIEWER, avoid: ["M"] }))
      .not.toMatchObject({ task: { id: "L" } });
  });

  it("keeps the red-lane exclusion: an avoided red M (make green) still holds its lane-mate", () => {
    const redM = task("M", { lane: "m", owns: ["scripts/m.mjs"] });
    const mate = task("L", { lane: "m", owns: ["scripts/l.mjs"] });
    expect(pick([redM, mate, N()], { branches: [builtM], prCi: [["agent/queue/m", "red"]], claimant: REVIEWER, avoid: ["M"] }))
      .toMatchObject({ kind: "build", task: { id: "N" } });
    expect(pick([redM, mate, N()], { branches: [builtM], prCi: [["agent/queue/m", "red"]], claimant: REVIEWER }))
      .toMatchObject({ kind: "green", task: { id: "M" } });
  });
});
