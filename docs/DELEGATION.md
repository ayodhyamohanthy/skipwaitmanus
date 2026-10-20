# Delegating implementation to open models

> Read [`docs/BRIEF.md`](BRIEF.md) first (D-073). This file is for whoever hands work to a model (the owner or an orchestrating agent) and for the reviewer. An implementer reads only the brief and its packet. The register, `AGENTS.md` and the plan §3b win any conflict with this file (D-074).

Written Oct 18 2026 at `main` `5ef0626`. On that commit the full suite was green: 394 files passed, 3 skipped; 2,983 tests passed, 16 skipped, 0 failed.

## 1. Roles
- **Owner:** decides (register), approves new features and pricing, triggers anything that touches live money or provider settings (catalog apply, the one live payment test, D-065), and answers the questions batched for the weekly review (D-064).
- **CEO and architect (Claude Code, D-074, D-085):** sets direction and makes the high-stakes calls inside the owner's decisions; keeps the business, the architecture map, this file, the packets and the queue order true; re-analyses what we build toward the goal and brings the owner rated recommendations; writes a packet before a row is delegated; writes the red-first tests for Tier 1 packets; reviews Tier 1 work; handles P0 triage and register entries on the owner's say-so. It never builds a packet itself (the picker never offers it one).
- **Implementer (an open frontier model):** executes exactly one packet per session, on its own branch.
- **Reviewer (a different model session from the implementer):** checks Tier 1 work against the packet and §6 before it reaches `main`.

## 2. What to do next
The binding order is the plan §3b (rules 1–7, D-072, D-053). The execution view with packet links, risk tiers and which lanes can run side by side is [`docs/plans/README.md`](plans/README.md). Only a row whose packet exists there may be handed to a model. A row without a packet goes to the architect first.

## 3. Risk tiers
| Tier | What | Who may implement | Before `main` |
|---|---|---|---|
| 1 | Credits, payments, refunds, the ledger, sign-in, sessions, identity linking, privacy ("private until a referrer accepts", blocks), migrations | Any model, but only from a packet with red-first tests already written | Draft PR (CI runs on pull requests), independent review (§6), findings fixed red-first, gate re-run by the reviewer, CI green on the exact commit that lands (D-082) |
| 2 | Server logic or a user flow with no money or identity effect | Any model from a packet | Gate (BRIEF "How to ship"), then CI green on the exact commit through a pull request (D-082); review recommended |
| 3 | Copy (never legal text), docs, an isolated UI state, test-only changes | Any model | Gate, then CI green on the exact commit through a pull request (D-082) |

A packet states its tier. When in doubt, it is the higher tier.

## 4. Handing a packet to a model
Start a fresh session for each packet and paste this, filling the three placeholders:

```text
You are implementing one work packet in the SkipWait repository
(github.com/ayodhyamohanthy/skipwaitmanus). It is a live product that
handles real money: a mistake reaches real users.

1. Read docs/BRIEF.md, then docs/plans/<PACKET FILE>. Read nothing else
   unless the packet names it. Never open server/db.ts or
   server/privateReferralRoutes.ts whole (they are too large): find a
   function with `grep -n "name" <file>` and read only that line range.
2. git fetch origin. If a function the packet cites no longer matches
   it, stop (step 8).
3. Claim it: node scripts/next-task.mjs --claim "<your model · session>" (the same name all session; it gives you back your own unfinished work first)
   pushes <BRANCH> to origin (the first push wins). Work in a worktree on
   it. Your first commit sets its docs/KIT_V4_BUILD_PLAN.md §3b row to
   "in progress — <your model> — <date> — branch <BRANCH>".
4. Write the tests in packet section 7 first. Run them; they must fail for
   the reason the packet gives. Never change a test the packet gave you.
5. Do packet section 6 one step at a time. After each step run its focused
   tests and `pnpm check`, then commit only that step's files with its
   commit message.
6. Edit only the files in packet section 5 "In scope". Never add a
   dependency, migration or env key the packet does not name.
7. When all steps are done, merge the latest origin/main into your branch,
   run the full gate from docs/BRIEF.md "How to ship", and fill in the
   evidence block from docs/DELEGATION.md section 5.
   - Tier 1: push the branch, open a draft pull request, set the §3b row
     to "review — <BRANCH> — <sha>", and stop. Do not push to main.
   - Tier 2 or 3: push the branch, open a pull request and wait until
     every check on that exact commit is green. Then confirm main's latest
     CI is green and fast-forward main to that commit (or merge the pull
     request). Watch main's CI and both deploys to the end, run the live
     check, set the row to "done — <sha>" with the evidence block.
   - Never push to main while main's CI is red (stop and report), while a
     check on your commit is failing, skipped or still running, or with
     --no-verify. If main goes red after your landing, revert or fix your
     commit before anything else (D-082).
8. If anything is unclear, a test fails for an unexpected reason, or a rule
   seems to conflict with docs/DECISIONS.md: stop. Write the question in
   the §3b row, push your branch, end the session. Never guess about
   money, sign-in, identity or privacy.
```

