// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GATE_STEP, heldAllBy, leaseFor, pickNextTask, statusBoard } from "./nextTaskCore.mjs";
import { renderPick } from "./nextTaskText.mjs";
const NOW = Date.parse("2026-11-08T04:00:00+05:30"), HOUR = 3600000;
const HEAD = "a".repeat(40), ARCH = "agent/architect/p", REVIEW = "agent/review/p", PR = "https://example.test/pr/1";
const task = { id: "P", title: "packet", row: "P", packet: null, tier: 1, lane: "p", branch: "agent/queue/p", status: "architect", dependsOn: [], syncedTo: "D-001" };
const arch = { tipMs: NOW - 3 * HOUR, tipSha: HEAD, work: true, merged: false, markers: [{ verb: "Claim", id: "P", who: "Writer · 1111" }] };
const ci = { state: "red", gateOnly: true, sha: HEAD };
const lock = (markers: object[], age = 3 * HOUR) => ({ tipMs: NOW - age, merged: false, markers });
const claim = { verb: "Review claim", id: "P", who: "Other · 1" };
const pass = { verb: "Verdict", id: "P", who: "Other · 1", verdict: "pass" };
const input = (extra: Record<string, unknown> = {}) => ({ tasks: [task], mainCi: { state: "green", sha: HEAD }, branches: new Map([[ARCH, arch]]), openPrs: new Map([[ARCH, PR]]), prCi: new Map([[ARCH, ci]]), mergedHeads: new Map(), reports: [], now: NOW, claimant: "Reviewer · 2222", register: [], ...extra });
const pick = (extra: Record<string, unknown> = {}) => pickNextTask(input(extra));
describe("PICKER-architect-review-route", () => {
  it("(a) routes the exact gate-only packet head to independent REVIEW", () => expect(pick()).toMatchObject({ kind: "review", work: ARCH, lock: REVIEW, packet: true }));
  it("(b,c) excludes writer, takeover and fixer models", () => {
    expect(pick({ claimant: "Writer · 3333" }).kind).not.toBe("review");
    expect(pick({ claimant: "Takeover · 2", branches: new Map([[ARCH, { ...arch, markers: [...arch.markers, { verb: "Takeover", id: "P", who: "Takeover · 1" }] }]]) }).kind).not.toBe("review");
    expect(pick({ claimant: "Fixer · 2", branches: new Map([[ARCH, arch], [REVIEW, lock([{ verb: "Fixed", id: "P", who: "Fixer · 1" }])]]) }).kind).not.toBe("review");
  });
  it("(d,e) fails closed and leaves Tier2 packets alone", () => {
    for (const c of [{ ...ci, gateOnly: false }, { state: "red", sha: HEAD }, { ...ci, sha: "b".repeat(40) }, ...["running", "running-after-red", "error", "unknown"].map(state => ({ ...ci, state }))]) expect(pick({ prCi: new Map([[ARCH, c]]) }).kind).not.toBe("review");
    expect(pick({ tasks: [{ ...task, tier: 2 }] }).kind).not.toBe("review");
  });
  it("(f) respects active review and permits quiet review takeover", () => {
    expect(pick({ branches: new Map([[ARCH, arch], [REVIEW, lock([claim], 1000)]]) }).kind).not.toBe("review");
    expect(pick({ branches: new Map([[ARCH, arch], [REVIEW, lock([claim])]]) }).kind).toBe("review");
  });
  it("packet review holder continues and is included in normal heartbeat ownership", () => {
    const extra = { claimant: "Other · 1", branches: new Map([[ARCH, arch], [REVIEW, lock([claim], 1000)]]) };
    expect(pick(extra)).toMatchObject({ kind: "continue", of: "review", work: ARCH, lock: REVIEW, packet: true });
    expect(heldAllBy(input(extra))).toContainEqual(expect.objectContaining({ of: "review", work: ARCH, lock: REVIEW, packet: true }));
    expect(leaseFor(pick(extra), input(extra).branches, NOW)).toEqual({ ref: REVIEW, verb: "Heartbeat", id: "P", reclaim: false, retry: false });
  });
  it("(l) packet fix, pass and land markers never become review-lock continuations", () => {
    for (const marker of [{ ...claim, verb: "Fix claim" }, pass, { ...claim, verb: "Land claim" }]) {
      const extra = { claimant: "Other · 1", branches: new Map([[ARCH, arch], [REVIEW, lock([claim, marker], 1000)]]) };
      expect(pick(extra).kind).not.toBe("continue");
      expect(heldAllBy(input(extra))).not.toContainEqual(expect.objectContaining({ lock: REVIEW }));
    }
  });
  it("(g) passed gate-only red on a quiet packet returns to REVIEW, never architect or fix", () => {
    // D-307 measured scope correction: a pass that names an earlier head cannot be cleared by re-running CI, so the
    // quiet packet is handed the ordinary REVIEW again; ARCHITECT, MAKE GREEN and FIX stay excluded.
    const got = pick({ branches: new Map([[ARCH, arch], [REVIEW, lock([claim, pass])]]) });
    expect(got).toMatchObject({ kind: "review", work: ARCH, lock: REVIEW, packet: true });
    expect(["architect", "green", "fix"]).not.toContain(got.kind);
  });
  it("(h) preserves green packet landing and writer exclusion", () => {
    const extra = { prCi: new Map([[ARCH, { state: "green", sha: HEAD }]]), branches: new Map([[ARCH, arch], [REVIEW, lock([claim, pass])]]) };
    expect(pick(extra)).toMatchObject({ kind: "land", packet: true, work: ARCH });
    expect(pick({ ...extra, claimant: "Writer · 1111" }).kind).not.toBe("land");
  });
  it("(i) dependencies and decision sync win", () => {
    expect(pick({ tasks: [{ ...task, dependsOn: ["missing"] }] }).kind).not.toBe("review");
    const register = [{ id: "D-001", number: 1, affects: [] }, { id: "D-002", number: 2, date: "2026-11-08", decision: "sync", affects: ["P"] }];
    expect(pick({ register }).kind).toBe("resync");
  });
  it("board displays packet review and text reviews packet rows, reruns same head", () => {
    expect(statusBoard(input())[0]).toMatchObject({ review: "needs-review" });
    const text = renderPick({ kind: "review", task, work: ARCH, pr: PR, lock: REVIEW, packet: true }, { who: "Reviewer · 2222", date: "2026-11-08", claimed: false });
    expect(text).toContain("packet and its rows");
    expect(text).toContain("re-run");
    expect(text).not.toContain('set this task\'s "status" to "done"');
  });
});

