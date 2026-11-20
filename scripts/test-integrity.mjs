#!/usr/bin/env node
/**
 * GATE-test-integrity (docs/plans/GATE-delivery.md, D-212): fail a pull request that deletes,
 * focuses, skips or thins tests. The rules live in scripts/testIntegrityCore.mjs; this file
 * only gathers the inputs.
 *
 * It runs from scripts/scope-check.mjs, so the required typecheck job runs it, and only for a
 * pull request: it reads the event at GITHUB_EVENT_PATH and passes at once when there is no
 * `pull_request` in it (a push to main, a manual run, a local run). The PR body comes from that
 * event, never from a shell line; a re-run replays the original event, so an edited body takes
 * effect with the next push.
 *
 * Fail closed on a definite breach, open on a broken tool (exit 0 with a warning).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { slugOf } from "./nextTaskCore.mjs";
import { pullRequestBody, testIntegrityViolations } from "./testIntegrityCore.mjs";

const ASSIGNMENTS = "docs/plans/assignments.json";
const git = args => execFileSync("git", ["-c", "core.quotePath=false", ...args], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 }).trim();

function ensureOriginMainHistory() {
  try {
    git(["merge-base", "origin/main", "HEAD"]);
  } catch {
    // actions/checkout's default depth-one checkout may not include the base history.
    const shallow = git(["rev-parse", "--is-shallow-repository"]) === "true";
    const refspec = "+refs/heads/main:refs/remotes/origin/main";
    git(shallow ? ["fetch", "--no-tags", "--unshallow", "origin", refspec] : ["fetch", "--no-tags", "origin", refspec]);
    git(["merge-base", "origin/main", "HEAD"]);
  }
}

function readEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;
  return JSON.parse(readFileSync(eventPath, "utf8"));
}

/** The task's owns from origin/main, matched by branch slug as the scope check does; [] when no row matches. */
function taskOwns() {
  const doc = JSON.parse(git(["show", `origin/main:${ASSIGNMENTS}`]));
  const tasks = Array.isArray(doc?.tasks) ? doc.tasks : [];
  const branch = process.env.GITHUB_HEAD_REF || git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const task = tasks.find(t => typeof t?.branch === "string" && slugOf(t.branch) === slugOf(branch));
  return Array.isArray(task?.owns) ? task.owns : [];
}

export function runTestIntegrity() {
  try {
    const body = pullRequestBody(readEvent());
    if (body === undefined) return 0;

    ensureOriginMainHistory();
    const diff = git(["diff", "-M", "--unified=0", "--no-color", "--no-ext-diff", "origin/main...HEAD"]);
    const separator = "\u001e";
    const commits = git(["log", `--format=%B${separator}`, "origin/main..HEAD"]).split(separator).map(message => message.trim()).filter(Boolean);
    const violations = testIntegrityViolations({ diff, owns: taskOwns(), body, commits });
    if (!violations.length) {
      console.log("test-integrity: no test deleted, focused, skipped or thinned.");
      return 0;
    }
    for (const violation of violations) console.error(`test-integrity: ${violation}`);
    console.error(`test-integrity: ${violations.length} violation(s). Tests can be added, not quietly removed (D-212, docs/plans/GATE-delivery.md).`);
    return 1;
  } catch (error) {
    console.error(`test-integrity: could not run (${error instanceof Error ? error.message : String(error)}) — not failing the branch.`);
    return 0;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = runTestIntegrity();
