import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

// D-370 (owner, Nov 20 2026): no review dependency and no model dependency. The test run sets
// SKIPWAIT_LEGACY_REVIEW_RULES=on (vitest.config.ts) so older tests keep covering the switched-off path;
// these tests run the real modules in a child process with the switch unset, as CI and the picker do.
const env = { ...process.env };
delete env.SKIPWAIT_LEGACY_REVIEW_RULES;

function run(code: string) {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: process.cwd(), env, encoding: "utf8" });
  return { status: result.status, out: result.stdout.trim(), err: result.stderr };
}

describe("D-370 production default", () => {
  it("turns both rules off when the switch is unset", () => {
    const r = run(`import * as p from "./scripts/sessionPolicy.mjs"; console.log(JSON.stringify([p.INDEPENDENT_REVIEW_REQUIRED, p.MODEL_ROUTES_ENFORCED]));`);
    expect(r.err).toBe("");
    expect(JSON.parse(r.out)).toEqual([false, false]);
  });

  it("re-enables both rules only for the exact value on", () => {
    const on = spawnSync(process.execPath, ["--input-type=module", "-e", `import * as p from "./scripts/sessionPolicy.mjs"; console.log(JSON.stringify([p.INDEPENDENT_REVIEW_REQUIRED, p.MODEL_ROUTES_ENFORCED]));`], { env: { ...env, SKIPWAIT_LEGACY_REVIEW_RULES: "on" }, encoding: "utf8" });
    expect(JSON.parse(on.stdout.trim())).toEqual([true, true]);
    const other = spawnSync(process.execPath, ["--input-type=module", "-e", `import * as p from "./scripts/sessionPolicy.mjs"; console.log(p.INDEPENDENT_REVIEW_REQUIRED);`], { env: { ...env, SKIPWAIT_LEGACY_REVIEW_RULES: "true" }, encoding: "utf8" });
    expect(other.stdout.trim()).toBe("false");
  });

  it("passes the CI review gate with the D-370 notice, Tier 1 or not", () => {
    const r = run(`import { runReviewGate } from "./scripts/review-gate.mjs"; console.log("exit=" + runReviewGate({ local: true }));`);
    expect(r.out).toContain("no independent review is required (D-370");
    expect(r.out).toContain("exit=0");
  });

  it("never asks the picker for a review, even for a Tier 1 money change", () => {
    const r = run(`import { needsReview, reviewNeeded } from "./scripts/nextTaskCore.mjs";
      const v = { task: { tier: 1 }, reviewPaths: ["server/creditLedger.ts", "drizzle/0123_banded.sql"] };
      console.log(JSON.stringify([needsReview(v), needsReview({ task: { tier: 1 } }), reviewNeeded({ tier: 1, paths: v.reviewPaths })]));`);
    expect(r.err).toBe("");
    // The rule function still computes Tier 1; the picker just no longer acts on it.
    expect(JSON.parse(r.out)).toEqual([false, false, true]);
  });

  it("reads no model name: any session may report and take the CEO review", () => {
    const r = run(`import { isArchitect } from "./scripts/nextTaskCore.mjs";
      console.log(JSON.stringify(["Qwen 3 · k3f9", "Gemini · b336", "Claude Code · cf1f", "", "  "].map(isArchitect)));`);
    expect(JSON.parse(r.out)).toEqual([true, true, true, false, false]);
  });

  it("gives every model's session the out-of-owns notice", () => {
    const r = run(`import { solSessionOf } from "./scripts/scope-check.mjs";
      console.log(JSON.stringify([solSessionOf("T-1", ["Claim T-1: Qwen 3 · k3f9"]), solSessionOf("T-1", ["Takeover T-1: Cline · d8cd"]), solSessionOf("T-1", ["Claim T-2: Qwen 3 · k3f9"])]));`);
    expect(JSON.parse(r.out)).toEqual(["Qwen 3", "Cline", null]);
  });
});
