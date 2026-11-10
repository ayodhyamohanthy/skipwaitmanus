// @vitest-environment node
// REL-rollback-skew (D-212): the web recovery takes a deliberate, green, typed-twice target and
// verifies what Cloudflare serves; the web deploy waits for its API before it goes live.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REQUIRED_JOBS } from "./require-green-release.mjs";
import { apiConverged, deployedCommitProblem, evaluateWebTarget, liveApiCommit, pageCommit, runWebGate, verifyWeb, waitForApi, webRecoveryProblem } from "./rollbackTarget.mjs";

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

// Instinct, Oct 30: a 503 JSON naming the target SHA was read as convergence because the SHA was
// read without checking HTTP success or readiness. Only a 200 `state: "ready"` answer proves the
// live API runs a release, so every other answer is "not yet", never "converged".
describe("the API wait believes only a ready health answer", () => {
  it("reads the commit of a 200 ready answer", () => {
    expect(liveApiCommit({ status: 200, body: { ok: true, state: "ready", commitSha: T } })).toBe(T);
    expect(liveApiCommit({ status: 200, body: { ok: true, state: "ready", commitSha: ` ${T} ` } })).toBe(T);
  });

  it("refuses a 503 that names the target SHA: a rollout, a failure and a refusal are not readiness", () => {
    for (const state of ["validating", "failed", undefined]) {
      expect(() => liveApiCommit({ status: 503, body: { ok: false, state, commitSha: T } })).toThrow(/HTTP 503/);
    }
    expect(() => liveApiCommit({ status: 401, body: { commitSha: T } })).toThrow(/HTTP 401/);
  });

  it("refuses a 200 that is not ready or names no full SHA", () => {
    expect(() => liveApiCommit({ status: 200, body: { state: "validating", commitSha: T } })).toThrow(/not ready/);
    expect(() => liveApiCommit({ status: 200, body: { ok: true, commitSha: T } })).toThrow(/not ready/);
    expect(() => liveApiCommit({ status: 200, body: null })).toThrow(/not ready/);
    expect(() => liveApiCommit({ status: 200, body: { state: "ready", commitSha: T.slice(0, 7) } })).toThrow(/full commit SHA/);
  });
});

// The real script as a process against a local HTTP stand-in for the live API.
function serveApi(answer: (n: number) => { status: number; body: unknown }) {
  let calls = 0;
  const server = createServer((_req, res) => {
    const { status, body } = answer(++calls);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  return new Promise<{ base: string; calls: () => number; close: () => void }>(resolve => server.listen(0, "127.0.0.1", () => {
    resolve({ base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls: () => calls, close: () => server.close() });
  }));
}
function waitCli(base: string, extra: Record<string, string> = {}) {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "", API_BASE_URL: base, EXPECTED_SHA: T, GITHUB_SHA: T,
    RELEASE_API_WAIT_MINUTES: "0.005", RELEASE_API_WAIT_INTERVAL_SECONDS: "0.001", ...extra,
  };
  return new Promise<{ code: number | null; out: string }>(resolve => {
    const child = spawn(process.execPath, ["scripts/rollbackTarget.mjs", "wait-api"], { cwd: root, env });
    let out = "";
    child.stdout.on("data", d => { out += d; });
    child.stderr.on("data", d => { out += d; });
    child.on("close", code => resolve({ code, out }));
  });
}

describe("wait-api as a process", () => {
  it("exits 0 on a ready API running this commit", async () => {
    const s = await serveApi(() => ({ status: 200, body: { ok: true, state: "ready", commitSha: T } }));
    try {
      const { code, out } = await waitCli(s.base);
      expect(out).toContain(`API WAIT CONVERGED: ${T}`);
      expect(code).toBe(0);
    } finally { s.close(); }
  });

  it.each([
    ["a 503 whose JSON names the target SHA", () => ({ status: 503, body: { ok: false, state: "validating", commitSha: T } })],
    ["a 503 failed rollout naming the target SHA", () => ({ status: 503, body: { ok: false, state: "failed", commitSha: T } })],
    ["a 401", () => ({ status: 401, body: { commitSha: T } })],
    ["an HTML error page", () => ({ status: 200, body: "<html>oops</html>" })],
  ])("exits 1 on %s and never reports convergence", async (_label, answer) => {
    const s = await serveApi(answer as () => { status: number; body: unknown });
    try {
      const { code, out } = await waitCli(s.base);
      expect(out).toContain("DID NOT CONVERGE");
      expect(out).not.toContain(`API WAIT CONVERGED: ${T}`);
      expect(code).toBe(1);
    } finally { s.close(); }
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

  it("fails closed: a failed wait stops the job before any production write and records why", () => {
    const wait = at(/node scripts\/rollbackTarget\.mjs wait-api/);
    const deploy = at(/wrangler pages deploy/);
    const record = at(/steps\.api-wait\.outcome == 'failure'/);
    // The wait is an ordinary step, so its non-zero exit skips every later step but the record.
    expect(steps[wait]).not.toMatch(/continue-on-error/);
    expect(deploy).toBeGreaterThan(wait);
    // No condition may let the Pages deploy run after a failed wait, and no record step deploys.
    expect(steps[deploy]).not.toMatch(/^ {8}if:/m);
    expect(record).toBeGreaterThan(wait);
    expect(steps[record]).toMatch(/^ {8}if: failure\(\)/m);
    expect(steps[record]).toMatch(/API did not converge/);
    expect(steps[record]).toMatch(/NOT deployed/);
    expect(steps[record]).not.toMatch(/wrangler pages deploy/);
    // The old fail-open shape is gone: nothing deploys and then fails afterwards.
    expect(steps.some(s => /steps\.api-wait\.outputs\.converged == 'false'/.test(s))).toBe(false);
  });
});
