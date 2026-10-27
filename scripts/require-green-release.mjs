#!/usr/bin/env node
// P1-deploy-green-gate (#748): no production migration or deployment starts until the CI
// workflow has passed on the exact commit being released. On Oct 27 main 2dcea864 applied
// migrations and deployed Web and API while its CI failed, because the deploy workflows
// never waited for CI.
//
//   node scripts/require-green-release.mjs --target api|web           # wait for CI, then pass or refuse
//   node scripts/require-green-release.mjs --target api|web --once    # re-check right before a production step
//
// It passes only when all of these hold, and refuses (exit 1) on anything else: a red,
// cancelled, skipped, missing or still-running check, a GitHub error, or a timeout.
//   - The workflow runs for a push to main or a manual dispatch of main (GITHUB_REF).
//   - The commit (GITHUB_SHA) is on main.
//   - Every CI run of that commit on main (push or workflow_dispatch; a pull_request run
//     tests a merge ref, not this commit) is completed and succeeded in its newest attempt,
//     and in each one the jobs "typecheck", "unit + component + route tests" and
//     "production build" succeeded on this commit. An older green run never hides a newer
//     red one: a failed run must itself be re-run green.
//   - Production does not already run a newer commit (a stale rerun would roll it back):
//     refs/tags/api-runtime for the API, the newest successful Pages deploys for the Web.
// There is no switch that skips it. A commit that skipped CI ([skip ci]) gets a CI run by
// dispatching the CI workflow on main; the gate waits for it.
//
// Environment (GitHub Actions sets the first five): GITHUB_SHA, GITHUB_REF, GITHUB_EVENT_NAME,
// GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_TOKEN, GITHUB_API_URL; optional
// RELEASE_GATE_TIMEOUT_MINUTES (45), RELEASE_GATE_APPEAR_MINUTES (10),
// RELEASE_GATE_INTERVAL_SECONDS (30). Smaller values only make it refuse sooner.
// It needs no packages, so it runs before `pnpm install`; responses are checked by hand.
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const RELEASE_BRANCH = "main";
export const CI_WORKFLOW = ".github/workflows/ci.yml";
export const REQUIRED_JOBS = Object.freeze(["typecheck", "unit + component + route tests", "production build"]);
const RELEASE_EVENTS = new Set(["push", "workflow_dispatch"]);
const TARGETS = new Set(["api", "web"]);
const FULL_SHA = /^[0-9a-f]{40}$/;
const MAX_API_ERRORS = 5;

/** Why this workflow run may not release at all, or null. */
export function contextProblem({ sha, ref, event, target }) {
  if (!TARGETS.has(target)) return `unknown target "${target}" (use --target api or --target web)`;
  if (!FULL_SHA.test(sha ?? "")) return `no full commit SHA to release (got "${sha ?? ""}")`;
  if (!RELEASE_EVENTS.has(event)) return `a ${event} run never releases; only a push to ${RELEASE_BRANCH} or a manual dispatch of ${RELEASE_BRANCH} does`;
  if (ref !== `refs/heads/${RELEASE_BRANCH}`) return `releases run from ${RELEASE_BRANCH} only; this run is on ${ref}`;
  return null;
}

/** The CI runs that tested exactly this commit as main. */
export function releaseRuns(sha, runs) {
  return runs.filter(r => r.head_sha === sha && r.path === CI_WORKFLOW && r.head_branch === RELEASE_BRANCH && RELEASE_EVENTS.has(r.event));
}

const runName = r => `CI run ${r.id} (attempt ${r.run_attempt}, ${r.event})`;

