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
