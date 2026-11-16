// @vitest-environment node
// D-314: a pull request whose red run predates D-292's named review-gate step failed only at the old
// "Scope check (declared file ownership)" step. That cannot be told apart from a real scope failure, so it
// stays MAKE GREEN (never REVIEW), but the hand-out says the cure first: merge origin/main so CI re-runs with
// the current workflow. Three rows sat in this state with "nothing to fix" reports (#955, #979, #938).
import { describe, expect, it } from "vitest";
import { GATE_STEP, LEGACY_SCOPE_STEP, gateOnlyRedFromJobs, legacyScopeRedFromJobs, pickNextTask } from "./nextTaskCore.mjs";
import { renderPick } from "./nextTaskText.mjs";

const NOW = Date.parse("2026-11-10T10:00:00+05:30");
const HOUR = 3_600_000;
const HEAD = "a".repeat(40);
const mainGreen = { state: "green", sha: "c".repeat(40), url: "https://ci/main" };

const ok = (name: string) => ({ name, conclusion: "success" });
const typecheck = (failing: string[]) => ({
  name: "typecheck", conclusion: failing.length ? "failure" : "success",
  steps: [ok("Typecheck"), ok("Design tokens"), ...failing.map(name => ({ name, conclusion: "failure" }))],
});
const run = (failing: string[], others: { name: string; conclusion: string }[] = [ok("e2e journeys"), ok("production build")]) => ({ jobs: [typecheck(failing), ...others] });

const task = (id: string, tier: number) => ({
  id, title: `${id} title`, row: id, packet: "docs/plans/FND-1-toolchain-and-test-collection.md", tier,
  lane: id.toLowerCase(), branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [] as string[],
  owns: [`server/${id.toLowerCase()}.ts`],
});
const pick = (t: ReturnType<typeof task>, ci: Record<string, unknown>) =>
  pickNextTask({
    tasks: [t], mainCi: mainGreen,
    branches: new Map([[t.branch, { tipMs: NOW - 3 * HOUR, tipSha: HEAD, merged: false, markers: [{ verb: "Claim", id: t.id, who: "DeepSeek · b1" }] }]]),
    openPrs: new Map([[t.branch, "https://github.com/o/r/pull/955"]]),
    prCi: new Map([[t.branch, { state: "red", sha: HEAD, url: "https://ci/run/9", ...ci }]]),
    mergedHeads: new Map(), reports: [], now: NOW, claimant: "Hark · me1", avoid: new Set(), register: null,
  });

describe("D-314: the legacy scope-check classifier", () => {
  it("is true only when the typecheck job failed at exactly the old scope-check step", () => {
    expect(legacyScopeRedFromJobs(run([LEGACY_SCOPE_STEP]))).toBe(true);
    expect(gateOnlyRedFromJobs(run([LEGACY_SCOPE_STEP]))).toBe(false);
  });

  it("fails closed on any other red, a second failure, or an unreadable list", () => {
    expect(legacyScopeRedFromJobs(run([GATE_STEP]))).toBe(false);
    expect(legacyScopeRedFromJobs(run(["Typecheck"]))).toBe(false);
    expect(legacyScopeRedFromJobs(run([LEGACY_SCOPE_STEP, "Deploy trigger coverage"]))).toBe(false);
    expect(legacyScopeRedFromJobs(run([LEGACY_SCOPE_STEP], [{ name: "production build", conclusion: "failure" }]))).toBe(false);
    expect(legacyScopeRedFromJobs(run([]))).toBe(false);
    expect(legacyScopeRedFromJobs(null)).toBe(false);
    expect(legacyScopeRedFromJobs({ jobs: [] })).toBe(false);
  });
});

describe("D-314: the hand-out for a stale-workflow red", () => {
  it("stays MAKE GREEN for Tier 1 and Tier 2, never REVIEW, and leads with merging main", () => {
    for (const tier of [1, 2]) {
      const picked = pick(task("T", tier), { legacyScope: true });
      expect(picked).toMatchObject({ kind: "green", task: { id: "T" }, legacyScope: true });
      const text = renderPick(picked, { who: "Hark · me1", date: "2026-11-10", claimed: false });
      expect(text).toContain("predates the current CI workflow");
      expect(text).toContain("First merge the latest origin/main into agent/queue/t");
      expect(text).toContain('Finding no code to fix is not "nothing to fix"');
    }
  });

  it("does not apply to a reading of a different head, and leaves an ordinary red's wording alone", () => {
    expect(pick(task("T", 1), { legacyScope: true, sha: "b".repeat(40) })).not.toHaveProperty("legacyScope");
    const plain = pick(task("T", 1), {});
    expect(plain).toMatchObject({ kind: "green" });
    expect(plain).not.toHaveProperty("legacyScope");
    expect(renderPick(plain, { who: "Hark · me1", date: "2026-11-10", claimed: false })).not.toContain("predates the current CI workflow");
  });
});
