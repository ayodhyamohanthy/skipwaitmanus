// @vitest-environment node
// P1-deploy-green-gate (#748): no production migration or deployment starts until the CI
// workflow has passed on the exact commit being released. On Oct 27 main 2dcea864 migrated
// and deployed while its CI failed; these tests pin every path that must now refuse it.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REQUIRED_JOBS, SCHEMA_CONTRACT, ciVerdict, contextProblem, evaluateRelease, gitHubClient, parseCompare, recoveryProblem, runGate } from "./require-green-release.mjs";

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
// Counts as GitHub reports them for each status: a diverged compare has commits on both sides.
const cmp = (status: string): Cmp => ({ status, ahead_by: status === "ahead" || status === "diverged" ? 2 : 0, behind_by: status === "behind" || status === "diverged" ? 3 : 0 });

// The schema contract as GitHub's contents API reports it, the same at every ref unless a test overrides "<path>@<ref>".
type Contents = { kind: "dir"; entries: { name: string; sha: string }[] } | { kind: "file"; sha: string } | null;
const sameSchema = (p: string): Contents => (p === "drizzle/deploy" ? { kind: "dir", entries: [{ name: "0120_job_catalog.sql", sha: "m120" }] } : { kind: "file", sha: `blob-${p}` });

// A GitHub stand-in with the same calls the gate makes. `compares` keys are "<base>...<head>"; a value is a status, or a raw response body.
function fake({ runs = [run()], jobsOf = { 1: jobs() } as Record<number, Job[]>, compares = {} as Record<string, string | Record<string, unknown>>, marker = null as string | null, pages = [] as Partial<Run>[], fail = 0, schema = {} as Record<string, Contents> } = {}) {
  const calls: string[] = [];
  let failures = fail;
  const gate = (what: string) => { calls.push(what); if (failures > 0) { failures--; throw new Error("HTTP 502 from GitHub"); } };
  return {
    calls,
    async compare(base: string, head: string) { gate(`compare ${base}...${head}`); const v = compares[`${base}...${head}`] ?? (head === "main" ? "identical" : "behind"); return typeof v === "string" ? cmp(v) : v; },
    async ciRuns(sha: string) { gate(`runs ${sha}`); return runs; },
    async ciJobs(id: number) { gate(`jobs ${id}`); return jobsOf[id] ?? []; },
    async apiRuntimeMarker() { gate("marker"); return marker; },
    async pagesRuns() { gate("pages"); return pages.map(p => run({ path: ".github/workflows/deploy-pages.yml", ...p })); },
    async contents(p: string, ref: string) { gate(`contents ${p}@${ref}`); return `${p}@${ref}` in schema ? schema[`${p}@${ref}`] : sameSchema(p); },
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

// Deliberate manual recovery (rollback.yml, #751): an older known-green main commit, chosen on purpose.
const MAIN = "d".repeat(40);
const intent = (extra: Record<string, string> = {}) => ({ system: "api", commit: OLDER, confirm: OLDER, reason: "API errors after the latest release", ...extra });

describe("manual recovery intent", () => {
  it("needs the API, a full commit typed twice and a reason", () => {
    expect(recoveryProblem(intent())).toBeNull();
    for (const system of ["web", "all", ""]) expect(recoveryProblem(intent({ system }))).toMatch(/only the API/);
    for (const commit of ["", "c0ffee", OLDER.toUpperCase(), `${OLDER} `, `${OLDER}; rm -rf /`]) expect(recoveryProblem(intent({ commit, confirm: commit }))).toMatch(/40-character/);
    expect(recoveryProblem(intent({ confirm: NEWER }))).toMatch(/confirmation/);
    for (const reason of ["", "   \n "]) expect(recoveryProblem(intent({ reason }))).toMatch(/reason/);
    expect(recoveryProblem(intent({ reason: "x".repeat(501) }))).toMatch(/500/);
  });

  it("runs only from a manual dispatch of main", () => {
    expect(contextProblem({ sha: OLDER, ref: "refs/heads/main", event: "workflow_dispatch", target: "api", recovery: true })).toBeNull();
    expect(contextProblem({ sha: OLDER, ref: "refs/heads/main", event: "push", target: "api", recovery: true })).toMatch(/manual dispatch/);
    expect(contextProblem({ sha: OLDER, ref: "refs/heads/old-release", event: "workflow_dispatch", target: "api", recovery: true })).toMatch(/main/);
  });
});

describe("recovery evaluation", () => {
  const older = (extra: Partial<Run> = {}) => run({ head_sha: OLDER, ...extra });
  const base = { runs: [older()], jobsOf: { 1: jobs({}, OLDER) }, marker: T, compares: { [`${OLDER}...${T}`]: "ahead" } };
  const evaluate = (gh: ReturnType<typeof fake>, recovery: boolean) => evaluateRelease({ gh, sha: OLDER, target: "api", runId: "999", recovery, workflowSha: MAIN });

  it("accepts an older known-green main commit that an ordinary deploy would refuse as superseded", async () => {
    expect((await evaluate(fake(base), false)).state).toBe("red");
    const gh = fake(base);
    const result = await evaluate(gh, true);
    expect(result.state).toBe("green");
    expect(gh.calls).not.toContain("marker");
    for (const p of SCHEMA_CONTRACT) expect(gh.calls).toEqual(expect.arrayContaining([`contents ${p}@${OLDER}`, `contents ${p}@${MAIN}`]));
  });

  it("still refuses a red, running, missing or off-main recovery target", async () => {
    expect((await evaluate(fake({ ...base, runs: [older({ conclusion: "failure" })] }), true)).state).toBe("red");
    expect((await evaluate(fake({ ...base, runs: [older({ status: "in_progress", conclusion: null })] }), true)).state).toBe("pending");
    expect((await evaluate(fake({ ...base, runs: [] }), true)).state).toBe("missing");
    expect((await evaluate(fake({ ...base, runs: [older({ event: "pull_request" })] }), true)).state).toBe("missing");
    expect((await evaluate(fake({ ...base, compares: { [`${OLDER}...main`]: "diverged" } }), true)).state).toBe("red");
  });

  it("refuses a target whose schema contract differs from main, naming what differs", async () => {
    const newer: Contents = { kind: "dir", entries: [{ name: "0120_job_catalog.sql", sha: "m120" }, { name: "0121_more.sql", sha: "m121" }] };
    const drift = await evaluate(fake({ ...base, schema: { [`drizzle/deploy@${MAIN}`]: newer } }), true);
    expect(drift.state).toBe("red");
    expect(drift.reason).toContain("drizzle/deploy/0121_more.sql");
    const reconcile = await evaluate(fake({ ...base, schema: { [`server/schemaReconcile.ts@${OLDER}`]: null } }), true);
    expect(reconcile.state).toBe("red");
    expect(reconcile.reason).toContain("server/schemaReconcile.ts");
    expect((await evaluate(fake({ ...base, schema: { [`drizzle/schema.ts@${OLDER}`]: { kind: "file", sha: "older" } } }), true)).state).toBe("red");
  });

  it("refuses a malformed request before any GitHub call", async () => {
    const gh = fake(base);
    const opts = { gh, sha: OLDER, ref: "refs/heads/main", event: "workflow_dispatch", target: "api", runId: "999", recovery: true, workflowSha: MAIN, timeoutMs: 1, appearMs: 1, intervalMs: 1, sleep: async () => {} };
    expect(await runGate({ ...opts, intent: intent({ confirm: T }) })).toMatchObject({ ok: false });
    expect(await runGate({ ...opts, intent: intent({ reason: " " }) })).toMatchObject({ ok: false });
    expect(await runGate({ ...opts, intent: intent(), workflowSha: "" })).toMatchObject({ ok: false });
    expect(gh.calls).toEqual([]);
    expect(await runGate({ ...opts, intent: intent() })).toMatchObject({ ok: true });
  });
});

// P1-release-gate-strict-compare (#748): a compare count that is missing or malformed was read as NaN, which
// "descends" treats as "not newer", so a stale release passed. Every compare body must be GitHub's exact shape.
describe("strict compare responses", () => {
  const VALID = [
    { status: "identical", ahead_by: 0, behind_by: 0 },
    { status: "ahead", ahead_by: 3, behind_by: 0 },
    { status: "behind", ahead_by: 0, behind_by: 2 },
    { status: "diverged", ahead_by: 2, behind_by: 1 },
  ];
  const MALFORMED: [string, unknown][] = [
    ["a missing behind_by", { status: "ahead", ahead_by: 3 }],
    ["a missing ahead_by", { status: "behind", behind_by: 3 }],
    ["a null count", { status: "ahead", ahead_by: 3, behind_by: null }],
    ["string counts", { status: "ahead", ahead_by: "3", behind_by: "0" }],
    ["a non-finite count", JSON.parse('{"status":"ahead","ahead_by":1e309,"behind_by":0}')],
    ["a negative count", { status: "behind", ahead_by: 0, behind_by: -1 }],
    ["a fractional count", { status: "ahead", ahead_by: 1.5, behind_by: 0 }],
    ["an unknown status", { status: "unknown", ahead_by: 0, behind_by: 0 }],
    ["no status", { ahead_by: 0, behind_by: 0 }],
    ["ahead with nothing ahead", { status: "ahead", ahead_by: 0, behind_by: 0 }],
    ["identical with commits between", { status: "identical", ahead_by: 1, behind_by: 0 }],
    ["behind with commits ahead", { status: "behind", ahead_by: 2, behind_by: 3 }],
    ["diverged on one side only", { status: "diverged", ahead_by: 0, behind_by: 2 }],
    ["an array body", ["ahead"]],
    ["a null body", null],
  ];
  const client = (body: unknown) => gitHubClient({ apiUrl: "http://gh.test", repo: "o/r", token: "", fetchImpl: async () => ({ ok: true, status: 200, json: async () => body }) });

  it("accepts GitHub's four consistent shapes at the client boundary", async () => {
    for (const body of VALID) {
      expect(await client(body).compare(T, "main")).toEqual(body);
      expect(parseCompare(body)).toEqual(body);
    }
  });

  it.each(MALFORMED)("refuses a compare response with %s instead of coercing it", async (_, body) => {
    await expect(client(body).compare(T, "main")).rejects.toThrow(/unexpected GitHub response/);
    expect(() => parseCompare(body)).toThrow(/unexpected GitHub response/);
  });

  const clock = () => { let t = 0; return { now: () => t, sleep: async (ms: number) => { t += ms; } }; };
  const opts = { sha: T, ref: "refs/heads/main", event: "push", target: "api", runId: "999", timeoutMs: 45 * 60_000, appearMs: 10 * 60_000, intervalMs: 30_000, log: () => {} };
  const missingBehind = { status: "ahead", ahead_by: 3 };

  it("never lets a malformed count turn a stale API rerun into a pass", async () => {
    const result = await runGate({ ...opts, ...clock(), gh: fake({ marker: NEWER, compares: { [`${T}...${NEWER}`]: missingBehind } }) });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/unexpected GitHub response/);
  });

  it("never lets a malformed count turn a stale Web rerun into a pass", async () => {
    const gh = fake({ pages: [{ id: 5, head_sha: NEWER }], compares: { [`${T}...${NEWER}`]: missingBehind } });
    const result = await runGate({ ...opts, ...clock(), target: "web", gh });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/unexpected GitHub response/);
  });

  it("refuses when main membership comes back malformed, for a release and a recovery alike", async () => {
    const release = await runGate({ ...opts, ...clock(), gh: fake({ compares: { [`${T}...main`]: { status: "ahead", ahead_by: 2, behind_by: "0" } } }) });
    expect(release.ok).toBe(false);
    expect(release.reason).toMatch(/unexpected GitHub response/);
    const older = { runs: [run({ head_sha: OLDER })], jobsOf: { 1: jobs({}, OLDER) } };
    const recovery = { ...opts, ...clock(), event: "workflow_dispatch", recovery: true, intent: intent(), workflowSha: MAIN };
    const malformed = await runGate({ ...recovery, gh: fake({ ...older, compares: { [`${OLDER}...main`]: { status: "ahead", ahead_by: 2 } } }) });
    expect(malformed.ok).toBe(false);
    expect(malformed.reason).toMatch(/unexpected GitHub response/);
  });

  it("keeps deliberate recovery of an older green target working on well-formed responses", async () => {
    const older = { runs: [run({ head_sha: OLDER })], jobsOf: { 1: jobs({}, OLDER) }, marker: T, compares: { [`${OLDER}...main`]: "ahead", [`${OLDER}...${T}`]: "ahead" } };
    const recovery = { ...opts, ...clock(), event: "workflow_dispatch", recovery: true, intent: intent(), workflowSha: MAIN };
    expect(await runGate({ ...recovery, gh: fake(older) })).toMatchObject({ ok: true });
    expect(await runGate({ ...opts, ...clock(), sha: OLDER, event: "workflow_dispatch", gh: fake(older) })).toMatchObject({ ok: false });
  });

  it("re-checks with --once without waiting for CI, but retries a GitHub error at most five times", async () => {
    const failing = clock();
    const gh = fake({ fail: 99 });
    const refused = await runGate({ ...opts, ...failing, once: true, gh });
    expect(refused.ok).toBe(false);
    expect(refused.reason).toMatch(/5 attempts in a row/);
    expect(gh.calls).toHaveLength(5);
    expect(failing.now()).toBe(4 * opts.intervalMs);
    const blip = clock();
    expect(await runGate({ ...opts, ...blip, once: true, gh: fake({ fail: 1 }) })).toMatchObject({ ok: true });
    expect(blip.now()).toBe(opts.intervalMs);
    const running = clock();
    expect(await runGate({ ...opts, ...running, once: true, gh: fake({ runs: [run({ status: "in_progress", conclusion: null })] }) })).toMatchObject({ ok: false });
    expect(running.now()).toBe(0);
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
function cli(base: string, target: string, extra: Record<string, string> = {}, flags: string[] = []) {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "", GITHUB_API_URL: base, GITHUB_REPOSITORY: "o/r", GITHUB_SHA: T, GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "push", GITHUB_RUN_ID: "999", GITHUB_TOKEN: "test-token-not-printed", RELEASE_GATE_INTERVAL_SECONDS: "0.05", RELEASE_GATE_TIMEOUT_MINUTES: "0.01", RELEASE_GATE_APPEAR_MINUTES: "0.01", ...extra,
  };
  return new Promise<{ code: number | null; out: string }>(resolve => {
    const child = spawn(process.execPath, ["scripts/require-green-release.mjs", "--target", target, ...flags], { cwd: root, env });
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
  if (url.pathname.endsWith("/contents/drizzle/deploy")) return [{ name: "0120_job_catalog.sql", path: "drizzle/deploy/0120_job_catalog.sql", sha: "m120", type: "file" }];
  if (url.pathname.includes("/contents/")) return { type: "file", sha: "same-blob" };
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

  it("recovers only a deliberate request: records who, what and why, and refuses a mismatch before any request", async () => {
    const s = await serve(api([run({ head_sha: OLDER, event: "push" })], jobs({}, OLDER)));
    const summary = path.join(mkdtempSync(path.join(os.tmpdir(), "gate-")), "summary.md");
    writeFileSync(summary, "");
    const recovery = { GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: MAIN, GITHUB_ACTOR: "owner-login", GITHUB_STEP_SUMMARY: summary, RECOVERY_SYSTEM: "api", RECOVERY_COMMIT: OLDER, RECOVERY_CONFIRM: OLDER, RECOVERY_REASON: "API errors `after` release\nline two" };
    try {
      const ok = await cli(s.base, "api", recovery, ["--recovery"]);
      expect(ok.out).toContain(`RELEASE GATE PASS (api recovery): ${OLDER}`);
      expect(ok.code).toBe(0);
      const record = readFileSync(summary, "utf8");
      for (const part of ["owner-login", OLDER, MAIN, "API errors 'after' release line two"]) expect(record).toContain(part);
      const before = s.seen.length;
      const refused = await cli(s.base, "api", { ...recovery, RECOVERY_CONFIRM: T }, ["--recovery"]);
      expect(refused.code).toBe(1);
      expect(refused.out).toMatch(/confirmation/);
      expect(s.seen.length).toBe(before);
    } finally { s.close(); }
  });

  it("refuses a stale rerun whose compare response is missing a count, as a real process", async () => {
    const base = api([run()], jobs());
    const s = await serve(url => {
      if (url.pathname.endsWith("/git/ref/tags/api-runtime")) return { ref: "refs/tags/api-runtime", object: { type: "commit", sha: NEWER } };
      if (url.pathname.endsWith(`/compare/${T}...${NEWER}`)) return { status: "ahead", ahead_by: 3 };
      return base(url);
    });
    try {
      const { code, out } = await cli(s.base, "api");
      expect(out).toContain("RELEASE GATE REFUSED (api)");
      expect(out).toMatch(/unexpected GitHub response/);
      expect(code).toBe(1);
    } finally { s.close(); }
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

describe("rollback.yml: deliberate API recovery", () => {
  const wf = workflow("rollback.yml");
  const inputs = wf.text.slice(wf.text.indexOf("    inputs:"), wf.text.indexOf("\nconcurrency:"));
  const recover = wf.steps("recover-api");
  const at = (pattern: RegExp) => recover.findIndex(s => has(s, pattern));

  it("is dispatch-only and asks for the system, the full commit twice and a reason", () => {
    expect(wf.text).toMatch(/^on:\n {2}workflow_dispatch:\n/m);
    expect(wf.text).not.toMatch(/^ {2}(push|pull_request|pull_request_target|schedule|workflow_run|workflow_call):/m);
    for (const name of ["target", "commit", "confirm", "reason"]) expect(inputs).toMatch(new RegExp(`\\n {6}${name}:\\n(?: {8}.+\\n)*? {8}required: true\\n`));
    // D-248 (4): the option set is exact and in declared order, so a fourth option or a
    // reordered one that skips this pin still fails.
    expect(inputs).toMatch(/ {8}options:\n {10}- api\n {10}- all\n {10}- web\n(?! {10}- )/);
  });

  it("waits in the API deploy queue and lets the gate read Actions", () => {
    expect(wf.text).toMatch(/^concurrency:\n {2}group: deploy-api\n {2}cancel-in-progress: false$/m);
    expect(wf.text).toMatch(/^permissions:\n(?: {2}.+\n)*? {2}actions: read$/m);
  });

  it("validates the request with the workflow's own code before the older target is ever checked out", () => {
    expect([...wf.jobs.keys()]).toEqual(["recovery-gate", "recover-api", "rollback-web"]);
    expect(wf.needs("recovery-gate")).toEqual([]);
    expect(wf.needs("recover-api")).toEqual(["recovery-gate", "rollback-web"]);
    expect(wf.needs("rollback-web")).toEqual(["recovery-gate"]);
    const gate = wf.steps("recovery-gate");
    expect(gate.some(s => has(s, /^ {10}ref:/))).toBe(false);
    expect(gate.some(s => has(s, /run: node scripts\/require-green-release\.mjs --target api --recovery\s*$/))).toBe(true);
    expect(gate.some(s => has(s, /run: node scripts\/rollbackTarget\.mjs web-gate\s*$/))).toBe(true);
    const trusted = at(/path: trusted/);
    const target = at(/ref: \$\{\{ inputs\.commit \}\}/);
    expect(trusted).toBeGreaterThanOrEqual(0);
    expect(has(recover[trusted], /^ {10}ref:/)).toBe(false);
    expect(has(recover[target], /path: target/)).toBe(true);
    for (const s of recover) if (has(s, /require-green-release|deploy-cloudflare-two-phase|verify-cloudflare-container-release/)) expect(has(s, /trusted\/scripts\//)).toBe(true);
  });

  it("never lets the older target's install or build reach the GitHub token", () => {
    const all = [...wf.jobs.keys()].flatMap(job => wf.steps(job));
    for (const s of all) if (has(s, /actions\/checkout@/)) expect(has(s, /persist-credentials: false/)).toBe(true);
    const tokened = all.filter(s => has(s, /secrets\.GITHUB_TOKEN/)).map(s => s.name);
    expect(tokened).toEqual([
      "Require a deliberate request and green CI on the recovery target",
      "Require a deliberate request and green CI on the web recovery target",
      "Re-check the recovery target",
      "Move the runtime marker to the target",
      "Re-check the web recovery target",
    ]);
    expect(wf.text).not.toMatch(/git push/);
  });

  it("re-checks before the first production write, deploys and verifies the target SHA, then moves the marker, with no migrations", () => {
    const recheck = at(/node trusted\/scripts\/require-green-release\.mjs --target api --recovery --once/);
    const deploy = at(/deploy-cloudflare-two-phase\.sh/);
    const verify = at(/verify-cloudflare-container-release\.sh/);
    const marker = at(/git\/refs\/tags\/api-runtime/);
    expect(recheck).toBeGreaterThanOrEqual(0);
    expect([recheck < deploy, deploy < verify, verify < marker]).toEqual([true, true, true]);
    for (const i of [deploy, verify, marker]) {
      expect(recover[i].body.some(l => /^ {8}if:/.test(l))).toBe(false);
      expect(has(recover[i], /EXPECTED_SHA: \$\{\{ inputs\.commit \}\}/)).toBe(true);
    }
    expect(wf.text).not.toMatch(/apply-deploy-migrations|MYSQL_PWD|NEWDB_PASSWORD|npx wrangler deploy/);
  });

  it("never puts a dispatch input into a shell command", () => {
    for (const job of wf.jobs.keys()) for (const s of wf.steps(job)) {
      const runAt = s.body.findIndex(l => /^ {8}run:/.test(l));
      if (runAt >= 0) expect(s.body.slice(runAt).join("\n")).not.toMatch(/\$\{\{\s*(inputs|github\.event\.inputs)\./);
    }
  });

  it("recovers the web from the trusted checkout with the gate, build, deploy and verify Deploy Web uses", () => {
    const web = wf.steps("rollback-web");
    const at = (pattern: RegExp) => web.findIndex(s => has(s, pattern));
    const trusted = at(/path: trusted/);
    const target = at(/ref: \$\{\{ inputs\.commit \}\}/);
    expect(trusted).toBeGreaterThanOrEqual(0);
    expect(target).toBeGreaterThan(trusted);
    expect(has(web[trusted], /^ {10}ref:/)).toBe(false);
    expect(has(web[target], /path: target/)).toBe(true);
    // Every control script runs from the trusted commit, never the older target's own copy.
    const scripts = web.filter(s => has(s, /rollbackTarget\.mjs/));
    expect(scripts.map(s => s.name)).toEqual(["Re-check the web recovery target", "Verify the live web is the target"]);
    for (const s of scripts) expect(has(s, /working-directory: trusted/)).toBe(true);
    const gate = at(/node scripts\/rollbackTarget\.mjs web-gate/);
    const build = at(/VITE_GIT_COMMIT_SHA: \$\{\{ inputs\.commit \}\}/);
    const deploy = at(/npx wrangler pages deploy dist\/public --project-name skipwait --branch main/);
    const verify = at(/node scripts\/rollbackTarget\.mjs verify-web/);
    expect([gate, build, deploy, verify].every(i => i >= 0)).toBe(true);
    expect([gate < deploy, deploy < verify]).toEqual([true, true]);
    // The build carries the target SHA, so the live page can prove which release it is.
    expect(has(web[build], /pnpm build/)).toBe(true);
    expect(has(web[gate], /^ {8}if:/)).toBe(false);
    // No migration, no container deploy, no runtime tag: the web leg touches the web only.
    expect(web.some(s => has(s, /apply-deploy-migrations|MYSQL_PWD|npx wrangler deploy|api-runtime/))).toBe(false);
  });

  it("runs the web leg in the web deploy queue, alone, and before the API leg when both are asked for", () => {
    const web = wf.jobs.get("rollback-web") ?? [];
    expect(web).toContain("    concurrency:");
    expect(web).toContain("      group: deploy-pages");
    expect(web).toContain("      cancel-in-progress: false");
    expect(web.some(l => /^ {4}if: .*inputs\.target != 'api'/.test(l))).toBe(true);
    const api = wf.jobs.get("recover-api") ?? [];
    expect(api.some(l => /^ {4}if: .*inputs\.target != 'web'/.test(l))).toBe(true);
    expect(api.some(l => /needs\.rollback-web\.result == 'success'/.test(l))).toBe(true);
    // The job-level web queue leaves the workflow-level API queue pin true.
    expect(wf.text).toMatch(/^concurrency:\n {2}group: deploy-api\n {2}cancel-in-progress: false$/m);
  });
});

describe("workflow YAML", () => {
  it.each(["deploy-api.yml", "deploy-pages.yml", "rollback.yml"])("%s has no one-line run: command that YAML would misread", file => {
    // A plain scalar holding ": " or " #" is a YAML error or a silent truncation; the line reader above would not notice.
    for (const line of workflow(file).text.split("\n")) {
      const value = /^\s+run: (?![|>])(.*)$/.exec(line)?.[1];
      if (value && !/^(['"]).*\1$/.test(value)) expect(value).not.toMatch(/: | #/);
    }
  });
});
