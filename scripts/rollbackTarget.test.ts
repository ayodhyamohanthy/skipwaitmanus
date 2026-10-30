// @vitest-environment node
// REL-rollback-skew (D-212): the web recovery takes a deliberate, green, typed-twice target and
// verifies what Cloudflare serves; the web deploy waits for its API before it goes live.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REQUIRED_JOBS } from "./require-green-release.mjs";
import { apiConverged, deployedCommitProblem, evaluateWebTarget, pageCommit, runWebGate, verifyWeb, waitForApi, webRecoveryProblem } from "./rollbackTarget.mjs";

const root = path.resolve(__dirname, "..");
const T = "a".repeat(40);
const NEWER = "b".repeat(40);
const OLDER = "c".repeat(40);
const ok = { system: "web", commit: T, confirm: T, reason: "web release broke sign-in" };
const MAIN = { ref: "refs/heads/main", event: "workflow_dispatch" };

type Run = { id: number; path: string; event: string; head_branch: string; head_sha: string; status: string; conclusion: string | null; run_attempt: number };
const run = (extra: Partial<Run> = {}): Run => ({ id: 1, path: ".github/workflows/ci.yml", event: "push", head_branch: "main", head_sha: T, status: "completed", conclusion: "success", run_attempt: 1, ...extra });
const jobs = (sha = T, conclusion = "success") => REQUIRED_JOBS.map((name: string) => ({ name, status: "completed", conclusion, head_sha: sha }));
function fake({ runs = [run()], jobsOf = { 1: jobs() } as Record<number, ReturnType<typeof jobs>>, onMain = "behind", fail = 0 } = {}) {
  const calls: string[] = [];
  let failures = fail;
  const gate = (what: string) => { calls.push(what); if (failures > 0) { failures--; throw new Error("HTTP 502 from GitHub"); } };
  return {
    calls,
    async compare(base: string, head: string) { gate(`compare ${base}...${head}`); return onMain === "behind" ? { status: "ahead", ahead_by: 2, behind_by: 0 } : onMain === "identical" ? { status: "identical", ahead_by: 0, behind_by: 0 } : { status: "diverged", ahead_by: 1, behind_by: 1 }; },
    async ciRuns(sha: string) { gate(`runs ${sha}`); return runs; },
    async ciJobs(id: number) { gate(`jobs ${id}`); return jobsOf[id] ?? []; },
  };
}

describe("web recovery request", () => {
  it("accepts web or all with the full commit typed twice and a reason", () => {
    expect(webRecoveryProblem(ok)).toBeNull();
    expect(webRecoveryProblem({ ...ok, system: "all" })).toBeNull();
  });

  it("refuses a confirmation that differs from the commit", () => {
    expect(webRecoveryProblem({ ...ok, confirm: NEWER })).toMatch(/confirmation does not repeat/);
    expect(webRecoveryProblem({ ...ok, confirm: T.slice(0, 39) })).toMatch(/confirmation does not repeat/);
  });

  it("refuses an empty or blank reason, a short or uppercase SHA, and the API-only target", () => {
    expect(webRecoveryProblem({ ...ok, reason: "" })).toMatch(/needs a reason/);
    expect(webRecoveryProblem({ ...ok, reason: "   " })).toMatch(/needs a reason/);
    expect(webRecoveryProblem({ ...ok, reason: "x".repeat(501) })).toMatch(/longer than 500/);
    expect(webRecoveryProblem({ ...ok, commit: "abc1234", confirm: "abc1234" })).toMatch(/full 40-character/);
    expect(webRecoveryProblem({ ...ok, commit: T.toUpperCase(), confirm: T.toUpperCase() })).toMatch(/full 40-character/);
    expect(webRecoveryProblem({ ...ok, system: "api" })).toMatch(/web or all/);
  });
});

