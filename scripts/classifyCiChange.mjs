#!/usr/bin/env node
/**
 * CI-architect-real-checks (#748/#752): decide whether a pull request changed
 * anything, from the complete diff between the SHAs the event pinned.
 *
 * Why this exists. `ci.yml` used to skip its three required jobs for every
 * branch under `agent/reports/`, `agent/review/`, `agent/heartbeat/` and
 * `agent/architect/`. True marker branches are empty commits and need no
 * checks, but substantive architect packet pull requests share that prefix:
 * PR #752 and PR #764 merged with all three required jobs skipped, and GitHub
 * counts a skipped required job as passed. The rule is now the diff, never the
 * branch name.
 *
 * The rule, in one line: exactly zero changed files at the pinned base and head
 * is the only fast path; every other answer, including "I could not read it",
 * runs the full required steps.
 *
 * Two independent reads must agree before an empty answer is trusted:
 * `git diff --name-only` gives the file list, and `git diff --quiet` gives the
 * tree comparison as an exit code. A truncated or malformed list next to a
 * differing tree, or a file list next to an identical tree, is a contradiction
 * and is treated as substantive. Nothing here reads a pull request's title,
 * message, labels or branch, and nothing reads the pull-request files API, so
 * a 403, 404, 422, 5xx, rate limit, timeout, non-JSON body, missing page or a
 * capped list can never become an empty list.
 *
 * `--expect-substantive` is how `ci.yml` calls it from inside a required job
 * that is already running: if that job's own diff turns out to be empty, the
 * empty-diff gate and the diff disagree, and the job fails instead of passing
 * without running a single real step. An unreadable diff never fails: it prints
 * the reason and lets the full steps run.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** A pinned commit id: 40 or 64 lowercase hex characters. A branch name is not a SHA. */
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** The diff options every read uses: no rename detection, and no filter a pull request could define. */
const DIFF_OPTIONS = ["--no-renames", "--no-textconv", "--no-ext-diff"];

/** A pinned commit id, or null when the value is not one. */
export function parseSha(value) {
  return typeof value === "string" && SHA.test(value) ? value : null;
}

/**
 * Packet E3: a changed-file count is only a count when it is the number zero.
 * The string "0", null, a negative number and NaN are all "not empty".
 */
export function fastPathFromCount(value) {
  return typeof value === "number" && Number.isInteger(value) && value === 0;
}

/** One line, no newlines: this text reaches a workflow output and a log line. */
function describe(error) {
  const status = error && typeof error.status === "number" ? ` (exit ${error.status})` : "";
  const message = error instanceof Error ? error.message : String(error);
  return `${message.split("\n")[0]}${status}`.replace(/\s+/g, " ").trim();
}

/**
 * Read the complete changed-file list between two pinned commits.
 *
 * The preferred range is the merge base, which is what the pull request itself
 * changed. When the checkout is too shallow to resolve one, the two pinned
 * commits are compared directly: that can only report *more* changed files,
 * never fewer, so it stays fail closed. A pair of identical trees is a stronger
 * "nothing changed" than an empty merge-base diff, not a weaker one.
 */
export function readGitDiff(base, head, run) {
  const git = run;
  let pair = null;
  let mode = "pinned-pair";
  try {
    const mergeBase = String(git(["merge-base", base, head]) ?? "").trim();
    if (SHA.test(mergeBase)) {
      pair = [`${mergeBase}..${head}`];
      mode = "merge-base";
    }
  } catch {
    // A shallow checkout has no common history. Fall through to the pinned pair.
  }
  if (pair === null) pair = [base, head];

  try {
    const names = String(git(["diff", ...DIFF_OPTIONS, "--name-only", ...pair]) ?? "");
    const files = names
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    let identical;
    try {
      git(["diff", ...DIFF_OPTIONS, "--quiet", ...pair]);
      identical = true;
    } catch (error) {
      if (!error || error.status !== 1) return { ok: false, reason: `the second diff read failed: ${describe(error)}` };
      identical = false;
    }
    return { ok: true, files, identical, mode };
  } catch (error) {
    return { ok: false, reason: `git could not read the diff: ${describe(error)}` };
  }
}

function substantive(reason, changedFiles = null) {
  return { markerOnly: false, reason, changedFiles };
}

/**
 * The whole rule, with no I/O: a verdict for one pinned pair of commits.
 * `diff` is a read result: `{ ok: true, files, identical }` or `{ ok: false, reason }`.
 */
export function decide({ eventName, base, head, diff } = {}) {
  if (eventName !== "pull_request") {
    return substantive("not a pull request event: every push, dispatch and re-run runs the full required steps");
  }
  const pinnedBase = parseSha(base);
  const pinnedHead = parseSha(head);
  if (!pinnedBase || !pinnedHead) return substantive("base or head is not a pinned commit SHA");
  if (pinnedBase === pinnedHead) return substantive("base and head are the same commit");
  if (!diff || diff.ok !== true || !Array.isArray(diff.files) || typeof diff.identical !== "boolean") {
    return substantive(`the diff could not be read: ${(diff && diff.reason) || "no result from the reader"}`);
  }
  const files = diff.files.filter((file) => typeof file === "string" && file.trim() !== "");
  const empty = files.length === 0;
  if (empty !== diff.identical) {
    return substantive("the two diff reads disagree, so the file list is not trusted");
  }
  if (!empty) return substantive(`${files.length} file(s) changed between the pinned base and head`, files.length);
  return { markerOnly: true, reason: "no file changed between the pinned base and head", changedFiles: 0 };
}

/** `git`, throwing on a non-zero exit with `status` set, so `readGitDiff` can tell 1 from a failure. */
function gitRun(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Map a workflow environment onto the rule. An absent environment is substantive, never a crash. */
export function classify(env = {}, read = readGitDiff) {
  const source = env ?? {};
  const eventName = typeof source.GITHUB_EVENT_NAME === "string" ? source.GITHUB_EVENT_NAME : "";
  const base = parseSha(source.BASE_SHA);
  const head = parseSha(source.HEAD_SHA);
  if (eventName !== "pull_request" || !base || !head || base === head) {
    return decide({ eventName, base: source.BASE_SHA, head: source.HEAD_SHA, diff: { ok: false, reason: "not read" } });
  }
  let diff;
  try {
    diff = read(base, head, gitRun);
  } catch (error) {
    diff = { ok: false, reason: describe(error) };
  }
  return decide({ eventName, base, head, diff });
}

/**
 * The workflow entry point. Prints only `key=value` lines on stdout, so
 * `>> "$GITHUB_OUTPUT"` stays valid; everything human goes to stderr.
 */
export function runCli(argv = [], env = process.env, read = readGitDiff, write = (chunk) => process.stdout.write(chunk)) {
  const verdict = classify(env, read);
  const changed = typeof verdict.changedFiles === "number" ? String(verdict.changedFiles) : "unknown";
  write(
    [
      `marker_only=${verdict.markerOnly ? "true" : "false"}`,
      `reason=${verdict.reason.replace(/\s+/g, " ").trim()}`,
      `changed_files=${changed}`,
      "",
    ].join("\n"),
  );
  process.stderr.write(`classify-ci-change: ${verdict.markerOnly ? "marker" : "substantive"} - ${verdict.reason}\n`);
  if (argv.includes("--expect-substantive") && verdict.markerOnly) {
    process.stderr.write(
      "classify-ci-change: this required job is running, but the pinned diff is empty; the empty-diff gate and the diff disagree, so this job fails instead of passing without real steps.\n",
    );
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli(process.argv.slice(2));
}
