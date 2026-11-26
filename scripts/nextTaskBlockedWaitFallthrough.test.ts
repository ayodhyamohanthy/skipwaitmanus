// @vitest-environment node
// Characterization: these contracts pass on the unmodified core, not a red-first source repair.
import { beforeAll, describe, expect, it, vi } from "vitest";

let core: typeof import("./nextTaskCore.mjs");
const inheritedPolicy = process.env.SKIPWAIT_LEGACY_REVIEW_RULES;
beforeAll(async () => {
  vi.resetModules();
  vi.stubEnv("SKIPWAIT_LEGACY_REVIEW_RULES", undefined);
  try { core = await import("./nextTaskCore.mjs"); }
  finally { vi.unstubAllEnvs(); }
});

const NOW = Date.parse("2026-11-26T12:00:00Z"), HOUR = 3_600_000;
const SHA = "a".repeat(40), ME = "Worker · blocked-wait-test", BUILDER = "Builder · blocked-wait-test";
interface Task {
  id: string; title: string; row: string; packet: string | null; tier: number; lane: string;
  branch: string; status: "todo" | "owner"; dependsOn: string[]; syncedTo: string;
}
interface Branch {
  tipMs: number; tipSha: string; merged: boolean;
  markers: { verb: "Claim"; id: string; who: string }[];
}
interface Evidence {
  version: number; work: { branch: string; sha: string }[]; decisions: string[]; doneDependencies: string[];
}
interface Fixture {
  tasks: Task[]; mainCi: { state: "running" }; branches: Map<string, Branch>; openPrs: Map<string, string>;
  prCi: Map<string, { state: "running"; sha: string }>; mergedHeads: Map<string, Set<string>>;
  reports: { id: string; status: "blocked"; who: string; at: number; note: string; evidence: Evidence }[];
  register: { id: string; number: number; date: string; title: string; affects: string[] }[];
  now: number; claimant: string; avoid: Set<string>; only?: string;
}
const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id, title: id, row: id, packet: "docs/plans/PICKER-blocked-wait-fallthrough.md", tier: 2, lane: id,
  branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [], syncedTo: "D-002", ...extra,
});
const owner = task("OWNER", { status: "owner" }), blocked = task("BLOCKED");
const claimed = (row: Task, who = BUILDER, hoursAgo = 0.5): Branch => ({
  tipMs: NOW - hoursAgo * HOUR, tipSha: SHA, merged: false, markers: [{ verb: "Claim", id: row.id, who }],
});
function fixture(tasks: Task[] = [owner, blocked]): Fixture {
  const input: Fixture = {
    tasks, mainCi: { state: "running" }, branches: new Map([[blocked.branch, claimed(blocked, BUILDER, 4)]]),
    openPrs: new Map([[blocked.branch, "https://github.com/o/r/pull/1"]]),
    prCi: new Map([[blocked.branch, { state: "running", sha: SHA }]]), mergedHeads: new Map(), reports: [],
    register: [
      { id: "D-001", number: 1, date: "2026-11-01", title: "Fixture", affects: [] },
      { id: "D-002", number: 2, date: "2026-11-02", title: "Owner packet changed", affects: [owner.id] },
    ],
    now: NOW, claimant: ME, avoid: new Set(),
  };
  input.reports.push({ id: blocked.id, status: "blocked", who: BUILDER, at: NOW - HOUR, note: "Needs evidence",
    evidence: core.blockEvidenceFor({ ...input, task: blocked }) });
  return input;
}
const expectBlockedWait = (input: Fixture) => expect(core.pickNextTask(input)).toEqual({
  kind: "wait", gate: blocked.id, blocked: true,
  reason: "BLOCKED was reported blocked; waiting for new evidence or 24h",
});