describe("web recovery gate", () => {
  it("passes a main commit whose own main CI is green, without reading anything about the live web", async () => {
    const gh = fake();
    const r = await runWebGate({ gh, intent: ok, ...MAIN });
    expect(r.ok).toBe(true);
    expect(gh.calls).toEqual([`compare ${T}...main`, `runs ${T}`, "jobs 1"]);
  });

  it("accepts a target equal to the live release (REL-self-heal redeploys it)", async () => {
    expect((await runWebGate({ gh: fake({ onMain: "identical" }), intent: ok, ...MAIN })).ok).toBe(true);
  });

  it("refuses a target with no green main CI run", async () => {
    const none = await runWebGate({ gh: fake({ runs: [] }), intent: ok, ...MAIN });
    expect(none).toMatchObject({ ok: false });
    expect(none.reason).toMatch(/no CI run/);
    const red = await runWebGate({ gh: fake({ runs: [run({ conclusion: "failure" })] }), intent: ok, ...MAIN });
    expect(red.ok).toBe(false);
    expect(red.reason).toMatch(/concluded failure/);
    const prOnly = await runWebGate({ gh: fake({ runs: [run({ event: "pull_request" })] }), intent: ok, ...MAIN });
    expect(prOnly.ok).toBe(false);
    const running = await runWebGate({ gh: fake({ runs: [run({ status: "in_progress", conclusion: null })] }), intent: ok, ...MAIN });
    expect(running.ok).toBe(false);
    const badJob = await runWebGate({ gh: fake({ jobsOf: { 1: jobs(T, "failure") } }), intent: ok, ...MAIN });
    expect(badJob.ok).toBe(false);
  });

  it("refuses a commit that is not on main", async () => {
    const r = await runWebGate({ gh: fake({ onMain: "diverged" }), intent: ok, ...MAIN });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not on main/);
  });

  it("refuses a bad request or a run that is not a dispatch of main before reading GitHub", async () => {
    for (const [intent, ctx] of [[{ ...ok, confirm: NEWER }, MAIN], [{ ...ok, reason: "" }, MAIN], [ok, { ...MAIN, event: "push" }], [ok, { ...MAIN, ref: "refs/heads/agent/x" }]] as const) {
      const gh = fake();
      expect((await runWebGate({ gh, intent, ...ctx })).ok).toBe(false);
      expect(gh.calls).toEqual([]);
    }
  });

  it("retries GitHub errors at most five times in a row, then refuses", async () => {
    expect((await runWebGate({ gh: fake({ fail: 4 }), intent: ok, ...MAIN })).ok).toBe(true);
    const r = await runWebGate({ gh: fake({ fail: 50 }), intent: ok, ...MAIN });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/5 attempts in a row/);
  });

  it("evaluates the target, never a newer commit", async () => {
    const gh = fake();
    expect((await evaluateWebTarget({ gh, sha: OLDER })).state).toBe("missing");
  });
});

