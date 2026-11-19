#!/usr/bin/env node
/**
 * D-166: require a pull-request head to match a task branch or one of the
 * explicitly allowed repository maintenance branches before it can merge.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { slugOf } from "./nextTaskCore.mjs";

const ASSIGNMENTS = "docs/plans/assignments.json";
const NO_ROW = "This branch matches no queue row. Nothing merges to main outside the queue (D-166). Register a row in docs/plans/assignments.json with a docs-only pull request (any session may, D-200), or work on the row's own branch.";
const git = args => execFileSync("git", args, { encoding: "utf8" }).trim();

function ensureOriginMainHistory() {
  try {
    git(["merge-base", "origin/main", "HEAD"]);
    return;
  } catch {
    // actions/checkout's default depth-one checkout may not include the base history.
    const shallow = git(["rev-parse", "--is-shallow-repository"]) === "true";
    const refspec = "+refs/heads/main:refs/remotes/origin/main";
    git(shallow
      ? ["fetch", "--no-tags", "--unshallow", "origin", refspec]
      : ["fetch", "--no-tags", "origin", refspec]);
    git(["merge-base", "origin/main", "HEAD"]);
  }
}

function knownTaskList(tasks) {
  return Array.isArray(tasks) && tasks.every(task =>
    task !== null && typeof task === "object" && !Array.isArray(task) &&
    typeof task.branch === "string" && task.branch.length > 0,
  );
}

function isDocumentPath(path) {
  if (path.startsWith("docs/") || path.startsWith("app/docs/")) return true;
  if (path === ASSIGNMENTS) return true;
  if (path.endsWith(".md") && !path.includes("/")) return true;
  if (!path.startsWith(".github/")) return false;
  const underGithub = path.slice(".github/".length);
  return underGithub.endsWith(".md") && !underGithub.includes("/");
}

/** Pure rule function so every exception and denial can be tested without git or GitHub. */
export function queueGateViolation({ tasks, branch, changed, labels = [] } = {}) {
  if (!knownTaskList(tasks) || typeof branch !== "string" || !Array.isArray(changed) ||
      !changed.every(path => typeof path === "string") || !Array.isArray(labels) ||
      !labels.every(label => typeof label === "string")) return null;

  if (tasks.some(task => task.branch === branch)) return null;

  const markerBranch = /^agent\/(architect|review|heartbeat)\/([^/]+)$/.exec(branch);
  if (markerBranch && tasks.some(task => slugOf(task.branch) === markerBranch[2])) return null;

  // D-200: a docs-only change (decisions, packets, queue rows) lands from any session's branch, so no step waits for one model.
  if (changed.length > 0 && changed.every(isDocumentPath)) return null;
  if (branch.startsWith("dependabot/")) return null;
  if (labels.includes("owner-direct")) return null;

  return NO_ROW;
}

/** Warn only when the owner-direct label is what makes a PR pass. */
export function ownerDirectWarning(labels, pullRequestNumber) {
  if (!Array.isArray(labels) || !labels.includes("owner-direct")) return null;
  const pr = Number.isInteger(pullRequestNumber) && pullRequestNumber > 0
    ? `PR #${pullRequestNumber}`
    : "PR number unavailable";
  return `queue-gate: ${pr} passed with owner-direct; only the owner may apply this label.`;
}

function readPullRequestEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return { labels: [], pullRequestNumber: null };

  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  const pullRequest = event && typeof event === "object" ? event.pull_request : null;
  const rawLabels = Array.isArray(pullRequest?.labels) ? pullRequest.labels : [];
  const labels = rawLabels
    .map(label => label && typeof label.name === "string" ? label.name : null)
    .filter(Boolean);
  const pullRequestNumber = Number.isInteger(pullRequest?.number)
    ? pullRequest.number
    : Number.isInteger(event?.number) ? event.number : null;
  return { labels, pullRequestNumber };
}

/** Run the gate in CI or locally; internal tool/data errors fail open with a warning. */
export function runQueueGate() {
  try {
    // This required check also runs after a merge on `main`. The gate is for PRs;
    // an already-completed push or manual run must not make main's own CI red.
    const eventName = process.env.GITHUB_EVENT_NAME;
    if (eventName && eventName !== "pull_request") return 0;

    ensureOriginMainHistory();
    const assignments = JSON.parse(git(["show", `origin/main:${ASSIGNMENTS}`]));
    const tasks = assignments?.tasks;
    if (!knownTaskList(tasks)) {
      console.warn("queue-gate: origin/main task list has an unknown structure — not failing the branch.");
      return 0;
    }

    const branch = process.env.GITHUB_HEAD_REF || git(["rev-parse", "--abbrev-ref", "HEAD"]);
    // --no-renames: a file moved into docs/ must still count its old path, or it would pass as docs-only.
    const changed = git(["diff", "--name-only", "--no-renames", "origin/main...HEAD"]).split("\n").filter(Boolean);
    const { labels, pullRequestNumber } = readPullRequestEvent();
    const violation = queueGateViolation({ tasks, branch, changed, labels });

    if (labels.includes("owner-direct") && violation === null) {
      const withoutOwnerDirect = queueGateViolation({ tasks, branch, changed, labels: labels.filter(label => label !== "owner-direct") });
      if (withoutOwnerDirect !== null) console.warn(ownerDirectWarning(labels, pullRequestNumber));
    }
    if (violation) {
      console.error(violation);
      return 1;
    }
    return 0;
  } catch (error) {
    console.error(`queue-gate: could not run (${error instanceof Error ? error.message : String(error)}) — not failing the branch.`);
    return 0;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runQueueGate();
}
