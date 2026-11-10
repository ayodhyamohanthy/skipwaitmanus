// D-315: an empty commit after the reviewed head (a picker Claim, Takeover or Land claim marker pushed onto the pull
// request's branch) changes no reviewed content, so it keeps the independent pass, like a merge of main or the landing's
// status commit. Any commit that changes a file still needs a new review. #878 (D-089) and D-301 were red only for this.
import { describe, expect, it } from "vitest";
import { REVIEW_GATE_FAIL, reviewGateViolation } from "./review-gate.mjs";
import { renderPick } from "./nextTaskText.mjs";

const HEAD = "a".repeat(40);
const REVIEWED = "b".repeat(40);
const task1 = { id: "T1", tier: 1, branch: "agent/queue/t1" };
const built = [{ verb: "Claim", id: "T1", who: "Instinct · b1" }];
const pass = [
  { verb: "Review claim", id: "T1", who: "Mistral · r1" },
  { verb: "Verdict", id: "T1", who: "Mistral · r1", verdict: "pass", reviewed: REVIEWED },
];
const gate = (own: string[], empty: Set<string>) => reviewGateViolation({
  task: task1, head: HEAD, workMarkers: built, lockMarkers: pass,
  nonMergeCommitsSince: () => own, isStatusCommit: () => false, isEmptyCommit: sha => empty.has(sha),
});

describe("D-315: empty marker commits keep the pass", () => {
  it("passes when every own commit after the reviewed head is an empty marker", () => {
    expect(gate(["e1", "e2"], new Set(["e1", "e2"]))).toBeNull();
  });

  it("still fails when any own commit after the review changes a file", () => {
    const got = gate(["e1", "c1"], new Set(["e1"]));
    expect(got).toContain(REVIEW_GATE_FAIL);
    expect(got).toContain("1 commit(s)");
  });

  it("without the empty-commit check (older callers) the old answer stands", () => {
    const got = reviewGateViolation({ task: task1, head: HEAD, workMarkers: built, lockMarkers: pass, nonMergeCommitsSince: () => ["e1"], isStatusCommit: () => false });
    expect(got).toContain(REVIEW_GATE_FAIL);
  });

  it("the lander's own check says an empty marker commit is not unreviewed work", () => {
    const text = renderPick({ kind: "land", task: { id: "T1", title: "t", row: "T1", tier: 1, lane: "t", branch: "agent/queue/t1", packet: "docs/plans/t.md" }, work: "agent/queue/t1", pr: "https://github.com/o/r/pull/1", lock: "agent/review/t1", tier1: true }, { who: "Kimi · k1", date: "2026-11-10", claimed: false });
    expect(text).toContain("one that lists no file at all (an empty picker marker, D-315)");
  });
});
