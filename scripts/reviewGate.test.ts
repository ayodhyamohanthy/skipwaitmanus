import { describe, expect, it } from "vitest";
import { REVIEW_GATE_FAIL, TIER_FLOOR_FAIL, findGateRow, isStatusOnlyChange, resolveReviewTarget, reviewGateViolation, reviewedOf } from "./review-gate.mjs";
import { classifyTier, tierReasonPaths } from "./tierClassifyCore.mjs";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { markerSubject } from "./nextTaskCore.mjs";

describe("GATE-merge-queue target binding", () => {
  const queued = "c".repeat(40);
  const pull = { number: 42, state: "open", head: { ref: "agent/queue/t1", sha: "a".repeat(40) }, base: { ref: "main" } };
  const input = () => ({
    eventName: "merge_group", ref: `refs/heads/gh-readonly-queue/main/pr-42-${queued}`,
    event: { merge_group: { head_sha: queued, head_ref: `refs/heads/gh-readonly-queue/main/pr-42-${queued}`, base_ref: "refs/heads/main" } },
    localHead: queued, headRef: "", readPullRequest: (number: number) => { expect(number).toBe(42); return pull; },
    isAncestor: (head: string, group: string) => head === pull.head.sha && group === queued,
  });
  const resolveTarget = (over = {}) => {
    return resolveReviewTarget({ ...input(), ...over });
  };

  it("resolves the queued PR head rather than the synthetic merge head", () => {
    expect(resolveTarget()).toEqual({ branch: pull.head.ref, head: pull.head.sha });
  });

  it("leaves ordinary pull request and local targets unchanged without an API read", () => {
    const readPullRequest = () => { throw new Error("unexpected API read"); };
    expect(resolveTarget({ eventName: "pull_request", event: { pull_request: { head: { sha: pull.head.sha } } }, headRef: pull.head.ref, readPullRequest }))
      .toEqual({ branch: pull.head.ref, head: pull.head.sha });
    expect(resolveTarget({ eventName: "", event: {}, headRef: "local-branch", readPullRequest }))
      .toEqual({ branch: "local-branch", head: queued });
  });

  it.each([
    { ref: "refs/heads/main" },
    { ref: `refs/heads/gh-readonly-queue/main/pr-0-${queued}` },
    { event: { merge_group: { head_sha: queued, head_ref: input().ref, base_ref: "refs/heads/other" } } },
    { localHead: "d".repeat(40) },
    { event: { merge_group: { head_sha: queued, head_ref: "other", base_ref: "refs/heads/main" } } },
    { isAncestor: () => false },
    { readPullRequest: () => ({ ...pull, state: "closed" }) },
    { readPullRequest: () => ({ ...pull, number: 43 }) },
    { readPullRequest: () => ({ ...pull, head: { ...pull.head, sha: "invalid" } }) },
    { readPullRequest: () => ({ ...pull, base: { ref: "other" } }) },
    { readPullRequest: () => { throw new Error("API unavailable"); } },
  ])("refuses an unbound or unreadable queue target (%#)", over => {
    expect(() => resolveTarget(over)).toThrow();
  });

  it("uses exactly the PR review result for passes, missing reviews, stale reviews and findings", () => {
    const target = resolveTarget();
    const verdicts = [passOn(HEAD), [], passOn(REVIEWED), [{ verb: "Verdict", id: "T1", who: "Reviewer · r1", verdict: "findings", reviewed: HEAD }]];
    for (const lockMarkers of verdicts) {
      expect(gate({ head: target.head, lockMarkers })).toEqual(gate({ head: HEAD, lockMarkers }));
    }
  });

  it("runs required jobs and the named review step for merge_group checks_requested", () => {
    const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
    expect(workflow).toMatch(/\n  merge_group:\n    types: \[checks_requested\]/);
    const step = workflow.split("- name: Review gate (independent Tier 1 pass)")[1]?.split("- name:")[0];
    expect(step).toContain("github.event_name == 'merge_group'");
    expect(step).toContain("GH_TOKEN: ${{ github.token }}");
    expect(workflow).toMatch(/name: typecheck\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n      pull-requests: read/);
    for (const name of ["typecheck", "unit + component + route tests", "production build"]) expect(workflow).toContain(`name: ${name}`);
  });

  it("evaluates the real CLI on a shallow queue checkout: no review fails, a PR-head pass succeeds, and API failure fails closed", () => {
    const root = mkdtempSync(join(tmpdir(), "merge-queue-gate-"));
    try {
      const src = join(root, "src");
      const bare = join(root, "origin.git");
      const ck = join(root, "checkout");
      const bin = join(root, "bin");
      const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" };
      const g = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
      g(root, "init", "-q", "--bare", "-b", "main", bare);
      g(root, "init", "-q", "-b", "main", src);
      mkdirSync(join(src, "docs/plans"), { recursive: true });
      writeFileSync(join(src, "docs/plans/assignments.json"), JSON.stringify({ tasks: [task1] }));
      g(src, "add", ".");
      g(src, "commit", "-qm", "main");
      g(src, "remote", "add", "origin", `file://${bare}`);
      g(src, "push", "-q", "origin", "main");
      g(src, "checkout", "-qb", task1.branch);
      g(src, "commit", "-q", "--allow-empty", "-m", markerSubject("Claim", task1.id, "Builder · b1"));
      mkdirSync(join(src, "server"));
      writeFileSync(join(src, "server/payments.ts"), "money fixture\n");
      g(src, "add", ".");
      g(src, "commit", "-qm", "work");
      const head = g(src, "rev-parse", "HEAD");
      g(src, "push", "-q", "origin", task1.branch);
      g(src, "checkout", "-qb", "queue", "main");
      g(src, "merge", "-q", "--no-ff", "-m", "queue merge", task1.branch);
      const group = g(src, "rev-parse", "HEAD");
      const ref = `refs/heads/gh-readonly-queue/main/pr-42-${group}`;
      g(src, "push", "-q", "origin", `HEAD:${ref}`);
      g(root, "clone", "-q", "--depth=1", "--branch", ref.slice("refs/heads/".length), `file://${bare}`, ck);
      expect(g(ck, "rev-parse", "--is-shallow-repository")).toBe("true");
      mkdirSync(bin);
      const stub = join(bin, "gh");
      writeFileSync(stub, `#!${process.execPath}\nif (process.argv.slice(2).join(' ') !== 'api repos/fixture/repo/pulls/42') process.exit(2);\nprocess.stdout.write(process.env.QUEUE_PULL_JSON || 'invalid');\n`);
      chmodSync(stub, 0o755);
      const eventPath = join(root, "event.json");
      writeFileSync(eventPath, JSON.stringify({ merge_group: { head_ref: ref, head_sha: group, base_ref: "refs/heads/main" } }));
      const run = (json = JSON.stringify({ number: 42, state: "open", head: { ref: task1.branch, sha: head }, base: { ref: "main" } })) => {
        const result = spawnSync(process.execPath, [new URL("./review-gate.mjs", import.meta.url).pathname], {
          cwd: ck, encoding: "utf8", env: { ...env, PATH: `${bin}:${env.PATH}`, GITHUB_HEAD_REF: "", GITHUB_EVENT_NAME: "merge_group", GITHUB_REF: ref, GITHUB_EVENT_PATH: eventPath, GITHUB_REPOSITORY: "fixture/repo", QUEUE_PULL_JSON: json },
        });
        return { code: result.status, out: `${result.stdout}\n${result.stderr}` };
      };
      const missing = run();
      expect(missing.code).toBe(1);
      expect(missing.out).toContain("Nobody has reviewed T1 yet");
      g(src, "checkout", "-qb", "agent/review/t1", "main");
      g(src, "commit", "-q", "--allow-empty", "-m", markerSubject("Verdict", task1.id, "Reviewer · r1", "pass"), "-m", `reviewed ${head}`);
      g(src, "push", "-q", "origin", "agent/review/t1");
      const passed = run();
      expect(passed.code).toBe(0);
      expect(passed.out).toContain(`T1 at ${head.slice(0, 8)} has an independent passing review`);
      const unavailable = run("invalid");
      expect(unavailable.code).toBe(1);
      expect(unavailable.out).toContain("failing closed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 90_000);
});


// PROCESS-review-gate (D-166, docs/plans/PROCESS-gates.md): a Tier 1 row merges only after an
// independent pass verdict that names its exact head (or a head that only merged main after it).
type Marker = { verb: string; id: string; who: string; verdict?: string; reviewed?: string | null };

const HEAD = "a".repeat(40);
const REVIEWED = "b".repeat(40);
const task1 = { id: "T1", tier: 1, branch: "agent/queue/t1" };
const task2 = { id: "T2", tier: 2, branch: "agent/queue/t2" };
const built: Marker[] = [{ verb: "Claim", id: "T1", who: "Instinct · b1" }];
const passOn = (reviewed: string | null, who = "Mistral · r1"): Marker[] => [
  { verb: "Review claim", id: "T1", who },
  { verb: "Verdict", id: "T1", who, verdict: "pass", reviewed },
];
// The commits of the head's own history after the reviewed one that are not merges and not on main.
const onlyMergesSince = () => [];
const ownCommitSince = () => ["c0ffee0"];

const gate = (over: Partial<Parameters<typeof reviewGateViolation>[0]> = {}) => reviewGateViolation({
  head: HEAD, workMarkers: built, lockMarkers: passOn(HEAD), nonMergeCommitsSince: ownCommitSince, ...over,
  task: "task" in over ? over.task : task1,
});


describe("PROCESS-review-gate", () => {
  it("passes a Tier 1 head whose independent pass verdict names that exact head", () => {
    expect(gate()).toBeNull();
  });

  it("passes after a merge of main only (every own commit since the review is a merge)", () => {
    expect(gate({ lockMarkers: passOn(REVIEWED), nonMergeCommitsSince: onlyMergesSince })).toBeNull();
  });

  it("fails after a non-merge commit of the branch's own since the review", () => {
    expect(gate({ lockMarkers: passOn(REVIEWED), nonMergeCommitsSince: ownCommitSince })).toContain(REVIEW_GATE_FAIL);
  });

  it("fails when the reviewed commit is not in this head's history", () => {
    expect(gate({ lockMarkers: passOn(REVIEWED), nonMergeCommitsSince: () => null })).toContain(REVIEW_GATE_FAIL);
  });

  it("fails when the reviewer's session also built the work; another session of the same model may review (D-344 (1))", () => {
    expect(gate({ lockMarkers: passOn(HEAD, "Instinct · b1") })).toContain(REVIEW_GATE_FAIL);
    expect(gate({ workMarkers: [...built, { verb: "Takeover", id: "T1", who: "Mistral · r1" }] })).toContain(REVIEW_GATE_FAIL);
    expect(gate({ lockMarkers: passOn(HEAD, "Instinct · r9") })).toBeNull();
  });

  it("fails when the reviewer's session also fixed the work; another session of the same model may pass it (D-344 (1))", () => {
    const fixedThen = (reviewer: string): Marker[] => [
      { verb: "Review claim", id: "T1", who: "Kimi · r1" }, { verb: "Verdict", id: "T1", who: "Kimi · r1", verdict: "findings", reviewed: REVIEWED },
      { verb: "Fix claim", id: "T1", who: "Mistral · f1" }, { verb: "Fixed", id: "T1", who: "Mistral · f1" },
      ...passOn(HEAD, reviewer),
    ];
    expect(gate({ lockMarkers: fixedThen("Mistral · f1") })).toContain(REVIEW_GATE_FAIL);
    expect(gate({ lockMarkers: fixedThen("Mistral · r2") })).toBeNull();
  });

  it("fails with findings as the last verdict, and with no review at all", () => {
    const findings: Marker[] = [{ verb: "Review claim", id: "T1", who: "Kimi · r1" }, { verb: "Verdict", id: "T1", who: "Kimi · r1", verdict: "findings", reviewed: HEAD }];
    expect(gate({ lockMarkers: findings })).toContain(REVIEW_GATE_FAIL);
    expect(gate({ lockMarkers: [] })).toContain(REVIEW_GATE_FAIL);
    expect(gate({ lockMarkers: [{ verb: "Review claim", id: "T1", who: "Kimi · r1" }] })).toContain(REVIEW_GATE_FAIL);
  });

  it("fails when a fix round came after the pass", () => {
    const lockMarkers: Marker[] = [...passOn(HEAD), { verb: "Fix claim", id: "T1", who: "Kimi · f1" }, { verb: "Fixed", id: "T1", who: "Kimi · f1" }];
    expect(gate({ lockMarkers })).toContain(REVIEW_GATE_FAIL);
  });

  it("passes a Land claim whose nearest earlier verdict is a pass on this head", () => {
    expect(gate({ lockMarkers: [...passOn(HEAD), { verb: "Land claim", id: "T1", who: "Kimi · l1" }] })).toBeNull();
    const landAfterFindings: Marker[] = [...passOn(HEAD), { verb: "Verdict", id: "T1", who: "Mistral · r1", verdict: "findings", reviewed: HEAD }, { verb: "Land claim", id: "T1", who: "Kimi · l1" }];
    expect(gate({ lockMarkers: landAfterFindings })).toContain(REVIEW_GATE_FAIL);
  });

  it("ignores heartbeats and markers of other tasks on the lock", () => {
    const lockMarkers: Marker[] = [...passOn(HEAD), { verb: "Heartbeat", id: "T1", who: "Mistral · r1" }, { verb: "Fix claim", id: "OTHER", who: "Kimi · f1" }];
    expect(gate({ lockMarkers })).toBeNull();
  });

  it("passes a Tier 2 or Tier 3 row and no row at all", () => {
    const plainPaths = ["server/jobLinkPreviewRoutes.ts"];
    const tierOfPlain = (changes: Parameters<typeof classifyTier>[0]) => classifyTier(changes).tier;
    expect(gate({ task: task2, lockMarkers: [], tierOf: tierOfPlain, changedPaths: plainPaths })).toBeNull();
    expect(gate({ task: { ...task2, tier: 3 }, lockMarkers: [], tierOf: tierOfPlain, changedPaths: plainPaths })).toBeNull();
    expect(gate({ task: null, lockMarkers: [] })).toBeNull();
  });

  it("fails a verdict recorded before this change (no body) and tells the reviewer to re-record it on the current head", () => {
    const message = gate({ lockMarkers: passOn(null) });
    expect(message).toContain(REVIEW_GATE_FAIL);
    expect(message).toContain("re-record");
    expect(message).toContain("--verdict pass");
  });

  it("reads the reviewed head from a verdict marker's body", () => {
    expect(reviewedOf(`reviewed ${HEAD}`)).toBe(HEAD);
    expect(reviewedOf(`reviewed ${HEAD}\n`)).toBe(HEAD);
    expect(reviewedOf("")).toBeNull();
    expect(reviewedOf("reviewed not-a-sha")).toBeNull();
  });

  it("finds the row as the queue gate does: its own branch, or a marker branch of its slug", () => {
    const tasks = [task1, task2];
    expect(findGateRow(tasks, "agent/queue/t1")).toBe(task1);
    expect(findGateRow(tasks, "agent/review/t2")).toBe(task2);
    expect(findGateRow(tasks, "agent/architect/t1")).toBe(task1);
    expect(findGateRow(tasks, "agent/instinct/t1")).toBeNull();
    expect(findGateRow(tasks, "claude/docs")).toBeNull();
  });
});

// The landing steps make one more commit after the review: the status commit (the task's
// "status" in docs/plans/assignments.json and its line in the packet's Status section). PR #819
// (D-048-p3-plans) failed on exactly that: head 653125b4 changed only those two lines after the
// reviewed 9f66f1ed. A status commit keeps the pass; anything else after the review does not.
const PACKET_BEFORE = ["# D-048", "", "## Rows", "- `D-048-p3-plans`: owns client/src/pages/goal/plans/**", "", "## Status", "", "- `D-048-p3-plans`: review — branch — 02590e56", "- `D-048-p3-premium`: not started", ""].join("\n");
const PACKET_AFTER = PACKET_BEFORE.replace("review — branch — 02590e56", "done — 9f66f1ed — landed");
const ROWS_BEFORE = ['{', '  "tasks": [', '    {', '      "id": "D-048-p3-plans",', '      "tier": 1,', '      "status": "in-review",', '      "syncedTo": "D-227"', '    }', '  ]', '}', ''].join("\n");
const ROWS_AFTER = ROWS_BEFORE.replace('"status": "in-review"', '"status": "done"');
const statusCommitOf819 = [
  { path: "docs/plans/D-048-money.md", before: PACKET_BEFORE, after: PACKET_AFTER, removed: [8], added: [8] },
  { path: "docs/plans/assignments.json", before: ROWS_BEFORE, after: ROWS_AFTER, removed: [6], added: [6] },
];

describe("PROCESS-review-gate: the status commit a landing makes keeps the pass", () => {
  it("reads the #819 status commit (assignments.json status + packet Status line) as status-only", () => {
    expect(isStatusOnlyChange(statusCommitOf819)).toBe(true);
    expect(isStatusOnlyChange([statusCommitOf819[1]])).toBe(true);
    expect(isStatusOnlyChange([statusCommitOf819[0]])).toBe(true);
  });

  it("does not read a code change, a packet edit outside Status, or another assignments field as status-only", () => {
    expect(isStatusOnlyChange([...statusCommitOf819, { path: "client/src/pages/Billing.tsx", before: "a\n", after: "b\n", removed: [1], added: [1] }])).toBe(false);
    expect(isStatusOnlyChange([{ path: "docs/plans/D-048-money.md", before: PACKET_BEFORE, after: PACKET_BEFORE.replace("owns client", "owns server"), removed: [4], added: [4] }])).toBe(false);
    expect(isStatusOnlyChange([{ path: "docs/plans/assignments.json", before: ROWS_BEFORE, after: ROWS_BEFORE.replace('"tier": 1', '"tier": 2'), removed: [5], added: [5] }])).toBe(false);
    expect(isStatusOnlyChange([{ path: "docs/plans/sub/x.md", before: PACKET_BEFORE, after: PACKET_AFTER, removed: [8], added: [8] }])).toBe(false);
    expect(isStatusOnlyChange([])).toBe(false);
  });

  it("passes #819's shape: the reviewed commit, a merge of main, then only the status commit", () => {
    const sinceReview = () => ["653125b4"];
    expect(gate({ lockMarkers: passOn(REVIEWED), nonMergeCommitsSince: sinceReview, isStatusCommit: (sha: string) => sha === "653125b4" })).toBeNull();
  });

  it("still fails when a code commit follows the review, with or without a status commit beside it", () => {
    const isStatusCommit = (sha: string) => sha === "653125b4";
    expect(gate({ lockMarkers: passOn(REVIEWED), nonMergeCommitsSince: () => ["c0ffee0"], isStatusCommit })).toContain(REVIEW_GATE_FAIL);
    const mixed = gate({ lockMarkers: passOn(REVIEWED), nonMergeCommitsSince: () => ["c0ffee0", "653125b4"], isStatusCommit });
    expect(mixed).toContain(REVIEW_GATE_FAIL);
    expect(mixed).toContain("1 commit(s)");
  });
});

// GATE-tier-floor (D-212): the gate uses the higher of the row's declared tier and the tier the
// changed paths compute, so a money or sign-in change filed as Tier 2 still needs an independent pass.
describe("GATE-tier-floor: the computed tier raises a declared Tier 2 row", () => {
  const money = [{ path: "server/payments.ts", added: ["+  const refund = 1;"], removed: [], context: [] }];
  const plain = [{ path: "server/jobLinkPreviewRoutes.ts", added: ["+  return ok;"], removed: [], context: [] }];
  const tierOfPaths = (changes: Parameters<typeof classifyTier>[0]) => classifyTier(changes).tier;
  const task2WithWork = { ...task2, tier: task2.tier };

  it("computes the money path Tier 1 and the plain path Tier 2", () => {
    expect(tierOfPaths(money)).toBe(1);
    expect(tierOfPaths(plain)).toBe(2);
  });

  it("fails a declared Tier 2 row whose diff is Tier 1 by path, naming the Tier 1 paths and the cure", () => {
    const violation = gate({ task: task2WithWork, workMarkers: [], lockMarkers: [], tierOf: tierOfPaths, tierReasonPaths, changedPaths: money });
    expect(String(violation)).toContain(TIER_FLOOR_FAIL);
    expect(String(violation)).toContain("server/payments.ts");
    expect(String(violation)).toContain("docs/plans/assignments.json");
  });

  it("passes that row once an independent pass on the head exists", () => {
    const lockMarkers = [
      { verb: "Review claim", id: "T2", who: "Mistral · r1" },
      { verb: "Verdict", id: "T2", who: "Mistral · r1", verdict: "pass", reviewed: HEAD },
    ];
    expect(gate({ task: task2WithWork, workMarkers: [], lockMarkers, tierOf: tierOfPaths, changedPaths: money })).toBeNull();
  });

  it("leaves a declared Tier 2 row whose diff is Tier 2 alone", () => {
    expect(gate({ task: task2WithWork, workMarkers: [], lockMarkers: [], tierOf: tierOfPaths, changedPaths: plain })).toBeNull();
  });

  it("D-352: a declared Tier 1 row whose diff is client UI only lands on green CI with no review; Tier 1 paths still need one", () => {
    const ui = ["client/src/pages/goal/profile/GoalProfile.tsx", "client/src/lib/goalSurfaces.ts"];
    expect(gate({ task: task1, workMarkers: [], lockMarkers: [], tierOf: tierOfPaths, changedPaths: ui })).toBeNull();
    expect(String(gate({ task: task1, workMarkers: [], lockMarkers: [], tierOf: tierOfPaths, changedPaths: money }))).toContain(REVIEW_GATE_FAIL);
  });

  it("backstop: a declared Tier 1 row touching server, shared, migration or worker code keeps its review even when the classifier computes Tier 2", () => {
    for (const path of ["server/creditCycles.ts", "shared/planReach.ts", "drizzle/0200_x.sql", "src/worker.ts", "functions/_middleware.ts"]) {
      expect(String(gate({ task: task1, workMarkers: [], lockMarkers: [], tierOf: tierOfPaths, changedPaths: [path] }))).toContain(REVIEW_GATE_FAIL);
    }
    expect(String(gate({ task: task1, workMarkers: [], lockMarkers: [], tierOf: tierOfPaths, changedPaths: plain }))).toContain(REVIEW_GATE_FAIL);
  });
});

describe("D-344 (7): findings, then a fix by another session, land without a re-review", () => {
  const FIXED_AT = "c".repeat(40);
  const findingsThenFixed = (fixer = "GPT · f1", body?: string): (Marker & { body?: string })[] => [
    { verb: "Review claim", id: "T1", who: "Kimi · r1" },
    { verb: "Verdict", id: "T1", who: "Kimi · r1", verdict: "findings", reviewed: REVIEWED },
    { verb: "Fix claim", id: "T1", who: fixer },
    { verb: "Fixed", id: "T1", who: fixer, ...(body ? { body } : {}) },
  ];

  it("fails a Fixed marker that names no fixed head: it approves nothing until re-recorded", () => {
    expect(gate({ lockMarkers: findingsThenFixed() })).toContain("names no fixed head");
  });

  it("fails when the findings were written by the session that built the work", () => {
    const own: (Marker & { body?: string })[] = [
      { verb: "Review claim", id: "T1", who: "Instinct · b1" },
      { verb: "Verdict", id: "T1", who: "Instinct · b1", verdict: "findings", reviewed: REVIEWED },
      { verb: "Fix claim", id: "T1", who: "GPT · f1" },
      { verb: "Fixed", id: "T1", who: "GPT · f1", body: `fixed ${HEAD}` },
    ];
    expect(gate({ lockMarkers: own })).toContain(REVIEW_GATE_FAIL);
  });

  it("fails when the findings verdict names no reviewed head, or one outside this branch", () => {
    const noHead: (Marker & { body?: string })[] = [
      { verb: "Review claim", id: "T1", who: "Kimi · r1" },
      { verb: "Verdict", id: "T1", who: "Kimi · r1", verdict: "findings", reviewed: null },
      { verb: "Fix claim", id: "T1", who: "GPT · f1" },
      { verb: "Fixed", id: "T1", who: "GPT · f1", body: `fixed ${HEAD}` },
    ];
    expect(gate({ lockMarkers: noHead })).toContain(REVIEW_GATE_FAIL);
    expect(gate({ lockMarkers: findingsThenFixed("GPT · f1", `fixed ${HEAD}`), nonMergeCommitsSince: () => null })).toContain(REVIEW_GATE_FAIL);
  });

  it("passes a Fixed marker naming this head, or a head that only merged main since", () => {
    expect(gate({ lockMarkers: findingsThenFixed("GPT · f1", `fixed ${HEAD}`) })).toBeNull();
    expect(gate({ lockMarkers: findingsThenFixed("GPT · f1", `fixed ${FIXED_AT}`), nonMergeCommitsSince: onlyMergesSince })).toBeNull();
  });

  it("fails when the branch gained its own commit after the fix it names", () => {
    expect(gate({ lockMarkers: findingsThenFixed("GPT · f1", `fixed ${FIXED_AT}`), nonMergeCommitsSince: ownCommitSince })).toContain(REVIEW_GATE_FAIL);
  });

  it("fails when the reviewer's own session marked its findings fixed", () => {
    expect(gate({ lockMarkers: findingsThenFixed("Kimi · r1") })).toContain(REVIEW_GATE_FAIL);
  });
});
