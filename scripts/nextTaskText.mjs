// D-083: what the queue picker prints for each decision. Pure: the same pick
// and context always print the same steps, which scripts/nextTask.test.ts pins.
import { epicSummaries, slugOf } from "./nextTaskCore.mjs";

const CMD = "node scripts/next-task.mjs";
const land = [
  "Run `node scripts/scope-check.mjs <id>` before you push: it reads the task's declared `owns` from origin/main and fails on any change outside them (PICKER-owns-scope).",
  "Probe every other open branch of the same goal for conflicts: `git merge-tree $(git merge-base origin/main origin/<a>) origin/<a> origin/<b> | grep -c '^+<<<<<<<'` must print 0.",
  "Land under D-082: push the branch, open a pull request, and wait until every check on that exact commit is green and main's own CI is green.",
  "Then fast-forward main to that exact commit (`git push origin <sha>:main`; GitHub's \"Create a merge commit\" button is also safe, because the ruleset only lets an up-to-date branch merge, but never squash or rebase-merge: they replace the tested commits, D-134 (6)). If that push is refused because main moved, merge the latest origin/main into your branch, re-run the full gate, push, wait until every check on the new commit is green and fast-forward again; never force-push.",
  "Watch main's CI and both deploys to the end and run the live check from docs/BRIEF.md \"How to ship\".",
  "If anything goes red, revert or fix your commit before anything else.",
];

/** D-200 (5): a fresh worktree has no packages; installing the pinned lockfile is always allowed, never a block. */
const INSTALL = "pnpm install --frozen-lockfile";
const INSTALL_WHY = "a fresh worktree has no packages, and missing ones fail as TS2688/TS5101 or 'vitest not found' (REGISTER-520, Oct 24). It installs only the versions pinned in pnpm-lock.yaml, so it is always allowed, whatever your session says about installing (D-200 (5)).";
const head = (title, lines) => [`NEXT: ${title}`, ...lines, ""].join("\n");
const steps = list => list.map((s, i) => `${i + 1}. ${s}`).join("\n");
const worktree = branch => `Work in your own worktree, never by switching branches in a shared checkout: git fetch origin && git worktree add ../skipwaitmanus-wt/${slugOf(branch)} ${branch} (if it already exists, use it). Then run \`${INSTALL}\` before your first \`pnpm check\`: ${INSTALL_WHY}`;
/** D-085: origin is the only place other agents can see; a claim nobody pushes to for 2 hours is free again. */
const keepAlive = who => `Push your branch after every commit. Before any step that may take over an hour without a commit (the full gate, a long test run), run \`${CMD} --heartbeat --as "${who}"\`: a claim nobody has pushed to for 2 hours is handed to the next agent (D-085). Before you stop for any reason, commit (a WIP commit is fine) and push.`;
const unclear = "If anything is unclear, a test fails for a reason the packet does not give, or the call is the owner's: stop, write the question in your status line (your §3b row, or your line in the packet's Status section when the row is shared), push the branch and ask the owner. Never guess about money, sign-in, identity or privacy.";
/** D-085: the team reports every priority's status to the CEO (Claude Code), green or not. */
const report = (task, who) => `When you stop, land, open a pull request or get blocked, report to the CEO: \`${CMD} --report <green|red|blocked|review|landed> --task ${task.id} --as "${who}" --note "<one line: what is green, what is not, what you need; no secrets or personal data>"\` (D-085). If you cannot take a task for a reason of your own session (an instruction not to touch it, a tool or permission you lack), never report it blocked: that holds it for every agent. Run this picker again with \`--avoid ${task.id}\` added instead, and it hands you something else. A red report holds every lower priority until a newer report on the task (or a newer green CI run on its pull request) clears it; a blocked one stands until a green or landed report, or any report from a session that neither raised the block nor holds the task, clears it (D-200).`;
const yours = who => `This is already yours (${who}): nothing new was claimed, and no other agent will be given it. Finish it before anything else (queue rule 2).`;
/** D-085: pending work ranked above your own comes first; your own claim stays yours, pushed. */
/** D-134: where a task's status goes: its own §3b row, or, when several tasks share that row, its line in its packet's Status section. */
const statusAt = task => task.sharedRow ? `its line in the Status section of ${task.packet ?? "its packet"} (\"${task.id}: ...\"; the §3b row \"${task.row}\" is shared by several tasks, so never edit it)` : `the §3b row \"${task.row}\"`;
const holding = pick => (pick.holds ? [`You also hold ${pick.holds.id} (${pick.holds.branch}). This higher priority needs hands first (D-085): your own work is pushed (the picker checked), and it stays yours for 2 hours; come back to it with \`${CMD} --claim\` as soon as this is done.`] : []);

