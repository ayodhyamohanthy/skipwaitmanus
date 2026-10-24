import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ownerDirectWarning, queueGateViolation } from "./queue-gate.mjs";

const NO_ROW = "This branch matches no queue row. Nothing merges to main outside the queue (D-166). Register a row in docs/plans/assignments.json with a docs-only pull request (any session may, D-200), or work on the row's own branch.";
const tasks = [{ id: "PROCESS-queue-gate", branch: "agent/queue/process-queue-gate" }];
const check = (branch: string, changed: string[] = [], labels: string[] = [], rows = tasks) =>
  queueGateViolation({ tasks: rows, branch, changed, labels });

describe("PROCESS-queue-gate", () => {
  it("passes an exact task branch", () => {
    expect(check("agent/queue/process-queue-gate")).toBeNull();
  });

  it.each(["architect", "review", "heartbeat"])("passes a registered %s branch for the task slug", role => {
    expect(check(`agent/${role}/process-queue-gate`)).toBeNull();
  });

  it.each(["claude/decision-sync", "agent/instinct/register-rows", "agent/cue/ruling"])("passes %s only when every changed path is a document (D-200: any session)", branch => {
    expect(check(branch, [
      "docs/DECISIONS.md",
      "docs/plans/assignments.json",
      "README.md",
      ".github/CONTRIBUTING.md",
      ".github/copilot-instructions.md",
      "app/docs/guide.md",
    ])).toBeNull();
  });

  it.each(["claude/decision-sync", "agent/instinct/register-rows"])("rejects %s when it also changes product code or a nested .github file", branch => {
    expect(check(branch, ["docs/DECISIONS.md", "server/db.ts"])).toBe(NO_ROW);
    expect(check(branch, [".github/nested/policy.md"])).toBe(NO_ROW);
  });

  it("does not pass an unregistered branch on an empty diff", () => {
    expect(check("agent/instinct/register-rows", [])).toBe(NO_ROW);
  });

  it("passes a dependabot branch", () => {
    expect(check("dependabot/npm_and_yarn/safe-update")).toBeNull();
  });

  it("passes an owner-direct PR and names its PR in the warning", () => {
    expect(check("outside/anywhere", ["server/db.ts"], ["owner-direct"])).toBeNull();
    expect(ownerDirectWarning(["owner-direct"], 812)).toContain("#812");
    expect(ownerDirectWarning([], 812)).toBeNull();
  });

  it("fails closed for a branch with no matching queue row", () => {
    expect(check("agent/instinct/unregistered", ["server/db.ts"])).toBe(NO_ROW);
  });

  it("fails open for an unknown task-list structure", () => {
    expect(queueGateViolation({ tasks: null, branch: "agent/instinct/unregistered", changed: [], labels: [] })).toBeNull();
    expect(queueGateViolation({ tasks: [{ branch: 7 }], branch: "agent/instinct/unregistered", changed: [], labels: [] })).toBeNull();
  });

  it("allows the branch recorded for every currently open assignment row", () => {
    const assignments = JSON.parse(readFileSync(new URL("../docs/plans/assignments.json", import.meta.url), "utf8"));
    expect(Array.isArray(assignments.tasks)).toBe(true);
    const openRows = assignments.tasks.filter((task: { status?: string; branch?: string }) => task.status !== "done" && typeof task.branch === "string");
    expect(openRows.length).toBeGreaterThan(0);
    for (const task of openRows) {
      expect(queueGateViolation({ tasks: assignments.tasks, branch: task.branch, changed: [], labels: [] }), task.id).toBeNull();
    }
  });
});
