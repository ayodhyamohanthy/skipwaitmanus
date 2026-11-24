#!/usr/bin/env node
// DEPLOY-web-catch-up (D-388): a web deploy refused while main was red ships by itself once main is green.
//
// Runs from .github/workflows/deploy-web-catch-up.yml after CI completes on main. It decides whether the
// live web is owed a deploy and prints `deploy=true|false` and `reason=...` for $GITHUB_OUTPUT. When owed,
// the workflow dispatches deploy-pages.yml on main: the manual recovery docs/DEPLOY.md already names, so
// every Deploy Web gate (require-green-release.mjs, the deploy-pages queue, the superseded-release
// refusal, the re-check before upload, the canonical git-commit check) stays exactly as it is.
//
// Owed only when all hold: the CI run was a green push to main; its head is still main's tip; the live
// web's commit is readable, differs from the head and is an ancestor of it; no Deploy Web run for the
// head is already queued or running; and a commit since the live one touches Deploy Web's own push
// paths (read from deploy-pages.yml, never copied).
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FULL_SHA = /^[0-9a-f]{40}$/;
const SITE = "https://skipwait.me/";

/** The `push.paths` list of deploy-pages.yml, in order, comments skipped. */
export function webPathsOf(workflowText) {
  const lines = workflowText.split("\n");
  const push = lines.findIndex(l => /^ {2}push:\s*$/.test(l));
  if (push < 0) throw new Error("deploy-pages.yml has no push trigger");
  const start = lines.findIndex((l, i) => i > push && /^ {4}paths:\s*$/.test(l));
  if (start < 0) throw new Error("deploy-pages.yml push trigger has no paths list");
  const paths = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const item = /^ {6}- "([^"]+)"\s*$/.exec(line);
    if (!item) break;
    paths.push(item[1]);
  }
  if (!paths.length) throw new Error("deploy-pages.yml push paths list is empty");
  return paths;
}

const globToRegExp = glob => new RegExp(`^${glob.split("**").map(part => part.split("*").map(s => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")).join(".*")}$`);

/** True when the file matches one of GitHub's path filters (`**` crosses folders, `*` does not). */
export function matchesAnyPath(file, paths) {
  return paths.some(p => globToRegExp(p).test(file));
}

/** The commit the live web carries, from its git-commit meta tag, or null. */
export function liveShaOf(html) {
  const sha = /name="git-commit" content="([0-9a-f]+)"/.exec(html ?? "")?.[1] ?? "";
  return FULL_SHA.test(sha) ? sha : null;
}

/** Pure decision. `notice: true` marks a skip a person should look at. */
export function decideCatchUp(c) {
  const skip = (reason, notice = false) => ({ deploy: false, notice, reason });
  if (c.ciConclusion !== "success") return skip(`CI on ${c.ciHead} concluded ${c.ciConclusion}`);
  if (c.ciEvent !== "push" || c.ciBranch !== "main") return skip(`CI on ${c.ciHead} was not a push to main (${c.ciEvent} on ${c.ciBranch})`);
  if (c.ciHead !== c.mainTip) return skip(`main moved on to ${c.mainTip}; that commit's own CI decides`);
  if (!c.liveSha) return skip(`could not read the live web commit from ${SITE}; dispatch Deploy Web by hand if it is behind`, true);
  if (c.liveSha === c.ciHead) return skip(`${c.ciHead} is already live`);
  if (!c.liveIsAncestor) return skip(`live ${c.liveSha} is not an ancestor of ${c.ciHead} (a rollback or a divergence); not overriding it`, true);
  if (c.activeDeployForHead) return skip(`a Deploy Web run for ${c.ciHead} is already queued or running`);
  const web = c.changedFiles.filter(f => matchesAnyPath(f, c.paths));
  if (!web.length) return skip(`no web-path change between live ${c.liveSha} and ${c.ciHead}`);
  return { deploy: true, notice: false, reason: `live ${c.liveSha} is behind ${c.ciHead} with ${web.length} web-path file(s) changed, e.g. ${web[0]}` };
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

async function activeDeployFor(sha, env) {
  const url = `${env.GITHUB_API_URL || "https://api.github.com"}/repos/${env.GITHUB_REPOSITORY}/actions/workflows/deploy-pages.yml/runs?head_sha=${sha}&per_page=50`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} listing Deploy Web runs`);
  const body = await res.json();
  return (body.workflow_runs ?? []).some(r => r.status !== "completed");
}

async function readLiveSha() {
  try {
    const res = await fetch(SITE, { headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(30_000) });
    return res.ok ? liveShaOf(await res.text()) : null;
  } catch {
    return null;
  }
}

async function main(env = process.env) {
  const ciHead = env.CI_HEAD_SHA ?? "";
  if (!FULL_SHA.test(ciHead)) throw new Error(`CI_HEAD_SHA is not a full SHA: ${ciHead}`);
  const paths = webPathsOf(readFileSync(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8"));
  const mainTip = git("rev-parse", "HEAD");
  const liveSha = await readLiveSha();
  const reachable = sha => { try { git("cat-file", "-e", `${sha}^{commit}`); return true; } catch { return false; } };
  const liveIsAncestor = Boolean(liveSha && reachable(liveSha) && (() => { try { git("merge-base", "--is-ancestor", liveSha, ciHead); return true; } catch { return false; } })());
  const changedFiles = liveSha && liveIsAncestor && liveSha !== ciHead ? git("diff", "--name-only", liveSha, ciHead).split("\n").filter(Boolean) : [];
  const activeDeployForHead = liveSha && liveSha !== ciHead ? await activeDeployFor(ciHead, env) : false;
  const decision = decideCatchUp({
    ciConclusion: env.CI_CONCLUSION, ciEvent: env.CI_EVENT, ciBranch: env.CI_BRANCH, ciHead, mainTip,
    liveSha, liveIsAncestor, changedFiles, paths, activeDeployForHead,
  });
  const line = `Deploy Web catch-up: ${decision.deploy ? "deploying" : "skipped"}: ${decision.reason}`;
  // stdout is $GITHUB_OUTPUT, so the workflow's next step prints the annotation from `reason` and `notice`.
  console.error(line);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `### ${line}\n`);
  process.stdout.write(`deploy=${decision.deploy}\nnotice=${decision.notice}\nreason=${decision.reason.replace(/\n/g, " ")}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`::error::deployWebCatchUp: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
