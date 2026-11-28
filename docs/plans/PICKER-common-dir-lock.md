# PICKER-common-dir-lock: one picker across a clone's linked worktrees

Tier 2 · lane `picker-single-flight` · branch `agent/queue/picker-common-dir-lock` · epic D-212

## Goal and authority

Restore the existing per-clone single-flight contract from D-324 / D-321 (11), not a new queue policy.
A session must obtain its assignment without competing with another expensive scan of the same clone.
This supports reliable parallel delivery of the referral flows; it changes no product behavior.

CEO review `GPT-6.1 Sol · 02ca` was returned by the unchanged official picker on main
`3508530aaf046afe3145003feb2306169e617c5d`. Instructions read: `AGENTS.md`, `docs/BRIEF.md`,
`docs/BUILD_CONTINUITY.md`, `docs/PRD.md`, `COLLABORATION.md`, the current queue and decisions through D-414.
The prior single-flight work remains done: PR #1557 added the lock and PR #1625
(`ae57f6cc86bedb62e9474b334235175aa0061eea`) fixed live-PID handling. Neither claimed a linked-worktree test.
D-415 (4)(b), the owner's Nov 28 exception to FIFO, moved this row and PICKER-claim-cost to the top of the queue. The four picker rows sit ahead of all open work, after the four pinned owner-registered rows, in this order: (c) PICKER-dep-about-to-land, (a) PICKER-durable-session, then (b)'s two rows, PICKER-common-dir-lock and PICKER-claim-cost. At registration, it took no active claim.

## Evidence

On that main, `scripts/next-task.mjs:106` builds the run-lock path from
`git rev-parse --git-dir`. A linked worktree's Git directory is its own
`<common-dir>/worktrees/<name>`, so it does not use the main checkout's lock.
`localState` still examines the clone's shared branches/worktrees, and the fetch/claim reads use shared refs.

A throwaway local clone plus `git worktree add --no-checkout --detach` exercised the production
`acquireRunLock` helper at both paths. Canonical paths were resolved with `realpathSync` so macOS's
`/var` and `/private/var` aliases do not produce a false comparison. The observed result was:

```json
{
  "sameCanonicalCommonDir": true,
  "distinctCurrentLockPaths": true,
  "rootAcquired": true,
  "linkedAcquiredWhileRootOwnerAlive": true
}
```

The fixture and its locks were removed. No real picker lock or another session was changed.
The original session's linked-worktree claim exceeded 1,800 seconds after a snapshot refresh and a lost
GROUP-contracts race; a clean standalone clone returned CEO review in about 99 seconds. Those durations
are observations, not a benchmark or proof that lock scope alone caused the slowdown.
Coordination evidence: [source finding](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/811#issuecomment-7228980723)
and [bounded scope](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/811#issuecomment-7229223404).

## Change

1. Resolve the run lock from the repository's **Git common directory**, as an absolute canonical path,
   before any expensive Git/GitHub scan. Main checkout, linked worktrees and symlinked access to that
   clone must select the same `next-task-run.lock`. Do not derive it from `.git` in the working folder.
   An unreadable/unresolvable common directory fails visibly before a scan or marker write; never
   fall back to a second independent lock.
2. Keep the existing atomic acquisition, live-PID rule, dead/unparseable-PID takeover, unreadable-lock
   30-minute mtime fallback and release-on-exit behavior. Never delete or steal a live owner's lock.
3. Preserve `--heartbeat` and `--report` exemptions. Different standalone clones retain separate locks;
   origin's first-push-wins claim remains the cross-clone arbiter. Do not add a host-wide lock, wait loop,
   background scheduler, forced claim, new dependency or new eligibility rule.
4. Handle existing worktree-local locks during cutover: while a live old picker owns one, a fixed picker
   must refuse rather than run beside it, and must not delete that lock. Discover legacy lock locations
   from Git's common worktree metadata, without scanning working folders. Unreadable legacy evidence
   fails closed; a dead legacy PID does not block the new common lock. Acquire the common lock before
   this bounded compatibility check, and release only the lock this run acquired on refusal. This is
   on-disk lock-state compatibility, not an alternate picker or permission to kill old processes.
5. Update the original packet's linked-worktree qualification and the continuity instructions to name
   the actual common-directory boundary and legacy-live-run refusal after verification.

## Owned paths and non-goals

- `scripts/next-task.mjs`: run-lock path resolution, bounded legacy-lock discovery and entry-point cleanup only.
- `scripts/nextTaskSingleFlight.test.ts`: extend the existing real-CLI Git fixtures.
- `docs/plans/PICKER-common-dir-lock.md`, `docs/plans/PICKER-single-flight.md` and `docs/BUILD_CONTINUITY.md`.

No changes to claim markers, FIFO order, task leases, branch cleanup, local-state scanning, auto-land,
GitHub read batching, authentication, environment keys, runtime flags, money, login, legal text or production.
Do not solve all picker performance issues in this row. Existing source owners integrate through normal merges.

## Regression and verification

Write the missing regression before the repair. Reuse the existing fixture's controlled GitHub-read barrier,
not wall-clock speed assertions, external requests or host process counts:

- Start a CLI run in the root checkout and hold it inside its mocked reads; a run in its linked worktree
  must exit 4 with the ordinary live-owner message before a second scan or any marker. Test the reverse
  direction and two sibling worktrees. The new cross-worktree case must fail on the current resolver.
- Symlinked access chooses the same canonical lock. Two independent clones can each acquire their lock.
- A live legacy worktree-local lock refuses the fixed CLI and remains byte-identical. A dead legacy owner
  permits the common lock; malformed/unreadable legacy evidence refuses without changing it.
- Failure to resolve the common directory refuses before network reads or marker writes.
- Normal exit and a thrown failure release this run's common lock; refusal never removes another owner's lock.
- Existing live/dead PID, missing timestamp, unreadable-file age and light-marker exemptions remain covered.

Run the focused single-flight suite and `scripts/nextTask.test.ts` once on the completed change, plus
`pnpm check`. Required exact-head CI is the landing gate (D-370); no independent-review/model gate.
No production deployment or live product mutation is needed for this local CLI correction.

## Risk and acceptance

**9/10 proposal.** Strongest counterargument: changing only the new path would ignore a live legacy
worktree-local owner during rollout, and a global lock would unnecessarily serialize independent clones.
The bounded legacy-live check and separate-clone regression address those cases. The remaining gap is
implementation and real-CLI regression evidence; 10/10 requires those to pass on the exact head.
This does not claim the shared clone will become fast: its expensive local-state scan remains out of scope.

Done only when the real root/worktree CLI scenario proves one active expensive run per common directory,
independent clones remain concurrent, all owned-lock cleanup paths pass, and the protected PR lands green.
Registration and the helper-level reproduction are not implementation acceptance.

## Status

PICKER-common-dir-lock: in progress — GPT-6.1 Sol · 291d — 2026-11-28 — [CEO scope](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/811#issuecomment-7229223404); linked-worktree regressions and runtime repair remain unverified.
