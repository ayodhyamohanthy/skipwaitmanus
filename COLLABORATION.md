# Multi-agent collaboration protocol

Applies to every model, IDE, CLI, automation agent, and human working on this repository. Read this file and AGENTS.md before editing. Configure tools that do not discover AGENTS.md automatically to read both files at session start. Instructions are a shared convention, not an enforced lock or a direct communication channel between models.

## 1. Establish the baseline

- Inspect `git status --short`, the current branch, recent commits, and `git worktree list` before writing.
- Fetch `origin` and inspect changes since the task's base commit. Never assume a local branch named main is current.
- Read relevant open GitHub issues and PRs, including their latest comments. Record existing dirty paths; they belong to another session unless ownership is confirmed.
- Do not print secrets, environment contents, credentials, or private customer data in handoffs.

## 2. Claim a task in a shared place

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
- Refresh the record at scope changes, checkpoints, blockers, and session end. An old timestamp does not authorize taking ownership; request reassignment or user confirmation.
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

- Default to feature-branch PRs rather than concurrent direct pushes to main. Commit, push, merge, and deploy only when authorized by the user or the environment's applicable instructions. This protocol does not grant new permission to publish.
- Before committing, inspect status, the full diff, recent history, and the staged diff. Stage explicit owned paths; never use `git add .` or `git add -A` to sweep up shared changes.
- Before merging, fetch again and review the entire branch diff against current main, not only the latest commit.
- Update only your clean, isolated branch. Resolve conflicts by reading both changes and preserving their intent; never blindly select ours/theirs or delete conflict markers to make tests pass.
- Ask the owners to resolve ambiguous behavior conflicts. Rerun validation on the integrated result; earlier passing tests do not certify a later merge.
- Run `git diff --check`, `pnpm check`, affected Vitest files, and `pnpm build` for runtime/dependency changes. Report exact commands and outcomes, including failures outside the task. Do not weaken tests to conceal conflicts.
- Use one designated integrator or the repository merge queue to serialize integration. Never force-push main. A rejected push means fetch, inspect, coordinate, and revalidate, not force.
- Where repository settings permit, maintainers should protect main with PR review and required CI checks. Documentation alone does not enable branch protection.

## 6. Leave a usable handoff

Update the shared issue/PR with the commit SHA, changed files, design decisions, tests run, known failures, unresolved questions, and remaining work. Release the scope explicitly when finished. Record deployment status separately from push status; a successful push does not prove a successful deployment.

If another model cannot access the shared record, give the user this handoff to relay. Never invent agreement, approval, test results, or completion by another session.

## 7. Tooling (`scripts/collab.sh`)

Prefer the script over hand-rolled git/gh commands — it encodes the naming and claim conventions above. Requires git + an authenticated `gh`.
- `./scripts/collab.sh status` — baseline snapshot (branch, dirty paths, worktrees, drift vs origin/main). Run before writing.
- `./scripts/collab.sh board` — live worktrees plus open coordination issues.
- `./scripts/collab.sh start <task> [--session NAME]` — new isolated worktree + `agent/<session>/<task>` branch off origin/main.
- `./scripts/collab.sh claim --issue N --session S --task T --scope F [...] [--dry-run]` — post a §2 claim comment.
- `./scripts/collab.sh release --issue N --session S` — release the scope when done.
