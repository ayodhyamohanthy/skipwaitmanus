/**
 * PICKER-auto-land (D-371, owner Nov 20 2026: "auto land"): green, in-sync task pull requests land on their own.
 *
 * The status board already decides what may land. A row is a candidate only when its state is `pr-green` and its
 * health is `green`: in sync with the register, not parked, every dependency done, no standing red or blocked
 * report, and green CI on the PR's tip. For each candidate the runner marks a draft ready, merges main into a branch
 * that is behind (a merge, never a rebase) and turns auto-merge on with a merge commit, so GitHub merges it once
 * every required check passes on the merge result. It runs with the session's own GitHub credentials: a merge made
 * with the Actions token would not trigger the deploy workflows.
 *
 * Pure parts take plain data; `runAutoLand` takes its I/O as functions so every path is testable.
 */

const PR_NUMBER = /\/pull\/([1-9][0-9]*)$/;

/** The pull-request number of a board row's PR URL, or null. */
export function prNumberOf(url) {
  const match = PR_NUMBER.exec(typeof url === "string" ? url : "");
  return match ? Number(match[1]) : null;
}

/**
 * Board rows that may land now, with the branch and the CI-green head the board saw.
 * `rows` are statusBoard rows; `tasks` the task list; `prCi` maps a branch to its CI state ({ state, sha }).
 */
export function autoLandCandidates({ rows, tasks, prCi }) {
  const byId = new Map((tasks ?? []).map(task => [task.id, task]));
  const out = [];
  for (const row of rows ?? []) {
    if (row?.state !== "pr-green" || row?.health !== "green") continue;
    const number = prNumberOf(row.pr);
    const task = byId.get(row.id);
    if (!number || !task || task.status === "done" || task.status === "owner") continue;
    const ci = prCi?.get?.(task.branch);
    if (ci?.state !== "green" || !/^[0-9a-f]{40}$/.test(ci.sha ?? "")) continue;
    out.push({ id: row.id, number, branch: task.branch, sha: ci.sha });
  }
  return out;
}

/** Why auto-land must not run at all now, or null. */
export function autoLandHold({ mainCi, openPrs }) {
  if (openPrs === null || openPrs === undefined) return "pull requests unreadable";
  if (mainCi?.state !== "green") return `main CI is ${mainCi?.state ?? "unknown"} (D-082: nothing lands until main is green)`;
  return null;
}

/**
 * Land each candidate. `io` supplies:
 *   readPull(number) -> { state, draft, merged, head: { ref, sha }, node_id, mergeable_state, auto_merge }
 *   markReady(nodeId), updateBranch(number, expectedSha), enableAutoMerge(nodeId), log(line)
 * Returns one result per candidate: { id, number, outcome, detail? }. A failure never stops the next candidate.
 */
export async function runAutoLand(candidates, io) {
  const results = [];
  for (const c of candidates) {
    const result = { id: c.id, number: c.number };
    try {
      const pr = await io.readPull(c.number);
      if (pr.state !== "open" || pr.merged) { results.push({ ...result, outcome: "skipped", detail: "not open" }); continue; }
      if (pr.head?.ref !== c.branch) { results.push({ ...result, outcome: "skipped", detail: "head branch is not the task branch" }); continue; }
      if (pr.head?.sha !== c.sha) { results.push({ ...result, outcome: "skipped", detail: "head moved since CI went green" }); continue; }
      if (pr.mergeable_state === "dirty") { results.push({ ...result, outcome: "conflict", detail: "merge conflict with main; the holder merges main" }); continue; }
      const steps = [];
      if (pr.draft) { await io.markReady(pr.node_id); steps.push("ready"); }
      if (pr.mergeable_state === "behind") { await io.updateBranch(c.number, c.sha); steps.push("updated with main"); }
      if (!pr.auto_merge) { await io.enableAutoMerge(pr.node_id); steps.push("auto-merge on"); }
      results.push({ ...result, outcome: steps.length ? "queued" : "already-queued", ...(steps.length ? { detail: steps.join(", ") } : {}) });
    } catch (error) {
      results.push({ ...result, outcome: "error", detail: error instanceof Error ? error.message : String(error) });
    }
  }
  for (const r of results) io.log?.(`auto-land: ${r.id} #${r.number} ${r.outcome}${r.detail ? ` (${r.detail})` : ""}`);
  return results;
}
