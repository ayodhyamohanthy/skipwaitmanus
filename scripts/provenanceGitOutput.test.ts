// @vitest-environment node
// D-311 / PROCESS-provenance-loader-bounds: the trusted registry on main is
// 1,620,441 bytes, above execFileSync's 1 MiB default. Both production loaders
// must read the real bytes through their actual wrappers, keep every failclosed
// check, and fail loudly above a finite aggregate bound.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { digest, loadTrustedProvenance, PROVENANCE_PATH } from "./modelProvenance.mjs";
import { reviewGateViolation } from "./review-gate.mjs";
import { TRUSTED_GIT_OUTPUT_MAX_BYTES, trustedGitReadOptions, trustedGitReader } from "./provenanceGitOutput.mjs";

const root = path.resolve(__dirname, "..");
const task = { id: "T", title: "test", row: "T", packet: "docs/plans/t.md", tier: 1, lane: "t", branch: "agent/queue/t", status: "todo", dependsOn: [], syncedTo: "D-001" };
const b = "Operator · b", r = "Operator · r";
const MIB = 1024 * 1024;
const PADDING = "observed public model selection bytes ".repeat(36_000); // ~1.2 MiB, above the 1 MiB default

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "provenance-bound-")), work = path.join(dir, "work"), remote = path.join(dir, "origin.git");
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
  must("switch", "-c", "agent/review/t", "main"); must("commit", "--allow-empty", "-m", `Review claim T: ${r}`, "-m", "provenance reviewer"); const reviewClaim = must("rev-parse", "HEAD"); must("push", "-u", "origin", "agent/review/t");
  must("commit", "--allow-empty", "-m", `Verdict T: pass — ${r}`, "-m", `reviewed ${head}\nprovenance reviewer\nexecution reviewed`); must("push", "origin", "agent/review/t");
  const route = (id: string, operator: string, modelId: string, roles: string[], observation: string) => ({ id, operator, modelId, roles, taskId: "T", revoked: false, providerUrl: "https://provider.example.test/models/public", selectedModel: modelId, observation, observationSha256: digest(observation), qualificationReview: "https://review.example.test/qualified" });
  const execution = (id: string, routeId: string, operator: string, role: string, claimSha: string, output: string) => ({ id, routeId, taskId: "T", operator, role, claimSha, inputSha: input, outputSha: head, input: "Fixture public code input", inputSha256: digest("Fixture public code input"), output, outputSha256: digest(output), observation: "Fixture actual-output observation", observationSha256: digest("Fixture actual-output observation"), semanticEdits: false, patchSha256: digest(patch), reviewUrl: "https://review.example.test/execution" });
  const build = execution("built", "builder", b, "build", claim, patch);
  const review = { ...execution("reviewed", "reviewer", r, "review", reviewClaim, "PASS fixture exact head"), inputSha: head, outputSha: head, verdict: "pass" };
  const registry = { version: 1, routes: [route("builder", b, "public-author", ["build", "fix"], PADDING), route("reviewer", r, "public-reviewer", ["review", "land"], "Fixture selected-model observation")], executions: [build, review] };
  const workMarkers = [{ verb: "Claim", id: "T", who: b, sha: claim, body: "provenance builder" }];
  const lockMarkers = [{ verb: "Review claim", id: "T", who: r, sha: reviewClaim, body: "provenance reviewer" }, { verb: "Verdict", id: "T", who: r, verdict: "pass", reviewed: head, body: "provenance reviewer\nexecution reviewed" }];
  const saveRegistry = (text: string) => { must("switch", "main"); writeFileSync(path.join(work, PROVENANCE_PATH), text); must("add", "."); must("commit", "-m", "fixture separately qualified receipts"); must("push", "origin", "main"); };
  saveRegistry(JSON.stringify(registry));
  const bytes = JSON.stringify(registry).length;
  // The production reader itself, pointed at the fixture repo. The exact wiring in
  // scripts/next-task.mjs and scripts/review-gate.mjs is pinned by the source test below.
  const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  const tryOf = (read: (...args: string[]) => string) => (...args: string[]) => { try { return read(...args); } catch { return null; } };
  const pickerTryGit = tryOf(trustedGitReader(execFileSync, { env: GIT_ENV, cwd: work }));
  const gateTryGit = tryOf(trustedGitReader(execFileSync, { cwd: work }));
  const mock = path.join(dir, "mock.mjs");
  writeFileSync(mock, `const response = body => ({ok:true,status:200,json:async()=>body});
globalThis.fetch=async input=>{const u=String(input);
if(u.includes('/runs?branch=main'))return response({workflow_runs:[{id:1,status:'completed',conclusion:'success',head_sha:'${head}',updated_at:'2026-11-10T00:00:00Z'}]});
if(u.includes('/runs?per_page=100'))return response({workflow_runs:[{id:2,status:'completed',conclusion:'success',head_sha:'${head}',head_branch:'${task.branch}',updated_at:'2026-11-10T00:00:00Z'}]});
if(u.includes('/pulls?state=open'))return response([{head:{repo:{full_name:'o/r'},ref:'${task.branch}',sha:'${head}'},html_url:'https://example.test/pr/1'}]);
if(u.includes('/pulls?state=closed'))return response([]);
throw Error('unexpected '+u);};`);
  const runPicker = (...args: string[]) => spawnSync(process.execPath, ["--import", mock, path.join(root, "scripts/next-task.mjs"), ...args], { cwd: work, encoding: "utf8", env: { ...process.env, NODE_USE_ENV_PROXY: "1", GH_TOKEN: "fixture-only" } });
  const runGate = () => spawnSync(process.execPath, [path.join(root, "scripts/review-gate.mjs")], { cwd: work, encoding: "utf8", env: { ...process.env, GITHUB_HEAD_REF: task.branch, GITHUB_EVENT_PATH: "", GITHUB_EVENT_NAME: "" } });
  const gate = (extra: object = {}) => reviewGateViolation({ task, head, workMarkers, lockMarkers, provenance: { registry, git: pickerTryGit }, ...extra });
  return { work, git, must, input, head, claim, registry, bytes, pickerTryGit, gateTryGit, runPicker, runGate, saveRegistry, gate };
}
const withFixture = (fn: (f: ReturnType<typeof fixture>) => void) => { const f = fixture(); try { fn(f); } finally { rmSync(f.work ? path.dirname(f.work) : "", { recursive: true, force: true }); } };

