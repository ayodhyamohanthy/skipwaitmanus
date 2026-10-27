// LAUNCH-marker-ci-skip: CI must skip marker branches (agent/reports/*,
// agent/review/*, agent/heartbeat/*, agent/architect/* and the landing lock
// agent/queue/landing) so the newest-100-runs window the picker reads is not
// flooded by PRs that never merge. This test reads .github/workflows/ci.yml
// and pins the job-level skip conditions; it must never pin a skip for main
// pushes or task branches.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ci = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "ci.yml"), "utf8");

const REQUIRED_JOBS = ["typecheck", "unit + component + route tests", "production build"] as const;
const PREFIXES = ["agent/reports/", "agent/review/", "agent/heartbeat/", "agent/architect/"] as const;

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

describe("LAUNCH-marker-ci-skip: every required CI job skips marker branches", () => {
  for (const job of REQUIRED_JOBS) {
    it(`${job} carries a job-level skip condition`, () => {
      const block = jobBlock(job);
      const ifLine = block.split("\n").find((l) => /^\s+if:\s/.test(l));
      expect(ifLine, `${job} needs a job-level if:`).toBeTruthy();
      for (const prefix of PREFIXES) {
        expect(ifLine!, `${job} if: must skip head_ref prefix ${prefix}`).toContain(`startsWith(github.head_ref, '${prefix}')`);
      }
      expect(ifLine!, `${job} if: must skip the landing lock branch`).toContain("github.head_ref == 'agent/queue/landing'");
      expect(ifLine!, `${job} if: must only apply to pull_request events`).toContain("pull_request");
    });
    it(`${job} skip condition never mentions main or push`, () => {
      const block = jobBlock(job);
      const ifLine = block.split("\n").find((l) => /^\s+if:\s/.test(l));
      expect(ifLine ?? "", "no condition may name main").not.toContain("main");
      expect(ifLine ?? "", "no condition may name push").not.toContain("push");
    });
  }
});