function workSteps(task, who, branch) {
  return [
    "Follow docs/DELEGATION.md §4 steps 4-8 exactly: the packet's tests first (they must fail for its reason), one step per commit, only the packet's files, then the full gate on your branch merged with the latest origin/main.",
    keepAlive(who),
    task.tier === 1
      ? `Tier 1: push the branch, open a DRAFT pull request, set ${statusAt(task)} to "review — ${branch} — <sha>", report, and end the session (one packet per session, D-074). Never land it yourself: \`${CMD}\` hands the review to a different session.`
      : `${land.join(" ")} In that same pull request set this task's "status" to "done" in docs/plans/assignments.json and ${statusAt(task)} to "done — <sha>".`,
    unclear,
    report(task, who),
  ];
}

function buildSteps(task, who, date, branch) {
  return steps([
    worktree(branch),
    `Read docs/BRIEF.md, then ${task.packet}. Read nothing else unless the packet names it. The branch above replaces the packet's agent/<model>/... name.`,
    `First commit: set ${task.sharedRow ? statusAt(task) : `the docs/KIT_V4_BUILD_PLAN.md §3b row "${task.row}"`} to "in progress — ${who} — ${date} — branch ${branch}".`,
    ...workSteps(task, who, branch),
  ]);
}

/** Where a half-built branch stopped: its row, its commits, its pull request. */
function resumeSteps(task, who, branch) {
  return steps([
    worktree(branch),
    `See where it stopped before touching anything: ${statusAt(task)}, \`git log --oneline origin/main..origin/${branch}\`, and any uncommitted changes in your worktree. Read docs/BRIEF.md and ${task.packet ?? "the row"}.`,
    ...workSteps(task, who, branch),
  ]);
}

/** D-074: a Tier 1 change lands only as reviewed; a commit pushed after the pass verdict was never reviewed. */
const unreviewed = pick => `Before you land, take the head commit the pass verdict names on the pull request, or in the reviewer's report note on the board (the newest pass, if there were several), as <reviewed> and run \`git fetch origin && git log --no-merges --name-only --format="%h %s" <reviewed>..origin/${pick.work} ^origin/main\` and \`git log --merges --cc --format="%h %s" <reviewed>..origin/${pick.work} ^origin/main\`. Every commit the first lists, except one that only changes docs/plans/assignments.json (the status commit a landing makes), and every merge the second shows with a diff hunk (a conflict resolution or an extra change, your own merge included) was never reviewed (D-074): do not land, and report it blocked to the CEO with --report blocked.`;