### 4a. Starting any model: the owner says `build`, `resume`, `continue` or `next` (D-083, D-085)
Every agent entry doc tells an agent that all four words mean one thing: run `node scripts/next-task.mjs --claim "<model · session>"` with the same name for the whole session and do only what it prints. The script reads Claude Code's order from `docs/plans/assignments.json` on `origin/main`, main's CI and each task pull request's CI from GitHub, and the local clone, then decides:
1. While `main` is red: only fixing it, and only one agent (a lock branch `agent/queue/fix-main-<sha>`); its holder gets it back instead of waiting on itself.
2. Your own unfinished work: a build, a review, findings to fix, a landing, a packet. A Tier 1 builder whose pull request waits for review holds nothing and takes new work.
3. Pending work before new work (owner: "completing a pending task is important than taking new one"). First one top-down pass for pending work nobody is on, then one for new work; a priority with red CI or a red or blocked report holds everything below it (others wait; new work ranked above it may start; a blocked task goes to the CEO): a Tier 1 review (never by the agent that built or fixed it), findings to fix (never by its reviewer), a pull request with red CI whose owner has been quiet for 2 hours (make it green), a green pull request nobody lands, a passed review whose reviewer went quiet (landed by someone who neither built nor fixed it, `Land claim` on the review lock), a half-built claim nobody has pushed to for 2 hours (take it over on the same branch), or, in the second pass, the next `todo` whose dependencies are done and whose lane is free.
4. "Quiet" means no commit and no heartbeat for 2 hours: push after every commit, run `--heartbeat --as "<name>"` before a long step (the full gate), and commit and push before you stop.
5. Claude Code sessions (the CEO, D-085) are offered red `main`, their own work, packets (claimed on `agent/architect/<slug>`) and Tier 1 reviews only, and the CEO review when nothing at that level waits.
6. Every agent reports to the CEO with `--report green|red|blocked|review|landed --task <id> --as "<name>" --note "<one line>"` when it stops, lands, opens a pull request or gets blocked (markers on `agent/reports/log`); `--status` and the top of every run print one board: every priority top down, its role (CTO, CDO), health, holder, quiet time, pull request and latest report.
7. Before any new work it checks the local clone: your own claimed branch with unpushed commits or uncommitted changes blocks it (exit 3, "SYNC FIRST"); other local-only branches and a stale local `main` are reported.

A claim is the task's branch on `origin`, an empty marker commit: the first push wins and a second agent's push is refused. Without `--claim` the script only shows the pick. Name yourself with a session tag (for example `Qwen 3 · 14:05`) so two sessions of one model count as different people for reviews.

For an agent that loads no instruction file, or one started in a folder that is behind `main`, paste:

