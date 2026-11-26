// @vitest-environment node
// OPS-live-qa-hardening (D-387): a password reset starts signed-in live QA itself. GitHub creates no workflow_run event
// for a run started with the workflow's GITHUB_TOKEN, so the reset deploy (run 45361666119, Nov 24) started no live QA.
// The reset job therefore waits for the exact deploy it dispatched and then dispatches live QA, which GITHUB_TOKEN may do.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const RESET = readFileSync(path.join(root, ".github/workflows/reviewer-qa-passwords.yml"), "utf8");
const LIVE_QA = readFileSync(path.join(root, ".github/workflows/live-qa.yml"), "utf8");
const at = (needle: string) => RESET.indexOf(needle);

describe("reviewer password reset workflow", () => {
  it("still refuses without the typed confirmation, before any dispatch", () => {
    expect(at("confirm must equal reset")).toBeGreaterThan(0);
    expect(at("confirm must equal reset")).toBeLessThan(at("gh workflow run deploy-api.yml"));
  });

  it("dispatches the reset deploy, then waits for that exact run and fails when it does not succeed", () => {
    expect(RESET).toContain("gh workflow run deploy-api.yml --ref main -f reset_reviewer_passwords=true");
    expect(RESET).toMatch(/gh run list --workflow deploy-api\.yml --event workflow_dispatch --branch main/);
    expect(RESET).toMatch(/gh run watch "\$\w+" --exit-status/);
    expect(at("gh workflow run deploy-api.yml")).toBeLessThan(at("gh run watch"));
    expect(RESET).toMatch(/::error::[^\n]*deploy/i);
  });

  it("dispatches signed-in live QA on main only after the deploy succeeded", () => {
    expect(RESET).toContain("gh workflow run live-qa.yml --ref main -f roles=both");
    expect(at("gh run watch")).toBeLessThan(at("gh workflow run live-qa.yml"));
  });

  it("allows the wait: a job timeout above the deploy's typical 15 minutes, with actions write to dispatch", () => {
    const timeout = Number(RESET.match(/timeout-minutes: (\d+)/)?.[1]);
    expect(timeout).toBeGreaterThanOrEqual(60);
    expect(RESET).toMatch(/permissions:\n\s+contents: read\n\s+actions: write/);
  });

  it("never passes credential material in inputs, arguments or logs", () => {
    expect(RESET).not.toMatch(/secrets\./);
    expect(RESET).not.toMatch(/-f (?!reset_reviewer_passwords=true|roles=both)\w+=/);
  });
});

describe("live QA workflow", () => {
  it("can be dispatched with the roles input the reset job sends", () => {
    expect(LIVE_QA).toMatch(/^on:\n  workflow_dispatch:\n    inputs:\n      roles:/m);
    expect(LIVE_QA).toMatch(/options: \[both, seeker, referrer\]/);
  });
});

// QA-auto-issues (D-409): scheduled every 6 hours, and failures become bug issues from this job only.
describe("live QA files its own bugs (D-409)", () => {
  it("also runs on a 6-hour schedule, never on push or pull_request", () => {
    expect(LIVE_QA).toMatch(/schedule:\n\s+- cron: "17 \*\/6 \* \* \*"/);
    expect(LIVE_QA).toContain("github.event_name == 'schedule'");
    expect(LIVE_QA).not.toMatch(/^\s+(push|pull_request|pull_request_target):/m);
  });

  it("grants issues: write to the live-qa job only, keeping the workflow token read-only", () => {
    expect(LIVE_QA).toMatch(/^permissions:\n  contents: read\n/m);
    expect(LIVE_QA).toMatch(/    permissions:\n      contents: read\n      issues: write/);
  });

  it("files bugs after every navigate run, even a failing one, with the run link and no secret", () => {
    const step = LIVE_QA.slice(LIVE_QA.indexOf("name: File bugs for failures"), LIVE_QA.indexOf("name: Upload screenshots and summary"));
    expect(step).toContain("always()");
    expect(step).toContain("inputs.mode != 'journeys'");
    expect(step).toContain("node scripts/qa-file-bugs.mjs live-qa/summary.json");
    expect(step).toContain("GH_TOKEN: ${{ github.token }}");
    expect(step).not.toMatch(/secrets\./);
    expect(LIVE_QA.indexOf("node scripts/live-qa-signed-in.mjs")).toBeLessThan(LIVE_QA.indexOf("node scripts/qa-file-bugs.mjs"));
  });
});
