// @vitest-environment node
// D-184: a reviewer's own findings comment must never bar it from the re-review
// that D-151 (1) hands back to it. Pins the printed review step's wording.
import { describe, expect, it } from "vitest";
import { renderPick } from "./nextTaskText.mjs";

const task = (id, extra = {}) => ({
  id, title: `${id} title`, row: id, packet: "docs/plans/PICKER-PARALLEL.md",
  tier: 1, lane: id, branch: `agent/queue/${id.toLowerCase()}`, status: "review", dependsOn: [], ...extra,
});
const ctx = { who: "GPT · s1", date: "2026-10-23", claimed: true };
const reviewPick = renderPick(
  { kind: "review", task: task("M"), work: "agent/queue/m", pr: "https://github.com/o/r/pull/547", lock: "agent/review/m", lockExists: true, builder: "Qwen · s1" },
  ctx,
);

describe("the printed review step (D-184)", () => {
  it("bars only a build, takeover or fix by the reviewer's own model", () => {
    expect(reviewPick).toContain("for a build, takeover or fix by your model");
    expect(reviewPick).toContain("A review or findings comment of your own model does not count");
  });

  it("keeps the D-151 model bar and the blocked report it points to", () => {
    expect(reviewPick).toContain("No session of your model");
    expect(reviewPick).toContain("post no verdict and report it blocked to the CEO");
  });
});