const reviewSteps = (pick, who) => steps([
  `Before reading any code, record the head you review: \`git fetch origin && git rev-parse origin/${pick.work}\` gives <reviewed>; review exactly that commit, whatever arrives later, in its own worktree: \`git worktree add --detach ../skipwaitmanus-wt/review-${slugOf(pick.work)} <reviewed>\`, then \`${INSTALL}\` there before any test: ${INSTALL_WHY}`,
  `Read docs/BRIEF.md and ${pick.task.packet}, then review exactly as docs/DELEGATION.md §6 says, reproducing every claim yourself.`,
  `Before posting, run \`git fetch origin && git log --no-merges --format="%h %s" <reviewed>..origin/${pick.work} ^origin/main\`: if it lists anything, review those commits too and record the new head as <reviewed>, or return findings. Name <reviewed> with your verdict, never a fresh rev-parse: a lander checks that nothing but clean merges of main came after it. Post it on the pull request if your tools can; if they cannot (git-only access), put "reviewed <reviewed>" in the note of a \`${CMD} --report review\` instead. The \`--verdict\` marker below is the record and is a plain git push: a GitHub review is never required.`,
  `Pass: run \`${CMD} --verdict pass --task ${pick.task.id} --as "${who}"\`. If you land it, first run the check in the landing steps: a commit after the one you reviewed, other than merges of main and the status commit, means do not land; report it blocked (D-074). Merge the latest origin/main into ${pick.work}, set this task's "status" to "done" in docs/plans/assignments.json, push, then: ${land.join(" ")} Set ${statusAt(pick.task)} to "done — <sha>".`,
  `Findings: list each with file:line, severity and the failing test to add first, then run \`${CMD} --verdict findings --task ${pick.task.id} --as "${who}"\` and stop. The verdict moves the task to its fix stage; you never fix code you reviewed.`,
  `Run \`${CMD} --heartbeat --as "${who}"\` before any long step: a review lock nobody has pushed to for 2 hours goes to the next agent (D-085).`,
  report(pick.task, who),
]);

const fixSteps = (pick, who) => steps([
  `git fetch origin && git worktree add ../skipwaitmanus-wt/${slugOf(pick.work)}-fix ${pick.work} (if it already exists, use it). Then run \`pnpm install\` before your first \`pnpm check\`: a fresh worktree has no dependencies, and missing ones fail as TS2688/TS5101 (REGISTER-520, Oct 24).`,
  `Read docs/BRIEF.md, ${pick.task.packet} and the findings on the pull request. Fix each one red-first on ${pick.work}, then re-run the full gate merged with the latest origin/main and push.`,
  keepAlive(who),
  `Run \`${CMD} --fixed --task ${pick.task.id} --as "${who}"\` once every fix is pushed, so the next run hands it back for review. Do not land it.`,
  report(pick.task, who),
]);

const greenSteps = (pick, who) => steps([
  worktree(pick.work),
  `Read the failing checks on ${pick.pr} and the §3b row "${pick.task.row}", then docs/BRIEF.md and ${pick.task.packet}.`,
  "Fix the failure red-first on the same branch (never skip, weaken or delete a test), merge the latest origin/main, re-run the full gate, push, and wait until every check on that exact commit is green.",
  keepAlive(who),
  pick.task.tier === 1
    ? `Tier 1: once green, set ${statusAt(pick.task)} to "review — ${pick.work} — <sha>" and stop; \`${CMD}\` hands the review to a different session.`
    : `Then land it: ${land.slice(1).join(" ")} In that same pull request set this task's "status" to "done" in docs/plans/assignments.json and ${statusAt(pick.task)} to "done — <sha>".`,
  report(pick.task, who),
]);

const landSteps = (pick, who) => steps([
  `Take the landing slot first: agent/queue/landing (first push wins; a quiet slot is free after 30 minutes). Keep it alive during deploys with \`${CMD} --heartbeat --as "${who}"\`.`,
  worktree(pick.work),
  `Read docs/BRIEF.md and the §3b row "${pick.task.row}". Merge the latest origin/main into ${pick.work} and re-run the full gate yourself; never land on someone else's word.`,
  ...(pick.tier1 ? [unreviewed(pick)] : []),
  pick.tier1
    ? `Set this task's "status" to "done" in docs/plans/assignments.json, push, then: ${land.join(" ")} Set ${statusAt(pick.task)} to "done — <sha>".`
    : `${land.join(" ")} In that same pull request set this task's "status" to "done" in docs/plans/assignments.json and ${statusAt(pick.task)} to "done — <sha>".`,
  keepAlive(who),
  `After main's CI and both deploys finish, release the landing slot: \`${CMD} --landed --task ${pick.task.id} --as "${who}"\`.`,
  report(pick.task, who),
]);

