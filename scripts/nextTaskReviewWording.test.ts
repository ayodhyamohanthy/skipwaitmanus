// @vitest-environment node
// D-184: a reviewer's own findings comment must never bar it from the re-review
// that D-151 (1) hands back to it. Pins the printed review step's wording.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderPick } from "./nextTaskText.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

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

// D-235 (owner, Oct 29 2026): after a bounded handoff a session reports, reruns the preflight and takes
// the next eligible task instead of ending. Pins the printed Tier 1 stop copy; the review independence
// above is unchanged.
describe("the printed Tier 1 handoff step (D-235)", () => {
  const buildPick = renderPick(
    { kind: "build", task: task("M", { status: "todo" }), ciRunning: false },
    ctx,
  );

  it("sends the session to the next eligible task instead of ending it", () => {
    expect(buildPick).toContain("take the next eligible task");
    expect(buildPick).toContain("D-235; one packet at a time");
    expect(buildPick).not.toContain("end the session (one packet per session, D-074)");
  });

  it("keeps the draft-pull-request step and the bar on landing your own work", () => {
    expect(buildPick).toContain("open a DRAFT pull request");
    expect(buildPick).toContain("Never land it yourself");
    expect(buildPick).toContain("hands the review to a different session");
  });

  it("ensures docs/BUILD_CONTINUITY.md and docs/DELEGATION.md carry no stale forward reference to the old end-of-session step", () => {
    const buildContinuity = readFileSync(path.join(root, "docs/BUILD_CONTINUITY.md"), "utf8");
    const delegation = readFileSync(path.join(root, "docs/DELEGATION.md"), "utf8");
    expect(buildContinuity).not.toContain("ends with \"end the session (one packet per session, D-074)\"");
    expect(delegation).not.toContain("ends with \"end the session (one packet per session, D-074)\"");
  });
});
