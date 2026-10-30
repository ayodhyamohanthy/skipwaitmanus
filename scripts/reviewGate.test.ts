import { describe, expect, it } from "vitest";
import { REVIEW_GATE_FAIL, findGateRow, isStatusOnlyChange, reviewGateViolation, reviewedOf } from "./review-gate.mjs";

// PROCESS-review-gate (D-166, docs/plans/PROCESS-gates.md): a Tier 1 row merges only after an
// independent pass verdict that names its exact head (or a head that only merged main after it).
type Marker = { verb: string; id: string; who: string; verdict?: string; reviewed?: string | null };

const HEAD = "a".repeat(40);
const REVIEWED = "b".repeat(40);
const task1 = { id: "T1", tier: 1, branch: "agent/queue/t1" };
const task2 = { id: "T2", tier: 2, branch: "agent/queue/t2" };
const built: Marker[] = [{ verb: "Claim", id: "T1", who: "Instinct · b1" }];
const passOn = (reviewed: string | null, who = "Mistral · r1"): Marker[] => [
  { verb: "Review claim", id: "T1", who },
  { verb: "Verdict", id: "T1", who, verdict: "pass", reviewed },
];
// The commits of the head's own history after the reviewed one that are not merges and not on main.
const onlyMergesSince = () => [];
const ownCommitSince = () => ["c0ffee0"];

const gate = (over: Partial<Parameters<typeof reviewGateViolation>[0]> = {}) => reviewGateViolation({
  task: task1, head: HEAD, workMarkers: built, lockMarkers: passOn(HEAD), nonMergeCommitsSince: ownCommitSince, ...over,
});

describe("PROCESS-review-gate", () => {
  it("passes a Tier 1 head whose independent pass verdict names that exact head", () => {
    expect(gate()).toBeNull();
  });

  it("passes after a merge of main only (every own commit since the review is a merge)", () => {
    expect(gate({ lockMarkers: passOn(REVIEWED), nonMergeCommitsSince: onlyMergesSince })).toBeNull();
  });

  it("fails after a non-merge commit of the branch's own since the review", () => {
    expect(gate({ lockMarkers: passOn(REVIEWED), nonMergeCommitsSince: ownCommitSince })).toContain(REVIEW_GATE_FAIL);
  });

  it("fails when the reviewed commit is not in this head's history", () => {
    expect(gate({ lockMarkers: passOn(REVIEWED), nonMergeCommitsSince: () => null })).toContain(REVIEW_GATE_FAIL);
  });

  it("fails when the reviewer's model also built the work (D-151)", () => {
    expect(gate({ lockMarkers: passOn(HEAD, "Instinct · r9") })).toContain(REVIEW_GATE_FAIL);
    expect(gate({ workMarkers: [...built, { verb: "Takeover", id: "T1", who: "Mistral · t2" }] })).toContain(REVIEW_GATE_FAIL);
  });

  it("fails when the reviewer's model also fixed the work (D-151)", () => {
    const lockMarkers: Marker[] = [
      { verb: "Review claim", id: "T1", who: "Kimi · r1" }, { verb: "Verdict", id: "T1", who: "Kimi · r1", verdict: "findings", reviewed: REVIEWED },
      { verb: "Fix claim", id: "T1", who: "Mistral · f1" }, { verb: "Fixed", id: "T1", who: "Mistral · f1" },
      ...passOn(HEAD, "Mistral · r2"),
    ];
    expect(gate({ lockMarkers })).toContain(REVIEW_GATE_FAIL);
  });

  it("fails with findings as the last verdict, and with no review at all", () => {
    const findings: Marker[] = [{ verb: "Review claim", id: "T1", who: "Kimi · r1" }, { verb: "Verdict", id: "T1", who: "Kimi · r1", verdict: "findings", reviewed: HEAD }];
    expect(gate({ lockMarkers: findings })).toContain(REVIEW_GATE_FAIL);
    expect(gate({ lockMarkers: [] })).toContain(REVIEW_GATE_FAIL);
    expect(gate({ lockMarkers: [{ verb: "Review claim", id: "T1", who: "Kimi · r1" }] })).toContain(REVIEW_GATE_FAIL);
  });

  it("fails when a fix round came after the pass", () => {
    const lockMarkers: Marker[] = [...passOn(HEAD), { verb: "Fix claim", id: "T1", who: "Kimi · f1" }, { verb: "Fixed", id: "T1", who: "Kimi · f1" }];
    expect(gate({ lockMarkers })).toContain(REVIEW_GATE_FAIL);
  });

  it("passes a Land claim whose nearest earlier verdict is a pass on this head", () => {
    expect(gate({ lockMarkers: [...passOn(HEAD), { verb: "Land claim", id: "T1", who: "Kimi · l1" }] })).toBeNull();
    const landAfterFindings: Marker[] = [...passOn(HEAD), { verb: "Verdict", id: "T1", who: "Mistral · r1", verdict: "findings", reviewed: HEAD }, { verb: "Land claim", id: "T1", who: "Kimi · l1" }];
    expect(gate({ lockMarkers: landAfterFindings })).toContain(REVIEW_GATE_FAIL);
  });

  it("ignores heartbeats and markers of other tasks on the lock", () => {
    const lockMarkers: Marker[] = [...passOn(HEAD), { verb: "Heartbeat", id: "T1", who: "Mistral · r1" }, { verb: "Fix claim", id: "OTHER", who: "Kimi · f1" }];
    expect(gate({ lockMarkers })).toBeNull();
  });

  it("passes a Tier 2 or Tier 3 row and no row at all", () => {
    expect(gate({ task: task2, lockMarkers: [] })).toBeNull();
    expect(gate({ task: { ...task2, tier: 3 }, lockMarkers: [] })).toBeNull();
    expect(gate({ task: null, lockMarkers: [] })).toBeNull();
  });

  it("fails a verdict recorded before this change (no body) and tells the reviewer to re-record it on the current head", () => {
    const message = gate({ lockMarkers: passOn(null) });
    expect(message).toContain(REVIEW_GATE_FAIL);
    expect(message).toContain("re-record");
    expect(message).toContain("--verdict pass");
  });

  it("reads the reviewed head from a verdict marker's body", () => {
    expect(reviewedOf(`reviewed ${HEAD}`)).toBe(HEAD);
    expect(reviewedOf(`reviewed ${HEAD}\n`)).toBe(HEAD);
    expect(reviewedOf("")).toBeNull();
    expect(reviewedOf("reviewed not-a-sha")).toBeNull();
  });

  it("finds the row as the queue gate does: its own branch, or a marker branch of its slug", () => {
    const tasks = [task1, task2];
    expect(findGateRow(tasks, "agent/queue/t1")).toBe(task1);
    expect(findGateRow(tasks, "agent/review/t2")).toBe(task2);
    expect(findGateRow(tasks, "agent/architect/t1")).toBe(task1);
    expect(findGateRow(tasks, "agent/instinct/t1")).toBeNull();
    expect(findGateRow(tasks, "claude/docs")).toBeNull();
  });
});