// A claimed lock always exists on origin (the claim pushed it), so the worktree tracks it; branching from main would lose the claim marker.
const architectSteps = (pick, who, claimed) => steps([
  `git fetch origin && git worktree add ../skipwaitmanus-wt/architect-${slugOf(pick.lock)} ${pick.lockExists || claimed ? pick.lock : `-b ${pick.lock} origin/main`} (if it already exists, use it). Then run \`pnpm install\` before your first \`pnpm check\`: a fresh worktree has no dependencies, and missing ones fail as TS2688/TS5101 (REGISTER-520, Oct 24). Never force-push this branch: its first commit is your claim.`,
  `Read the §3b row "${pick.task.row}", the task's note in docs/plans/assignments.json and every decision it names in docs/DECISIONS.md.`,
  "Write the packet in docs/plans/ exactly as docs/DELEGATION.md describes (goal, binding rules quoted, current behaviour verified in code with file:line, rulings, files in and out of scope, red-first tests, definition of done, review checklist, stop-and-ask). Any session records its rulings as register entries marked \"decided under D-200\" (D-200: no model holds the pen alone). A choice that changes an owner decision (prices, plan contents, legal text, live money, the login rule, referrer fairness) goes to the owner as `--report blocked` with the question; any other gap gets a stated, changeable assumption in the packet (D-109).",
  `In the same pull request update docs/plans/assignments.json: a packet-only task (its note says so: its work is the rows it adds) gets "status": "done" and its rows are added exactly as its packet's list gives them (the D-048 split, or the packet the CEO wrote); any other task gets its "packet" and "status": "todo", so the next \`${CMD}\` hands it to a builder (D-134).`,
  `Land it like any docs change (D-082: pull request, every check green on that exact commit). ${keepAlive(who)}`,
  report(pick.task, who),
]);

// D-085: the fix is committed on the lock branch itself, so every commit keeps the lock alive.
const fixMainSteps = (pick, who) => steps([
  `Work on the lock branch itself: git fetch origin && git worktree add ../skipwaitmanus-wt/${slugOf(pick.lock)} ${pick.lock} (if it already exists, use it). Then run \`pnpm install\` before your first \`pnpm check\`: a fresh worktree has no dependencies, and missing ones fail as TS2688/TS5101 (REGISTER-520, Oct 24). Never force-push it: its first commit is your claim.`,
  "Find the commit that turned main red (the run above and `gh run list --branch main --workflow CI`).",
  `Fix it red-first on ${pick.lock}, or revert that commit if the fix is not obvious. Nothing else: no other change rides along.`,
  keepAlive(who),
  `Open a pull request from ${pick.lock} and wait until every check on that exact commit is green: main is red, so this fix is the one push D-082 allows. Then fast-forward main to that exact commit (\`git push origin <sha>:main\`; never squash or rebase-merge, D-134 (6)); if that push is refused because main moved, merge the latest origin/main into the lock branch, re-run the full gate, push, wait until every check on the new commit is green and fast-forward again, never force-push. Watch main's CI and both deploys to the end, and run the live check from docs/BRIEF.md "How to ship".`,
  "Tell the owner what broke, which commit, and how you fixed it.",
]);

const unblockSteps = (pick, who) => {
  const newer = pick.report.newer ?? [];
  const newerLines = newer.map(entry => {
    const at = Number.isFinite(entry.at) ? ` (${new Date(entry.at).toISOString()})` : "";
    return `- ${entry.status} — ${entry.who}${at}${entry.note ? `: ${entry.note}` : ""}`;
  });
  return steps([
    ...(newerLines.length ? [
      `Newer reports after the standing block (oldest first):\n${newerLines.join("\n")}\nRead these newer reports before ruling; a builder may have recorded an owner's word.`,
    ] : []),
    `Read the row "${pick.task.row}", its branch and pull request, and every decision it names.`,
    "Decide it under D-200 (any session that neither raised the block nor holds the task may: the best evidence wins, D-032) and record the ruling in docs/DECISIONS.md, or, if the call changes an owner decision (prices, plan contents, legal text, live money, the login rule, referrer fairness), set the task's status to \"owner\" in docs/plans/assignments.json and put the question to the owner. A missing permission, tool or setting (a GitHub review you cannot post, an API that answers 403, missing node_modules) is not a ruling: record the verdict with --verdict, run pnpm install, or name the exact owner click needed, and move on.",
    `Run \`${CMD} --heartbeat --as "${who}"\` before any long step: an unblock lock nobody has pushed to for 2 hours goes to the next session (D-085, D-200).`,
    `Report before you land the ruling's pull request (once it lands from the unblock lock, the lock no longer names you): \`${CMD} --report review --task ${pick.task.id} --as "${who}" --note "<the ruling>"\`. That newer report releases every priority below it. Then answer the team where it will see it (the row and the pull request) and land the ruling.`,
    `If you cannot decide it either, report it \`blocked\` with the question: your unblock lock then stops holding anyone off, and the next session that did not raise the block takes it.`,
  ]);
};

