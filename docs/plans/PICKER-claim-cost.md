# PICKER-claim-cost: bound the cost of a current, contended claim

Tier 2; lane `picker-claim-cost`; branch `agent/queue/picker-claim-cost`.
Technical follow-through on D-321/D-324/D-412, not a new assignment or landing
policy. D-415 (4)(b) promotes this row with PICKER-common-dir-lock ahead of other
open work, after PICKER-dep-about-to-land and PICKER-durable-session (the owner's
explicit FIFO exception). Status belongs here, not in the shared D-212 plan row.

## Evidence and uncertainty

Official `GPT-6.1 Sol · 9186` CEO-review assignment on main
`3508530aaf046afe3145003feb2306169e617c5d` followed these observed runs:

- The shared checkout's read-only status returned a live single-flight lock;
  the other process was left alone.
- A normal claim in an isolated worktree exceeded its 300-second deadline
  while printing retained local branches/worktrees, before an assignment.
- The unchanged picker in a clean full-history clone exceeded a 900-second
  deadline after a snapshot refresh and losing D-180-referral-words and
  GROUP-contracts claim races.
- One bounded retry under the same identity completed in 847 seconds. It lost
  D-099-bonus-line, GROUP-grants and GROUP-delegation races before assigning
  CEO REVIEW. No task claim was forged and no active holder was overridden.
- Each loaded state reported two unknown merged-branch histories after the
  newest 12 pages of closed PRs. This is evidence of repeated work, not proof
  that those unknown rows were done or the sole cause of latency.

Sanitized coordination receipts:
[initial fallback](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/811#issuecomment-7228712892),
[contention](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/811#issuecomment-7228911965),
[completed CEO assignment](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/811#issuecomment-7229154977).
Raw local transcripts are not publication artifacts.

Inspected `scripts/next-task.mjs`: every claim-race retry calls the complete
`state()` loader again. It refreshes refs, reads PR/CI histories, loads branch
facts and landed evidence, reads release state and reports, then scans local
state. Exact-head CI fallback and red-run job reads are sequential. Which
phase dominates on this host is **unverified**; do not assume network, git,
cache misses or retained worktrees are the cause without phase evidence.

## Contract and approach

1. Attribute elapsed time and reader-call counts to the existing phases using
   a local diagnostic/profiling harness; do not print tokens, URLs with secret
   data, account information or raw subprocess payloads. Record a safe
   before baseline with main SHA, row/ref counts, clone layout, result and
   elapsed time. Never run competing claims in the same clone for timing.
2. Remove the measured redundant work at its owning reader/orchestration
   boundary. Prefer snapshot-keyed reuse for immutable data or a small bounded
   pool for independent reads over a new cache/service/framework. Reuse only
   facts whose identity/freshness is proven; an unknown is not a success.
   Keep diagnostics temporary unless an existing opt-in pattern justifies
   retaining them; remove throwaway scripts after proof.
3. A rival claim still invalidates the affected task snapshot. Refresh that
   task and every required mutable input before re-selection/write. Reuse
   cannot hide a changed decision, row/dependency, main CI, PR head/check,
   report, release hold or holder/heartbeat. The final scoped ref compare and
   first-push-wins remain authoritative.
4. Preserve command results, FIFO among eligible work, unique exact identity,
   session resumption, single-flight, sync-first, six-attempt race bound,
   three-attempt snapshot bound, failed-read behavior and every owner hold.
   Do not avoid the queue by selecting a task manually or weakening its guards.
5. Prove the same claim/preview result and a material measured cost reduction
   on equivalent snapshots/layouts. Publish reader-call/phase evidence as
   well as wall time, so a quieter host is not mistaken for a code improvement.

## Owns

- `scripts/next-task.mjs`
- `scripts/nextTaskCore.mjs` (only the measured claim/state orchestration support)
- `scripts/nextTaskClaimCost.test.ts`
- This packet.

Read the existing branch-scan, merged-history, exact-head, snapshot-scope,
claim-race, network/fetch-retry, single-flight and session-resume tests. If phase
attribution proves the generator is in another module, name its exact path and
ownership in the task plan before changing it; do not add a parallel workaround
inside these paths merely to stay within the initial list. D-370 permits a
justified scope notice, not unrelated refactoring. Coordinate with the active
`PICKER-bug-issues` holder and preserve that change during integration; a shared
filename alone is not a dependency or permission to take its row.

## Verification and acceptance

Add deterministic consumer-visible regressions before the repair. Exercise
an actual rival claim/changed heartbeat between selection and write; decision
and row/dependency/main/PR-head/check/report/release changes invalidate any
reused fact; unreadable evidence remains unknown; exhausted races stop rather
than loop; an unchanged input is not read redundantly where the measured
optimization promises reuse. Use injected readers/counters and isolated git
fixtures, not brittle source-text assertions or wall-clock thresholds.

Run the narrow changed-reader and existing snapshot/claim-race/session/
network/single-flight regressions plus typecheck once afterward. Obtain green
required CI through a protected PR. Finally run one real official picker
claim or preview from an isolated full-history clone on the composed candidate,
with authenticated GitHub reads and safe before/after phase/call evidence.
Name the exact main/head, resulting assignment or stop condition and elapsed
time. No claim-latency improvement is accepted from unit tests or a quieter
server alone. No deployment, schema, dependency, paid service, settings, auth,
product or owner-reserved decision changes.

## Recommendation quality

7/10 pending attribution. Strongest counterargument: a faster reader may reuse
stale mutable facts and assign another session's work. The scoped final compare,
identity-keyed reuse and mutation/unknown controls are mandatory defenses.
What closes the gap to 10/10: measured root-phase attribution, deterministic
freshness/cost regressions and a successful current-origin run under contention;
until then no root cause, speedup or productive pickup is claimed.

## Status

PICKER-claim-cost: GPT-6.1 Sol · 2269, 2026-11-28 — took over two empty prior markers; integrated main 510547f2a at branch [a424801b7](https://github.com/ayodhyamohanthy/skipwaitmanus/commit/a424801b793ccf5ff96878e578ac229cf3367b27); phase attribution, repair and before/after proof remain unverified.