// Real git plus mocked GitHub. All writes are confined to a throwaway local bare origin.
const root = path.resolve(__dirname, "..");
function harness() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "architect-review-")), work = path.join(dir, "work"), origin = path.join(dir, "origin.git"), mock = path.join(dir, "mock.mjs");
  mkdirSync(path.join(work, "docs/plans"), { recursive: true });
  const old = new Date(Date.now() - 3 * HOUR).toISOString(), env = { ...process.env, GIT_AUTHOR_DATE: old, GIT_COMMITTER_DATE: old };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: work, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }).trim();
  execFileSync("git", ["init", "--bare", origin], { stdio: "pipe" });
  git("init", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test"); git("remote", "add", "origin", origin);
  writeFileSync(path.join(work, "docs/plans/test.md"), "# fixture\n");
  writeFileSync(path.join(work, "docs/DECISIONS.md"), "# Decisions\n| ID | Date | Decision | Evidence | Notes | Status |\n|---|---|---|---|---|---|\n| D-001 | 2026-10-19 | One | e | none | adopted |\n");
  writeFileSync(path.join(work, "docs/plans/assignments.json"), JSON.stringify({ version: 1, repo: "o/r", tasks: [task] }));
  git("add", "."); git("commit", "-m", "root"); git("push", "-u", "origin", "main");
  git("switch", "-c", ARCH); git("commit", "--allow-empty", "-m", "Claim P: Writer · 1111");
  writeFileSync(path.join(work, "docs/plans/test.md"), "# packet work\n"); git("commit", "-am", "packet work"); git("push", "-u", "origin", ARCH); const head = git("rev-parse", "HEAD");
  git("switch", "-c", REVIEW, "main"); git("commit", "--allow-empty", "-m", "Review claim P: Reviewer · 2222"); git("push", "-u", "origin", REVIEW); git("switch", "main");
  const jobs = { jobs: [{ name: "typecheck", status: "completed", conclusion: "failure", steps: [{ name: GATE_STEP, conclusion: "failure" }, { name: "Scope check (declared file ownership)", conclusion: "skipped" }] }, ...["unit + component + route tests", "production build", "e2e journeys"].map(name => ({ name, status: "completed", conclusion: "success", steps: [{ name: "work", conclusion: "success" }] }))] };
  writeFileSync(mock, `const response = body => ({ok:true,status:200,json:async()=>body});
  globalThis.fetch=async input=>{const u=String(input);
  if(u.includes('/actions/runs/4242/jobs'))return response(${JSON.stringify(jobs)});
  if(u.includes('/runs?branch=main'))return response({workflow_runs:[{id:1,status:'completed',conclusion:'success',head_sha:'${head}',updated_at:'${old}'}]});
  if(u.includes('/runs?per_page=100'))return response({workflow_runs:[{id:4242,status:'completed',conclusion:'failure',head_sha:'${head}',head_branch:'${ARCH}',updated_at:'${old}',html_url:'https://example.test/run/4242'}]});
  if(u.includes('/pulls?state=open'))return response([{head:{repo:{full_name:'o/r'},ref:'${ARCH}',sha:'${head}'},html_url:'${PR}'}]);
  if(u.includes('/pulls?state=closed'))return response([]);
  throw Error('unexpected '+u);};`);
  const run = (...args: string[]) => spawnSync(process.execPath, ["--import", mock, path.join(root, "scripts/next-task.mjs"), ...args], { cwd: work, encoding: "utf8", env: { ...process.env, GH_TOKEN: "fixture-only", NODE_USE_ENV_PROXY: "1" } });
  return { dir, git, head, run };
}
describe("packet verdict and live-loader spawn contract", () => {
  it("(j) verdict names architect head when no task branch exists", () => {
    const f = harness(); try { const r = f.run("--verdict", "pass", "--task", "P", "--as", "Reviewer · 2222"); expect(r.status, r.stderr).toBe(0); expect(f.git("show", "-s", "--format=%B", "origin/" + REVIEW)).toContain("reviewed " + f.head); } finally { rmSync(f.dir, { recursive: true, force: true }); }
  }, 30000);
  it("(k) mocked GitHub gate-only exact lock run prints REVIEW and board state, no claim", () => {
    const f = harness(); try { // age the existing reviewer is quiet, so preview may offer another model
      const r = f.run("--as", "Independent · 3"); expect(r.stdout + r.stderr).toMatch(/NEXT: REVIEW P/); expect(r.stdout).toContain("review in-review");
    } finally { rmSync(f.dir, { recursive: true, force: true }); }
  }, 30000);
});
