#!/usr/bin/env node
/**
 * PROCESS-scorecard (D-166, docs/plans/PROCESS-gates.md): the weekly numbers every CEO review starts from.
 *
 *   node scripts/scorecard.mjs              # the last 7 days
 *   node scripts/scorecard.mjs --days 14    # another window
 *
 * It reads GitHub the way scripts/next-task.mjs does (one `per_page=100` read of closed pull requests,
 * sorted by `updated`; the proxy refuses page links, so the first line says how many days that sample
 * covers), and everything else from git: the task list on origin/main, each merge's changed files, the
 * review locks and the board (agent/reports/log). It prints plain text, one number per line, with pull
 * request numbers and task ids only: no names, no personal data (the repository is public).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parseMarker, reviewLockOf } from "./nextTaskCore.mjs";
import { queueGateViolation } from "./queue-gate.mjs";
import { findGateRow, reviewGateViolation, reviewedOf } from "./review-gate.mjs";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const PAGE = 100;
const STATUS_ORDER = ["green", "red", "blocked", "review", "landed"];

// ---- the pure classifier (scripts/scorecard.test.ts) ----

/** §0's path rules, the queue gate's document rule included: docs, test, script or product. */
export function classifyPath(path) {
  const p = String(path ?? "");
  if (p.startsWith("docs/") || p.startsWith("app/docs/") || p === "docs/plans/assignments.json") return "docs";
  if (p.endsWith(".md") && !p.includes("/")) return "docs";
  if (p.startsWith(".github/") && p.slice(8).endsWith(".md") && !p.slice(8).includes("/")) return "docs";
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(p) || /(^|\/)(__tests__|__fixtures__)\//.test(p)) return "test";
  if (p.startsWith("scripts/") || p.startsWith(".github/")) return "script";
  return "product";
}

/** One kind per merge: any product file makes it product code; an unreadable diff is unknown, never docs. */
export function kindOf(files) {
  if (!Array.isArray(files) || files.length === 0) return "unknown";
  const kinds = new Set(files.map(classifyPath));
  if (kinds.has("product")) return "product";
  if (kinds.has("script")) return "scripts";
  if (kinds.has("test")) return "tests";
  return "docs";
}

export function median(values) {
  const v = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export const isRevert = pr => /^revert\b/i.test(String(pr?.title ?? "").trim());

export function mergedInWindow(prs, now, days) {
  const since = now - days * DAY;
  return (prs ?? []).filter(p => p?.merged_at && Date.parse(p.merged_at) >= since && Date.parse(p.merged_at) <= now);
}

/** How many days back the one-page sample reaches, and whether the page was full (older items were cut). */
export function sampleSpan(prs, now) {
  const times = (prs ?? []).map(p => Date.parse(p?.updated_at)).filter(Number.isFinite);
  if (!times.length) return { days: 0, truncated: false };
  return { days: Math.ceil((now - Math.min(...times)) / DAY), truncated: times.length >= PAGE };
}

export function reportCounts(reports, now, days) {
  const since = now - days * DAY;
  const inWindow = (reports ?? []).filter(r => r && r.at >= since && r.at <= now);
  const byStatus = {};
  const blocked = new Map();
  for (const r of inWindow) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.status === "blocked") blocked.set(r.id, (blocked.get(r.id) ?? 0) + 1);
  }
  const blockedByTask = [...blocked].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { total: inWindow.length, byStatus, blockedByTask };
}

const short = sha => String(sha).slice(0, 8);

export function liveLine(surface, liveSha, mainSha, ahead) {
  if (!liveSha) return `Live ${surface}: unknown (probe failed)`;
  if (liveSha === mainSha) return `Live ${surface}: ${short(liveSha)} = main`;
  const gap = Number.isInteger(ahead) ? `${ahead} commit${ahead === 1 ? "" : "s"} ahead` : "not in local history";
  return `Live ${surface}: ${short(liveSha)}, main is ${short(mainSha)} (${gap})`;
}

