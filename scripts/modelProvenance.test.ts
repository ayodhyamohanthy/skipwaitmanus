// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { digest, registryOf, routeIdentity, markerReferences, resolveTaskProvenance, loadTrustedProvenance } from "./modelProvenance.mjs";
import { pickNextTask } from "./nextTaskCore.mjs";
import { reviewGateViolation } from "./review-gate.mjs";

const root = path.resolve(__dirname, "..");
const task = { id: "T", title: "test", row: "T", packet: "docs/plans/t.md", tier: 1, lane: "t", branch: "agent/queue/t", status: "todo", dependsOn: [], syncedTo: "D-001" };
const b = "Operator · b", r = "Operator · r";
function fixture() {
 const dir = mkdtempSync(path.join(os.tmpdir(), "provenance-")), work = path.join(dir, "work"), remote = path.join(dir, "origin.git");
 mkdirSync(path.join(work, "docs/plans"), { recursive: true });
 const git = (...args: string[]) => { try { return execFileSync("git", args, { cwd: work, encoding: "utf8", stdio: "pipe" }).trim(); } catch { return null; } };
 const must = (...args: string[]) => { const x = git(...args); if (x === null) throw Error(args.join(" ")); return x; };
 execFileSync("git", ["init", "--bare", remote], { stdio: "pipe" });
 must("init", "-b", "main"); must("config", "user.name", "Fixture"); must("config", "user.email", "fixture@example.test"); must("remote", "add", "origin", remote);
 writeFileSync(path.join(work, "docs/plans/t.md"), "# task\n\n## Status\nin progress\n");
 writeFileSync(path.join(work, "docs/plans/assignments.json"), JSON.stringify({ version: 1, repo: "o/r", tasks: [task] }));
 writeFileSync(path.join(work, "docs/DECISIONS.md"), "# Decisions\n| ID | Date | Decision | Evidence | Notes | Status |\n|---|---|---|---|---|---|\n| D-001 | 2026-10-19 | fixture | e | none | adopted |\n");
 writeFileSync(path.join(work, "code.txt"), "before\n"); must("add", "."); must("commit", "-m", "root"); const input = must("rev-parse", "HEAD");
 must("push", "-u", "origin", "main");
 must("switch", "-c", task.branch); must("commit", "--allow-empty", "-m", `Claim T: ${b}`, "-m", "provenance builder"); const claim = must("rev-parse", "HEAD");
 writeFileSync(path.join(work, "code.txt"), "after\n"); must("commit", "-am", "generated implementation"); const head = must("rev-parse", "HEAD"), patch = must("diff", "--binary", "--no-ext-diff", input, head, "--"); must("push", "-u", "origin", task.branch);
 must("switch", "-c", "agent/review/t", "main"); must("commit", "--allow-empty", "-m", `Review claim T: ${r}`, "-m", "provenance reviewer"); const reviewClaim = must("rev-parse", "HEAD");
 const route = (id: string, operator: string, modelId: string, roles: string[]) => ({ id, operator, modelId, roles, taskId: "T", revoked: false, providerUrl: "https://provider.example.test/models/public", selectedModel: modelId, observation: "Fixture selected-model observation, not a real external run", observationSha256: digest("Fixture selected-model observation, not a real external run"), qualificationReview: "https://review.example.test/qualified" });
 const execution = (id: string, routeId: string, operator: string, role: string, claimSha: string, output: string) => ({ id, routeId, taskId: "T", operator, role, claimSha, inputSha: input, outputSha: head, input: "Fixture public code input", inputSha256: digest("Fixture public code input"), output, outputSha256: digest(output), observation: "Fixture actual-output observation", observationSha256: digest("Fixture actual-output observation"), semanticEdits: false, patchSha256: digest(patch), reviewUrl: "https://review.example.test/execution" });
 const build = execution("built", "builder", b, "build", claim, patch);
 const review = { ...execution("reviewed", "reviewer", r, "review", reviewClaim, "PASS fixture exact head"), inputSha: head, outputSha: head, verdict: "pass" };
 const registry = { version: 1, routes: [route("builder", b, "public-author", ["build", "fix"]), route("reviewer", r, "public-reviewer", ["review", "land"])], executions: [build, review] };
 const workMarkers = [{ verb: "Claim", id: "T", who: b, sha: claim, body: "provenance builder" }];
 const lockMarkers = [{ verb: "Review claim", id: "T", who: r, sha: reviewClaim, body: "provenance reviewer" }, { verb: "Verdict", id: "T", who: r, verdict: "pass", reviewed: head, body: "provenance reviewer\nexecution reviewed" }];
 const save = () => { must("switch", "main"); writeFileSync(path.join(work, "docs/model-provenance.json"), JSON.stringify(registry)); must("add", "."); must("commit", "-m", "fixture separately qualified receipts"); must("push", "origin", "main"); };
 save();
 const resolved = (extra: object = {}) => resolveTaskProvenance({ taskId: "T", head, workMarkers, lockMarkers, registry, git, ...extra });
 const gate = (extra: object = {}) => reviewGateViolation({ task, head, workMarkers, lockMarkers, provenance: { registry, git }, ...extra });
 const pick = (routeId = "reviewer", extra: object = {}) => pickNextTask({ tasks: [task], mainCi: { state: "green" }, branches: new Map([[task.branch, { tipSha: head, tipMs: 0, merged: false, work: true, markers: workMarkers }], ["agent/review/t", { tipMs: 0, merged: false, markers: lockMarkers.slice(0, 1) }]]), openPrs: new Map([[task.branch, "https://example.test/pr/1"]]), prCi: new Map([[task.branch, { state: "green", sha: head }]]), now: Date.now(), claimant: r, provenance: { registry, git, routeId }, ...extra });
 const mock = path.join(dir, "mock.mjs");
 writeFileSync(mock, `const response = body => ({ok:true,status:200,json:async()=>body});
 globalThis.fetch=async input=>{const u=String(input);
 if(u.includes('/runs?branch=main'))return response({workflow_runs:[{id:1,status:'completed',conclusion:'success',head_sha:'${head}',updated_at:'2026-11-10T00:00:00Z'}]});
 if(u.includes('/runs?per_page=100'))return response({workflow_runs:[{id:2,status:'completed',conclusion:'success',head_sha:'${head}',head_branch:'${task.branch}',updated_at:'2026-11-10T00:00:00Z'}]});
 if(u.includes('/pulls?state=open'))return response([{head:{repo:{full_name:'o/r'},ref:'${task.branch}',sha:'${head}'},html_url:'https://example.test/pr/1'}]);
 if(u.includes('/pulls?state=closed'))return response([]);
 throw Error('unexpected '+u);};`);
 const run = (...args: string[]) => spawnSync(process.execPath, ["--import", mock, path.join(root, "scripts/next-task.mjs"), ...args], { cwd: work, encoding: "utf8", env: { ...process.env, NODE_USE_ENV_PROXY: "1", GH_TOKEN: "fixture-only" } });
 return { run, dir, work, git, must, input, head, claim, reviewClaim, patch, registry, build, review, workMarkers, lockMarkers, save, resolved, gate, pick };
}
const withFixture = (fn: (f: ReturnType<typeof fixture>) => void) => { const f = fixture(); try { fn(f); } finally { rmSync(f.dir, { recursive: true, force: true }); } };

