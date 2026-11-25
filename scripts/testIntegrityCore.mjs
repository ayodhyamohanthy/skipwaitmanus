/**
 * GATE-test-integrity (docs/plans/GATE-delivery.md, D-212): tests can be added, not quietly
 * removed. The rules, with no I/O, so they run on diff-text fixtures. The CI wrapper is
 * scripts/test-integrity.mjs.
 *
 * A pull request fails when:
 *   1. a test file is deleted or renamed away, unless the task's owns names it;
 *   2. a changed test file adds a focused test;
 *   3. a changed test file adds a skipped or todo test;
 *   4. a changed test file ends with fewer assertion lines, unless the PR body's
 *      "Ported assertions" table has a row naming the file and where they now live;
 *   5. a pinned test file loses any assertion line at all, table or not, unless a commit
 *      on the branch carries `test-integrity: <file> — D-<n>`.
 */
import { ownsMatches } from "./nextTaskCore.mjs";

const TEST_FILE = /\.test\.tsx?$/;
const ASSERTION = /expect\(|assert/;
const FOCUS = /\.only\(|\b(?:it|test|describe)\.only\./;
const SKIP = /\.skip\(|\.todo\(|\bit\.skip\b|\btest\.skip\b|\bdescribe\.skip\b|\bxit\(/;
const PORTED_HEADING = /^\s{0,3}#{1,6}\s*Ported assertions\b/i;
const ANY_HEADING = /^\s{0,3}#{1,6}\s/;
const MARKER = /^\s*test-integrity:\s*`?([^\s`]+)`?\s+[—–-]+\s+(D-\d+)\b/;

/**
 * The pinned login and money tests (rule 5): one list, exact paths or patterns.
 * Changing it needs a decision, like losing one of their assertions.
 */
export const PINNED_TESTS = [
  "client/src/pages/loginRule.test.tsx",
  "client/src/pages/signIn.test.tsx",
  /^server\/[^/]*(?:creditLedger|dailyMoneyCheck|payment|refund|chargebee)[^/]*\.test\.ts$/i,
];

export const isTestFile = path => typeof path === "string" && TEST_FILE.test(path);

export function isPinnedTestFile(path) {
  if (typeof path !== "string") return false;
  return PINNED_TESTS.some(entry => (typeof entry === "string" ? entry === path : entry.test(path)));
}

/** The PR body from a GitHub event payload; undefined when the event is not a pull request. */
export function pullRequestBody(event) {
  if (!event || typeof event !== "object") return undefined;
  const pr = event.pull_request;
  if (!pr || typeof pr !== "object") return undefined;
  return typeof pr.body === "string" ? pr.body : "";
}

const stripPrefix = (raw, prefix) => (raw.startsWith(prefix) ? raw.slice(prefix.length) : raw);

/**
 * Parse `git diff` output (any context size, renames on) into one entry per file:
 * { status: added|deleted|renamed|modified, oldPath, newPath, added: string[], removed: string[] }.
 */
export function parseDiff(text) {
  const files = [];
  let file = null;
  let inHunk = false;
  for (const line of String(text ?? "").split("\n")) {
    if (line.startsWith("diff --git ")) {
      const header = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      file = { status: "modified", oldPath: header?.[1] ?? null, newPath: header?.[2] ?? null, added: [], removed: [] };
      files.push(file);
      inHunk = false;
      continue;
    }
    if (!file) continue;
    if (inHunk) {
      if (line.startsWith("@@")) continue;
      if (line.startsWith("+")) file.added.push(line.slice(1));
      else if (line.startsWith("-")) file.removed.push(line.slice(1));
      continue;
    }
    if (line.startsWith("@@")) inHunk = true;
    else if (line.startsWith("new file mode")) file.status = "added";
    else if (line.startsWith("deleted file mode")) file.status = "deleted";
    else if (line.startsWith("rename from ")) { file.status = "renamed"; file.oldPath = line.slice("rename from ".length); }
    else if (line.startsWith("rename to ")) { file.status = "renamed"; file.newPath = line.slice("rename to ".length); }
    else if (line.startsWith("--- ")) { const p = line.slice(4); if (p !== "/dev/null") file.oldPath = stripPrefix(p, "a/"); }
    else if (line.startsWith("+++ ")) { const p = line.slice(4); if (p !== "/dev/null") file.newPath = stripPrefix(p, "b/"); }
  }
  for (const entry of files) {
    if (entry.status === "added") entry.oldPath = null;
    if (entry.status === "deleted") entry.newPath = null;
  }
  return files;
}

/** Lines in `lines` whose trimmed text is not matched one-for-one in `others` (a multiset difference). */
function unmatched(lines, others) {
  const pool = new Map();
  for (const line of others) pool.set(line.trim(), (pool.get(line.trim()) ?? 0) + 1);
  return lines.filter(line => {
    const key = line.trim();
    const left = pool.get(key) ?? 0;
    if (left > 0) { pool.set(key, left - 1); return false; }
    return true;
  });
}

/** Files the PR body's "Ported assertions" table accounts for: a row naming the file plus a non-empty destination cell. */
export function portedRows(body) {
  const rows = [];
  let inSection = false;
  for (const line of String(body ?? "").split("\n")) {
    if (PORTED_HEADING.test(line)) { inSection = true; continue; }
    if (ANY_HEADING.test(line)) { inSection = false; continue; }
    if (!inSection || !line.trim().startsWith("|")) continue;
    if (/^[\s|:-]+$/.test(line)) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.replace(/`/g, "").trim());
    rows.push(cells);
  }
  return rows;
}