// The landing steps make one more commit after the review: the status commit (the task's
// "status" in docs/plans/assignments.json and its line in the packet's Status section). PR #819
// (D-048-p3-plans) failed on exactly that: head 653125b4 changed only those two lines after the
// reviewed 9f66f1ed. A status commit keeps the pass; anything else after the review does not.
const PACKET_BEFORE = ["# D-048", "", "## Rows", "- `D-048-p3-plans`: owns client/src/pages/goal/plans/**", "", "## Status", "", "- `D-048-p3-plans`: review — branch — 02590e56", "- `D-048-p3-premium`: not started", ""].join("\n");
const PACKET_AFTER = PACKET_BEFORE.replace("review — branch — 02590e56", "done — 9f66f1ed — landed");
const ROWS_BEFORE = ['{', '  "tasks": [', '    {', '      "id": "D-048-p3-plans",', '      "tier": 1,', '      "status": "in-review",', '      "syncedTo": "D-227"', '    }', '  ]', '}', ''].join("\n");
const ROWS_AFTER = ROWS_BEFORE.replace('"status": "in-review"', '"status": "done"');
const statusCommitOf819 = [
  { path: "docs/plans/D-048-money.md", before: PACKET_BEFORE, after: PACKET_AFTER, removed: [8], added: [8] },
  { path: "docs/plans/assignments.json", before: ROWS_BEFORE, after: ROWS_AFTER, removed: [6], added: [6] },
];

describe("PROCESS-review-gate: the status commit a landing makes keeps the pass", () => {
  it("reads the #819 status commit (assignments.json status + packet Status line) as status-only", () => {
    expect(isStatusOnlyChange(statusCommitOf819)).toBe(true);
    expect(isStatusOnlyChange([statusCommitOf819[1]])).toBe(true);
    expect(isStatusOnlyChange([statusCommitOf819[0]])).toBe(true);
  });

  it("does not read a code change, a packet edit outside Status, or another assignments field as status-only", () => {
    expect(isStatusOnlyChange([...statusCommitOf819, { path: "client/src/pages/Billing.tsx", before: "a\n", after: "b\n", removed: [1], added: [1] }])).toBe(false);
    expect(isStatusOnlyChange([{ path: "docs/plans/D-048-money.md", before: PACKET_BEFORE, after: PACKET_BEFORE.replace("owns client", "owns server"), removed: [4], added: [4] }])).toBe(false);
    expect(isStatusOnlyChange([{ path: "docs/plans/assignments.json", before: ROWS_BEFORE, after: ROWS_BEFORE.replace('"tier": 1', '"tier": 2'), removed: [5], added: [5] }])).toBe(false);
    expect(isStatusOnlyChange([{ path: "docs/plans/sub/x.md", before: PACKET_BEFORE, after: PACKET_AFTER, removed: [8], added: [8] }])).toBe(false);
    expect(isStatusOnlyChange([])).toBe(false);
  });

  it("passes #819's shape: the reviewed commit, a merge of main, then only the status commit", () => {
    const sinceReview = () => ["653125b4"];
    expect(gate({ lockMarkers: passOn(REVIEWED), nonMergeCommitsSince: sinceReview, isStatusCommit: (sha: string) => sha === "653125b4" })).toBeNull();
  });

  it("still fails when a code commit follows the review, with or without a status commit beside it", () => {
    const isStatusCommit = (sha: string) => sha === "653125b4";
    expect(gate({ lockMarkers: passOn(REVIEWED), nonMergeCommitsSince: () => ["c0ffee0"], isStatusCommit })).toContain(REVIEW_GATE_FAIL);
    const mixed = gate({ lockMarkers: passOn(REVIEWED), nonMergeCommitsSince: () => ["c0ffee0", "653125b4"], isStatusCommit });
    expect(mixed).toContain(REVIEW_GATE_FAIL);
    expect(mixed).toContain("1 commit(s)");
  });
});
