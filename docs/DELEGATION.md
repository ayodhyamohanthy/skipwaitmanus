# Delegating implementation through the picker

> Read [`docs/BRIEF.md`](BRIEF.md) first (D-073). This file is for whoever hands work to a model (the owner or an orchestrating agent) and for the reviewer. Every session first completes [the current-instruction preflight](BUILD_CONTINUITY.md) (D-225), including latest decisions and the previous repo-only outcome; a packet cannot waive that read. The register, `AGENTS.md` and the plan §3b win any conflict with this file (D-074).

Written Oct 18 2026 at `main` `5ef0626`. On that commit the full suite was green: 394 files passed, 3 skipped; 2,983 tests passed, 16 skipped, 0 failed.

## 1. Roles
- **Owner:** decides (register), approves new features and pricing, triggers anything that touches live money or provider settings (catalog apply, the one live payment test, D-065), and answers the questions batched for the weekly review (D-064).
- **CEO and architect (Claude Code, D-074, D-085):** sets direction and makes the high-stakes calls inside the owner's decisions; keeps the business, the architecture map, this file, the packets and the queue order true; re-analyses what we build toward the goal and brings the owner rated recommendations; writes a packet before a row is delegated (any agent may write one, D-109); writes the red-first tests for Tier 1 packets; reviews Tier 1 work; handles P0 triage and register entries on the owner's say-so. D-225 supersedes the former Claude implementation role: Claude supplies intelligence/reasoning, while other tools develop; another capable session may perform authorized CEO work if that session is unavailable, so no task waits for one model. Tier 1 review remains independent of the builder and fixers (D-151), with required CI and protections (D-082).
- **Implementer (development tools other than Claude sessions, D-225):** executes one packet at a time on its own branch; after it opens a Tier 1 draft pull request or lands, it reports to the CEO and continues with the next eligible task without another owner prompt (D-085 (10) as amended by D-235); review independence and every gate are unchanged.
- **Reviewer (a session of a model that neither built nor fixed the work, D-151):** checks Tier 1 work against the packet and §6 before it reaches `main`.

## 2. What to do next
The binding order is the plan §3b (rules 1–7, D-072, D-053). The execution view with packet links, risk tiers and which lanes can run side by side is [`docs/plans/README.md`](plans/README.md). Only a row whose packet exists there may be handed to a model. Any capable session may write a missing packet; do not wait for the architect specifically (D-200).

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

1. Complete docs/BUILD_CONTINUITY.md before claiming: read current
   instructions/decisions and the previous repo-only outcome. Read
   docs/BRIEF.md, then docs/plans/<PACKET FILE>. A packet cannot waive
   current-decision reading: the pick opens with "Newest decisions (read
   before you work)" — read those entries too and stop with a blocked
   report if one changes the packet (D-202). For implementation details, never open server/db.ts or
   server/privateReferralRoutes.ts whole (they are too large): find a
   function with `grep -n "name" <file>` and read only that line range.
2. git fetch origin. If a function the packet cites no longer matches
   it, stop (step 8).
3. Claim it: node scripts/next-task.mjs --claim "<your model name>"
   It adds a session tag and prints your full name: use exactly that name
   from now on and when you resume. It pushes <BRANCH> to origin (the
   first push wins). If it prints a different task than <PACKET FILE>, do
   the printed task instead and tell me. Work in a worktree on it. Your
   first commit sets your status line (its docs/KIT_V4_BUILD_PLAN.md §3b
   row, or your line in the packet's Status section when several tasks
   share that row; the picker says which, D-134) to
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
   - Your status line is your task's §3b row, or, when several tasks share
     that row, your line in the packet's Status section (the picker says
     which, D-134); never edit a shared §3b row.
   - Tier 1: push the branch, open a draft pull request, set your status
     line to "review — <BRANCH> — <sha>", and stop. Do not push to main.
   - Tier 2 or 3: push the branch, open a pull request and wait until
     every check on that exact commit is green. Then confirm main's latest
     CI is green and fast-forward main to that exact commit
     (`git push origin <sha>:main`; GitHub's merge-commit button is also
     safe, since only an up-to-date branch can merge; never squash or
     rebase-merge, D-134 (6)). If that push is refused because main moved, merge the
     latest origin/main, wait for every required check on the new commit
     (no fresh full local gate just because main moved: the Oct 23
     merge-policy amendment) and fast-forward again; never force-push. Watch main's CI and
     both deploys to the end, run the live check, set your status line to
     "done — <sha>" with the evidence block.
   - Never push to main while main's CI is red (stop and report), while a
     check on your commit is failing, skipped or still running, or with
     --no-verify. If main goes red after your landing, revert or fix your
     commit before anything else (D-082).
   - Then report to the CEO with --report, rerun the current-instruction
     preflight and take the next task the picker hands you (D-235).