/** green, red, pending (wait) or missing (wait for a run to appear), with the reason. */
export function ciVerdict({ sha, runs, jobsByRun }) {
  const own = releaseRuns(sha, runs);
  if (!own.length) return { state: "missing", reason: `no CI run of ${sha} on ${RELEASE_BRANCH} yet` };
  const running = own.find(r => r.status !== "completed");
  if (running) return { state: "pending", reason: `${runName(running)} is ${running.status}` };
  const failed = own.find(r => r.conclusion !== "success");
  if (failed) return { state: "red", reason: `${runName(failed)} concluded ${failed.conclusion ?? "without a result"}; re-run that run until it passes` };
  for (const r of own) {
    const jobs = jobsByRun.get(r.id);
    if (!jobs) return { state: "pending", reason: `the jobs of ${runName(r)} are not read yet` };
    for (const name of REQUIRED_JOBS) {
      const named = jobs.filter(j => j.name === name);
      if (!named.length) return { state: "red", reason: `${runName(r)} has no "${name}" job` };
      const open = named.find(j => j.status !== "completed");
      if (open) return { state: "pending", reason: `"${name}" in ${runName(r)} is ${open.status}` };
      const bad = named.find(j => j.conclusion !== "success" || j.head_sha !== sha);
      if (bad) return { state: "red", reason: `"${name}" in ${runName(r)} ${bad.head_sha !== sha ? `ran on ${bad.head_sha}` : `concluded ${bad.conclusion ?? "without a result"}`}` };
    }
  }
  return { state: "green", reason: `${own.map(runName).join(", ")}: ${REQUIRED_JOBS.join(", ")} succeeded on ${sha}` };
}

// GitHub's compare base...head: "ahead" with behind_by 0 means head strictly descends from base.
const descends = c => c.status === "ahead" && c.behind_by === 0;

/** Production already runs a commit newer than sha: the reason, or null. */
async function supersededBy({ gh, sha, target, runId }) {
  if (target === "api") {
    const marker = await gh.apiRuntimeMarker();
    if (!marker || marker === sha) return null;
    return descends(await gh.compare(sha, marker)) ? `the API already runs ${marker} (refs/tags/api-runtime), which is newer than ${sha}` : null;
  }
  const deployed = (await gh.pagesRuns())
    .filter(r => r.conclusion === "success" && r.head_branch === RELEASE_BRANCH && String(r.id) !== String(runId) && r.head_sha !== sha)
    .map(r => r.head_sha);
  for (const other of [...new Set(deployed)].slice(0, 10)) {
    if (descends(await gh.compare(sha, other))) return `the Web already serves ${other}, which is newer than ${sha}`;
  }
  return null;
}

/** One look at GitHub: green only when the commit is on main, CI passed on it and nothing newer is live. */
export async function evaluateRelease({ gh, sha, target, runId }) {
  const line = await gh.compare(sha, RELEASE_BRANCH);
  if (!(line.status === "identical" || descends(line))) return { state: "red", reason: `${sha} is not on ${RELEASE_BRANCH} (compare: ${line.status})` };
  const runs = await gh.ciRuns(sha);
  const jobsByRun = new Map();
  for (const r of releaseRuns(sha, runs)) if (r.status === "completed" && r.conclusion === "success") jobsByRun.set(r.id, await gh.ciJobs(r.id));
  const ci = ciVerdict({ sha, runs, jobsByRun });
  if (ci.state !== "green") return ci;
  const newer = await supersededBy({ gh, sha, target, runId });
  return newer ? { state: "red", reason: `superseded: ${newer}; dispatch this workflow on ${RELEASE_BRANCH} to release the newest commit` } : ci;
}

/** Wait (or, with once, look once) and return { ok, reason }. Only a green verdict is ok. */
export async function runGate({ gh, sha, ref, event, target, runId, once = false, timeoutMs, appearMs, intervalMs, now = Date.now, sleep, log = () => {} }) {
  const problem = contextProblem({ sha, ref, event, target });
  if (problem) return { ok: false, reason: problem };
  const start = now();
  let errors = 0;
  for (;;) {
    let verdict;
    try {
      verdict = await evaluateRelease({ gh, sha, target, runId });
      errors = 0;
    } catch (error) {
      errors++;
      verdict = { state: "error", reason: `GitHub API error: ${error instanceof Error ? error.message : String(error)}` };
      if (errors >= MAX_API_ERRORS) return { ok: false, reason: `${verdict.reason} (${errors} attempts in a row)` };
    }
    if (verdict.state === "green") return { ok: true, reason: verdict.reason };
    if (verdict.state === "red") return { ok: false, reason: verdict.reason };
    if (once && verdict.state !== "error") return { ok: false, reason: `${verdict.reason}; the re-check before a production step never waits` };
    const waited = now() - start;
    if (verdict.state === "missing" && waited >= appearMs) {
      return { ok: false, reason: `${verdict.reason} after ${Math.round(waited / 60_000)} min. If the commit skipped CI ([skip ci]), dispatch the CI workflow on main, then re-run this workflow` };
    }
    if (waited >= timeoutMs) return { ok: false, reason: `timed out after ${Math.round(waited / 60_000)} min: ${verdict.reason}` };
    log(`waiting: ${verdict.reason}`);
    await sleep(intervalMs);
  }
}