describe("PICKER-blocked-wait-fallthrough: production-default characterization", () => {
  it("uses D-370 defaults while restoring the inherited legacy-test environment", () => {
    expect(core.needsReview({ task: { tier: 1 } })).toBe(false);
    expect(core.isArchitect(ME)).toBe(true);
    expect(process.env.SKIPWAIT_LEGACY_REVIEW_RULES).toBe(inheritedPolicy);
  });

  it.each(["owner first", "blocked first"])("builds the parked owner past an unchanged blocked PR: %s", order => {
    const input = fixture(order === "owner first" ? [owner, blocked] : [blocked, owner]);
    expect(core.statusBoard(input).find(row => row.id === blocked.id)).toMatchObject({
      blockWaitingForEvidence: true, pr: "https://github.com/o/r/pull/1",
    });
    expect(core.blockedReportError({ ...input, task: blocked })).toContain("already reported");
    expect(core.pickNextTask(input)).toMatchObject({ kind: "build", task: { id: owner.id }, parked: "it waits for the owner" });
  });

  it("hands ordinary unrelated work out before owner build-ahead", () => {
    const input = fixture([owner, blocked, task("SAME", { lane: blocked.lane }),
      task("DEPENDENT", { dependsOn: [blocked.id] }), task("UNRELATED")]);
    const pick = core.pickNextTask(input);
    expect(pick).toMatchObject({ kind: "build", task: { id: "UNRELATED" } });
    expect(pick).not.toHaveProperty("parked");
    expect(pick).not.toHaveProperty("ahead");
  });

  it("keeps the blocked lane held even when the session avoids the blocked row", () => {
    const input = fixture([blocked, task("SAME", { lane: blocked.lane })]);
    expectBlockedWait(input);
    input.avoid.add(blocked.id);
    expectBlockedWait(input);
  });

  it("withholds ordinary dependent work, permits D-315 ahead work, and never duplicates its PR", () => {
    const dependent = task("DEPENDENT", { dependsOn: [blocked.id] });
    const input = fixture([blocked, dependent, task("UNRELATED")]);
    expect(core.pickNextTask(input)).toMatchObject({ kind: "build", task: { id: "UNRELATED" } });
    input.tasks = [blocked, dependent];
    const ahead = core.pickNextTask(input);
    expect(ahead).toMatchObject({ kind: "build", task: { id: dependent.id }, ahead: [blocked.id] });
    expect(ahead).not.toHaveProperty("parked");
    input.branches.set(dependent.branch, claimed(dependent, BUILDER, 4));
    input.openPrs.set(dependent.branch, "https://github.com/o/r/pull/2");
    input.prCi.set(dependent.branch, { state: "running", sha: SHA });
    expectBlockedWait(input);
  });

  it("restricts --task without handing a blocked PR or overriding --avoid", () => {
    const input = fixture();
    input.only = owner.id;
    expect(core.pickNextTask(input)).toMatchObject({ kind: "build", task: { id: owner.id }, parked: "it waits for the owner" });
    input.avoid.add(owner.id);
    expect(core.pickNextTask(input)).toMatchObject({ kind: "ineligible", task: { id: owner.id } });
    input.only = blocked.id;
    expect(core.pickNextTask(input)).toMatchObject({ kind: "ineligible", task: { id: blocked.id },
      reason: "BLOCKED was reported blocked; waiting for new evidence or 24h" });
  });

  it.each(["stale", "active claimant", "avoided", "already has PR", "no packet"])(
    "returns the original truthful WAIT when the owner is %s", state => {
      const parked = task(owner.id, { status: "owner", syncedTo: state === "stale" ? "D-001" : "D-002",
        packet: state === "no packet" ? null : owner.packet });
      const input = fixture([parked, blocked]);
      if (state === "active claimant" || state === "already has PR") input.branches.set(parked.branch, claimed(parked));
      if (state === "already has PR") input.openPrs.set(parked.branch, "https://github.com/o/r/pull/2");
      if (state === "avoided") input.avoid.add(parked.id);
      expectBlockedWait(input);
    },
  );

  it("resumes a parked owner's active holder without handing it to another session", () => {
    const input = fixture();
    input.branches.set(owner.branch, claimed(owner, ME));
    expect(core.pickNextTask(input)).toMatchObject({ kind: "build", task: { id: owner.id }, parked: "it waits for the owner" });
    input.claimant = "Other · blocked-wait-test";
    expectBlockedWait(input);
  });

  it("only takes over a blocked build without a PR, leaving its block intact", () => {
    const input = fixture([blocked]);
    expectBlockedWait(input);
    input.openPrs.clear();
    expect(core.pickNextTask(input)).toMatchObject({ kind: "takeover", task: { id: blocked.id }, work: blocked.branch,
      parked: expect.stringContaining("it is blocked") });
    expect(core.blockedReportError({ ...input, task: blocked })).toContain("already reported");
  });
});
