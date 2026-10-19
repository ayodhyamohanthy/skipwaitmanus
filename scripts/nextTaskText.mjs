// D-083: what the queue picker prints for each decision. Pure: the same pick
// and context always print the same steps, which scripts/nextTask.test.ts pins.
import { slugOf } from "./nextTaskCore.mjs";

const CMD = "node scripts/next-task.mjs";
const land = [
  "Land under D-082: push the branch, open a pull request, and wait until every check on that exact commit is green and main's own CI is green.",
  "Then merge the pull request (or fast-forward main to that commit). Watch main's CI and both deploys to the end and run the live check from docs/BRIEF.md \"How to ship\".",
  "If anything goes red, revert or fix your commit before anything else.",
];

const head = (title, lines) => [`NEXT: ${title}`, ...lines, ""].join("\n");
const steps = list => list.map((s, i) => `${i + 1}. ${s}`).join("\n");

function buildSteps(task, who, date, branch) {
  const tier1 = task.tier === 1;
  return steps([
    `Work in your own worktree, never by switching branches in a shared checkout: git fetch origin && git worktree add ../skipwaitmanus-wt/${slugOf(branch)} ${branch}`,
    `Read docs/BRIEF.md, then ${task.packet}. Read nothing else unless the packet names it. The branch above replaces the packet's agent/<model>/... name.`,
    `First commit: set the docs/KIT_V4_BUILD_PLAN.md §3b row "${task.row}" to "in progress — ${who} — ${date} — branch ${branch}".`,
    "Follow docs/DELEGATION.md §4 steps 4-8 exactly: the packet's tests first (they must fail for its reason), one step per commit, only the packet's files, then the full gate on your branch merged with the latest origin/main.",
    tier1
      ? `Tier 1: push the branch, open a DRAFT pull request, set the row to "review — ${branch} — <sha>", and stop. Never land it yourself: \`${CMD}\` hands the review to a different session.`
      : `${land.join(" ")} In that same pull request set this task's "status" to "done" in docs/plans/assignments.json and the §3b row to "done — <sha>".`,
    "If anything is unclear, a test fails for a reason the packet does not give, or the call is the owner's: stop, write the question in the row, push the branch and ask the owner. Never guess about money, sign-in, identity or privacy.",
  ]);
}

/** The steps for one pick. ctx: { who, date, claimed } (claimed = this run took the lock). */
export function renderPick(pick, { who, date, claimed }) {
  const take = claimed ? "" : `\nNot claimed yet. To take it: ${CMD} --claim "<your model name and session>"\n`;
  switch (pick.kind) {
    case "stop": return head("STOP", [pick.reason]);
    case "wait": return head("WAIT", [pick.reason, "Do not start other work and do not push to main until main is green."]);
    case "none": return head("NOTHING TO PICK", [
      "Every task is done, claimed, waiting on another task, or waiting for Claude Code or the owner:",
      ...pick.skipped.map(s => `- ${s.id}: ${s.reason}`),
      "Tell the owner; do not choose work yourself.",
    ]);
    case "fix-main": return head(`FIX RED MAIN (P0) — ${pick.sha.slice(0, 8)}`, [
      `Failing run: ${pick.url}`,
      steps([
        "Find the commit that turned main red (the run above and `gh run list --branch main --workflow CI`).",
        "Fix it red-first in your own worktree, or revert that commit if the fix is not obvious. Nothing else: no other change rides along.",
        ...land,
        "Tell the owner what broke, which commit, and how you fixed it.",
      ]),
    ]) + take;
    case "review": return head(`REVIEW ${pick.task.id} — ${pick.task.title}`, [
      `Tier 1 · pull request ${pick.pr} · branch ${pick.work} · review lock ${pick.lock}`,
      `You must not have built or fixed this (built by ${pick.builder ?? "unknown"}).`,
      steps([
        `Read docs/BRIEF.md and ${pick.task.packet}, then review exactly as docs/DELEGATION.md §6 says, reproducing every claim yourself.`,
        "Post the verdict on the pull request.",
        `Pass: run \`${CMD} --verdict pass --task ${pick.task.id} --as "${who}"\`. Merge the latest origin/main into ${pick.work}, set this task's "status" to "done" in docs/plans/assignments.json, push, then: ${land.join(" ")} Set the §3b row to "done — <sha>".`,
        `Findings: list each with file:line, severity and the failing test to add first, then run \`${CMD} --verdict findings --task ${pick.task.id} --as "${who}"\` and stop.`,
      ]),
    ]) + take;
    case "fix": return head(`FIX REVIEW FINDINGS ${pick.task.id} — ${pick.task.title}`, [
      `Tier 1 · pull request ${pick.pr} · branch ${pick.work}`,
      "You must not be the reviewer.",
      steps([
        `git fetch origin && git worktree add ../skipwaitmanus-wt/${slugOf(pick.work)}-fix ${pick.work}`,
        `Read docs/BRIEF.md, ${pick.task.packet} and the findings on the pull request. Fix each one red-first on ${pick.work}, then re-run the full gate merged with the latest origin/main and push.`,
        `Run \`${CMD} --fixed --task ${pick.task.id} --as "${who}"\` so the next run hands it back for review. Do not land it.`,
      ]),
    ]) + take;
    case "takeover": return head(`TAKE OVER ${pick.task.id} — ${pick.task.title}`, [
      `Stalled: no commits on ${pick.work} since ${new Date(pick.since).toISOString()} (queue rule 2; started by ${pick.from ?? "unknown"}).`,
      `Continue on the same branch and keep every commit on it. Note the takeover in the §3b row "${pick.task.row}".`,
      buildSteps(pick.task, who, date, pick.work),
    ]) + take;
    case "build": return head(`BUILD ${pick.task.id} — ${pick.task.title}`, [
      `Tier ${pick.task.tier} · lane ${pick.task.lane} · packet ${pick.task.packet} · branch ${pick.task.branch}`,
      ...(pick.ciRunning ? ["main's CI is still running: you may start, but push nothing to main until it is green."] : []),
      buildSteps(pick.task, who, date, pick.task.branch),
    ]) + take;
    default: throw new Error(`unknown pick kind ${pick.kind}`);
  }
}
