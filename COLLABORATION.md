# Multi-agent collaboration protocol

Applies to every model, IDE, CLI, automation agent, and human working on this repository. Read [`docs/BRIEF.md`](docs/BRIEF.md) first (D-073), then this file and AGENTS.md, before editing. Configure tools that do not discover AGENTS.md automatically to read both files at session start. Instructions are a shared convention, not an enforced lock or a direct communication channel between models.

**Owner says `build`, `resume`, `continue` or `next`?** Continue current work, never restart an old plan. First follow [the current-instruction preflight](./docs/BUILD_CONTINUITY.md) (D-225): fetch current main, read latest instructions and decisions plus the previous repo-only outcome, check goal alignment and ownership, then use `node scripts/next-task.mjs --claim "<your model name>"`. Read its assignment against those decisions before implementation; stale or conflicting context holds only the affected task. Claude handles intelligence/reasoning; other tools develop. Keep the picker's exact session-tagged name for later flags. The picker is not proof that the preflight was read.

## 1. Establish the baseline

- Inspect `git status --short`, the current branch, recent commits, and `git worktree list` before writing.
- Fetch `origin` and inspect changes since the task's base commit. Never assume a local branch named main is current.
- Read relevant open GitHub issues and PRs, including their latest comments. Record existing dirty paths; they belong to another session unless ownership is confirmed.
- Do not print secrets, environment contents, credentials, or private customer data in handoffs.

## 2. Claim a task in a shared place

For a task in `docs/plans/assignments.json`, the picker claims on origin (`node scripts/next-task.mjs --claim "<your model name>"` pushes the task's branch, and the first push wins); your first commit on the task branch sets its `docs/KIT_V4_BUILD_PLAN.md` §3b row, which reaches `main` with the work (D-083, D-085), and a claim nobody pushed to (commit or `--heartbeat`) for 2 hours is free. Keep the §3b Status table current. Every change updates every affected markdown doc in the same push (D-068).


Use a GitHub issue or draft PR as the coordination record across machines and platforms. Before overlapping work, post:

```text
Session: <tool/model plus unique session identifier>
Task: <goal and issue reference>
Base: <commit SHA>
Branch/worktree: <branch and local worktree identifier>
Scope: <files or directories to edit>
Shared resources: <lockfile, migrations, routes, CI, ports, or none>
Status: claimed | working | blocked | ready for review | handed off | complete
Updated: <UTC timestamp>
Next: <next action or requested coordination>
```

- Check for overlapping claims before editing and again before integration. An issue comment is advisory, not an atomic lock; simultaneous claims must be reconciled explicitly.
- If someone owns the same file or resource, request a split or handoff in that record and wait for agreement. Continue only with non-overlapping work.
- Refresh the record at scope changes, checkpoints, blockers, and session end. For a listed task the picker decides takeovers: a claim with no push to its branch or lock and no `--heartbeat` for 2 hours is free (D-085). For anything else, request reassignment or user confirmation before taking ownership.
- If shared coordination is unavailable, tell the user and work in isolation on non-overlapping scope. Do not claim to have contacted another model without an actual shared message.

## 3. Isolate each writer

- Default: one task, one feature branch, one separate worktree or clone per session, based on a reviewed origin/main commit. Use unique branch names such as `agent/<session>/<task>`.
- Never switch branches, pull, merge, rebase, install dependencies, or operate on the Git index in another session's working directory.
- If forced to share a working directory, allow only one writer at a time. Obtain an explicit handoff before editing or running Git operations. Other sessions may inspect, but must not mutate it.
- Never stash, reset, clean, restore, delete, stage, or commit another session's work to make the tree look clean.
- Use separate local server ports and build output directories/worktrees. Never kill another session's server or test process.

## 4. Coordinate shared files and contracts

- Assign a single owner per change set for package.json and its lockfile, migrations/schema, App.tsx routing, shared theme tokens, AGENTS.md, and deployment workflows.
- Agree on request/response shapes before parallel client/server changes. Record compatibility requirements in the shared task.
- Reserve migration identifiers through the shared record; check the latest main before allocating and integrating them.
- Do not upgrade unrelated dependencies, rewrite formatting across the repository, or rotate secrets as part of a scoped task.
- Immediately before each edit, reread the target. If its contents or HEAD changed unexpectedly, stop editing that scope and investigate rather than overwriting.

## 5. Integrate through review

- Work on a feature branch; once a group passes the gate in `docs/KIT_V4_BUILD_PLAN.md` §3 and GitHub CI is green on that exact commit, ship it to main (D-003 as amended by D-082: pull request first; while main is red, push nothing but the fix), never as concurrent direct pushes. Commit, push, merge, and deploy only when authorized by the user or the environment's applicable instructions. This protocol does not grant new permission to publish.
- Before committing, inspect status, the full diff, recent history, and the staged diff. Stage explicit owned paths; never use `git add .` or `git add -A` to sweep up shared changes.
- Before merging, fetch again and review the entire branch diff against current main, not only the latest commit.
- Update only your clean, isolated branch. Resolve conflicts by reading both changes and preserving their intent; never blindly select ours/theirs or delete conflict markers to make tests pass.
- Ask the owners to resolve ambiguous behavior conflicts. Rerun validation on the integrated result; earlier passing tests do not certify a later merge (required CI on the merge result; a docs/registry-only PR needs focused checks and an independent delta review, Oct 23 merge-policy amendment).
- Run `git diff --check`, `pnpm check`, affected Vitest files, and `pnpm build` for runtime/dependency changes. Report exact commands and outcomes, including failures outside the task. Do not weaken tests to conceal conflicts.
- Use one designated integrator or the repository merge queue to serialize integration. Never force-push main. A rejected push means fetch, inspect, coordinate, and revalidate, not force.
- Where repository settings permit, maintainers should protect main with required CI checks (Tier 1 work needs an independent review before landing by a model that neither built nor fixed it, D-074, D-151; Tier 2 and 3 groups ship on green CI, D-003). Documentation alone does not enable branch protection; since Oct 20 the GitHub ruleset `main: green CI only (D-082)` refuses any push to main whose exact commit has not passed typecheck, tests and build, for everyone.

## 6. Leave a usable handoff

Update the shared issue/PR with the commit SHA, changed files, design decisions, tests run, known failures, unresolved questions, and remaining work. Release the scope explicitly when finished. Record deployment status separately from push status; a successful push does not prove a successful deployment.

If another model cannot access the shared record, give the user this handoff to relay. Never invent agreement, approval, test results, or completion by another session.


Scoped Oct 23 founder exception for one manual claim only: see docs/DECISIONS.md, section "Scoped founder manual-claim exception, Oct 23, 2026". Applies only to PICKER-review-independence by Forge · fd06 after the attestation is committed and published; reviews and every other hold remain unchanged.
