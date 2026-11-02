#!/usr/bin/env node
// P1-deploy-green-gate (#748): no production migration or deployment starts until the CI
// workflow has passed on the exact commit being released. On Oct 27 main 2dcea864 applied
// migrations and deployed Web and API while its CI failed, because the deploy workflows
// never waited for CI.
//
//   node scripts/require-green-release.mjs --target api|web           # wait for CI, then pass or refuse
//   node scripts/require-green-release.mjs --target api|web --once    # re-check right before a production step (never waits for CI)
//   node scripts/require-green-release.mjs --target api --recovery    # rollback.yml: a deliberate older target
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
// --once never waits for CI: anything but green refuses at once. A GitHub API error (including a
// malformed response) is the one thing it retries, like the waiting gate does: at most 5 attempts in a
// row, RELEASE_GATE_INTERVAL_SECONDS apart (about 2 minutes at the default), then it refuses.
//
// --recovery (#751) is the one deliberate exception to the last rule, for rollback.yml run from
// main: production may move back to an older commit, chosen on purpose. Everything else holds:
// the request names the API, gives the full target SHA twice (RECOVERY_COMMIT, RECOVERY_CONFIRM)
// and a reason (RECOVERY_REASON); the target is on main with its own main CI green as above;
// and its schema contract (SCHEMA_CONTRACT) is byte-identical to the workflow's main commit, the
// one case where the older code is known to fit the live schema. Anything else is refused. The
// workflow SHA (GITHUB_SHA) and the target SHA stay distinct, and the actor, both SHAs and the
// reason go to the run summary.
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
const MAX_REASON = 500;
// What the API's code assumes about the database: migrations, the Drizzle schema and the boot-time reconcile.
export const SCHEMA_CONTRACT = Object.freeze(["drizzle/deploy", "drizzle/schema.ts", "server/schemaReconcile.ts"]);

/** Why this workflow run may not release at all, or null. */
export function contextProblem({ sha, ref, event, target, recovery = false }) {
  if (!TARGETS.has(target)) return `unknown target "${target}" (use --target api or --target web)`;
  if (!FULL_SHA.test(sha ?? "")) return `no full commit SHA to release (got "${sha ?? ""}")`;
  if (recovery && event !== "workflow_dispatch") return `a recovery runs only from a manual dispatch of ${RELEASE_BRANCH}, never from a ${event} run`;
  if (!RELEASE_EVENTS.has(event)) return `a ${event} run never releases; only a push to ${RELEASE_BRANCH} or a manual dispatch of ${RELEASE_BRANCH} does`;
  if (ref !== `refs/heads/${RELEASE_BRANCH}`) return `releases run from ${RELEASE_BRANCH} only; this run is on ${ref}`;
  return null;
}