describe("D311 shared resolver with real git histories", () => {
 it("accepts qualified distinct actual models behind one truthful operator prefix, consistently in picker and gate", () => withFixture(f => {
  expect(f.resolved()).toMatchObject({ active: true, ok: true, builders: ["public-author"] });
  expect(f.gate()).toBeNull(); expect(f.pick()).toMatchObject({ kind: "continue", of: "review" });
 }));
 it("rejects same external model and another session of the same model in picker and gate", () => withFixture(f => {
  f.registry.routes[1].modelId = "public-author";
  expect(f.gate()).toContain("shares a builder/fixer"); expect(["review", "continue"]).not.toContain(f.pick().kind);
 }));
 it.each(["input", "output", "observation"])("rejects changed %s artifact bytes", field => withFixture(f => {
  (f.build as any)[field] += "tampered"; expect(f.gate()).toContain("artifact bytes changed"); expect(["review", "continue"]).not.toContain(f.pick().kind);
 }));
 it("rejects unknown earlier code contributors even if a new external receipt claims the whole diff", () => withFixture(f => {
  const earlier = { verb: "Takeover", id: "T", who: "Unknown · old" };
  expect(f.resolved({ workMarkers: [earlier, ...f.workMarkers] })).toMatchObject({ ok: false });
  expect(f.gate({ workMarkers: [earlier, ...f.workMarkers] })).toContain("unresolved historical contributor");
 }));
 it("does not bar review/findings-only history under D184", () => withFixture(f => {
  expect(f.gate({ lockMarkers: [{ verb: "Verdict", id: "T", who: "Earlier unknown reviewer", verdict: "findings", reviewed: f.input }, ...f.lockMarkers] })).toBeNull();
 }));
 it("rejects operator semantic edits, arbitrary labels, candidate-only receipts and unqualified routes", () => withFixture(f => {
  f.build.semanticEdits = true; expect(f.gate()).toContain("semantic contributions"); f.build.semanticEdits = false;
  expect(routeIdentity(f.registry, "fake", r, "T", "review").ok).toBe(false);
  expect(f.gate({ provenance: { registry: null, git: f.git } })).toContain("missing trusted-main");
  expect(loadTrustedProvenance(() => null).registry).toBeNull();
  expect(["review", "continue"]).not.toContain(f.pick("fake").kind);
 }));
 it("rejects wrong task/operator/role and conflicting evidence", () => withFixture(f => {
  for (const prop of ["taskId", "operator", "role"]) { const old = (f.build as any)[prop]; (f.build as any)[prop] = "wrong"; expect(f.gate()).not.toBeNull(); (f.build as any)[prop] = old; }
  f.registry.executions.push({ ...f.build, id: "duplicate-execution" }); expect(f.gate()).toContain("ambiguous");
 }));
 it("rejects applied patch changes and unattributed later code", () => withFixture(f => {
  f.must("switch", task.branch); writeFileSync(path.join(f.work, "code.txt"), "operator fix\n"); f.must("commit", "-am", "unattributed fix"); const head = f.must("rev-parse", "HEAD");
  expect(f.resolved({ head, lockMarkers: [] })).toMatchObject({ ok: false, reason: "unattributed file-changing contribution in branch history" });
  f.build.output = "not the patch"; f.build.outputSha256 = digest(f.build.output); expect(f.gate()).toContain("differs from applied patch");
 }));
 it("rejects stale exact review head, missing route and malformed marker bodies", () => withFixture(f => {
  f.review.inputSha = f.input; expect(f.gate()).toContain("not for this exact head"); f.review.inputSha = f.head;
  expect(["review", "continue"]).not.toContain(f.pick("").kind);
  for (const body of ["provenance", "provenance reviewer\nprovenance builder", "provenance ../bad"]) expect(f.gate({ lockMarkers: [...f.lockMarkers.slice(0, 1), { ...f.lockMarkers[1], body }] })).not.toBeNull();
 }));
 it("detects invalid trusted registry JSON, duplicate IDs and unsupported evidence URLs", () => withFixture(f => {
  expect(registryOf("bad").ok).toBe(false); expect(registryOf(JSON.stringify({ ...f.registry, routes: [f.registry.routes[0], f.registry.routes[0]] })).ok).toBe(false);
  f.registry.routes[0].providerUrl = "file:///untrusted"; expect(f.gate()).toContain("unsupported provenance URL");
 }));
});


