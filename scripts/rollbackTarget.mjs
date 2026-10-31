#!/usr/bin/env node
// REL-rollback-skew (D-212): the SHA rules for the web half of a deliberate recovery and for
// keeping the web from running ahead of its API.
//
//   node scripts/rollbackTarget.mjs web-gate     # rollback.yml rollback-web: a deliberate, green older web target
//   node scripts/rollbackTarget.mjs verify-web   # rollback.yml rollback-web: the build Cloudflare serves is the target
//   node scripts/rollbackTarget.mjs wait-api     # deploy-pages.yml: wait until the live API runs this SHA or a descendant
//
// web-gate passes only when the request names the web (web or all), gives the full target
// SHA twice and a reason, the target is on main, and every CI run of the target on main
// (push or dispatch) succeeded in its newest attempt with the three required jobs, the same
// CI rule scripts/require-green-release.mjs applies (its ciVerdict and releaseRuns are
// reused, never copied). A target equal to the live web SHA is accepted, so REL-self-heal
// can redeploy the live release. It runs from the workflow's own trusted commit.
//
// verify-web reads the commit of the Pages project's canonical (production) deployment from
// the Cloudflare API and the git-commit meta tag the live site serves, and fails loudly when
// either is not the target. It never deploys, so a mismatch leaves the live web as it is.
//
// wait-api polls /api/health/ready until its commitSha is this SHA or a descendant of it
// (`git merge-base --is-ancestor <sha> <live>`; a queued Deploy API run can be cancelled by a
// newer push, so this exact SHA may never be served). Only a 200 answer whose state is "ready"
// proves the live API runs a release: a 503 (validating or failed), a 401, an HTML body or a
// body without a full SHA names no verified release, so it is "not yet", never convergence.
// After RELEASE_API_WAIT_MINUTES (45) it gives up, writes converged=true|false to GITHUB_OUTPUT
// and exits 1: the caller must not deploy the web over an API it could not verify (D-212; the
// web never runs ahead of its API). Fail-closed is the rule for this row.
//
// It needs no packages, so it runs before `pnpm install`.
import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { RELEASE_BRANCH, ciVerdict, releaseRuns, gitHubClient } from "./require-green-release.mjs";

export const WEB_SYSTEMS = Object.freeze(["web", "all"]);
export const PAGES_PROJECT = "skipwait";
export const LIVE_SITE = "https://skipwait.me";
const FULL_SHA = /^[0-9a-f]{40}$/;
const MAX_REASON = 500;
const MAX_API_ERRORS = 5;

/** Why a web recovery request is not a deliberate, well-formed one, or null. */
export function webRecoveryProblem({ system, commit, confirm, reason } = {}) {
  if (!WEB_SYSTEMS.includes(system)) return `the web recovery runs only for target web or all (got "${system ?? ""}")`;
  if (!FULL_SHA.test(commit ?? "")) return "the recovery commit must be a full 40-character lowercase SHA from main";
  if (confirm !== commit) return "the confirmation does not repeat the recovery commit exactly";
  const why = String(reason ?? "").trim();
  if (!why) return "a recovery needs a reason";
  if (why.length > MAX_REASON) return `the reason is longer than ${MAX_REASON} characters`;
  return null;
}

/** Why this workflow run may not recover the web at all, or null. */
export function webContextProblem({ ref, event }) {
  if (event !== "workflow_dispatch") return `a recovery runs only from a manual dispatch of ${RELEASE_BRANCH}, never from a ${event ?? ""} run`;
  if (ref !== `refs/heads/${RELEASE_BRANCH}`) return `a recovery runs from ${RELEASE_BRANCH} only; this run is on ${ref ?? ""}`;
  return null;
}

/** One look at GitHub: green only when the target is on main and its own main CI passed. */
export async function evaluateWebTarget({ gh, sha }) {
  const line = await gh.compare(sha, RELEASE_BRANCH);
  const onMain = line.status === "identical" || (line.status === "ahead" && line.behind_by === 0);
  if (!onMain) return { state: "red", reason: `${sha} is not on ${RELEASE_BRANCH} (compare: ${line.status})` };
  const runs = await gh.ciRuns(sha);
  const jobsByRun = new Map();
  for (const r of releaseRuns(sha, runs)) if (r.status === "completed" && r.conclusion === "success") jobsByRun.set(r.id, await gh.ciJobs(r.id));
  return ciVerdict({ sha, runs, jobsByRun });
}

