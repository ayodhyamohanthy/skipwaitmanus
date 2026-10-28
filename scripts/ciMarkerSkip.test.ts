// CI-architect-real-checks (#748/#752): this file used to pin the
// LAUNCH-marker-ci-skip contract, where each required job skipped every
// `agent/reports/`, `agent/review/`, `agent/heartbeat/` and `agent/architect/`
// pull request. That rule skipped substantive architect packet pull requests
// too: PR #752 and PR #764 merged with all three required jobs skipped, which
// GitHub counts as passed.
//
// The contract pinned here is the replacement. A required job may skip only
// when the pull request's own diff is empty, as counted by GitHub at the pinned
// base and head: `changed_files`, `additions` and `deletions` all exactly the
// number 0. A branch name, title, message or label is never an input. Every
// other case, including a missing or malformed count, runs the full steps.
//
// `toJSON()` is deliberate: it is the only way a GitHub expression can tell the
// number 0 from the string "0", because `==` coerces. A string count must never
// reach the fast path (packet E3).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ci = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "ci.yml"), "utf8");

const REQUIRED_JOBS = ["typecheck", "unit + component + route tests", "production build"] as const;
/** The one condition all three required jobs carry, byte for byte. */
const FAST_PATH_IF =
  "${{ !(github.event_name == 'pull_request' && toJSON(github.event.pull_request.changed_files) == '0' && toJSON(github.event.pull_request.additions) == '0' && toJSON(github.event.pull_request.deletions) == '0') }}";

// Extract one job's block: from its key line (two-space indent under `jobs:`)
// up to the next key at the same indent or end of file.
function jobBlock(jobName: string): string {
  const jobsStart = ci.indexOf("\njobs:");
  expect(jobsStart).toBeGreaterThan(-1);
  const rest = ci.slice(jobsStart);
  const blocks = rest.split(/\n  (?=[a-zA-Z][\w-]*:\n)/);
  const block = blocks.find((b) => b.includes(`name: ${jobName}\n`));
  expect(block, `job named "${jobName}" must exist in ci.yml`).toBeTruthy();
  return block!;
}

function jobIfLine(jobName: string): string {
  const line = jobBlock(jobName).split("\n").find((l) => /^\s{4}if:\s/.test(l));
  expect(line, `${jobName} needs a job-level if:`).toBeTruthy();
  return line!.replace(/^\s{4}if:\s*/, "");
}

describe("CI-architect-real-checks: the required jobs skip only an empty diff", () => {
  for (const job of REQUIRED_JOBS) {
    it(`${job} keeps its required name`, () => {
      expect(ci).toContain(`name: ${job}\n`);
    });

    it(`${job} carries the shared empty-diff condition, byte for byte`, () => {
      expect(jobIfLine(job)).toBe(FAST_PATH_IF);
    });

    it(`${job} never decides from a branch, a prefix, a label or another job`, () => {
      const condition = jobIfLine(job);
      for (const banned of ["startsWith", "head_ref", "base_ref", "ref_name", "github.ref", "needs.", "agent/", "label"]) {
        expect(condition, `${job} if: must not mention ${banned}`).not.toContain(banned);
      }
    });

    it(`${job} still runs on a push to main and on a dispatch`, () => {
      // The condition is gated on `pull_request`, so both other events fall through to running.
      expect(jobIfLine(job)).toContain("github.event_name == 'pull_request'");
      expect(jobIfLine(job)).not.toContain("main");
      expect(jobIfLine(job)).not.toContain("push");
    });

    it(`${job} classifies the pinned diff inside its own job`, () => {
      const block = jobBlock(job);
      expect(block).toContain("scripts/classifyCiChange.mjs --expect-substantive");
      expect(block).toContain("BASE_SHA: ${{ github.event.pull_request.base.sha }}");
      expect(block).toContain("HEAD_SHA: ${{ github.event.pull_request.head.sha }}");
      expect(block).toContain('>> "$GITHUB_OUTPUT"');
    });
  }

  it("no required job needs another job (packet F1)", () => {
    expect(ci).not.toMatch(/^\s+needs:/m);
  });

  it("no aggregate job hides a skipped required job", () => {
    const jobs = ci.slice(ci.indexOf("\njobs:")).split(/\n  (?=[a-zA-Z][\w-]*:\n)/).filter((b) => b.trim());
    const names = jobs.map((b) => /name: (.+)\n/.exec(b)?.[1]).filter(Boolean);
    expect(names.sort()).toEqual([...REQUIRED_JOBS].sort());
  });

  it("no branch prefix survives in any workflow instruction", () => {
    // Comments may still explain the retired rule; no runnable line may use it.
    const instructions = ci
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    for (const prefix of ["agent/reports/", "agent/review/", "agent/heartbeat/", "agent/architect/", "agent/queue/landing"]) {
      expect(instructions, `${prefix} must not be a CI input`).not.toContain(prefix);
    }
  });

  it("the count comparison cannot accept the string \"0\"", () => {
    for (const field of ["changed_files", "additions", "deletions"]) {
      expect(FAST_PATH_IF).toContain(`toJSON(github.event.pull_request.${field}) == '0'`);
    }
    // A bare `== 0` would coerce "0" to 0 and skip a real change.
    expect(FAST_PATH_IF).not.toMatch(/github\.event\.pull_request\.\w+ == 0/);
  });
});

describe("CI-architect-real-checks: what must not move", () => {
  it("keeps #666's typecheck hunk byte for byte, with nothing added inside it", () => {
    const lines = ci.split("\n");
    const start = lines.indexOf("      - name: Typecheck");
    expect(start, "the Typecheck step must exist").toBeGreaterThan(-1);
    expect(lines.slice(start, start + 4).join("\n")).toBe(
      [
        "      - name: Typecheck",
        "        # tsc needs more than the default old-space on this tree; OOM exits 1",
        "        # with no diagnostics (verified: 8GB local run passes with zero errors).",
        "        run: NODE_OPTIONS=--max-old-space-size=6144 pnpm check",
      ].join("\n"),
    );
    // Packet G2: #666's merge must be a no-op, so nothing may be added inside
    // this step. The next line is a comment for the following step, not a key.
    expect(/^\s{8}\S/.test(lines[start + 4]), `added inside the Typecheck step: ${lines[start + 4]}`).toBe(false);
  });

  it("keeps the triggers, the concurrency group and the job runners", () => {
    expect(ci).toContain("on:\n  pull_request:\n  push:\n    branches: [main]\n  workflow_dispatch:\n");
    expect(ci).toContain("concurrency:\n  group: ci-${{ github.ref }}\n  cancel-in-progress: true\n");
    expect(ci.match(/runs-on: ubuntu-latest/g)?.length).toBe(REQUIRED_JOBS.length);
  });

  it("keeps the blocking steps that already lived in the typecheck job", () => {
    for (const step of ["node scripts/design-token-audit.mjs", "node scripts/check-deploy-triggers.mjs", "node scripts/scope-check.mjs --branch", "pnpm check", "pnpm vitest run", "pnpm build"]) {
      expect(ci, `missing step ${step}`).toContain(step);
    }
  });
});
