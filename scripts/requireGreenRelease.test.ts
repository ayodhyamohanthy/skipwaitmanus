// @vitest-environment node
// P1-deploy-green-gate (#748): no production migration or deployment starts until the CI
// workflow has passed on the exact commit being released. On Oct 27 main 2dcea864 migrated
// and deployed while its CI failed; these tests pin every path that must now refuse it.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REQUIRED_JOBS, ciVerdict, contextProblem, evaluateRelease, runGate } from "./require-green-release.mjs";

const root = path.resolve(__dirname, "..");
const T = "a".repeat(40);
const NEWER = "b".repeat(40);
const OLDER = "c".repeat(40);
type Run = { id: number; name: string; path: string; event: string; head_branch: string; head_sha: string; status: string; conclusion: string | null; run_attempt: number };
type Job = { name: string; status: string; conclusion: string | null; head_sha: string };
type Cmp = { status: string; ahead_by: number; behind_by: number };
const run = (extra: Partial<Run> = {}): Run => ({
  id: 1, name: "CI", path: ".github/workflows/ci.yml", event: "push", head_branch: "main", head_sha: T, status: "completed", conclusion: "success", run_attempt: 1, ...extra,
});
const jobs = (over: Record<string, Partial<Job>> = {}, sha = T): Job[] =>
  REQUIRED_JOBS.map((name: string) => ({ name, status: "completed", conclusion: "success", head_sha: sha, ...over[name] }));
const cmp = (status: string): Cmp => ({ status, ahead_by: status === "ahead" ? 3 : 0, behind_by: status === "behind" ? 3 : status === "diverged" ? 2 : 0 });

// A GitHub stand-in with the same calls the gate makes. `compares` keys are "<base>...<head>".
function fake({ runs = [run()], jobsOf = { 1: jobs() } as Record<number, Job[]>, compares = {} as Record<string, string>, marker = null as string | null, pages = [] as Partial<Run>[], fail = 0 } = {}) {
  const calls: string[] = [];
  let failures = fail;
  const gate = (what: string) => { calls.push(what); if (failures > 0) { failures--; throw new Error("HTTP 502 from GitHub"); } };
  return {
    calls,
    async compare(base: string, head: string) { gate(`compare ${base}...${head}`); return cmp(compares[`${base}...${head}`] ?? (head === "main" ? "identical" : "behind")); },
    async ciRuns(sha: string) { gate(`runs ${sha}`); return runs; },
    async ciJobs(id: number) { gate(`jobs ${id}`); return jobsOf[id] ?? []; },
    async apiRuntimeMarker() { gate("marker"); return marker; },
    async pagesRuns() { gate("pages"); return pages.map(p => run({ path: ".github/workflows/deploy-pages.yml", ...p })); },
  };
}
const verdict = (runs: Run[], jobsOf: Record<number, Job[]> = { 1: jobs() }) => ciVerdict({ sha: T, runs, jobsByRun: new Map(Object.entries(jobsOf).map(([k, v]) => [Number(k), v])) });