function tableNames(rows, path) {
  return rows.some(cells => {
    const at = cells.findIndex(cell => cell.split(/[\s,]+/).includes(path));
    return at >= 0 && cells.some((cell, i) => i !== at && cell !== "" && cell !== "-" && cell !== "—");
  });
}

function markerFor(commits, path) {
  return commits.some(message => String(message ?? "").split("\n").some(line => {
    const match = MARKER.exec(line);
    return match !== null && match[1] === path;
  }));
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Judge a pull request. `diff` is `git diff -M <base>...<head>` text, `owns` the task's owns,
 * `body` the PR body, `commits` the full messages of the branch's commits. Returns violations.
 */
export function testIntegrityViolations({ diff = "", owns = [], body = "", commits = [] } = {}) {
  const violations = [];
  const rows = portedRows(body);
  const ownsList = Array.isArray(owns) ? owns : [];
  const commitList = Array.isArray(commits) ? commits : [];
  const owned = path => ownsList.some(entry => ownsMatches(entry, path));

  for (const file of parseDiff(diff)) {
    const oldIsTest = isTestFile(file.oldPath);
    const newIsTest = isTestFile(file.newPath);
    if (!oldIsTest && !newIsTest) continue;
    const pinned = oldIsTest && isPinnedTestFile(file.oldPath);
    const pinnedEscape = pinned && markerFor(commitList, file.oldPath);
    const gone = file.status === "deleted" || file.status === "renamed";

    // Rule 1: a test file deleted or renamed away.
    if (oldIsTest && gone && !owned(file.oldPath)) {
      const how = file.status === "deleted" ? "deleted" : `renamed to ${file.newPath}`;
      violations.push(`${file.oldPath}: test file ${how}; only a task whose owns names it may retire a test (rule 1).`);
    }
    if (pinned && gone && !pinnedEscape) {
      violations.push(`${file.oldPath}: a pinned login or money test was ${file.status}; that needs a commit on the branch with "test-integrity: ${file.oldPath} — D-<n>" naming the decision that changed the rule (rule 5).`);
    }

    // Rules 2 and 3: only lines this PR really adds.
    if (newIsTest) {
      const fresh = unmatched(file.added, file.removed);
      const focus = fresh.find(line => FOCUS.test(line));
      if (focus) violations.push(`${file.newPath}: adds a focused test (${focus.trim()}); remove .only before merging (rule 2).`);
      const skip = fresh.find(line => SKIP.test(line));
      if (skip) violations.push(`${file.newPath}: adds a skipped or todo test (${skip.trim()}); tests can be added, not switched off (rule 3).`);
    }

    if (file.status === "deleted" || !oldIsTest) continue;

    const removedAsserts = file.removed.filter(line => ASSERTION.test(line));
    const addedAsserts = file.added.filter(line => ASSERTION.test(line));

    // Rule 5: a pinned file loses any assertion line (moved inside the file is fine).
    if (pinned) {
      const lost = unmatched(removedAsserts, addedAsserts);
      if (lost.length > 0 && !pinnedEscape) {
        violations.push(`${file.oldPath}: a pinned login or money test loses ${plural(lost.length, "assertion line")} (first: ${lost[0].trim()}); that needs a commit on the branch with "test-integrity: ${file.oldPath} — D-<n>" naming the decision that changed the rule; a Ported assertions table does not cover pinned files (rule 5).`);
      }
      if (lost.length > 0) continue;
    }

    // Rule 4: fewer assertion lines at the end than at the start.
    if (removedAsserts.length > addedAsserts.length && !pinnedEscape) {
      const named = tableNames(rows, file.oldPath) || (file.newPath !== null && tableNames(rows, file.newPath));
      if (!named) {
        violations.push(`${file.oldPath}: removes ${plural(removedAsserts.length, "assertion line")} and adds ${addedAsserts.length}, so it ends with fewer. Add a row naming ${file.oldPath} and where each removed assertion now lives to a "Ported assertions" table in the PR body, then push again (an empty commit is fine) (rule 4, D-136).`);
      }
    }
  }
  return violations;
}