describe("D311 actual CLI and gate loader composition, local bare origin only", () => {
 it("preview keeps real operator, records exact external verdict, and real gate reads matching evidence", () => withFixture(f => {
   f.must("push", "-u", "origin", "agent/review/t");
   const preview = f.run("--as", r, "--provenance", "reviewer");
   expect(preview.status, preview.stdout + preview.stderr).toBe(0);
   expect(preview.stdout).toContain("REVIEW T");
   const before = f.must("rev-parse", "origin/agent/review/t");
   const missing = f.run("--verdict", "pass", "--task", "T", "--as", r);
   expect(missing.status).not.toBe(0); expect(missing.stderr).toContain("external completion requires");
   expect(f.must("rev-parse", "origin/agent/review/t")).toBe(before);
   const verdict = f.run("--verdict", "pass", "--task", "T", "--as", r, "--provenance", "reviewer", "--execution", "reviewed");
   expect(verdict.status, verdict.stderr).toBe(0);
   const message = f.must("show", "-s", "--format=%B", "origin/agent/review/t");
   expect(message).toContain(`Verdict T: pass — ${r}`); expect(message).toContain(`reviewed ${f.head}`); expect(message).toContain("execution reviewed");
   expect(message).not.toContain("public-reviewer ·");
   f.must("switch", task.branch);
   const gate = spawnSync(process.execPath, [path.join(root, "scripts/review-gate.mjs")], { cwd: f.work, encoding: "utf8", env: { ...process.env, GITHUB_HEAD_REF: task.branch } });
   expect(gate.status, gate.stdout + gate.stderr).toBe(0); expect(gate.stdout).toContain("has an independent passing review");
 }), 30000);
 it("candidate copy and CLI strings cannot replace trusted model evidence or write an invalid verdict", () => withFixture(f => {
   f.must("push", "-u", "origin", "agent/review/t");
   f.must("switch", task.branch);
   const fake = structuredClone(f.registry); fake.routes[1].modelId = "made-up-safe-model";
   writeFileSync(path.join(f.work, "docs/model-provenance.json"), JSON.stringify(fake));
   const before = f.must("rev-parse", "origin/agent/review/t");
   const result = f.run("--verdict", "pass", "--task", "T", "--as", r, "--provenance", "unqualified", "--execution", "reviewed");
   expect(result.status).not.toBe(0); expect(result.stderr).toContain("no qualified route"); expect(f.must("rev-parse", "origin/agent/review/t")).toBe(before);
   const trusted = loadTrustedProvenance(f.git); expect(trusted.registry.routes[1].modelId).toBe("public-reviewer");
 }), 30000);
});