describe("CI verdict for the exact commit", () => {
  it("passes only when every required job of the main run succeeded on that commit", () => {
    expect(verdict([run()]).state).toBe("green");
    expect(REQUIRED_JOBS).toEqual(["typecheck", "unit + component + route tests", "production build"]);
  });

  it("refuses the #748 incident shape: tests failed while typecheck and build passed", () => {
    // Real run 40486604317 for 2dcea864 (read-only GitHub API, Oct 27): conclusion failure.
    const red = run({ id: 40486604317, conclusion: "failure" });
    const v = verdict([red], { 40486604317: jobs({ "unit + component + route tests": { conclusion: "failure" } }) });
    expect(v.state).toBe("red");
    expect(v.reason).toContain("40486604317");
  });

  it("waits while CI is missing, queued or running and never treats that as a pass", () => {
    expect(verdict([]).state).toBe("missing");
    for (const status of ["queued", "in_progress", "waiting", "requested", "pending"]) expect(verdict([run({ status, conclusion: null })]).state).toBe("pending");
  });

  it.each(["failure", "cancelled", "timed_out", "action_required", "neutral", "skipped", "stale", "startup_failure", null])("refuses a run that concluded %s", conclusion => {
    expect(verdict([run({ conclusion })]).state).toBe("red");
  });

  it("refuses a run whose required job was skipped, failed, missing or ran on another commit", () => {
    expect(verdict([run()], { 1: jobs({ "production build": { conclusion: "skipped" } }) }).state).toBe("red");
    expect(verdict([run()], { 1: jobs({ typecheck: { conclusion: "failure" } }) }).state).toBe("red");
    expect(verdict([run()], { 1: jobs().filter(j => j.name !== "typecheck") }).state).toBe("red");
    expect(verdict([run()], { 1: jobs({ typecheck: { head_sha: NEWER } }) }).state).toBe("red");
  });

  it("ignores runs that did not test this exact commit on main: pull requests, other branches, other SHAs, other workflows", () => {
    // A pull_request run tests a merge ref, not the release commit; a zero-second Workers Builds check is not a CI run at all.
    expect(verdict([run({ event: "pull_request" })]).state).toBe("missing");
    expect(verdict([run({ head_branch: "agent/queue/x" })]).state).toBe("missing");
    expect(verdict([run({ head_sha: NEWER })]).state).toBe("missing");
    expect(verdict([run({ path: ".github/workflows/design-gate.yml" })]).state).toBe("missing");
    expect(verdict([run({ event: "workflow_dispatch" })]).state).toBe("green");
  });

  it("never lets an older green run hide a newer red or running one on the same commit", () => {
    const pass = run({ id: 1 });
    expect(verdict([pass, run({ id: 2, event: "workflow_dispatch", conclusion: "failure" })], { 1: jobs(), 2: jobs() }).state).toBe("red");
    expect(verdict([run({ id: 2, conclusion: "failure" }), pass], { 1: jobs(), 2: jobs() }).state).toBe("red");
    // A re-run of a passed run shows the newest attempt: while it runs the gate waits, and its result decides.
    expect(verdict([run({ run_attempt: 2, status: "in_progress", conclusion: null })]).state).toBe("pending");
    expect(verdict([run({ run_attempt: 2, conclusion: "failure" })]).state).toBe("red");
    expect(verdict([run({ run_attempt: 2 })]).state).toBe("green");
  });
});

describe("release context", () => {
  it("accepts a push or a manual dispatch of main only", () => {
    expect(contextProblem({ sha: T, ref: "refs/heads/main", event: "push", target: "api" })).toBeNull();
    expect(contextProblem({ sha: T, ref: "refs/heads/main", event: "workflow_dispatch", target: "web" })).toBeNull();
    expect(contextProblem({ sha: T, ref: "refs/heads/agent/queue/x", event: "workflow_dispatch", target: "api" })).toMatch(/main/);
    expect(contextProblem({ sha: T, ref: "refs/tags/api-runtime", event: "workflow_dispatch", target: "api" })).toMatch(/main/);
    expect(contextProblem({ sha: T, ref: "refs/heads/main", event: "pull_request", target: "api" })).toMatch(/pull_request/);
    expect(contextProblem({ sha: "abc", ref: "refs/heads/main", event: "push", target: "api" })).toMatch(/commit/);
    expect(contextProblem({ sha: T, ref: "refs/heads/main", event: "push", target: "db" })).toMatch(/target/);
  });
});

