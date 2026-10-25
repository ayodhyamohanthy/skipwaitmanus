// @vitest-environment node
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
const assignmentData = JSON.parse(read("docs/plans/assignments.json")) as { tasks: Array<{ id: string; dependsOn?: string[] }> };
const skippyFixTask = assignmentData.tasks.find(task => task.id === "SKIPPY-fix");

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
    expect(skippyFixTask?.dependsOn).toContain("D-132-item3");
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