/** The web recovery gate: { ok, reason }. Never waits for CI (an older target's CI is finished); only GitHub errors are retried. */
export async function runWebGate({ gh, intent, ref, event, sleep = async () => {}, intervalMs = 30_000 }) {
  const problem = webRecoveryProblem(intent) ?? webContextProblem({ ref, event });
  if (problem) return { ok: false, reason: problem };
  for (let errors = 1; ; errors++) {
    try {
      const verdict = await evaluateWebTarget({ gh, sha: intent.commit });
      if (verdict.state === "green") return { ok: true, reason: verdict.reason };
      return { ok: false, reason: `${verdict.reason}; a recovery target needs its own main CI finished and green` };
    } catch (error) {
      const reason = `GitHub API error: ${error instanceof Error ? error.message : String(error)}`;
      if (errors >= MAX_API_ERRORS) return { ok: false, reason: `${reason} (${errors} attempts in a row)` };
      await sleep(intervalMs);
    }
  }
}

/** Why the deployment Cloudflare serves is not the target, or null. */
export function deployedCommitProblem({ deployed, expected }) {
  if (!FULL_SHA.test(expected ?? "")) return `no full target SHA to verify (got "${expected ?? ""}")`;
  if (typeof deployed !== "string" || !deployed) return "Cloudflare reports no commit for the production deployment";
  if (deployed !== expected) return `Cloudflare's production deployment is ${deployed}, not the target ${expected}`;
  return null;
}

/** The git-commit meta tag of a page, or null. */
export function pageCommit(html) {
  const m = /<meta\s+name="git-commit"\s+content="([0-9a-f]{7,40})"/.exec(String(html ?? ""));
  return m ? m[1] : null;
}

/** The commit of the Pages project's canonical (production) deployment, read from the Cloudflare API. */
export async function cloudflareCanonicalCommit({ accountId, token, project = PAGES_PROJECT, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Cloudflare API HTTP ${res.status} for the Pages project`);
  const body = await res.json();
  if (body?.success !== true) throw new Error("Cloudflare API answered without success for the Pages project");
  const hash = body?.result?.canonical_deployment?.deployment_trigger?.metadata?.commit_hash;
  return typeof hash === "string" && hash ? hash : null;
}

/** verify-web: { ok, reason }. Reads only; a mismatch never triggers another deploy. */
export async function verifyWeb({ expected, readCanonical, readPage, attempts = 10, sleep = async () => {}, intervalMs = 15_000 }) {
  let last = "not checked";
  for (let i = 1; i <= attempts; i++) {
    try {
      const problem = deployedCommitProblem({ deployed: await readCanonical(), expected });
      if (problem) last = problem;
      else {
        const live = pageCommit(await readPage());
        if (live === expected) return { ok: true, reason: `Cloudflare's production deployment and ${LIVE_SITE} both carry ${expected}` };
        last = `Cloudflare reports ${expected}, but ${LIVE_SITE} serves ${live ?? "no git-commit meta tag"}`;
      }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (i < attempts) await sleep(intervalMs);
  }
  return { ok: false, reason: `${last}; the web recovery did not put the target live. Nothing else was deployed` };
}

/** The live API commit from a /api/health/ready answer; throws unless that answer proves a ready release. */
export function liveApiCommit({ status, body } = {}) {
  if (status !== 200) throw new Error(`the health endpoint answered HTTP ${status}`);
  const state = body?.state;
  if (state !== "ready") throw new Error(`the API reports "${typeof state === "string" && state ? state : "no state"}", not ready`);
  const sha = typeof body?.commitSha === "string" ? body.commitSha.trim() : "";
  if (!FULL_SHA.test(sha)) throw new Error("the health endpoint reports no full commit SHA");
  return sha;
}

/** Whether the live API runs sha or a commit that descends from it. isAncestor(a, b) is `git merge-base --is-ancestor a b`. */
export function apiConverged({ sha, live, isAncestor }) {
  if (!FULL_SHA.test(sha ?? "") || !FULL_SHA.test(live ?? "")) return false;
  if (live === sha) return true;
  try { return isAncestor(sha, live) === true; } catch { return false; }
}

/** wait-api: { converged, reason }. Polls readLive() (the live API commitSha, or throws) until it converges or the time is up. */
export async function waitForApi({ sha, readLive, isAncestor, timeoutMs, intervalMs, now = Date.now, sleep, log = () => {} }) {
  const start = now();
  for (;;) {
    let live = null;
    let why;
    try {
      live = await readLive();
      if (apiConverged({ sha, live, isAncestor })) return { converged: true, reason: `the live API runs ${live}, which is ${live === sha ? "this commit" : `a descendant of ${sha}`}` };
      why = `the live API runs ${live ?? "an unknown commit"}, not ${sha} or a descendant`;
    } catch (error) {
      why = `the live API could not be read: ${error instanceof Error ? error.message : String(error)}`;
    }
    const waited = now() - start;
    if (waited >= timeoutMs) return { converged: false, reason: `the API did not converge on ${sha} within ${Math.round(waited / 60_000)} min: ${why}` };
    log(`waiting: ${why}`);
    await sleep(intervalMs);
  }
}