describe("superseded and out-of-line releases", () => {
  const evaluate = (gh: ReturnType<typeof fake>, target = "api") => evaluateRelease({ gh, sha: T, target, runId: "999" });

  it("refuses a commit that is not on main", async () => {
    for (const status of ["behind", "diverged"]) expect((await evaluate(fake({ compares: { [`${T}...main`]: status } }))).state).toBe("red");
    expect((await evaluate(fake({ compares: { [`${T}...main`]: "ahead" } }))).state).toBe("green");
  });

  it("refuses a stale API rerun once production runs a newer commit, and allows a same-commit redeploy", async () => {
    expect((await evaluate(fake({ marker: NEWER, compares: { [`${T}...${NEWER}`]: "ahead" } }))).state).toBe("red");
    expect((await evaluate(fake({ marker: T }))).state).toBe("green");
    expect((await evaluate(fake({ marker: OLDER, compares: { [`${T}...${OLDER}`]: "behind" } }))).state).toBe("green");
    expect((await evaluate(fake({ marker: null }))).state).toBe("green");
  });

  it("refuses a stale Web rerun once a newer commit deployed successfully", async () => {
    const pages = [{ id: 5, head_sha: NEWER }, { id: 4, head_sha: T }, { id: 3, head_sha: OLDER }];
    expect((await evaluate(fake({ pages, compares: { [`${T}...${NEWER}`]: "ahead" } }), "web")).state).toBe("red");
    expect((await evaluate(fake({ pages: [{ id: 4, head_sha: T }, { id: 3, head_sha: OLDER }] }), "web")).state).toBe("green");
  });

  it("never reads superseded state for a commit whose CI is not green", async () => {
    const gh = fake({ runs: [run({ conclusion: "failure" })], marker: NEWER });
    expect((await evaluate(gh)).state).toBe("red");
    expect(gh.calls).not.toContain("marker");
  });
});

describe("the waiting gate", () => {
  const clock = () => { let t = 0; return { now: () => t, sleep: async (ms: number) => { t += ms; } }; };
  const opts = { sha: T, ref: "refs/heads/main", event: "push", target: "api", runId: "999", timeoutMs: 45 * 60_000, appearMs: 10 * 60_000, intervalMs: 30_000, log: () => {} };

  it("waits for running CI, then passes once it is green", async () => {
    let n = 0;
    const gh = fake();
    gh.ciRuns = async () => (++n < 4 ? [run({ status: "in_progress", conclusion: null })] : [run()]);
    const result = await runGate({ ...opts, ...clock(), gh });
    expect(result).toMatchObject({ ok: true });
    expect(n).toBe(4);
  });

  it("refuses at once when CI is red, without waiting", async () => {
    const c = clock();
    const result = await runGate({ ...opts, ...c, gh: fake({ runs: [run({ conclusion: "failure" })] }) });
    expect(result.ok).toBe(false);
    expect(c.now()).toBe(0);
  });

  it("refuses when CI is still running at the timeout", async () => {
    const result = await runGate({ ...opts, ...clock(), gh: fake({ runs: [run({ status: "in_progress", conclusion: null })] }) });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/timed out/);
  });

  it("refuses when no CI run appears, and says how to start one for a [skip ci] commit", async () => {
    const result = await runGate({ ...opts, ...clock(), gh: fake({ runs: [] }) });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/dispatch the CI workflow on main/);
  });

  it("retries a GitHub error but refuses after five in a row", async () => {
    expect(await runGate({ ...opts, ...clock(), gh: fake({ fail: 2 }) })).toMatchObject({ ok: true });
    expect(await runGate({ ...opts, ...clock(), gh: fake({ fail: 5 }) })).toMatchObject({ ok: false });
  });

  it("re-checks without waiting right before a production step: anything but green refuses", async () => {
    const once = { ...opts, once: true };
    expect(await runGate({ ...once, ...clock(), gh: fake() })).toMatchObject({ ok: true });
    expect(await runGate({ ...once, ...clock(), gh: fake({ runs: [run({ run_attempt: 2, status: "in_progress", conclusion: null })] }) })).toMatchObject({ ok: false });
    expect(await runGate({ ...once, ...clock(), gh: fake({ runs: [] }) })).toMatchObject({ ok: false });
  });

  it("refuses a bad context before calling GitHub", async () => {
    const gh = fake();
    expect(await runGate({ ...opts, ...clock(), gh, ref: "refs/heads/feature" })).toMatchObject({ ok: false });
    expect(gh.calls).toEqual([]);
  });
});