describe("D311 complete contribution and continuation controls", () => {
 it("binds completed receipts to actual task role claims, not any existing commit", () => withFixture(f => {
  f.build.claimSha = f.input;
  expect(f.gate()).toContain("missing or ambiguous completed execution");
 }));
 it("never lets a registered task fall back to unknown unannotated markers", () => withFixture(f => {
  expect(f.gate({ workMarkers: [{ ...f.workMarkers[0], body: "" }], lockMarkers: f.lockMarkers.map(m => ({ ...m, body: "" })) })).toContain("unresolved historical contributor");
 }));
 it("retains main-merge and narrowly status-only PASS semantics, but not new code", () => withFixture(f => {
  f.must("switch", task.branch); f.must("merge", "--no-edit", "main");
  const merged = f.must("rev-parse", "HEAD");
  expect(f.gate({ head: merged, nonMergeCommitsSince: () => [] })).toBeNull();
  writeFileSync(path.join(f.work, "docs/plans/t.md"), "# task\n\n## Status\ndone - fixture\n");
  f.must("commit", "-am", "landing status"); const status = f.must("rev-parse", "HEAD");
  expect(f.resolved({ head: status })).toMatchObject({ ok: true });
  expect(f.gate({ head: status, nonMergeCommitsSince: () => [status], isStatusCommit: () => true })).toBeNull();
  f.must("reset", "--hard", merged);
  writeFileSync(path.join(f.work, "code.txt"), "unreviewed\n"); f.must("commit", "-am", "later fix");
  expect(f.gate({ head: f.must("rev-parse", "HEAD"), nonMergeCommitsSince: () => [f.must("rev-parse", "HEAD")] })).toContain("came after");
 }));
 it("validates a separately qualified fix and retains its contributor exclusion", () => withFixture(f => {
  f.must("switch", "agent/review/t"); f.must("commit", "--allow-empty", "-m", `Fix claim T: ${b}`, "-m", "provenance builder"); const claim = f.must("rev-parse", "HEAD");
  f.must("switch", task.branch); writeFileSync(path.join(f.work, "code.txt"), "fixed externally\n"); f.must("commit", "-am", "external fix"); const head = f.must("rev-parse", "HEAD");
  const patch = f.must("diff", "--binary", "--no-ext-diff", f.head, head, "--");
  f.registry.executions.push({ ...f.build, id: "fix", role: "fix", claimSha: claim, inputSha: f.head, outputSha: head, output: patch, outputSha256: digest(patch), patchSha256: digest(patch) });
  const lockMarkers = [...f.lockMarkers.slice(0, 1), { verb: "Fix claim", id: "T", who: b, sha: claim, body: "provenance builder" }, { verb: "Fixed", id: "T", who: b, body: "provenance builder\nexecution fix" }];
  expect(f.resolved({ head, lockMarkers })).toMatchObject({ ok: true, fixers: ["public-author"] });
  expect(f.gate({ head, lockMarkers })).toContain('not a pass');
 }));
 it("requires an independent qualified lander, including on a continued landing", () => withFixture(f => {
  const land = { verb: "Land claim", id: "T", who: r, body: "provenance reviewer" };
  expect(f.gate({ lockMarkers: [...f.lockMarkers, land] })).toBeNull();
  expect(f.gate({ lockMarkers: [...f.lockMarkers, { ...land, body: "" }] })).toContain("lander");
  f.registry.routes[1].modelId = "public-author";
  expect(f.gate({ lockMarkers: [...f.lockMarkers, land] })).not.toBeNull();
 }));
 it("holds all provenance git-read failures and mismatched input/output/head records", () => withFixture(f => {
  expect(f.resolved({ git: () => null })).toMatchObject({ ok: false });
  for (const key of ["inputSha", "outputSha", "claimSha"]) {
    const old = (f.build as any)[key]; (f.build as any)[key] = "d".repeat(40);
    expect(f.gate()).not.toBeNull(); (f.build as any)[key] = old;
  }
  f.registry.routes[0].roles = "build" as any; expect(f.gate()).not.toBeNull();
 }));
 it("real heartbeat preserves external review ownership without inventing execution", () => withFixture(f => {
  f.must("push", "-u", "origin", "agent/review/t");
  const heartbeat = f.run("--heartbeat", "--as", r, "--provenance", "reviewer");
  expect(heartbeat.status, heartbeat.stdout + heartbeat.stderr).toBe(0);
  expect(heartbeat.stdout).toContain("Heartbeat recorded");
  const result = f.run("--verdict", "pass", "--task", "T", "--as", r, "--provenance", "reviewer", "--execution", "reviewed");
  expect(result.status, result.stdout + result.stderr).toBe(0);
 }), 30000);
});