describe("web recovery verification", () => {
  it("reports failure when Cloudflare's production deployment is not the target, and deploys nothing", async () => {
    let pages = 0;
    const r = await verifyWeb({ expected: T, readCanonical: async () => NEWER, readPage: async () => { pages++; return ""; }, attempts: 3 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(new RegExp(`production deployment is ${NEWER}, not the target ${T}`));
    expect(r.reason).toMatch(/Nothing else was deployed/);
    expect(pages).toBe(0);
  });

  it("reports failure when Cloudflare names no commit or the live page serves another build", async () => {
    expect((await verifyWeb({ expected: T, readCanonical: async () => null, readPage: async () => "", attempts: 2 })).reason).toMatch(/no commit/);
    const page = await verifyWeb({ expected: T, readCanonical: async () => T, readPage: async () => `<meta name="git-commit" content="${NEWER}">`, attempts: 2 });
    expect(page.ok).toBe(false);
    expect(page.reason).toMatch(new RegExp(`serves ${NEWER}`));
  });

  it("passes when Cloudflare and the live page both carry the target, after the edge catches up", async () => {
    let n = 0;
    const r = await verifyWeb({ expected: T, readCanonical: async () => T, readPage: async () => (++n < 3 ? `<meta name="git-commit" content="${NEWER}">` : `<meta name="git-commit" content="${T}">`), attempts: 5 });
    expect(r.ok).toBe(true);
  });

  it("treats a Cloudflare error as a failed look, not a pass", async () => {
    const r = await verifyWeb({ expected: T, readCanonical: async () => { throw new Error("Cloudflare API HTTP 403 for the Pages project"); }, readPage: async () => "", attempts: 2 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/HTTP 403/);
  });

  it("reads the commit names exactly", () => {
    expect(deployedCommitProblem({ deployed: T, expected: T })).toBeNull();
    expect(deployedCommitProblem({ deployed: T.slice(0, 7), expected: T })).toMatch(/not the target/);
    expect(pageCommit(`<head><meta name="git-commit" content="${T}"></head>`)).toBe(T);
    expect(pageCommit("<head></head>")).toBeNull();
  });
});

describe("the web waits for its API", () => {
  const ancestry = new Map([[`${T}>${NEWER}`, true], [`${T}>${OLDER}`, false]]);
  const isAncestor = (a: string, b: string) => ancestry.get(`${a}>${b}`) ?? false;

  it("converges on this SHA or a descendant, never an older or unknown one", () => {
    expect(apiConverged({ sha: T, live: T, isAncestor })).toBe(true);
    expect(apiConverged({ sha: T, live: NEWER, isAncestor })).toBe(true);
    expect(apiConverged({ sha: T, live: OLDER, isAncestor })).toBe(false);
    expect(apiConverged({ sha: T, live: null, isAncestor })).toBe(false);
    expect(apiConverged({ sha: T, live: NEWER, isAncestor: () => { throw new Error("not in checkout"); } })).toBe(false);
  });

  it("waits while the API still runs the old release, then goes on", async () => {
    let clock = 0;
    const seen = [OLDER, OLDER, NEWER];
    const r = await waitForApi({ sha: T, readLive: async () => seen.shift() ?? null, isAncestor, timeoutMs: 45 * 60_000, intervalMs: 30_000, now: () => clock, sleep: async (ms: number) => { clock += ms; } });
    expect(r.converged).toBe(true);
    expect(clock).toBe(60_000);
  });

  it("gives up after the timeout and says the API did not converge", async () => {
    let clock = 0;
    const r = await waitForApi({ sha: T, readLive: async () => { throw new Error("HTTP 503 without JSON"); }, isAncestor, timeoutMs: 45 * 60_000, intervalMs: 30_000, now: () => clock, sleep: async (ms: number) => { clock += ms; } });
    expect(r.converged).toBe(false);
    expect(r.reason).toMatch(/did not converge/);
    expect(clock).toBe(45 * 60_000);
  });

  it("the CLI refuses an unknown command", () => {
    const r = spawnSync(process.execPath, [path.join(root, "scripts/rollbackTarget.mjs"), "nope"], { encoding: "utf8", env: { PATH: process.env.PATH ?? "" } });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/unknown command/);
  });
});

// deploy-pages.yml: only the checkout and the API wait belong to this row.
function deployJob() {
  const text = readFileSync(path.join(root, ".github/workflows/deploy-pages.yml"), "utf8");
  const lines = text.split("\n");
  const start = lines.indexOf("  deploy:");
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) { if (/^ {2}\S/.test(line) || /^\S/.test(line)) break; body.push(line); }
  const steps: string[][] = [];
  for (const line of body) { if (/^ {6}- /.test(line)) steps.push([line]); else if (steps.length && /^ {8}/.test(line)) steps[steps.length - 1].push(line); }
  return steps.map(s => s.join("\n"));
}

describe("deploy-pages.yml waits for its API before the Pages deploy", () => {
  const steps = deployJob();
  const at = (re: RegExp) => steps.findIndex(s => re.test(s));

  it("checks out the full history the classifier and the ancestry check diff", () => {
    expect(steps[0]).toMatch(/uses: actions\/checkout@v4\n {8}with:\n {10}fetch-depth: 0/);
  });

  it("classifies the push and waits only when it changed API paths, before the deploy", () => {
    const classify = at(/bash scripts\/classify-api-changes\.sh/);
    const wait = at(/node scripts\/rollbackTarget\.mjs wait-api/);
    const deploy = at(/wrangler pages deploy/);
    expect(classify).toBeGreaterThanOrEqual(0);
    expect(steps[classify]).toMatch(/BEFORE_SHA: \$\{\{ github\.event\.before \}\}/);
    expect(steps[wait]).toMatch(/if: steps\.api-changes\.outputs\.classification == 'runtime'/);
    expect(steps[wait]).toMatch(/RELEASE_API_WAIT_MINUTES: "45"/);
    expect([classify < wait, wait < deploy]).toEqual([true, true]);
  });

  it("deploys anyway after the wait, then fails the job so the Deploy failed issue says the API did not converge", () => {
    const deploy = at(/wrangler pages deploy/);
    const fail = at(/steps\.api-wait\.outputs\.converged == 'false'/);
    const notify = at(/name: Notify sync status/);
    expect(steps[deploy]).not.toMatch(/^ {8}if:/m);
    expect(fail).toBeGreaterThan(deploy);
    expect(fail).toBeLessThan(notify);
    expect(steps[fail]).toMatch(/API did not converge/);
    expect(steps[fail]).toMatch(/exit 1/);
  });
});