// The real script, as a process, against a local HTTP stand-in for the GitHub REST API.
function serve(handler: (url: URL, req: IncomingMessage) => unknown) {
  const seen: { url: string; auth: string | undefined }[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://local");
    seen.push({ url: url.pathname + url.search, auth: req.headers.authorization });
    const body = handler(url, req);
    res.writeHead(body === undefined ? 404 : 200, { "content-type": "application/json" });
    res.end(JSON.stringify(body ?? { message: "Not Found" }));
  });
  return new Promise<{ base: string; seen: typeof seen; close: () => void }>(resolve => server.listen(0, "127.0.0.1", () => {
    resolve({ base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen, close: () => server.close() });
  }));
}
function cli(base: string, target: string, extra: Record<string, string> = {}) {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "", GITHUB_API_URL: base, GITHUB_REPOSITORY: "o/r", GITHUB_SHA: T, GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "push", GITHUB_RUN_ID: "999", GITHUB_TOKEN: "test-token-not-printed", RELEASE_GATE_INTERVAL_SECONDS: "0.05", RELEASE_GATE_TIMEOUT_MINUTES: "0.01", RELEASE_GATE_APPEAR_MINUTES: "0.01", ...extra,
  };
  return new Promise<{ code: number | null; out: string }>(resolve => {
    const child = spawn(process.execPath, ["scripts/require-green-release.mjs", "--target", target], { cwd: root, env });
    let out = "";
    child.stdout.on("data", d => { out += d; });
    child.stderr.on("data", d => { out += d; });
    child.on("close", code => resolve({ code, out }));
  });
}
const api = (runs: Run[], jobList: Job[]) => (url: URL) => {
  if (url.pathname.endsWith("/actions/workflows/ci.yml/runs")) return { total_count: runs.length, workflow_runs: runs };
  if (/\/actions\/runs\/\d+\/jobs$/.test(url.pathname)) return { total_count: jobList.length, jobs: jobList };
  if (url.pathname.includes("/compare/")) return cmp("identical");
  if (url.pathname.endsWith("/actions/workflows/deploy-pages.yml/runs")) return { total_count: 0, workflow_runs: [] };
  return undefined; // refs/tags/api-runtime: no marker yet
};

describe("require-green-release.mjs as a process", () => {
  it("exits 0 and names the run for a fully green exact commit, sending the token without printing it", async () => {
    const s = await serve(api([run()], jobs()));
    try {
      const { code, out } = await cli(s.base, "api");
      expect(out).toContain(`RELEASE GATE PASS (api): ${T}`);
      expect(code).toBe(0);
      expect(out).not.toContain("test-token-not-printed");
      expect(s.seen.every(r => r.auth === "Bearer test-token-not-printed")).toBe(true);
      expect(s.seen.some(r => r.url.includes(`head_sha=${T}`))).toBe(true);
    } finally { s.close(); }
  });

  it("exits 1 for red CI, running CI past the timeout, and an unreachable API", async () => {
    const red = await serve(api([run({ conclusion: "failure" })], jobs({ "unit + component + route tests": { conclusion: "failure" } })));
    const running = await serve(api([run({ status: "in_progress", conclusion: null })], []));
    try {
      const a = await cli(red.base, "web");
      expect(a.code).toBe(1);
      expect(a.out).toContain("RELEASE GATE REFUSED (web)");
      const b = await cli(running.base, "api");
      expect(b.code).toBe(1);
      expect(b.out).toMatch(/timed out/);
      const c = await cli("http://127.0.0.1:9", "api");
      expect(c.code).toBe(1);
    } finally { red.close(); running.close(); }
  });

  it("exits 1 without a target or a commit", async () => {
    const s = await serve(api([run()], jobs()));
    try {
      expect((await cli(s.base, "")).code).toBe(1);
      expect((await cli(s.base, "api", { GITHUB_SHA: "" })).code).toBe(1);
    } finally { s.close(); }
  });
});

