// @vitest-environment node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const decisions = read("docs/DECISIONS.md");
const d202Start = decisions.indexOf("| D-202 |");
const d203Start = decisions.indexOf("\n| D-203 |", d202Start);
const d202 = d202Start >= 0 && d203Start > d202Start ? decisions.slice(d202Start, d203Start) : "";
const decisionSync = read("docs/plans/PICKER-decision-sync.md");
const skippyFix = read("docs/plans/SKIPPY-fix.md");

describe("REGISTER-520 packet contracts", () => {
  it("lets any capable session re-sync D-202 work under the newer D-200 rule", () => {
    expect(d202).toContain("D-200");
    expect(d202).toMatch(/any (capable )?session/i);
    expect(d202).not.toMatch(/no agent but the CEO gets work|CEO is (?:given|handed) a re-sync/i);

    expect(decisionSync).toContain("D-200");
    expect(decisionSync).toMatch(/any (capable )?session.*re-sync/i);
    expect(decisionSync).not.toMatch(/no agent but the CEO|for the CEO \(`isArchitect`\)/i);
  });

  it("makes the S-1 no-network test seam callable and injectable", () => {
    expect(skippyFix).toContain("exported `fetchJobText(url, fetcher = fetchPublicJobLink)`");
    expect(skippyFix).toMatch(/stub the injected safe fetcher.*never touch the network/i);
  });

  it("binds S-3's confirmed price to the atomic ask transaction", () => {
    expect(skippyFix).toMatch(/capture the confirmed cost before overwriting `session\.quote`/i);
    expect(skippyFix).toContain("`expectedCost`");
    expect(skippyFix).toMatch(/same database transaction.*before any debit/i);
    expect(skippyFix).toMatch(/price may change between the fresh quote and the database transaction/i);
    expect(skippyFix).not.toMatch(/no change to credits, prices or the ask transaction/i);
  });

  it("holds accepted-price consumers until the banded guard lands, then offers their green PRs", () => {
    const env = { ...process.env };
    delete env.SKIPWAIT_LEGACY_REVIEW_RULES;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { pickNextTask } from "./scripts/nextTaskCore.mjs";
      import { readFileSync } from "node:fs";
      const { tasks } = JSON.parse(readFileSync("docs/plans/assignments.json", "utf8"));
      const now = Date.parse("2026-11-21T00:00:00Z");
      const sha = "a".repeat(40);
      const outcomes = ["SKIPPY-fix", "D-174-held-ask-reconfirm"].map(id => {
        const consumer = tasks.find(task => task.id === id);
        if (!consumer) throw new Error("Missing accepted-price consumer: " + id);
        const pick = guardDone => pickNextTask({
          tasks: tasks.map(task => ({ ...task,
            status: task.id === id || (task.id === "BANDED-spend" && !guardDone) ? "todo" : "done",
          })),
          only: id,
          mainCi: { state: "green", sha },
          branches: new Map([[consumer.branch, { tipMs: now - 3 * 3_600_000, tipSha: sha, merged: false, work: true, markers: [] }]]),
          openPrs: new Map([[consumer.branch, "https://github.com/example/project/pull/1"]]),
          prCi: new Map([[consumer.branch, { state: "green", sha }]]),
          mergedHeads: new Map(), reports: [], register: [], claimant: "Queue fixture · routing", now,
        });
        return [id, pick(false).kind, pick(true).kind];
      });
      console.log(JSON.stringify(outcomes));
    `], { cwd: root, env, encoding: "utf8" });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      ["SKIPPY-fix", "ineligible", "land"],
      ["D-174-held-ask-reconfirm", "ineligible", "land"],
    ]);
  });

  it("makes S-6 audit events replay-safe and keeps the normal ask schema", () => {
    expect(skippyFix).toContain("`!out.session.replayed`");
    for (const field of [
      "attachmentCount", "pinnedWorkCount", "notifiedEmployees", "creditReserved",
      "coverageStatus", "fastTrack", "fromPost", "firstLook", "jobFunctionChosen",
    ]) expect(skippyFix).toContain(field);
    expect(skippyFix).toMatch(/both Skippy ask-log events.*not replayed/i);
  });

  it("separates the historical probe from the current-main re-check", () => {
    expect(skippyFix).toContain("9bd32abf");
    expect(skippyFix).toContain("badad4d6");
    expect(skippyFix).toMatch(/historical.*current-main.*re-check/i);
  });
});
