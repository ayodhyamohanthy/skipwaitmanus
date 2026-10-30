// CI-architect-real-checks (#748/#752): this file used to pin the
// LAUNCH-marker-ci-skip contract, where each required job skipped every
// `agent/reports/`, `agent/review/`, `agent/heartbeat/` and `agent/architect/`
// pull request. That rule skipped substantive architect packet pull requests
// too: PR #752 and PR #764 merged with all three required jobs skipped, which
// GitHub counts as passed.
//
// H1 (owner source review, Oct 28): the first correction replaced that with a
// job-level `if:` reading the event's changed-file counts, which left the same
// hole one level up - a wrong count meant the job never started and no
// classifier step ran. The contract pinned here is the correction:
//
// 1. No required job carries a job-level `if:`. Every one of them starts on
//    every event, so a skipped job can never hide a change again.
// 2. Each job classifies its own pinned diff first (`id: classify`), and only
//    `marker_only == 'true'` lets it skip steps.
// 3. The event counts survive only as `EVENT_CLAIMED_EMPTY`, an input the
//    classifier uses to fail the job red when the counts contradict the diff.
//    `toJSON()` is deliberate: it is the only way a GitHub expression can tell
//    the number 0 from the string "0" (packet E3).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ci = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "ci.yml"), "utf8");

const REQUIRED_JOBS = ["typecheck", "unit + component + route tests", "production build"] as const;
// D-239: the required list stays exactly the three jobs in the ruleset. The
// whole-file inventory assertions below must also account for the non-required
// `e2e journeys` job, which is named here explicitly so no job can appear
// silently. This union is used by those two assertions only.
const CI_JOBS = [...REQUIRED_JOBS, "e2e journeys"] as const;
/** The one gate every skippable step carries, byte for byte. */
const FAST_PATH_GATE = "${{ steps.classify.outputs.marker_only != 'true' }}";
/** The event-count claim, byte for byte: only ever an input to the classifier. */
const CLAIMED_EMPTY =
  "${{ github.event_name == 'pull_request' && toJSON(github.event.pull_request.changed_files) == '0' && toJSON(github.event.pull_request.additions) == '0' && toJSON(github.event.pull_request.deletions) == '0' }}";
const BASE_IS_DEFAULT =
  "${{ github.event_name == 'pull_request' && github.event.pull_request.base.ref == github.event.repository.default_branch }}";

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

/** The steps of one job, each as its own text block, in file order. */
function steps(jobName: string): string[] {
  return jobBlock(jobName)
    .split(/\n(?=      - )/)
    .filter((s) => s.trimStart().startsWith("- "));
}

function stepNamed(jobName: string, name: string): string {
  const step = steps(jobName).find((s) => s.includes(`- name: ${name}\n`));
  expect(step, `job "${jobName}" needs a step named "${name}"`).toBeTruthy();
  return step!;
}

describe("H1: every required job starts, and only its own classifier may skip steps", () => {
  for (const job of REQUIRED_JOBS) {
    it(`${job} keeps its required name`, () => {
      expect(ci).toContain(`name: ${job}\n`);
    });

    it(`${job} has no job-level if: - it always starts`, () => {
      const lines = jobBlock(job).split("\n");
      const jobIf = lines.find((l) => /^\s{4}if:\s/.test(l));
      expect(jobIf, `${job} must not skip itself on the event's counts`).toBeUndefined();
    });

    it(`${job} classifies its own pinned diff first`, () => {
      const block = jobBlock(job);
      const classify = stepNamed(job, "Classify the change from the pinned diff");
      expect(classify).toContain("id: classify");
      expect(classify).toContain("node scripts/classifyCiChange.mjs >> \"$GITHUB_OUTPUT\"");
      expect(classify).toContain("BASE_SHA: ${{ github.event.pull_request.base.sha }}");
      expect(classify).toContain("HEAD_SHA: ${{ github.event.pull_request.head.sha }}");
      expect(classify).toContain(`EVENT_CLAIMED_EMPTY: ${CLAIMED_EMPTY}`);
      expect(classify).toContain(`BASE_IS_DEFAULT_BRANCH: ${BASE_IS_DEFAULT}`);
      // The classify step is the first step that can fail the job; nothing
      // expensive runs before it.
      expect(block.indexOf("id: classify")).toBeLessThan(block.indexOf("pnpm install"));
    });

    it(`${job} reads a merge base before it trusts an empty diff`, () => {
      // L1: a depth-1 pair has no merge base, and an empty pinned pair cannot
      // prove the pull request is empty. The fetch deepens instead.
      const fetch = stepNamed(job, "Fetch the pinned base and head");
      expect(fetch).toContain("git merge-base");
      expect(fetch).toContain("--deepen=100");
      expect(fetch).toContain("continue-on-error: true");
    });

    it(`${job} never decides from a branch, a prefix, a label or another job`, () => {
      const runnable = jobBlock(job)
        .split("\n")
        .filter((line) => !line.trim().startsWith("#"))
        .join("\n");
      for (const banned of ["startsWith", "head_ref", "ref_name", "needs.", "agent/reports/", "agent/review/", "agent/heartbeat/", "agent/architect/", "agent/queue/landing"]) {
        expect(runnable, `${job} must not read ${banned}`).not.toContain(banned);
      }
    });
  }

  it("no required job needs another job (packet F1)", () => {
    expect(ci).not.toMatch(/^\s+needs:/m);
  });

  it("the event counts are an input to the classifier, never a skip rule", () => {
    const countLines = ci
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .filter((line) => line.includes("changed_files") || line.includes("additions") || line.includes("deletions"));
    expect(countLines.length).toBe(REQUIRED_JOBS.length);
    for (const line of countLines) {
      expect(line.trim().startsWith("EVENT_CLAIMED_EMPTY:"), `counts used outside the classifier input: ${line}`).toBe(true);
    }
  });

  it("no aggregate job hides a skipped required job", () => {
    const jobs = ci.slice(ci.indexOf("\njobs:")).split(/\n  (?=[a-zA-Z][\w-]*:\n)/).filter((b) => b.trim());
    const names = jobs.map((b) => /name: (.+)\n/.exec(b)?.[1]).filter(Boolean);
    expect(names.sort()).toEqual([...CI_JOBS].sort());
  });

  it("no branch prefix survives in any workflow instruction", () => {
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
      expect(CLAIMED_EMPTY).toContain(`toJSON(github.event.pull_request.${field}) == '0'`);
    }
    expect(CLAIMED_EMPTY).not.toMatch(/github\.event\.pull_request\.\w+ == 0/);
  });
});