const ceoSteps = () => steps([
  `Read the board above: every priority, top down, green or not, and the latest report from its team. A red or blocked priority comes first: unblock any block you neither raised nor hold the task of (decide it under D-200, or move the task to "owner" in docs/plans/assignments.json and ask the owner) before anything lower moves.`,
  "Session-start sync (AGENTS.md §0): fetch main, read the newest entries in docs/DECISIONS.md, the queue (docs/plans/assignments.json, plan §3b) and plan §6; show the owner every decision since your last session.",
  "Re-analyse the business against the goal (the go-to global site for referrals, getting people referred faster, D-010/D-026): what is live, what the money and funnel numbers say (D-018 panel, D-054 analytics, D-065 money check), supply (D-064), and what users hit that we have not fixed. Find the highest-leverage gap.",
  "Turn it into decisions for the owner (rate each 1-10, give the strongest counter-argument, D-023), packets (docs/plans/, D-074) and the queue order in docs/plans/assignments.json (any session may add or reorder rows through a docs pull request that says why, D-200).",
  "Land those docs through a pull request with every check green (D-082). Then run the picker again: Claude Code sessions take builds like any other session once rows are open (D-200).",
]);

/** WAIT: for red main, for a red priority above you, or for your own blocked one, which another session or the owner clears (D-200). */
function waitLines(pick, who) {
  if (pick.mainRed) return [pick.reason, `Do not start other work and do not push to main until main is green. If you hold a claim, keep it alive: \`${CMD} --heartbeat --as "${who}"\`.`];
  if (pick.landing) return [pick.reason, `Only one landing at a time (D-082, PICKER-landing-slot). Run this again once ${pick.holder} finishes and releases agent/queue/landing, and keep any claim you hold alive with \`${CMD} --heartbeat --as "${who}"\`.`];
  if (pick.own) return [`${pick.reason}.`, `Push your work on ${pick.work}, tell the owner exactly what you need to go on, and stop. Run \`${CMD} --claim "${who}"\` again once it is unblocked.`];
  if (pick.blocked) return [`${pick.reason}.`, `Do not start anything ranked below ${pick.gate}. Tell the owner you are waiting on ${pick.gate} and stop; run this again after another session or the owner unblocks it (D-200).`];
  return [`${pick.reason}. A priority must be green before anything below it is touched (D-085).`, `Do not start anything ranked below ${pick.gate}; help only if its holder asks. Run this again later, and keep any claim you hold alive with \`${CMD} --heartbeat --as "${who}"\`.`];
}

const HEALTH = { done: "done", green: "GREEN", red: "RED", progress: "in progress", open: "not started", owner: "waits for the owner" };
/** D-085: one board every agent reads — the priorities top down, green or not. */
export function renderBoard(rows) {
  const lines = rows.map((r, i) => {
    const bits = [`${i + 1}. ${r.id} — ${r.title}`, r.role, `Tier ${r.tier}`, HEALTH[r.health] ?? r.state, r.state];
    if (r.review) bits.push(`review ${r.review}${r.stage ? ` by ${r.stage}` : ""}`);
    else if (r.stage) bits.push(`unblocking: ${r.stage}`);
    if (r.holder) bits.push(r.holder);
    if (r.quietHours !== null && r.quietHours !== undefined) bits.push(`quiet ${r.quietHours}h`);
    if (r.pr) bits.push(r.pr);
    if (r.pr && r.state !== "done") bits.push(`behind main ${Number.isSafeInteger(r.behindMain) && r.behindMain >= 0 ? r.behindMain : "unknown"}`);
    if (r.report) {
      bits.push(`report: ${r.report.status} — ${r.report.who}${r.report.note ? `: ${r.report.note}` : ""}`);
      const newer = r.report.newer ?? [];
      for (const entry of newer.slice(0, 3)) {
        bits.push(`then: ${entry.status} — ${entry.who}${entry.note ? `: ${entry.note}` : ""}`);
      }
      if (newer.length > 3) bits.push(`+${newer.length - 3} more`);
    }
    return bits.join(" · ");
  });
  const summaries = epicSummaries(rows).map(s => `${s.epic}: ${s.done}/${s.total} done, ${s.prs} PR, ${s.red} red, released: ${s.released.join(", ") || "none"}`);
  return ["STATUS BOARD (priorities top down; a red or blocked one holds its lane and the tasks that depend on it)", ...summaries, ...lines, ""].join("\n");
}