const prList = prs => (prs.length ? ` (${prs.map(p => `#${p.number}`).join(", ")})` : "");

/** The card itself, one number per line. `merged` rows: { number, kind, hours, untracked, tier1, revert }. */
export function scorecardLines({ days, sample, merged, reports, live, notes = [] }) {
  const lines = [];
  lines.push(sample.truncated && sample.days < days
    ? `Scorecard: last ${days} days; the PR sample covers only ${sample.days} days (${PAGE}-item page), so the counts below are a floor`
    : `Scorecard: last ${days} days; the PR sample covers ${sample.days} days`);
  const count = kind => merged.filter(m => m.kind === kind).length;
  lines.push(`Merged PRs: ${merged.length} (product code ${count("product")}, tests only ${count("tests")}, scripts ${count("scripts")}, docs only ${count("docs")}, unknown ${count("unknown")})`);
  const untracked = merged.filter(m => m.untracked);
  lines.push(`Product-code merges with no queue row: ${untracked.length}${prList(untracked)}`);
  const unreviewed = merged.filter(m => m.tier1 === "none");
  lines.push(`Tier 1 code merges without an independent pass: ${unreviewed.length}${prList(unreviewed)}`);
  const unpinned = merged.filter(m => m.tier1 === "unpinned");
  lines.push(`Tier 1 code merges whose pass predates head-pinned verdicts: ${unpinned.length}${prList(unpinned)}`);
  const unread = merged.filter(m => m.tier1 === null);
  if (unread.length) lines.push(`Tier 1 merges whose review could not be read: ${unread.length}${prList(unread)}`);
  const timed = merged.filter(m => Number.isFinite(m.hours));
  if (timed.length) {
    const longest = timed.reduce((a, b) => (b.hours > a.hours ? b : a));
    lines.push(`Open-to-merge: median ${median(timed.map(m => m.hours)).toFixed(1)} h, longest ${longest.hours.toFixed(1)} h (#${longest.number})`);
  } else lines.push("Open-to-merge: none merged");
  const reverts = merged.filter(m => m.revert);
  lines.push(`Reverts: ${reverts.length}${prList(reverts)}`);
  const statuses = [...STATUS_ORDER, ...Object.keys(reports.byStatus).filter(s => !STATUS_ORDER.includes(s))]
    .filter(s => reports.byStatus[s]).map(s => `${s} ${reports.byStatus[s]}`);
  lines.push(`Board reports: ${reports.total}${statuses.length ? ` (${statuses.join(", ")})` : ""}`);
  lines.push(`Blocked reports per task: ${reports.blockedByTask.length ? reports.blockedByTask.map(([id, n]) => `${id} ${n}`).join(", ") : "none"}`);
  lines.push(...live, ...notes);
  return lines;
}

/**
 * The review gate's rule on a merged head, for code merges of Tier 1 rows (a docs-only merge is not
 * counted here): "pass", "none" (no independent pass), or "unpinned" — an independent pass recorded
 * before verdicts named their head (PROCESS-review-gate), which the gate would now ask to re-record.
 * Non-Tier-1 rows and docs merges are "n/a".
 */
export function tier1Status({ task, kind, head, workMarkers = [], lockMarkers = [], nonMergeCommitsSince }) {
  if (!task || Number(task.tier) !== 1 || kind === "docs") return "n/a";
  const input = { task, head, workMarkers, lockMarkers, nonMergeCommitsSince };
  if (reviewGateViolation(input) === null) return "pass";
  const pinned = lockMarkers.map(m => (m?.verb === "Verdict" && !m.reviewed ? { ...m, reviewed: head } : m));
  return reviewGateViolation({ ...input, lockMarkers: pinned }) === null ? "unpinned" : "none";
}

// ---- I/O ----

const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
const git = (...args) => execFileSync("git", args, { encoding: "utf8", env: GIT_ENV, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };
const hasCommit = sha => typeof sha === "string" && /^[0-9a-f]{40}$/.test(sha) && tryGit("cat-file", "-e", `${sha}^{commit}`) !== null;

function ghToken() {
  try { return execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null; }
  catch { return null; }
}

async function github(repo, path) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || tryGit("config", "--get", "github.token") || ghToken();
  const headers = { accept: "application/vnd.github+json", "user-agent": "skipwait-scorecard", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`GitHub ${path} answered ${res.status}`);
  return res.json();
}

async function probe(url, read) {
  try {
    const res = await fetch(url, { headers: { "user-agent": "skipwait-scorecard" }, signal: AbortSignal.timeout(20_000) });
    return res.ok ? read(await res.text()) : null;
  } catch { return null; }
}

/** Empty marker commits in `range`, oldest first, with commit time and each verdict's reviewed head. */
function markersIn(range) {
  const raw = tryGit("log", "--reverse", "--no-merges", "--format=%x1e%ct%x1f%s%x1f%b%x1d", "--name-only", range) ?? "";
  return raw.split("\x1e").filter(Boolean).flatMap(record => {
    const [ct, subject = "", rest = ""] = record.split("\x1f");
    const [body = "", files = ""] = rest.split("\x1d");
    const marker = files.trim() ? null : parseMarker(subject.trim());
    if (!marker) return [];
    const at = Number(ct) * 1000;
    return [marker.verb === "Verdict" ? { ...marker, at, reviewed: reviewedOf(body) } : { ...marker, at }];
  });
}

function loadReports() {
  const raw = tryGit("log", "-n", "1000", "--format=%ct%x1f%s%x1e", "refs/remotes/origin/agent/reports/log");
  if (!raw) return null;
  return raw.split("\x1e").map(r => r.trim()).filter(Boolean).flatMap(rec => {
    const [ct, subject = ""] = rec.split("\x1f");
    const m = parseMarker(subject);
    return m?.verb === "Report" ? [{ id: m.id, status: m.status, at: Number(ct) * 1000 }] : [];
  });
}

/** tier1Status for a merged pull request; null when its review could not be read (head or merge not in local history). */
function tier1Of(tasks, pr, kind) {
  const task = findGateRow(tasks, pr.head?.ref);
  if (!task || Number(task.tier) !== 1 || kind === "docs") return "n/a";
  const head = pr.head?.sha;
  const merge = pr.merge_commit_sha;
  if (!hasCommit(head) || !hasCommit(merge)) return null;
  const mergedAt = Date.parse(pr.merged_at);
  const lockRef = `refs/remotes/origin/${reviewLockOf(task)}`;
  const lockMarkers = tryGit("rev-parse", "--verify", "-q", lockRef) ? markersIn(`origin/main..${lockRef}`).filter(m => m.at <= mergedAt) : [];
  const before = `${merge}^1`;
  const workMarkers = markersIn(`${before}..${head}`);
  const nonMergeCommitsSince = sha => {
    if (tryGit("merge-base", "--is-ancestor", sha, head) === null) return null;
    return (tryGit("rev-list", "--no-merges", `${sha}..${head}`, "--not", before) ?? "").split("\n").filter(Boolean);
  };
  return tier1Status({ task, kind, head, workMarkers, lockMarkers, nonMergeCommitsSince });
}

function changedFiles(pr) {
  const merge = pr.merge_commit_sha;
  if (!hasCommit(merge)) return null;
  const out = tryGit("diff", "--name-only", "--no-renames", `${merge}^1`, merge);
  return out === null ? null : out.split("\n").filter(Boolean);
}

export async function main(argv = process.argv.slice(2)) {
  const i = argv.indexOf("--days");
  const days = i >= 0 ? Number(argv[i + 1]) : 7;
  if (!Number.isInteger(days) || days < 1 || days > 90) { console.error("scorecard: --days is a whole number from 1 to 90"); return 1; }
  if (tryGit("fetch", "-q", "--prune", "origin") === null) console.error("scorecard: git fetch origin failed; reading the local copy of origin");
  let doc;
  try { doc = JSON.parse(git("show", "origin/main:docs/plans/assignments.json")); }
  catch (e) { console.error(`scorecard: cannot read the task list on origin/main (${e.message})`); return 1; }
  const tasks = Array.isArray(doc?.tasks) ? doc.tasks : [];
  const now = Date.now();

  let closed;
  try { closed = await github(doc.repo, `/pulls?state=closed&sort=updated&direction=desc&per_page=${PAGE}`); }
  catch (e) { console.error(`scorecard: ${e.message}; no numbers printed rather than wrong ones`); return 2; }

  const merged = mergedInWindow(closed, now, days).filter(p => p.base?.ref === "main").map(pr => {
    const files = changedFiles(pr);
    const kind = kindOf(files);
    const labels = (pr.labels ?? []).map(l => l?.name).filter(n => typeof n === "string");
    return {
      number: pr.number,
      kind,
      hours: (Date.parse(pr.merged_at) - Date.parse(pr.created_at)) / HOUR,
      untracked: kind === "product" && queueGateViolation({ tasks, branch: pr.head?.ref ?? "", changed: files, labels }) !== null,
      tier1: tier1Of(tasks, pr, kind),
      revert: isRevert(pr),
    };
  }).sort((a, b) => a.number - b.number);

  const notes = ["Rows are matched against today's task list on origin/main, so a row registered after its merge counts as matched."];
  const allReports = loadReports();
  if (allReports === null) notes.push("Board: agent/reports/log is not on origin; the report counts are empty.");
  const reports = reportCounts(allReports ?? [], now, days);

  const mainSha = git("rev-parse", "origin/main");
  const apiSha = await probe("https://skipwait.me/api/health", text => { try { return JSON.parse(text)?.commitSha ?? null; } catch { return null; } });
  const webSha = await probe("https://skipwait.me/", text => /<meta name="git-commit" content="([0-9a-f]{7,40})"/.exec(text)?.[1] ?? null);
  const ahead = sha => {
    if (!sha || !hasCommit(sha)) return null;
    const n = tryGit("rev-list", "--count", `${sha}..origin/main`);
    return n !== null && /^\d+$/.test(n) ? Number(n) : null;
  };
  const live = [liveLine("API", apiSha, mainSha, ahead(apiSha)), liveLine("web", webSha, mainSha, ahead(webSha))];
  if (apiSha !== mainSha || webSha !== mainSha) notes.push("A push deploys only what it touches (D-003): an API or web SHA behind main is expected when the newer commits did not touch that surface.");

  console.log(scorecardLines({ days, sample: sampleSpan(closed, now), merged, reports, live, notes }).join("\n"));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Cloud sandboxes reach GitHub only through HTTPS_PROXY, which Node's fetch ignores without NODE_USE_ENV_PROXY=1.
  if ((process.env.HTTPS_PROXY || process.env.https_proxy) && process.env.NODE_USE_ENV_PROXY !== "1") {
    const rerun = spawnSync(process.execPath, ["--disable-warning=UNDICI-EHPA", ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
    process.exit(rerun.status ?? 1);
  }
  main().then(code => { process.exitCode = code; }, error => { console.error(`scorecard: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
}
