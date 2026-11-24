// @vitest-environment node
// PICKER-tier1-wording (D-389, implementing D-370): green required CI alone lands every pull request at
// every tier, so a Tier 1 hand-out must not send its builder to a draft pull request or to a review that
// never comes. It prints the same landing instruction Tier 2/3 does.
import { describe, expect, it } from "vitest";
import { renderPick } from "./nextTaskText.mjs";

const task = (id, extra = {}) => ({
  id, title: `${id} title`, row: id, packet: "docs/plans/PICKER-tier1-wording.md",
  tier: 1, lane: id, branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [], ...extra,
});
const ctx = { who: "DeepSeek V4.1 Flash · 019f", date: "2026-11-24", claimed: true };
const landingLines = text => text.split("\n").filter(line => line.includes("Land under D-082"));

describe("a Tier 1 build hand-out (D-370, D-389)", () => {
  const build = renderPick({ kind: "build", task: task("M"), ciRunning: false }, ctx);

  it("never sends the builder to a draft pull request or to a review that never comes", () => {
    expect(build).not.toContain("DRAFT");
    expect(build).not.toContain("different session");
    expect(build).not.toContain('to "review —');
  });

  it("lands on green required CI with auto-merge, like Tier 2/3", () => {
    expect(build).toContain("Land under D-082");
    expect(build).toContain("auto-merge");
    expect(build).toContain('"status" to "done" in docs/plans/assignments.json');
  });

  it("prints exactly the Tier 2 landing instruction", () => {
    const tier2 = renderPick({ kind: "build", task: task("M", { tier: 2 }), ciRunning: false }, ctx);
    expect(landingLines(build)).toEqual(landingLines(tier2));
    expect(landingLines(build).length).toBe(1);
  });

  it("keeps the D-235 handoff to the next eligible task", () => {
    expect(build).toContain("take the next eligible task");
    expect(build).toContain("D-235; one packet at a time");
  });
});

describe("a Tier 1 make-green hand-out (D-370, D-389)", () => {
  const green = renderPick({
    kind: "green", task: task("M"), work: "agent/queue/m",
    pr: "https://github.com/o/r/pull/547", since: Date.parse("2026-11-24T10:00:00Z"), from: "Qwen · s1",
  }, ctx);

  it("lands instead of stopping at a review", () => {
    expect(green).not.toContain("different session");
    expect(green).not.toContain('to "review —');
    expect(green).toContain("auto-merge");
  });

  it("prints exactly the Tier 2 landing instruction", () => {
    const tier2 = renderPick({
      kind: "green", task: task("M", { tier: 2 }), work: "agent/queue/m",
      pr: "https://github.com/o/r/pull/547", since: Date.parse("2026-11-24T10:00:00Z"), from: "Qwen · s1",
    }, ctx);
    expect(landingLines(green)).toEqual(landingLines(tier2));
  });
});