```text
You are working on SkipWait (github.com/ayodhyamohanthy/skipwaitmanus), a
live product that handles real money. Your folder may be behind main, so
run the task picker straight from origin/main:

  git fetch origin
  d=$(mktemp -d); for f in next-task.mjs nextTaskCore.mjs nextTaskText.mjs; do git show origin/main:scripts/$f > "$d/$f"; done
  node "$d/next-task.mjs" --claim "<your model name · a session tag>"

Do only the task it prints, exactly as it says, in the worktree it tells
you to create, and read docs/BRIEF.md there first. Never choose work
yourself. If it prints STOP, WAIT or NOTHING TO PICK, tell me and stop.
```

Use this prompt instead of `build` in any folder that is behind `main` (its entry docs do not know `build` yet). It changes nothing in the folder: the picker only reads git and pushes the claim.

Claude Code keeps the list: a task goes in only with a ready packet (or as `architect` until it has one), and an agent changes only its own task's status, to done, in the pull request that lands it.

## 5. What the implementer returns (evidence block)
Paste into the §3b row (keep it under 1,200 characters; details go in commit messages):

```text
Evidence — <packet> — <model> — <date>
Branch <name> @ <sha>, merged with origin/main <sha>
Red first: <n> failing before the fix in <files>
Gate: check 0 · token audit OK · migration lint OK · deploy triggers OK ·
vitest <files> passed / <tests> passed / <skipped> skipped / 0 failed · build 0
Live: API CONVERGED on <sha> | web git-commit <sha> | 1280/390: <screens>
Left out / follow-ups: <list or none>
```

## 6. Review (required for Tier 1)
The reviewer is a different session from the implementer, ideally a different model. Never trust pasted output: reproduce it.
1. **Scope:** `git diff --stat origin/main...<branch>` touches only the packet's in-scope files and the docs it names.
2. **Tests are honest:** every packet §7 test exists with its assertions; `git diff origin/main...<branch> -- '*.test.ts' '*.test.tsx'` shows no removed `expect`, no `.skip` or `.only`, no loosened literal. Check out the test commit without the fix and confirm the new tests fail.
3. **Money:** every credit move goes through an existing keyed ledger path; one idempotency key per effect; no raw balance `UPDATE`; replaying any request or job writes nothing twice; a failure mid-way leaves no partial state; an ended month or plan returns 0 and says so.
4. **Identity and privacy:** every query is scoped to the signed-in person and company; no seeker name or file before acceptance; blocks hold in both directions; nothing links or merges on an unverified email.
5. **Failure paths:** no silent `catch`; errors reach Sentry without tokens, query strings or personal data; the user sees plain words.
6. **Time:** timestamps come from the app clock, never MySQL `NOW()` compared with `Date.now()`.
7. **Contracts:** Zod at every boundary; shared types in `shared/`; no `any`, unchecked casts or non-null assertions.
8. **Docs:** the D-068 updates are in the same push; the row's evidence matches what you reproduced.
9. **The packet's own §10 questions**, each answered with a file and line.
10. **Gate:** CI on the draft PR is green, and you re-ran `pnpm check`, the focused tests and the build on the branch merged with the latest `origin/main`.