// Workflow structure: a minimal reader for the two deploy workflows (no YAML dependency).
type Step = { name: string; body: string[] };
function workflow(file: string) {
  const text = readFileSync(path.join(root, ".github/workflows", file), "utf8");
  const lines = text.split("\n");
  const jobs = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of lines.slice(lines.indexOf("jobs:") + 1)) {
    const key = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (key) { current = []; jobs.set(key[1], current); continue; }
    if (/^\S/.test(line)) break;
    if (current) current.push(line);
  }
  const needs = (job: string) => (jobs.get(job) ?? []).find(l => /^ {4}needs:/.test(l))?.replace(/^ {4}needs:\s*/, "").replace(/[[\]\s]/g, "").split(",").filter(Boolean) ?? [];
  const steps = (job: string): Step[] => {
    const out: Step[] = [];
    for (const line of jobs.get(job) ?? []) {
      if (/^ {6}- /.test(line)) out.push({ name: /name:\s*(.+)$/.exec(line)?.[1] ?? line.trim(), body: [line] });
      else if (out.length && /^ {8}/.test(line)) out[out.length - 1].body.push(line);
    }
    return out;
  };
  return { text, jobs, needs, steps };
}
const has = (step: Step, pattern: RegExp) => step.body.some(l => pattern.test(l));
const PRODUCTION = /wrangler|deploy-cloudflare-two-phase|apply-deploy-migrations|git push -f origin refs\/tags\/api-runtime/;
const RECHECK = (target: string) => new RegExp(`node scripts/require-green-release\\.mjs --target ${target} --once`);

describe.each([
  { file: "deploy-api.yml", target: "api", sideJobs: ["migrate-db", "deploy"] },
  { file: "deploy-pages.yml", target: "web", sideJobs: ["deploy"] },
])("$file", ({ file, target, sideJobs }) => {
  const wf = workflow(file);

  it("has a waiting release gate that every production job depends on", () => {
    const gate = wf.steps("release-gate");
    expect(gate.some(s => has(s, new RegExp(`node scripts/require-green-release\\.mjs --target ${target}\\s*$`)))).toBe(true);
    expect(gate.some(s => has(s, /GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/))).toBe(true);
    expect(wf.needs("release-gate")).toEqual([]);
    const reaches = (job: string, seen = new Set<string>()): boolean => wf.needs(job).some(n => n === "release-gate" || (!seen.has(n) && seen.add(n) && reaches(n, seen)));
    for (const job of wf.jobs.keys()) if (job !== "release-gate") expect(reaches(job)).toBe(true);
  });

  it("re-checks right before each production step in the same job, with no way around it", () => {
    for (const job of sideJobs) {
      const steps = wf.steps(job);
      const recheck = steps.findIndex(s => has(s, RECHECK(target)));
      expect(recheck).toBeGreaterThanOrEqual(0);
      const production = steps.map((s, i) => (has(s, PRODUCTION) ? i : -1)).filter(i => i >= 0);
      expect(production.length).toBeGreaterThan(0);
      for (const i of production) expect(i).toBeGreaterThan(recheck);
      const condition = steps[recheck].body.find(l => /^ {8}if:/.test(l));
      for (const i of production) expect(steps[i].body.find(l => /^ {8}if:/.test(l))).toBe(condition);
    }
    for (const job of wf.jobs.keys()) {
      const lines = wf.jobs.get(job) ?? [];
      expect(lines.some(l => /^ {4}if:/.test(l))).toBe(false);
      expect(lines.some(l => /^ {4}continue-on-error/.test(l))).toBe(false);
      for (const s of wf.steps(job)) if (has(s, /require-green-release|wrangler|apply-deploy-migrations|deploy-cloudflare/)) expect(has(s, /continue-on-error/)).toBe(false);
    }
  });

  it("keeps manual recovery and lets the gate read Actions", () => {
    expect(wf.text).toMatch(/^ {2}workflow_dispatch:/m);
    expect(wf.text).toMatch(/^permissions:\n(?: {2}.+\n)*? {2}actions: read$/m);
  });
});

describe("deploy-api.yml migrations", () => {
  it("apply only after the release gate passed, never merely before the deploy job", () => {
    const wf = workflow("deploy-api.yml");
    expect(wf.needs("migrate-db")).toEqual(["release-gate"]);
    expect(wf.needs("deploy")).toEqual(["migrate-db"]);
  });
});
