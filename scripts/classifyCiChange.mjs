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
 * H1 (owner source review, Oct 28). The first correction moved the skip to a
 * job-level `if:` that read the event's `changed_files`/`additions`/`deletions`
 * counts. That left the same hole one level up: if those counts wrongly said
 * zero for a non-empty diff, the job never started and no classifier step ran.
 * The required jobs now always start. This script runs inside each of them and
 * is the only thing that may grant an empty fast path, so a wrong count cannot
 * buy a green job that ran no real step. A count that claims empty next to a
 * pinned diff that is not empty is a contradiction, and it fails the job red.
 *
 * The rule, in one line: exactly zero changed files at the pinned base and head,
 * read from a real merge base, on a pull request against the default branch, is
 * the only fast path; every other answer, including "I could not read it", runs
 * the full required steps.
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
 * L1 (owner source review). Only a merge-base comparison may answer "empty".
 * Comparing the two pinned commits directly is a weaker question: if the base
 * and the head each made the same change on their own, that pair is empty while
 * the pull request is not. The workflow deepens the fetch until a merge base
 * resolves, and a shallow read that cannot resolve one is substantive here, so
 * the fallback can no longer produce a green fast path on a real change.
 *
 * M1 (owner source review). Only a pull request whose base is the repository's
 * default branch may take the fast path. A head that is empty against a twin
 * non-default base can still be substantive against `main`, and a retarget is
 * then a fresh `pull_request` run that decides again from its own pinned pair.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** A pinned commit id: 40 or 64 lowercase hex characters. A branch name is not a SHA. */
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** The diff options every read uses: no rename detection, and no filter a pull request could define. */
const DIFF_OPTIONS = ["--no-renames", "--no-textconv", "--no-ext-diff"];

/** The only comparison mode that may answer "empty": the pull request's own merge-base range. */
export const TRUSTED_MODE = "merge-base";

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

/** A workflow boolean arrives as the string `true`; anything else is not a yes. */
function isTrue(value) {
  return value === true || value === "true";
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
 * commits are still compared so the caller has a file list, but the result is
 * marked `pinned-pair`: it can be empty for a pull request that is not (L1), so
 * `decide` never accepts an empty answer from it. `ci.yml` deepens the fetch
 * first, so a genuine marker still reaches a merge base.
 */
export function readGitDiff(base, head, run) {
  const git = run;
  let pair = null;
  let mode = "pinned-pair";
  try {
    const mergeBase = String(git(["merge-base", base, head]) ?? "").trim();
    if (SHA.test(mergeBase)) {
      pair = [`${mergeBase}..${head}`];
      mode = TRUSTED_MODE;
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

function substantive(reason, changedFiles = null, mode = null) {
  return { markerOnly: false, contradiction: false, reason, changedFiles, mode };
}

/** The event's own counts said zero, but the pinned diff says otherwise. That is a red job, not a full run. */
function contradiction(reason, changedFiles, mode = null) {
  return { markerOnly: false, contradiction: true, reason, changedFiles, mode };
}

/**
 * The whole rule, with no I/O: a verdict for one pinned pair of commits.
 * `diff` is a read result: `{ ok: true, files, identical, mode }` or `{ ok: false, reason }`.
 * `eventClaimedEmpty` is the workflow's own evaluation of the event counts.
 * `baseIsDefaultBranch` is true only for a pull request opened against `main`.
 */
export function decide({ eventName, base, head, diff, eventClaimedEmpty = false, baseIsDefaultBranch = false } = {}) {
  const mode = diff && typeof diff.mode === "string" ? diff.mode : null;
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
  // H1: the counts claimed nothing changed while the pinned diff proves otherwise.
  if (!empty && isTrue(eventClaimedEmpty)) {
    return contradiction(
      `the event reported no change, but ${files.length} file(s) differ between the pinned base and head`,
      files.length,
      mode,
    );
  }
  if (!empty) return substantive(`${files.length} file(s) changed between the pinned base and head`, files.length, mode);
  // L1: an empty pinned pair is not proof that the pull request is empty.
  if (mode !== TRUSTED_MODE) {
    return substantive("no merge base resolved, so an empty pinned pair cannot prove the pull request is empty");
  }
  // M1: an empty diff against a non-default base says nothing about the default branch.
  if (!isTrue(baseIsDefaultBranch)) {
    return substantive("the base is not the default branch, so an empty diff here is not an empty change to main");
  }
  return { markerOnly: true, contradiction: false, reason: "no file changed between the pinned base and head", changedFiles: 0, mode };
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
  const eventClaimedEmpty = isTrue(source.EVENT_CLAIMED_EMPTY);
  const baseIsDefaultBranch = isTrue(source.BASE_IS_DEFAULT_BRANCH);
  if (eventName !== "pull_request" || !base || !head || base === head) {
    return decide({ eventName, base: source.BASE_SHA, head: source.HEAD_SHA, diff: { ok: false, reason: "not read" }, eventClaimedEmpty, baseIsDefaultBranch });
  }
  let diff;
  try {
    diff = read(base, head, gitRun);
  } catch (error) {
    diff = { ok: false, reason: describe(error) };
  }
  return decide({ eventName, base, head, diff, eventClaimedEmpty, baseIsDefaultBranch });
}

/**
 * The workflow entry point. Prints only `key=value` lines on stdout, so
 * `>> "$GITHUB_OUTPUT"` stays valid; everything human goes to stderr.
 *
 * Exit 0 means "decided": `marker_only=true` grants the fast path, `false` runs
 * the full steps. Exit 1 is reserved for H1's contradiction - the event said
 * nothing changed and the pinned diff says otherwise - so the required job goes
 * red instead of passing on a false empty.
 */
export function runCli(argv = [], env = process.env, read = readGitDiff, write = (chunk) => process.stdout.write(chunk)) {
  const verdict = classify(env, read);
  const changed = typeof verdict.changedFiles === "number" ? String(verdict.changedFiles) : "unknown";
  const mode = typeof verdict.mode === "string" ? verdict.mode : "unread";
  write(
    [
      `marker_only=${verdict.markerOnly ? "true" : "false"}`,
      `contradiction=${verdict.contradiction ? "true" : "false"}`,
      `mode=${mode}`,
      `reason=${verdict.reason.replace(/\s+/g, " ").trim()}`,
      `changed_files=${changed}`,
      "",
    ].join("\n"),
  );
  process.stderr.write(
    `classify-ci-change: ${verdict.contradiction ? "contradiction" : verdict.markerOnly ? "marker" : "substantive"} - ${verdict.reason}\n`,
  );
  if (verdict.contradiction) {
    process.stderr.write(
      "classify-ci-change: the event reported an empty diff and the pinned diff is not empty, so this required job fails rather than passing without real steps.\n",
    );
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli(process.argv.slice(2));
}