/** The steps for one pick. ctx: { who, date, claimed } (claimed = this run took the lock or holds it). */
export function renderPick(pick, { who, date, claimed }) {
  const take = claimed ? "" : `\nNot claimed yet. To take it: ${CMD} --claim "<your model name>"\n`;
  switch (pick.kind) {
    case "stop": return head("STOP", [pick.reason, "Tell the owner what failed; do not choose work yourself."]);
    case "wait": return head("WAIT", waitLines(pick, who));
    case "none": return head("NOTHING TO PICK", [
      "Every task is done, claimed, waiting on another task, or waiting for another session or the owner:",
      ...pick.skipped.map(s => `- ${s.id}: ${s.reason}`),
      "Tell the owner; do not choose work yourself.",
    ]);
    case "unblock": return head(`UNBLOCK ${pick.task.id} — ${pick.task.title}`, [
      `${pick.report.who} reported it ${pick.report.status}${pick.report.note ? `: ${pick.report.note}` : ""}. Every lower priority waits on it (D-085). Lock ${pick.lock}${pick.from ? ` · taken over from ${pick.from}, quiet for 2 hours` : ""}.`,
      ...holding(pick),
      unblockSteps(pick, who),
    ]) + take;
    case "ceo": return head("CEO REVIEW (D-085)", [
      ...(pick.board ? [renderBoard(pick.board)] : []),
      "Nothing is left for you: no red main, nothing of yours open, no block you may clear, no packet, review, landing or build. The queue:",
      ...pick.skipped.map(s => `- ${s.id}: ${s.reason}`),
      ceoSteps(),
    ]);
    case "fix-main": return head(`FIX RED MAIN (P0) — ${pick.sha.slice(0, 8)}`, [
      `Failing run: ${pick.url} · lock ${pick.lock}${pick.from ? ` · taken over from ${pick.from}, quiet for 2 hours` : ""}`,
      fixMainSteps(pick, who),
    ]) + take;
    case "review": return head(`REVIEW ${pick.task.id} — ${pick.task.title}`, [
      `Tier 1 · pull request ${pick.pr} · branch ${pick.work} · review lock ${pick.lock}`,
      `No session of your model may have built or fixed this (D-151; built by ${pick.builder ?? "unknown"}). For work built or fixed outside the picker, check pull-request comments and the task reports on the board for your model; if found, post no verdict and report it blocked to the CEO.`,
      ...holding(pick),
      reviewSteps(pick, who),
    ]) + take;
    case "fix": return head(`FIX REVIEW FINDINGS ${pick.task.id} — ${pick.task.title}`, [
      `Tier 1 · pull request ${pick.pr} · branch ${pick.work}`,
      ...(pick.why ? [`${pick.why}.`] : []),
      "You must not be a reviewer of it.",
      ...holding(pick),
      fixSteps(pick, who),
    ]) + take;
    case "green": return head(`MAKE GREEN ${pick.task.id} — ${pick.task.title}`, [
      `${pick.why ?? `Pull request ${pick.pr} has red CI`}, and nobody has pushed to ${pick.work} since ${new Date(pick.since).toISOString()} (started by ${pick.from ?? "unknown"}; D-085).`,
      `Continue on the same branch and keep every commit on it. Note the takeover in ${statusAt(pick.task)}.`,
      ...holding(pick),
      greenSteps(pick, who),
    ]) + take;
    case "land": return head(`LAND ${pick.task.id} — ${pick.task.title}`, [
      `Pull request ${pick.pr} is ${pick.tier1 ? "reviewed and passed" : "built"}, but nobody has landed it for 2 hours (last held by ${pick.from ?? "unknown"}; D-085).${pick.tier1 ? " You must not have built or fixed it." : ""}`,
      ...holding(pick),
      landSteps(pick, who),
    ]) + take;
    case "architect": return head(`WRITE THE PACKET FOR ${pick.task.id} — ${pick.task.title}`, [
      `Any agent (D-109); Claude Code may revise it · lock ${pick.lock}${pick.from ? ` · taken over from ${pick.from}, quiet for 2 hours` : ""}`,
      architectSteps(pick, who, claimed),
    ]) + take;
    case "takeover": return head(`TAKE OVER ${pick.task.id} — ${pick.task.title}`, [
      `Half-built and quiet: nobody has pushed to ${pick.work} since ${new Date(pick.since).toISOString()} (queue rule 2, D-085; started by ${pick.from ?? "unknown"}).${pick.why ? ` ${pick.why}.` : ""}`,
      `Continue on the same branch and keep every commit on it. Note the takeover in ${statusAt(pick.task)}.`,
      ...holding(pick),
      resumeSteps(pick.task, who, pick.work),
    ]) + take;
    case "build": return head(`BUILD ${pick.task.id} — ${pick.task.title}`, [
      `Tier ${pick.task.tier} · lane ${pick.task.lane} · packet ${pick.task.packet} · branch ${pick.task.branch}`,
      ...(pick.ciRunning ? ["main's CI is still running: you may start, but push nothing to main until it is green."] : []),
      buildSteps(pick.task, who, date, pick.task.branch),
    ]) + take;
    case "continue": {
      const intro = yours(who);
      switch (pick.of) {
        case "fix-main": return head(`CONTINUE: FIX RED MAIN (P0) — ${pick.sha.slice(0, 8)}`, [intro, `Failing run: ${pick.url ?? "see main's CI"} · lock ${pick.lock}`, fixMainSteps(pick, who)]);
        case "review": return head(`CONTINUE REVIEW ${pick.task.id} — ${pick.task.title}`, [intro, `Tier 1 · pull request ${pick.pr} · branch ${pick.work} · review lock ${pick.lock}`, reviewSteps(pick, who)]);
        case "fix": return head(`CONTINUE FIXING REVIEW FINDINGS ${pick.task.id} — ${pick.task.title}`, [intro, `Tier 1 · pull request ${pick.pr} · branch ${pick.work}`, fixSteps(pick, who)]);
        case "green": return head(`CONTINUE: MAKE GREEN ${pick.task.id} — ${pick.task.title}`, [intro, `Pull request ${pick.pr} has red CI.`, greenSteps(pick, who)]);
        case "land": return head(`CONTINUE: LAND ${pick.task.id} — ${pick.task.title}`, [intro, `Pull request ${pick.pr}.`, landSteps(pick, who)]);
        case "architect": return head(`CONTINUE: WRITE THE PACKET FOR ${pick.task.id} — ${pick.task.title}`, [intro, `Lock ${pick.lock}.`, architectSteps({ ...pick, lockExists: true }, who, true)]);
        case "unblock": return head(`CONTINUE: UNBLOCK ${pick.task.id} — ${pick.task.title}`, [intro, `${pick.report.who} reported it ${pick.report.status}${pick.report.note ? `: ${pick.report.note}` : ""}. Lock ${pick.lock}.`, unblockSteps(pick, who)]);
        default: return head(`CONTINUE ${pick.task.id} — ${pick.task.title}`, [intro, `Tier ${pick.task.tier} · lane ${pick.task.lane} · packet ${pick.task.packet} · branch ${pick.work}`, resumeSteps(pick.task, who, pick.work)]);
      }
    }
    default: throw new Error(`unknown pick kind ${pick.kind}`);
  }
}