// The run summary records plain text only.
const plain = value => String(value ?? "").replace(/`/g, "'").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_REASON);
const minutes = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback);
const sleepMs = ms => new Promise(resolve => setTimeout(resolve, ms));

function gitIsAncestor(a, b) {
  const run = () => { execFileSync("git", ["merge-base", "--is-ancestor", a, b], { stdio: "ignore" }); return true; };
  const known = c => { try { execFileSync("git", ["cat-file", "-e", `${c}^{commit}`], { stdio: "ignore" }); return true; } catch { return false; } };
  if (!known(b)) { try { execFileSync("git", ["fetch", "--quiet", "origin", RELEASE_BRANCH], { stdio: "ignore" }); } catch { /* checked below */ } }
  if (!known(a) || !known(b)) throw new Error(`commit ${known(a) ? b : a} is not in this checkout`);
  try { return run(); } catch { return false; }
}

async function main() {
  const [command] = process.argv.slice(2);
  const env = process.env;
  const summary = line => { if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${line}\n`); };

  if (command === "web-gate") {
    const intent = { system: env.RECOVERY_SYSTEM, commit: env.RECOVERY_COMMIT, confirm: env.RECOVERY_CONFIRM, reason: env.RECOVERY_REASON };
    const result = await runWebGate({
      gh: gitHubClient({ apiUrl: env.GITHUB_API_URL || "https://api.github.com", repo: env.GITHUB_REPOSITORY ?? "", token: env.GITHUB_TOKEN }),
      intent, ref: env.GITHUB_REF ?? "", event: env.GITHUB_EVENT_NAME ?? "",
      sleep: sleepMs, intervalMs: minutes(env.RELEASE_GATE_INTERVAL_SECONDS, 30) * 1000,
    });
    const verdict = `WEB RECOVERY GATE ${result.ok ? "PASS" : "REFUSED"}: ${plain(env.RECOVERY_COMMIT) || "<no commit>"} — ${result.reason}`;
    const record = `Web recovery requested by ${plain(env.GITHUB_ACTOR)}, run ${plain(env.GITHUB_RUN_ID)} attempt ${plain(env.GITHUB_RUN_ATTEMPT)}: target ${plain(env.RECOVERY_COMMIT)}, workflow commit ${plain(env.GITHUB_SHA)}, reason: ${plain(env.RECOVERY_REASON)}`;
    console.log(record);
    console.log(result.ok ? verdict : `::error::${verdict}`);
    summary(`### ${verdict}\n${record}`);
    process.exit(result.ok ? 0 : 1);
  }

  if (command === "verify-web") {
    const expected = env.EXPECTED_SHA ?? "";
    const result = await verifyWeb({
      expected,
      readCanonical: () => cloudflareCanonicalCommit({ accountId: env.CLOUDFLARE_ACCOUNT_ID ?? "", token: env.CLOUDFLARE_API_TOKEN ?? "" }),
      readPage: async () => (await fetch(`${LIVE_SITE}/`, { signal: AbortSignal.timeout(20_000), headers: { "cache-control": "no-cache" } })).text(),
      attempts: 10, sleep: sleepMs, intervalMs: 15_000,
    });
    const verdict = `WEB RECOVERY VERIFY ${result.ok ? "PASS" : "FAILED"}: ${plain(expected)} — ${result.reason}`;
    console.log(result.ok ? verdict : `::error::${verdict}`);
    summary(`### ${verdict}`);
    process.exit(result.ok ? 0 : 1);
  }

  if (command === "wait-api") {
    const sha = env.EXPECTED_SHA || env.GITHUB_SHA || "";
    const base = env.API_BASE_URL || LIVE_SITE;
    const result = await waitForApi({
      sha,
      readLive: async () => {
        const res = await fetch(`${base.replace(/\/$/, "")}/api/health/ready`, { signal: AbortSignal.timeout(20_000), headers: { "cache-control": "no-cache" } });
        const body = await res.json().catch(() => null);
        return liveApiCommit({ status: res.status, body });
      },
      isAncestor: gitIsAncestor,
      timeoutMs: minutes(env.RELEASE_API_WAIT_MINUTES, 45) * 60_000,
      intervalMs: minutes(env.RELEASE_API_WAIT_INTERVAL_SECONDS, 30) * 1000,
      sleep: sleepMs, log: line => console.log(line),
    });
    const verdict = `API WAIT ${result.converged ? "CONVERGED" : "DID NOT CONVERGE"}: ${plain(sha)} — ${result.reason}`;
    console.log(result.converged ? verdict : `::error::${verdict}`);
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `converged=${result.converged}\n`);
    summary(`### ${verdict}`);
    // Fail closed: a caller that cannot see a ready API must not write the web ahead of it.
    process.exit(result.converged ? 0 : 1);
  }

  console.log(`::error::unknown command "${plain(command)}" (use web-gate, verify-web or wait-api)`);
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch(error => {
    console.log(`::error::rollbackTarget: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