Verdict: `pass` (then the reviewer pushes the merged candidate to the pull request, waits until every check is green on that exact commit, lands that same commit on `main` once `main`'s own CI is green (D-082), and runs the live check) or `findings` (each with file:line, severity and the failing test to add first; the implementer fixes them red-first on the same branch).

## 7. Never do (each line is a real incident)
1. Never commit a file without `pnpm check` passing: drafts saved as `.ts` with JSX turned `main` red (`ca303ded`, fixed `6b2c1d59`).
2. Never commit conflict markers: a merge left them on `main` (fixed by #192). After every merge or rebase run `git diff --check` and grep the changed files for `<<<<<<<`.
3. Never follow an older doc over the register: #293 reverted the register's catalog numbers under a retired rule (`3ce3c92b`); the owner had to rule D-044 to restore them.
4. Never mark a row done before it is live on `main`: a P0 privacy fix was marked done while it sat on an unmerged branch (reopened as P0-pre-accept-privacy).
5. Never leave work or findings only on your machine: the seeker sign-in review findings were lost when a session stopped (§3b row 2).
6. Never claim a row and walk away: stale claims blocked lanes for days. Update or release your claim before you stop.
7. Never ship only a money rule's happy path: a shipped tier promised "7 days from first visibility" while delivered asks could never expire or be withdrawn (P0-allocated-ask-stuck). Test every transition the rule touches: create, deliver, claim, accept, pass, withdraw, expire and replay.
8. Never weaken, skip or delete a test to get green.
9. Never edit a deploy workflow unless the packet says so: duplicate env keys broke both deploy workflows (`8d986d4`).
10. Never assume your machine's locale or time zone: date tests failed on an en-IN machine until vitest pinned them (`4acc43af`). Do not override the pins.
11. Never let one failing query stop a whole job: a failing held-ask read stopped every ask from expiring (`df7c7618`).
12. Never call a provider without a deadline: one Chargebee probe that never settled hung the catalog endpoint (`22351f46`).
13. Never land a whole long-lived branch at once: one pricing landing brought 143 files into `main` in a single merge (`7cda8cf7`). One packet per push.
14. Never make a real payment or change live provider settings (D-065, runbook §4); never commit a secret or personal data (the repo is public, D-059); never reword Terms, Privacy, Refund or Cancellation text.
15. Never refactor, rename or reformat outside the packet; never force-push, rewrite shared history or `git reset --hard` a shared tree.
16. Never push to `main` with red or unfinished CI, or while `main` is red (D-082): `c53ea471` went straight to `main` with six failing tests and unreviewed Tier 1 money code, and three of its routes crashed live and lacked an ownership check (fixed forward in #330).

## 8. Working in a small context window
- Required reading is the brief (under 10 KB) plus one packet. Aim for under 15 KB; a large lane keeps its packet under 60 KB and moves reference tables (verification, token values, specs) to an appendix that the implementer opens by section. The architecture map (`docs/ARCHITECTURE.md`) is also a reference: read only the section the packet names.
- `server/db.ts` is about 470 KB (about 120K tokens) and `server/privateReferralRoutes.ts` about 170 KB: never read either whole. Use the function index in `docs/ARCHITECTURE.md` and `grep -n`, then `sed -n '<from>,<to>p' server/db.ts | cut -c1-400`.
- One packet per session; commit after every step, so a crashed session loses at most one step.

## 9. Running lanes side by side
- Two lanes may run at the same time only when `docs/plans/README.md` marks them parallel-safe (different functions and files). Everything else waits.
- Migrations: one number at a time; take the next free number after `drizzle/deploy/` and the numbers claimed in plan §5 at commit time, and record it there.
- Pushes to `main` are serialized: fetch, merge, re-run the gate, wait for green CI on that exact commit, push (D-082). A rejected push means merge and re-gate, never force.

## 10. An environment that works
- Node 22.12 or newer (the jsdom test environment loads an ES module with `require()`; on Node 22.11 set `NODE_OPTIONS=--experimental-require-module`). CI uses the latest Node 22.
- Behind an HTTPS proxy (cloud sandboxes), Node's `fetch` ignores `HTTPS_PROXY`; `scripts/next-task.mjs` re-runs itself with `NODE_USE_ENV_PROXY=1` (Node 22.21 or newer), so the picker can read GitHub.
- pnpm 10.34.7 (`packageManager` in `package.json`). If corepack fails with "Cannot find matching keyid", install it with `npm install -g pnpm@10.34.7`.
- Tests need no database: database code runs against in-repo fixtures and the in-memory Drizzle test kit.
- Local dev: `.env` with `JWT_SECRET`, `VITE_APP_ID=skipwait`, `BILLING_ENV=test` and placeholder `CHARGEBEE_SITE`, `CHARGEBEE_API_KEY`, `CHARGEBEE_WEBHOOK_SECRET`.
- The full suite takes about 6 minutes on 2 CPUs. While iterating, run only the packet's focused files.