8. If anything is unclear, a test fails for an unexpected reason, or a rule
   seems to conflict with docs/DECISIONS.md: stop that task. Write the
   question in your status line, push your branch and --report blocked; the
   block holds that task, its lane and its dependents, so run the picker
   again for other eligible work. Never guess about
   money, sign-in, identity or privacy.
```

### 4a. Starting any model: the owner says `build`, `resume`, `continue` or `next` (D-083, D-085)
Every agent entry doc tells an agent that all four words mean one thing: run `node scripts/next-task.mjs --claim "<your model name>"` and do only what it prints. If the name has no ` · <session>` part, the picker adds a unique session tag (for example `Qwen 3 · k3f9`) and prints it. Use exactly that full name for `--heartbeat`, `--report`, `--fixed`, `--verdict` and when you resume: on resume, read your name from the holder column of the board (`--status`); never invent a new one, or your own half-built work sits idle. Two sessions never share a name, but sessions of one model are one model for reviews: a session of a model that built or fixed the work neither reviews nor lands it (D-151).

The script reads the shared order from `docs/plans/assignments.json` on `origin/main`, the decision register `docs/DECISIONS.md` from the same ref (a register it cannot parse stops the picker, exactly as a broken task list does), main's CI and each task pull request's CI from GitHub, and the local clone, then decides (a task whose dependency is not done gets no work at all from any of these passes, D-134: no build, takeover, make-green, review, findings fix, packet or landing; the board shows it as waiting, it never holds its lane, and your claim on it stays yours, kept alive by `--heartbeat`, until the dependency is done. A task whose `syncedTo` trails a register entry that names it under `Affects tasks:` is out of sync and is held in exactly the same way, D-202):
1. **Red `main` first**, fixed by one agent only. The fixer works on the lock branch itself (`agent/queue/fix-main-<sha8>`) and opens the fix pull request from it, so its commits keep the lock alive; its holder gets it back instead of waiting on itself. Because `main` is red, landing the fix is the one push D-082 allows, once every check on that commit is green. One fix-main lock at a time: a newer red commit while someone is on the fix does not open a second one.
2. **Your own unfinished work** (a build, a review, findings to fix, a landing, a packet). Except: pending work ranked above your own task with nobody on it (a review, findings to fix, a red pull request whose owner is quiet, a landing, a half-built claim quiet for 2 hours, an unblock for the CEO) is handed to you first. You push your own work first (the picker enforces it), and your own claim stays yours for 2 hours.
3. **Pending work nobody is on, top down** (owner: "completing a pending task is important than taking new one"): a Tier 1 review (never by a session of a model that built or fixed it, D-151), findings to fix (never by its reviewer), a pull request with red CI whose owner is quiet (make it green), a green pull request nobody lands, a passed review whose reviewer went quiet (landed by a session of a model that neither built nor fixed it, `Land claim` on the review lock), a half-built claim quiet for 2 hours (take it over on the same branch), a blocked task (the CEO unblocks it). A Tier 1 pull request built outside the picker (no claim names its builder) is reviewed only once its branch has been quiet for 2 hours, unless a picker fixer pushed last (its Fixed marker came after the last push). A Tier 1 pull request whose CI turns red after its review passed goes to a fix stage and is reviewed again; it is never landed as it is.
4. **New work, top down:** the next `todo` whose dependencies are done and whose lane is free. A squash-merged pull request counts as done even before its status is set to done. An out-of-sync task at that position is handed as a **`resync`** instead (D-202).
5. **A red or blocked priority** (red CI, or a red or blocked report) holds its own lane and the tasks that depend on it for everyone else: nothing there starts, other lanes go on; red `main` holds everything (D-109). An agent already holding work below a red priority whose owner is active keeps going on its own work (its hands cannot help the red one); a red priority with nobody on it is handed out first.
6. **Quiet** means no push to the task's branch or lock and no heartbeat for 2 hours (D-085; queue rule 2 said 24 hours). Push after every commit, run `--heartbeat --as "<name>"` before a long step (the full gate), and commit and push before you stop. A holder that comes back after 90 minutes or more re-takes its claim on the same branch a takeover would push to, so the first push wins and two agents never both hold it.
7. **Claude Code (intelligence/reasoning, D-225)** retains the historical identity `--claim "Claude Code"`, but must not treat a picker build offer as permission to implement. Follow `BUILD_CONTINUITY.md` and return a bounded decision/handoff for another development tool. The older Claude-build role is superseded. No task waits for the CEO session; another capable session may take authorized work. Tier 1 review remains independent (D-151), and all CI and branch-protection gates apply (D-082).
8. **Reports:** every agent reports to the CEO with `--report green|red|blocked|review|landed --task <id> --as "<name>" --note "<one line>"` when it stops, lands, opens a pull request or gets blocked (markers on `agent/reports/log`). A note is one line; secrets and email addresses are redacted, and no personal data belongs in it (the repo is public). `--status` and the top of every run print one board: every priority top down, its role (CTO, CDO), health, holder, quiet time, pull request and latest report. Only an agent holding part of the task (its builder, reviewer, fixer, lander or unblocker) or the CEO may report on it, and a blocked report stands until the CEO reports on that task.
9. **Sync:** while your own claimed work has commits or changes not on origin, the picker refuses new work, `--report` and `--fixed` (exit 3, "SYNC FIRST"); other local-only branches and a stale local `main` are reported.
10. **One packet at a time (D-074 (2) and D-085 (10), amended by D-235; owner, Oct 29 2026, 23:56 IST):** After each bounded handoff (a Tier 1 draft pull request, a landing or a reported block), report the actual outcome with `--report`, push your own work, rerun the current-instruction preflight (`docs/BUILD_CONTINUITY.md`) and take the next task the picker hands you that your role may take (D-225), without waiting for another `build`. One packet at a time, not one packet per session. Never take your own review, and never bypass a held lane, missing authentication or approval, a platform session or usage limit, or a free-only limit. Stop only for a real blocker, no eligible work, an explicit stop or a session limit, and report that exact reason instead of asking the owner to choose routine work. A Tier 1 builder whose pull request waits for review holds nothing: the review goes to a session of a model that neither built nor fixed it (D-151), and the builder takes disjoint eligible work, never its own review. Until its owning row changes `scripts/nextTaskText.mjs`, the picker's printed Tier 1 step still ends with "end the session (one packet per session, D-074)"; read that step as amended by D-235.
11. **The newest decisions come with every pick (D-202).** Each task in `docs/plans/assignments.json` carries `syncedTo`: the newest register entry its packet was checked against (required on every task that is not `done`). A register entry that changes queued work names those tasks in its "Supersedes · affects" cell as `Affects tasks: <id>, <id>`, or `Affects tasks: none`. The picker compares the two, so every pick it prints — build, continue, takeover, review, fix, make-green, land, packet, unblock, resync, CEO review, fix-main or wait — opens with "Newest decisions (read before you work)": the 5 newest entries plus every entry newer than that task's `syncedTo`. Read them before touching code; if one changes what the task says, stop and `--report blocked "<task id>: conflicts with D-nnn"` (D-032) — a newer decision always beats an older packet, note or chat message. `--status` opens with `Register: D-nnn, YYYY-MM-DD`, and a stale task's row reads `re-sync (D-nnn)` instead of its state.
12. **A re-sync is anyone's (D-200, D-202).** It is claimed on `agent/architect/<slug>` like a packet, and the session that takes it reads the newer entries, updates the packet — or records in the register that the rule is unaffected — and sets that task's `syncedTo` to the newest entry, all in one docs commit landed like any other docs change. While a task is out of sync, no one is handed a build, takeover, make-green, fix, review, packet or landing on it and it never holds its lane; a task you already hold that goes stale comes back to you as its re-sync.

Exit codes: 0 work to do (claimed, continue, or the CEO review), 2 STOP (GitHub unreadable: main's CI, the pull-request list or a task pull request's CI), 3 SYNC FIRST (your own work is not on origin), 4 WAIT, 5 NOTHING TO PICK.

A claim is the task's branch on `origin`, an empty marker commit: the first push wins and a second agent's push is refused. Without `--claim` the script only shows the pick.

For an agent that loads no instruction file, or one started in a folder that is behind `main`, paste:

```text
You are working on SkipWait (github.com/ayodhyamohanthy/skipwaitmanus), a
live product that handles real money. Your folder may be behind main, so
run the task picker straight from origin/main:

  git fetch origin
  d=$(mktemp -d); for f in next-task.mjs nextTaskCore.mjs nextTaskText.mjs; do git show origin/main:scripts/$f > "$d/$f"; done
  node "$d/next-task.mjs" --claim "<your model name>"