const bad = what => { throw new Error(`unexpected GitHub response: ${what}`); };
const text = (v, what) => (typeof v === "string" ? v : bad(what));
const textOrNull = (v, what) => (v === null || typeof v === "string" ? v : bad(what));
const list = (v, what) => (Array.isArray(v) ? v : bad(what));
const parseRun = r => ({
  id: typeof r?.id === "number" ? r.id : bad("run id"), head_sha: text(r.head_sha, "run head_sha"), head_branch: textOrNull(r.head_branch, "run head_branch"),
  path: text(r.path, "run path"), event: text(r.event, "run event"), status: text(r.status, "run status"), conclusion: textOrNull(r.conclusion, "run conclusion"),
  run_attempt: typeof r.run_attempt === "number" ? r.run_attempt : bad("run_attempt"),
});
const parseJob = j => ({ name: text(j?.name, "job name"), status: text(j.status, "job status"), conclusion: textOrNull(j.conclusion, "job conclusion"), head_sha: text(j.head_sha, "job head_sha") });

/** The five GitHub REST reads the gate makes (no writes). */
export function gitHubClient({ apiUrl, repo, token, fetchImpl = fetch }) {
  const get = async (path, { missingOk = false } = {}) => {
    const res = await fetchImpl(`${apiUrl.replace(/\/$/, "")}/repos/${repo}${path}`, {
      headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "skipwait-release-gate", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(20_000),
    });
    if (missingOk && res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path.split("?")[0]}`);
    return res.json();
  };
  return {
    async compare(base, head) {
      const c = await get(`/compare/${base}...${head}?per_page=1`);
      return { status: text(c?.status, "compare status"), ahead_by: Number(c.ahead_by), behind_by: Number(c.behind_by) };
    },
    async ciRuns(sha) {
      return list((await get(`/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100&exclude_pull_requests=true`))?.workflow_runs, "workflow_runs").map(parseRun);
    },
    async ciJobs(runId) {
      return list((await get(`/actions/runs/${runId}/jobs?filter=latest&per_page=100`))?.jobs, "jobs").map(parseJob);
    },
    async apiRuntimeMarker() {
      const ref = await get("/git/ref/tags/api-runtime", { missingOk: true });
      if (ref === null) return null;
      if (ref?.object?.type === "commit") return text(ref.object.sha, "marker sha");
      if (ref?.object?.type === "tag") return text((await get(`/git/tags/${text(ref.object.sha, "tag sha")}`))?.object?.sha, "tagged commit");
      return bad("api-runtime ref");
    },
    async pagesRuns() {
      return list((await get(`/actions/workflows/deploy-pages.yml/runs?branch=${RELEASE_BRANCH}&status=success&per_page=20&exclude_pull_requests=true`))?.workflow_runs, "workflow_runs").map(parseRun);
    },
  };
}

const minutes = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback);

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf("--target");
  const target = at >= 0 ? args[at + 1] ?? "" : "";
  const once = args.includes("--once");
  const env = process.env;
  const result = await runGate({
    gh: gitHubClient({ apiUrl: env.GITHUB_API_URL || "https://api.github.com", repo: env.GITHUB_REPOSITORY ?? "", token: env.GITHUB_TOKEN }),
    sha: env.GITHUB_SHA ?? "", ref: env.GITHUB_REF ?? "", event: env.GITHUB_EVENT_NAME ?? "", target, runId: env.GITHUB_RUN_ID ?? "", once,
    timeoutMs: minutes(env.RELEASE_GATE_TIMEOUT_MINUTES, 45) * 60_000,
    appearMs: minutes(env.RELEASE_GATE_APPEAR_MINUTES, 10) * 60_000,
    intervalMs: minutes(env.RELEASE_GATE_INTERVAL_SECONDS, 30) * 1000,
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    log: line => console.log(line),
  });
  const verdict = `RELEASE GATE ${result.ok ? "PASS" : "REFUSED"} (${target}): ${env.GITHUB_SHA || "<no commit>"} — ${result.reason}`;
  console.log(result.ok ? verdict : `::error::${verdict}`);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `### ${verdict}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch(error => {
    console.log(`::error::RELEASE GATE REFUSED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
