// Historical read-only routing reproduction; run from the repository root.
// Reports/architect lease are omitted in memory only. No real ref is edited.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const core = await import(pathToFileURL(path.join(root, "scripts/nextTaskCore.mjs")));
const gate = await import(pathToFileURL(path.join(root, "scripts/review-gate.mjs")));
const provenance = await import(pathToFileURL(path.join(root, "scripts/modelProvenance.mjs")));
const tier = await import(pathToFileURL(path.join(root, "scripts/tierClassifyCore.mjs")));
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };
const task = JSON.parse(git("show", "origin/main:docs/plans/assignments.json")).tasks.find(row => row.id === "D-100.provider-recon");
assert.ok(task);
const workRef = `origin/${task.branch}`;
const lockName = core.reviewLockOf(task), lockRef = `origin/${lockName}`;
const head = git("rev-parse", workRef), lockHead = git("rev-parse", lockRef);
const main = git("rev-parse", "origin/main");
for (const name of ["nextTaskCore.mjs", "review-gate.mjs", "modelProvenance.mjs"]) {
  assert.equal(readFileSync(path.join(root, "scripts", name), "utf8").trim(), git("show", `origin/main:scripts/${name}`));
}
function markers(ref) {
  const raw = git("log", "--reverse", "--no-merges", `--format=${provenance.PROVENANCE_LOG_FORMAT}`, "--name-only", `origin/main..${ref}`);
  return provenance.parseProvenanceLog(raw).filter(row => !row.files.length).flatMap(row => {
    const marker = core.parseMarker(row.subject);
    return marker ? [{ ...marker, sha: row.sha, body: row.body, reviewed: gate.reviewedOf(row.body) }] : [];
  });
}
const workMarkers = markers(workRef), lockMarkers = markers(lockRef);
const nonMergeCommitsSince = sha => tryGit("merge-base", "--is-ancestor", sha, head) === null
  ? null : git("rev-list", "--no-merges", `${sha}..${head}`, "--not", "origin/main").split("\n").filter(Boolean);
const isEmptyCommit = sha => { const tree = tryGit("rev-parse", `${sha}^{tree}`); return tree !== null && tree === tryGit("rev-parse", `${sha}^1^{tree}`); };
const paths = gate.changedPathsOf(head);
const trusted = provenance.loadTrustedProvenance(tryGit);
const violation = gate.reviewGateViolation({ task, head, workMarkers, lockMarkers, nonMergeCommitsSince,
  // Matches the then-current pullRequestFacts loader. Exact-head CI separately
  // confirms this same two-non-status-commits rejection, not a product verdict.
  isStatusCommit: () => false, isEmptyCommit, changedPaths: paths,
  tierOf: rows => tier.classifyTier(rows).tier, tierReasonPaths: tier.tierReasonPaths,
  provenance: { ...trusted, git: tryGit },
});
assert.ok(violation);
const fixed = [...lockMarkers].reverse().find(row => row.verb === "Fixed");
assert.ok(fixed);
const fixedHead = gate.fixedOf(fixed.body);
assert.ok(fixedHead);
const later = nonMergeCommitsSince(fixedHead);
assert.deepEqual(later, ["40595a6cf438fd9cf8642ff330aba3bcb4295a64", "5fc71c404dd9f8570cb9430d7c787c44b93d9f06"]);
assert.equal(git("diff", "f9114c901", head, "--"), "");
const owned = ["server/dailyMoneyCheck.ts", "server/dailyMoneyCheck.test.ts", "server/chargebeeAccountApi.ts"];
assert.equal(git("diff", fixedHead, head, "--", ...owned), "");
const now = Date.now();
const work = { tipSha: head, tipMs: Number(git("show", "-s", "--format=%ct", workRef)) * 1000, merged: false, work: true, markerOnly: false, markers: workMarkers };
const lock = { tipSha: lockHead, tipMs: Number(git("show", "-s", "--format=%ct", lockRef)) * 1000, merged: false, work: false, markerOnly: true, markers: lockMarkers };
assert.equal(core.reviewStateOf(lock, task.id), "landing");
assert.ok(now - Math.max(work.tipMs, lock.tipMs) > 2 * 3_600_000);
const doc = JSON.parse(git("show", "origin/main:docs/plans/assignments.json"));
assert.ok(task.dependsOn.every(id => doc.tasks.find(row => row.id === id)?.status === "done"));
const base = {
  tasks: doc.tasks, mainCi: { state: "green", sha: main },
  branches: new Map([[task.branch, work], [lockName, lock]]),
  openPrs: new Map([[task.branch, "https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1171"]]),
  prCi: new Map([[task.branch, { state: "red", sha: head, gateOnly: true, runId: 44316287767 }]]),
  prFacts: new Map([[task.branch, { tipSha: head, paths, gateClear: false }]]),
  mergedHeads: new Map(), reports: [], register: [], now,
  claimant: "GPT-6.1 Sol · 74ff", only: task.id,
};
const actual = core.pickNextTask(base);
assert.equal(actual.kind, "ineligible");
const withoutLanding = { ...lock, markers: lock.markers.filter(row => row.verb !== "Land claim") };
const control = core.pickNextTask({ ...base, branches: new Map([[task.branch, work], [lockName, withoutLanding]]) });
assert.equal(control.kind, "review");
assert.equal(git("rev-parse", workRef), head); assert.equal(git("rev-parse", lockRef), lockHead);
const record = {
  checkedAt: new Date().toISOString(), readOnly: true, main, head, lockHead, fixedHead,
  gateViolation: violation, currentStage: core.reviewStateOf(lock, task.id),
  laterOwnCommits: later, netRevertDeltaEmpty: true, ownedRepairSourceUnchanged: true,
  isolatedMainCondition: "green; reports and this session's architect lease omitted in memory only",
  ordinaryStage: { kind: actual.kind, reason: actual.reason },
  withoutLandClaimControl: { kind: control.kind, scope: "in-memory counterfactual only; not a proposed marker edit" },
  workAndReviewRefsUnchanged: true, productVerdict: false, providerCalls: 0,
};
const output = process.argv[2] ?? path.join(root, "docs/evidence/D-100-provider-recon-routing/probe.json");
writeFileSync(output, JSON.stringify(record, null, 2) + "\n");
console.log(JSON.stringify(record));
