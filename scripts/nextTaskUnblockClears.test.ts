import { describe, expect, it } from "vitest";
import * as core from "./nextTaskCore.mjs";

// PICKER-unblock-report-clears (D-378): the UNBLOCK hand-out tells its holder to report its ruling with
// `--report review`. A D-346 evidence-backed block ignored that report, so the block stood after the ruling,
// the holder was handed CONTINUE: UNBLOCK for the same task on every run, and every other session was handed
// the same UNBLOCK again once the lock went quiet. The unblocker's own report now clears it; an unrelated
// session's report still cannot (D-346).

const NOW = Date.parse("2026-11-21T21:00:00Z");
const HOUR = 3_600_000;
const SHA = "a".repeat(40);
const task = (id: string, extra: object = {}) => ({
  id, title: id, row: id, packet: "docs/plans/D-344-unblock.md", tier: 2,
  lane: id, branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [] as string[],
  syncedTo: "D-001", ...extra,
});
const a = task("A");
const next = task("NEXT");
const RULER = "Ruler · u1";
const work = { tipMs: NOW - 30 * HOUR, tipSha: SHA, merged: false, markers: [{ verb: "Claim", id: "A", who: "Builder · b1" }] };
// Quiet for 3 hours, so a standing block would be handed to the next session as an UNBLOCK.
const lock = (markers: object[]) => ({ tipMs: NOW - 3 * HOUR, tipSha: "c".repeat(40), merged: false, markers });
const unblock = { verb: "Unblock", id: "A", who: RULER };
const evidence = { version: 1, work: [{ branch: a.branch, sha: SHA }], decisions: [] as string[], doneDependencies: [] as string[] };
// Older than 24 hours, so the block is handed out as an UNBLOCK again unless something clears it.
const block = { id: "A", status: "blocked", who: "Builder · b1", at: NOW - 25 * HOUR, note: "Needs a ruling", evidence };
const ruling = { id: "A", status: "review", who: RULER, at: NOW - HOUR, note: "Ruling: the block's reason is gone", evidence: null };
// Reports are newest first, as the loader reads them from the report log.
const fixture = (extra: object = {}) => ({
  tasks: [a, next],
  branches: new Map<string, object>([[a.branch, work], ["agent/architect/a", lock([unblock])]]),
  openPrs: new Map(), mainCi: { state: "green", sha: SHA }, reports: [ruling, block], register: [],
  now: NOW, claimant: "Worker · w1", ...extra,
});
const isUnblockOfA = (pick: { kind: string; of?: string; task?: { id: string } }) =>
  pick.task?.id === "A" && (pick.kind === "unblock" || (pick.kind === "continue" && pick.of === "unblock"));

describe("D-378: the unblocker's own report clears an evidence-backed block", () => {
  it("stops handing the unblocker CONTINUE: UNBLOCK after it reported its ruling", () => {
    expect(isUnblockOfA(core.pickNextTask(fixture({ claimant: RULER })))).toBe(false);
  });

  it("stops handing every other session the same UNBLOCK", () => {
    for (const claimant of ["Worker · w1", "Claude Code · c1"]) {
      expect(isUnblockOfA(core.pickNextTask(fixture({ claimant })))).toBe(false);
    }
  });

  it("shows the ruling, not the block, as the task's standing report", () => {
    const row = core.statusBoard(fixture()).find(r => r.id === "A");
    expect(row?.report).toMatchObject({ status: "review", who: RULER });
    expect(row).not.toHaveProperty("blockAgeHours");
  });

  it("keeps clearing when a later packet or re-sync claim lands on the same architect lock", () => {
    const branches = new Map<string, object>([[a.branch, work], ["agent/architect/a", lock([unblock, { verb: "Claim", id: "A", who: "Writer · p1" }])]]);
    expect(isUnblockOfA(core.pickNextTask(fixture({ branches })))).toBe(false);
  });

  it("lets a new block after the ruling stand again", () => {
    const first = { ...block, at: NOW - 30 * HOUR };
    const again = { ...block, who: "Builder · b2", at: NOW - 26 * HOUR, note: "Blocked again" };
    const reports = [again, { ...ruling, at: NOW - 28 * HOUR }, first];
    expect(core.pickNextTask(fixture({ reports }))).toMatchObject({ kind: "unblock", task: { id: "A" } });
  });
});

describe("D-346 protections that stay", () => {
  it("an unrelated session's review still does not clear the block", () => {
    const reports = [{ ...ruling, who: "Other · o1" }, block];
    expect(core.pickNextTask(fixture({ reports }))).toMatchObject({ kind: "unblock", task: { id: "A" } });
  });

  it("an unblock lock holder that raised the block cannot clear it with its own review", () => {
    const branches = new Map<string, object>([[a.branch, work], ["agent/architect/a", lock([{ ...unblock, who: block.who }])]]);
    const reports = [{ ...ruling, who: block.who }, block];
    expect(core.statusBoard(fixture({ branches, reports })).find(r => r.id === "A")?.report).toMatchObject({ status: "blocked" });
  });

  it("an unblock lock holder that holds the task cannot clear it with its own review", () => {
    const holderWork = { ...work, markers: [{ verb: "Claim", id: "A", who: RULER }] };
    const reports = [ruling, { ...block, who: "Other · o2" }];
    const branches = new Map<string, object>([[a.branch, holderWork], ["agent/architect/a", lock([unblock])]]);
    expect(core.statusBoard(fixture({ branches, reports })).find(r => r.id === "A")?.report).toMatchObject({ status: "blocked" });
  });

  it("a green report still clears it from anyone", () => {
    const reports = [{ ...ruling, status: "green", who: "Other · o1" }, block];
    expect(core.statusBoard(fixture({ reports })).find(r => r.id === "A")?.report).toMatchObject({ status: "green" });
  });

  it("the duplicate-block refusal treats a cleared block as gone", () => {
    expect(core.blockedReportError({ ...fixture(), task: a })).toBeNull();
  });
});
