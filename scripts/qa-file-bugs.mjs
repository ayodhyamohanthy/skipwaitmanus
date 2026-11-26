#!/usr/bin/env node
// QA-auto-issues (D-409, owner Nov 26 2026: automated testers raise bugs before users hit them). Reads the live-QA
// summary (scripts/live-qa-signed-in.mjs) and keeps ONE GitHub issue per failing role and route, labelled bug +
// automated: create it, comment when it fails again, close it when a later run of that role passes. Issues without
// this script's key marker are never touched. The summary is already redacted; nothing personal is added here.
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const LABELS = ["bug", "automated"];
const MARKER = /<!-- live-qa-key: ([^\s]+) -->/;
const short = sha => (typeof sha === "string" && sha ? sha.slice(0, 8) : "unknown");
export const keyOf = (role, where) => `${role}:${where}`;

function problemsOf(r) {
  const out = [...(r.fails ?? [])];
  for (const req of r.failedRequests ?? []) out.push(`request answered ${req}`);
  for (const req of new Set(r.clientErrors ?? [])) out.push(`request answered ${req}`);
  for (const text of new Set(r.consoleErrors ?? [])) out.push(`console error: ${text}`);
  if (r.sideways) out.push("scrolls sideways at 390");
  return out;
}

/** The bugs one summary shows, keyed by role and route (both widths merged). */
export function bugsFromSummary(summary) {
  if (!summary || !Array.isArray(summary.roles)) {
    return [{ key: keyOf("run", "no-summary"), title: "Live QA: the run wrote no summary", body: "The signed-in live QA run ended before writing live-qa/summary.json (missing secrets, a crash or a timeout). Open the run log." }];
  }
  const release = `API \`${short(summary.release?.api)}\` · web \`${short(summary.release?.web)}\``;
  const bugs = [];
  for (const role of summary.roles) {
    if (!role.signIn?.ok) {
      bugs.push({ key: keyOf(role.role, "sign-in"), title: `Live QA: ${role.role} sign-in fails (${role.signIn?.status ?? "no answer"})`, body: `The demo ${role.role} could not sign in: ${role.signIn?.message ?? "no answer"}.\n\nRelease: ${release}` });
      continue;
    }
    const byRoute = new Map();
    for (const r of role.routes ?? []) {
      const problems = problemsOf(r);
      if (!problems.length) continue;
      const entry = byRoute.get(r.route) ?? [];
      entry.push({ width: r.width, status: r.status, problems });
      byRoute.set(r.route, entry);
    }
    for (const [route, hits] of byRoute) {
      const first = hits[0].problems[0];
      const lines = hits.map(h => `- **${h.width}px** (document ${h.status ?? "no answer"}):\n${h.problems.map(p => `  - ${p}`).join("\n")}`);
      bugs.push({ key: keyOf(role.role, route), title: `Live QA: ${role.role} ${route} — ${first}`.slice(0, 200), body: `Signed-in live QA as the demo ${role.role} found problems on \`${route}\`.\n\n${lines.join("\n")}\n\nRelease: ${release}` });
    }
  }
  return bugs;
}

/** What to do on GitHub: create, comment or close. Only roles this run checked successfully can close their issues. */
export function planIssueActions({ summary, openIssues, runUrl }) {
  const bugs = bugsFromSummary(summary);
  const keyed = new Map();
  for (const issue of openIssues) {
    const key = MARKER.exec(issue.body ?? "")?.[1];
    if (key && !keyed.has(key)) keyed.set(key, issue);
  }
  const actions = [];
  const current = new Set(bugs.map(b => b.key));
  for (const bug of bugs) {
    const existing = keyed.get(bug.key);
    if (existing) actions.push({ kind: "comment", number: existing.number, body: `Still failing in ${runUrl}\n\n${bug.body}` });
    else actions.push({ kind: "create", title: bug.title, labels: LABELS, body: `${bug.body}\n\nRun: ${runUrl}\n\nThis issue closes itself when a later live QA run passes for this role and page (D-409).\n\n<!-- live-qa-key: ${bug.key} -->` });
  }
  const checked = new Set(Array.isArray(summary?.roles) ? summary.roles.filter(r => r.signIn?.ok).map(r => r.role) : []);
  for (const [key, issue] of keyed) {
    if (current.has(key)) continue;
    const role = key.slice(0, key.indexOf(":"));
    const closable = role === "run" ? Array.isArray(summary?.roles) : checked.has(role);
    if (closable) actions.push({ kind: "close", number: issue.number, body: `Passed in ${runUrl}; closing (D-409).` });
  }
  return actions;
}

async function main() {
  const file = process.argv[2] ?? "live-qa/summary.json";
  const runUrl = process.env.RUN_URL ?? "(run link unavailable)";
  const summary = await readFile(file, "utf8").then(JSON.parse).catch(() => null);
  const gh = args => execFileSync("gh", args, { encoding: "utf8" });
  for (const [name, color] of [["bug", "d73a4a"], ["automated", "5319e7"]]) {
    try { gh(["label", "create", name, "--color", color, "--force"]); } catch { /* label exists or no permission: creation below reports it */ }
  }
  const openIssues = JSON.parse(gh(["issue", "list", "--label", "automated", "--state", "open", "--limit", "200", "--json", "number,title,body"]));
  for (const action of planIssueActions({ summary, openIssues, runUrl })) {
    if (action.kind === "create") gh(["issue", "create", "--title", action.title, "--body", action.body, ...action.labels.flatMap(l => ["--label", l])]);
    else if (action.kind === "comment") gh(["issue", "comment", String(action.number), "--body", action.body]);
    else gh(["issue", "close", String(action.number), "--comment", action.body]);
    console.log(`${action.kind}${action.number ? ` #${action.number}` : `: ${action.title}`}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch(error => { console.error(`qa-file-bugs: ${error instanceof Error ? error.message : String(error)}`); process.exit(1); });
}