it("permits truthful pending review claim before execution without treating it as PASS", () => withFixture(f => {
 f.registry.executions = [f.build];
 expect(f.pick()).toMatchObject({ kind: "continue", of: "review" });
 expect(f.gate()).toContain("missing or ambiguous completed execution");
}));

it("a qualified review claim cannot launder an unqualified latest legacy verdict", () => withFixture(f => {
 expect(f.gate({ lockMarkers: [f.lockMarkers[0], { ...f.lockMarkers[1], body: "" }] })).toContain("qualified execution marker");
}));

it("standalone legacy core keeps external histories failclosed if support is absent", () => withFixture(f => {
 const dir = path.join(f.dir, "standalone"); mkdirSync(dir);
 writeFileSync(path.join(dir, "nextTaskCore.mjs"), readFileSync(path.join(root, "scripts/nextTaskCore.mjs")));
 const input = { tasks: [task], mainCi: { state: "green" }, branches: [[task.branch, { tipSha: f.head, tipMs: 0, work: true, markers: f.workMarkers }], ["agent/review/t", { tipMs: 0, markers: f.lockMarkers.slice(0, 1) }]], now: Date.now(), claimant: r };
 const code = `import {pickNextTask} from './nextTaskCore.mjs';const i=${JSON.stringify(input)};i.branches=new Map(i.branches);i.openPrs=new Map([['${task.branch}','https://example.test/pr']]);i.prCi=new Map([['${task.branch}',{state:'green',sha:'${f.head}'}]]);console.log(JSON.stringify(pickNextTask(i)));`;
 writeFileSync(path.join(dir, "probe.mjs"), code);
 const result = spawnSync(process.execPath, ["probe.mjs"], { cwd: dir, encoding: "utf8" });
 expect(result.status, result.stderr).toBe(0); expect(result.stdout).toContain("external provenance held");
}));

it("actual gate source failure on external work never becomes its legacy fail-open", () => withFixture(f => {
 f.must("push", "-u", "origin", "agent/review/t"); f.must("switch", task.branch);
 // A missing review-lock source used to enter the gate's internal-error PASS.
 f.must("remote", "set-url", "origin", path.join(f.dir, "missing.git"));
 const gate = spawnSync(process.execPath, [path.join(root, "scripts/review-gate.mjs")], { cwd: f.work, encoding: "utf8", env: { ...process.env, GITHUB_HEAD_REF: task.branch } });
 expect(gate.status).toBe(1); expect(gate.stderr).toContain("failing closed");
}));

it("does not hide semantic contribution inside a merge commit", () => withFixture(f => {
 f.must("switch", task.branch);
 f.must("merge", "--no-edit", "main");
 const parent = f.must("rev-parse", "HEAD");
 writeFileSync(path.join(f.work, "code.txt"), "hidden merge edit\n"); f.must("add", "."); const tree = f.must("write-tree");
 const merge = f.must("commit-tree", tree, "-p", parent, "-p", f.must("rev-parse", "main"), "-m", "semantic merge edit");
 expect(f.resolved({ head: merge })).toMatchObject({ ok: false, reason: "unattributed merge contribution; only clean main merges are transport" });
}));