describe("H1: the steps each job may skip on a verified empty diff", () => {
  it("the tests and build jobs skip only their expensive steps", () => {
    for (const [job, names] of [
      ["unit + component + route tests", ["Install dependencies", "Vitest"]],
      ["production build", ["Install dependencies", "Build", "Build with all goal surfaces on"]],
    ] as const) {
      for (const name of names) {
        expect(stepNamed(job, name), `${job} / ${name}`).toContain(`if: ${FAST_PATH_GATE}`);
      }
    }
  });

  it("the typecheck job always runs install and tsc, and skips only the scope check", () => {
    // #666's heap hunk occupies the only safe insertion point in the Typecheck
    // step (packet G2), so this job cannot fast-path its own typecheck. It runs
    // it, and the classifier still decides whether the scope check applies.
    for (const name of ["Install dependencies", "Typecheck", "Design tokens", "Deploy trigger coverage"]) {
      expect(stepNamed("typecheck", name), `typecheck / ${name} must always run`).not.toContain("if:");
    }
    expect(stepNamed("typecheck", "Scope check (declared file ownership)")).toContain(`if: ${FAST_PATH_GATE}`);
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
    expect(ci.match(/runs-on: ubuntu-latest/g)?.length).toBe(CI_JOBS.length);
  });

  it("keeps the blocking steps that already lived in the typecheck job", () => {
    for (const step of ["node scripts/design-token-audit.mjs", "node scripts/check-deploy-triggers.mjs", "node scripts/scope-check.mjs --branch", "pnpm check", "pnpm vitest run", "pnpm build"]) {
      expect(ci, `missing step ${step}`).toContain(step);
    }
  });
});

// D-239 F1 (P1): the whole-file test above asserts these commands exist
// somewhere in ci.yml, and `e2e journeys` runs `pnpm build` too, so a required
// job's own build could be turned into `echo skipped` and still pass. These
// additions assert each required job runs its own blocking commands inside its
// own job block; `CI_JOBS` is not used here.
describe("D-239 F1: each required job runs its own blocking commands", () => {
  const BLOCKING_COMMANDS: Record<(typeof REQUIRED_JOBS)[number], readonly string[]> = {
    typecheck: [
      "pnpm install --frozen-lockfile",
      "NODE_OPTIONS=--max-old-space-size=6144 pnpm check",
      "node scripts/design-token-audit.mjs",
      "node scripts/check-deploy-triggers.mjs",
      "node scripts/scope-check.mjs --branch",
    ],
    "unit + component + route tests": ["pnpm install --frozen-lockfile", "pnpm vitest run"],
    "production build": ["pnpm install --frozen-lockfile", "pnpm build"],
  };

  for (const job of REQUIRED_JOBS) {
    it(`${job} carries each of its blocking commands in its own job block`, () => {
      const block = jobBlock(job);
      for (const command of BLOCKING_COMMANDS[job]) {
        expect(block, `${job} must run ${command} itself`).toContain(command);
      }
    });
  }
});