Do only the task it prints, exactly as it says, in the worktree it tells
you to create, and read docs/BRIEF.md there first. Use the full name it
prints for every later step. Never choose work yourself. If it prints
STOP, WAIT or NOTHING TO PICK, tell me and stop.
```

Use this prompt instead of `build` in any folder that is behind `main` (its entry docs do not know `build` yet). It changes nothing in the folder: the picker only reads git and pushes the claim.

Queue ownership is shared under D-200: add a task only with a ready packet (or as `architect` until it has one); any capable session may write its packet and update the register/order, explaining the change in its pull request. An agent changes only its own task's status to done in the pull request that lands it. **The session that writes or updates a packet, or that re-syncs one, sets that task's `syncedTo` to the newest entry in `docs/DECISIONS.md` it checked, in the same commit (D-202, D-200);** a new register entry whose rule changes queued work puts `Affects tasks: <id>, <id>` (or `Affects tasks: none`) in its "Supersedes · affects" cell, or the picker cannot tell the next builder that the packet moved.

## 5. What the implementer returns (evidence block)
Paste into your status line, the §3b row or your line in the packet's Status section (keep it under 1,200 characters; details go in commit messages):

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
The reviewer is a session of a model that neither built nor fixed the work (the model is the part of an agent's name before " · ", D-151): a different session of the same model is not independent. The reviewer who wrote the findings may re-review the fixes. A session handed a review of its own model's work posts no verdict and reports it blocked. Never trust pasted output: reproduce it.
0. **The head you review:** before reading any code, record `git fetch origin && git rev-parse origin/<branch>` and review exactly that commit; before posting, list anything pushed since (`git log --no-merges --format="%h %s" <reviewed>..origin/<branch> ^origin/main`) and review it too or return findings. Post the verdict naming that commit: a lander refuses any later commit, and any merge whose `git log --merges --cc` shows a diff hunk, as unreviewed (D-074, D-134).
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
17. Never build on an owner's word that exists only in your session or on your branch. workbuddy · b0eb recorded the owner's BYOR gate waiver only on its task branch, as D-148, an ID that open PR #488 already held (it reached `main` 13 minutes later). The board still showed its blocked report, so four hours later the CEO's D-154 put the gate back, and the owner had to restate his word (D-162). First record the word on `main` in its own docs pull request, under an ID fetched from `main` and every open branch, then report it, then build.
18. Never merge a pull request from an unregistered branch: the queue gate rejects it before the required CI check can pass (D-166).

## 8. Working in a small context window
- Required reading is the brief (under 10 KB) plus one packet. Aim for under 15 KB; a large lane keeps its packet under 60 KB and moves reference tables (verification, token values, specs) to an appendix that the implementer opens by section. The architecture map (`docs/ARCHITECTURE.md`) is also a reference: read only the section the packet names.
- `server/db.ts` is about 470 KB (about 120K tokens) and `server/privateReferralRoutes.ts` about 170 KB: never read either whole. Use the function index in `docs/ARCHITECTURE.md` and `grep -n`, then `sed -n '<from>,<to>p' server/db.ts | cut -c1-400`.
- One packet at a time (D-235): after a Tier 1 draft pull request, a landing or a reported block, report and continue through the preflight to the next eligible task; commit after every step, so a crashed session loses at most one step.

## 9. Running lanes side by side
- Two lanes may run at the same time only when `docs/plans/README.md` marks them parallel-safe (different functions and files). Everything else waits.
- Migrations: one number at a time; take the next free number after `drizzle/deploy/` and the numbers claimed in plan §5 at commit time, and record it there.
- Pushes to `main` are serialized: fetch, merge, wait for green CI on that exact commit, push (D-082). A rejected push means merge `main` again and wait for CI on the new commit; a fresh full local gate is not needed just because `main` moved (Oct 23 merge-policy amendment). Never force.

## 10. An environment that works
- Node 22.12 or newer (`.nvmrc` pins 22; the jsdom test environment loads an ES module with `require()`, which is only unflagged from Node 22.12). CI uses the latest Node 22.
- Behind an HTTPS proxy (cloud sandboxes), Node's `fetch` ignores `HTTPS_PROXY`; `scripts/next-task.mjs` re-runs itself with `NODE_USE_ENV_PROXY=1` (Node 22.21 or newer), so the picker can read GitHub.
- pnpm 10.34.7 (`packageManager` in `package.json`). If corepack fails with "Cannot find matching keyid", install it with `npm install -g pnpm@10.34.7`.
- Tests need no database: database code runs against in-repo fixtures and the in-memory Drizzle test kit.
- Local dev: `.env` with `JWT_SECRET`, `VITE_APP_ID=skipwait`, `BILLING_ENV=test` and placeholder `CHARGEBEE_SITE`, `CHARGEBEE_API_KEY`, `CHARGEBEE_WEBHOOK_SECRET`.
- The full suite takes about 6 minutes on 2 CPUs. While iterating, run only the packet's focused files.