/** Why a manual recovery request is not a deliberate, well-formed one, or null. */
export function recoveryProblem({ system, commit, confirm, reason }) {
  if (system !== "api") return `only the API has a recovery job (got "${system ?? ""}"); to redeploy the Web, dispatch Deploy Web on ${RELEASE_BRANCH}`;
  if (!FULL_SHA.test(commit ?? "")) return "the recovery commit must be a full 40-character lowercase SHA from main";
  if (confirm !== commit) return "the confirmation does not repeat the recovery commit exactly";
  const why = String(reason ?? "").trim();
  if (!why) return "a recovery needs a reason";
  if (why.length > MAX_REASON) return `the reason is longer than ${MAX_REASON} characters`;
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

// GitHub's compare base...head, exactly as GitHub reports it: a known status and whole, non-negative
// counts that agree with it. Anything else is an API error (retried, then refused), never a coerced
// count: Number() turned a missing behind_by into NaN, which read as "not newer" and let a stale release pass.
const COMPARE_COUNTS = { identical: (a, b) => a === 0 && b === 0, ahead: (a, b) => a > 0 && b === 0, behind: (a, b) => a === 0 && b > 0, diverged: (a, b) => a > 0 && b > 0 };
const shown = v => (v === undefined ? "missing" : typeof v === "number" ? String(v) : JSON.stringify(v));
const count = (v, what) => (Number.isSafeInteger(v) && v >= 0 ? v : bad(`${what} ${shown(v)}`));
export function parseCompare(c) {
  if (c === null || typeof c !== "object" || Array.isArray(c)) return bad("compare body");
  const status = text(c.status, "compare status");
  if (!Object.hasOwn(COMPARE_COUNTS, status)) return bad(`compare status ${shown(status)}`);
  const ahead_by = count(c.ahead_by, "compare ahead_by");
  const behind_by = count(c.behind_by, "compare behind_by");
  if (!COMPARE_COUNTS[status](ahead_by, behind_by)) return bad(`compare ${status} with ahead_by ${ahead_by} and behind_by ${behind_by}`);
  return { status, ahead_by, behind_by };
}
// Every compare the gate decides on goes through the parser, whichever client supplied it.
const compare = async (gh, base, head) => parseCompare(await gh.compare(base, head));
// "ahead" with nothing behind means head strictly descends from base.
const descends = c => c.status === "ahead" && c.behind_by === 0;

/** Production already runs a commit newer than sha: the reason, or null. */
async function supersededBy({ gh, sha, target, runId }) {
  if (target === "api") {
    const marker = await gh.apiRuntimeMarker();
    if (!marker || marker === sha) return null;
    return descends(await compare(gh, sha, marker)) ? `the API already runs ${marker} (refs/tags/api-runtime), which is newer than ${sha}` : null;
  }
  const deployed = (await gh.pagesRuns())
    .filter(r => r.conclusion === "success" && r.head_branch === RELEASE_BRANCH && String(r.id) !== String(runId) && r.head_sha !== sha)
    .map(r => r.head_sha);
  for (const other of [...new Set(deployed)].slice(0, 10)) {
    if (descends(await compare(gh, sha, other))) return `the Web already serves ${other}, which is newer than ${sha}`;
  }
  return null;
}

/** The SCHEMA_CONTRACT paths whose content differs between two commits (a missing path counts). */
async function schemaDrift(gh, a, b) {
  const files = (p, c) => (c === null ? [] : c.kind === "file" ? [[p, c.sha]] : c.entries.map(e => [`${p}/${e.name}`, e.sha]));
  const drift = [];
  for (const p of SCHEMA_CONTRACT) {
    const [left, right] = [new Map(files(p, await gh.contents(p, a))), new Map(files(p, await gh.contents(p, b)))];
    for (const name of new Set([...left.keys(), ...right.keys()])) if (left.get(name) !== right.get(name)) drift.push(name);
  }
  return drift.sort();
}

/** One look at GitHub: green only when the commit is on main, CI passed on it and nothing newer is live (or, for a recovery, its schema contract is main's). */
export async function evaluateRelease({ gh, sha, target, runId, recovery = false, workflowSha = "" }) {
  const line = await compare(gh, sha, RELEASE_BRANCH);
  if (!(line.status === "identical" || descends(line))) return { state: "red", reason: `${sha} is not on ${RELEASE_BRANCH} (compare: ${line.status})` };
  const runs = await gh.ciRuns(sha);
  const jobsByRun = new Map();
  for (const r of releaseRuns(sha, runs)) if (r.status === "completed" && r.conclusion === "success") jobsByRun.set(r.id, await gh.ciJobs(r.id));
  const ci = ciVerdict({ sha, runs, jobsByRun });
  if (ci.state !== "green") return ci;
  if (recovery) {
    const drift = await schemaDrift(gh, sha, workflowSha);
    if (drift.length) return { state: "red", reason: `the target's schema contract differs from ${RELEASE_BRANCH} ${workflowSha} in ${drift.join(", ")}; whether the older code fits the live schema cannot be established, so this recovery is refused. Choose a target with the same schema contract` };
    return { state: "green", reason: `${ci.reason}; schema contract identical to ${RELEASE_BRANCH} ${workflowSha}` };
  }
  const newer = await supersededBy({ gh, sha, target, runId });
  return newer ? { state: "red", reason: `superseded: ${newer}; dispatch this workflow on ${RELEASE_BRANCH} to release the newest commit` } : ci;
}

/** Wait for CI (with once, never: only GitHub errors are retried, MAX_API_ERRORS at most) and return { ok, reason }. Only a green verdict is ok. A recovery releases intent.commit. */
export async function runGate({ gh, sha, ref, event, target, runId, recovery = false, intent = null, workflowSha = "", once = false, timeoutMs, appearMs, intervalMs, now = Date.now, sleep, log = () => {} }) {
  if (recovery) {
    const problem = recoveryProblem(intent ?? {}) ?? (FULL_SHA.test(workflowSha) ? null : "no workflow commit to compare the target's schema contract with");
    if (problem) return { ok: false, reason: problem };
    sha = intent.commit;
  }
  const problem = contextProblem({ sha, ref, event, target, recovery });
  if (problem) return { ok: false, reason: problem };
  const start = now();
  let errors = 0;
  for (;;) {
    let verdict;
    try {
      verdict = await evaluateRelease({ gh, sha, target, runId, recovery, workflowSha });
      errors = 0;
    } catch (error) {
      errors++;
      verdict = { state: "error", reason: `GitHub API error: ${error instanceof Error ? error.message : String(error)}` };
      if (errors >= MAX_API_ERRORS) return { ok: false, reason: `${verdict.reason} (${errors} attempts in a row)` };
    }
    if (verdict.state === "green") return { ok: true, reason: verdict.reason };
    if (verdict.state === "red") return { ok: false, reason: verdict.reason };
    if (once && verdict.state !== "error") return { ok: false, reason: `${verdict.reason}; the re-check before a production step never waits for CI` };
    const waited = now() - start;
    if (verdict.state === "missing" && waited >= appearMs) {
      return { ok: false, reason: `${verdict.reason} after ${Math.round(waited / 1000)} s. If the commit skipped CI ([skip ci]), dispatch the CI workflow on main, then re-run this workflow` };
    }
    if (waited >= timeoutMs) return { ok: false, reason: `timed out after ${Math.round(waited / 1000)} s: ${verdict.reason}` };
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

/** The GitHub REST reads the gate makes (no writes). */
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
      return parseCompare(await get(`/compare/${base}...${head}?per_page=1`));
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
    // A file is its blob SHA, a folder its entries' SHAs, a missing path null.
    async contents(path, ref) {
      const c = await get(`/contents/${path}?ref=${ref}`, { missingOk: true });
      if (c === null) return null;
      if (Array.isArray(c)) return { kind: "dir", entries: c.map(e => ({ name: text(e?.name, "entry name"), sha: text(e.sha, "entry sha") })) };
      if (c?.type === "file") return { kind: "file", sha: text(c.sha, "file sha") };
      return bad(`contents of ${path}`);
    },
  };
}

// The run summary records the request as plain text: no backticks, control characters or line breaks.
const plain = value => String(value ?? "").replace(/`/g, "'").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_REASON);

const minutes = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback);

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf("--target");
  const target = at >= 0 ? args[at + 1] ?? "" : "";
  const once = args.includes("--once");
  const recovery = args.includes("--recovery");
  const env = process.env;
  const intent = recovery ? { system: env.RECOVERY_SYSTEM, commit: env.RECOVERY_COMMIT, confirm: env.RECOVERY_CONFIRM, reason: env.RECOVERY_REASON } : null;
  const sha = (recovery ? env.RECOVERY_COMMIT : env.GITHUB_SHA) || "";
  const result = await runGate({
    gh: gitHubClient({ apiUrl: env.GITHUB_API_URL || "https://api.github.com", repo: env.GITHUB_REPOSITORY ?? "", token: env.GITHUB_TOKEN }),
    sha, ref: env.GITHUB_REF ?? "", event: env.GITHUB_EVENT_NAME ?? "", target, runId: env.GITHUB_RUN_ID ?? "", once,
    recovery, intent, workflowSha: env.GITHUB_SHA ?? "",
    timeoutMs: minutes(env.RELEASE_GATE_TIMEOUT_MINUTES, 45) * 60_000,
    appearMs: minutes(env.RELEASE_GATE_APPEAR_MINUTES, 10) * 60_000,
    intervalMs: minutes(env.RELEASE_GATE_INTERVAL_SECONDS, 30) * 1000,
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    log: line => console.log(line),
  });
  const verdict = `RELEASE GATE ${result.ok ? "PASS" : "REFUSED"} (${recovery ? `${target} recovery` : target}): ${plain(sha) || "<no commit>"} — ${result.reason}`;
  const record = recovery
    ? `Recovery requested by ${plain(env.GITHUB_ACTOR)} (this attempt by ${plain(env.GITHUB_TRIGGERING_ACTOR || env.GITHUB_ACTOR)}), run ${plain(env.GITHUB_RUN_ID)} attempt ${plain(env.GITHUB_RUN_ATTEMPT)}: target ${plain(env.RECOVERY_COMMIT)}, workflow commit ${plain(env.GITHUB_SHA)}, reason: ${plain(env.RECOVERY_REASON)}`
    : null;
  if (record) console.log(record);
  console.log(result.ok ? verdict : `::error::${verdict}`);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `### ${verdict}\n${record ? `${record}\n` : ""}`);
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch(error => {
    console.log(`::error::RELEASE GATE REFUSED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