describe("PROCESS-provenance-loader-bounds: shared bounded Git transport", () => {
  it("names one finite bound that leaves room above the measured registry", () => {
    expect(Number.isInteger(TRUSTED_GIT_OUTPUT_MAX_BYTES)).toBe(true);
    expect(TRUSTED_GIT_OUTPUT_MAX_BYTES).toBe(64 * MIB);
    expect(trustedGitReadOptions({ encoding: "utf8" })).toEqual({ encoding: "utf8", maxBuffer: TRUSTED_GIT_OUTPUT_MAX_BYTES });
  });

  it("both production wrappers are wired to the shared reader, not left on the default buffer", () => {
    const picker = readFileSync(path.join(root, "scripts/next-task.mjs"), "utf8");
    const gate = readFileSync(path.join(root, "scripts/review-gate.mjs"), "utf8");
    expect(picker).toMatch(/import \{ trustedGitReader \} from "\.\/provenanceGitOutput\.mjs";/);
    expect(picker).toMatch(/const git = trustedGitReader\(execFileSync, \{ env: GIT_ENV \}\);/);
    expect(gate).toMatch(/import \{ trustedGitRead \} from "\.\/provenanceGitOutput\.mjs";/);
    expect(gate).toMatch(/const git = args => trustedGitRead\(execFileSync, args\);/);
  });

  it("the production picker loader reads the actual >1MiB trusted registry, so its external review hand-out survives", () => withFixture(f => {
    expect(f.bytes).toBeGreaterThan(MIB);
    const trusted = loadTrustedProvenance(f.pickerTryGit);
    expect(trusted.registryError).toBeUndefined();
    expect(trusted.registry.routes.length).toBe(2);
    const preview = f.runPicker("--as", r, "--provenance", "reviewer");
    expect(preview.status, preview.stdout + preview.stderr).toBe(0);
    // The hand-out needs the qualified route from the >1MiB registry: unreadable evidence holds the task instead.
    expect(preview.stdout).toContain("NEXT: CONTINUE: LAND T");
  }), 60000);

  it("the production review gate reads the same actual registry through its own wrapper", () => withFixture(f => {
    f.must("switch", task.branch);
    const gate = f.runGate();
    expect(gate.status, gate.stdout + gate.stderr).toBe(0);
    expect(gate.stdout).toContain("has an independent passing review");
  }), 60000);

  it("keeps failclosed checks at the larger size: a tampered observation still holds", () => withFixture(f => {
    const tampered = structuredClone(f.registry);
    tampered.routes[0].observation += "tampered";
    expect(reviewGateViolation({ task, head: f.head, workMarkers: [{ verb: "Claim", id: "T", who: b, sha: f.claim, body: "provenance builder" }], lockMarkers: [{ verb: "Review claim", id: "T", who: r, body: "provenance reviewer" }, { verb: "Verdict", id: "T", who: r, verdict: "pass", reviewed: f.head, body: "provenance reviewer\nexecution reviewed" }], provenance: { registry: tampered, git: f.pickerTryGit } })).toContain("route observation bytes changed");
  }));

  it("fails closed on malformed, missing and unreadable trusted registries, never as a pass", () => withFixture(f => {
    const malformed = JSON.stringify(f.registry).slice(0, -1);
    expect(loadTrustedProvenance(() => malformed).registryError).toBeTruthy();
    // What the pre-fix wrappers actually produced above the old bound: the existence probe
    // succeeds (tiny output) and the registry read throws, so the adapter returns null there.
    const unreadable = loadTrustedProvenance((...args: string[]) => (args[0] === "cat-file" ? "" : null));
    expect(unreadable).toEqual({ registry: null, registryError: "invalid provenance registry" });
    expect(f.gate({ provenance: { ...unreadable, git: f.pickerTryGit } })).not.toBeNull();
    f.must("update-ref", "-d", "refs/remotes/origin/main");
    expect(loadTrustedProvenance(f.gateTryGit)).toEqual({ registry: null, registryError: "no trusted-main provenance registry" });
  }), 30000);

  it("an output above the shared bound is a loud transport failure, not truncated success", () => withFixture(f => {
    const big = path.join(path.dirname(f.work), "over-bound.txt");
    execFileSync("sh", ["-c", `yes 'over bound provenance bytes' | head -c ${TRUSTED_GIT_OUTPUT_MAX_BYTES + 1024} > "${big}"`], { stdio: "pipe" });
    const blob = f.must("hash-object", "-w", big);
    const read = () => execFileSync("git", ["cat-file", "-p", blob], trustedGitReadOptions({ encoding: "utf8", cwd: f.work, stdio: ["ignore", "pipe", "pipe"] }));
    expect(read).toThrow();
    try { read(); } catch (error) { expect(String((error as { code?: string }).code ?? (error as Error).message)).toMatch(/ENOBUFS|maxBuffer|ERR_CHILD_PROCESS_STDIO_MAXBUFFER/); }
  }), 60000);
});
