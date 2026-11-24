# PICKER-single-flight: many concurrent picker runs starve each other (D-324, D-321 (11))

## The defect, measured (Nov 24, 2026, ~17:00 IST)

The picker has **no concurrency guard**. Any number of runs execute at once in the same clone, and
each run is heavy: it parses the full `assignments.json`, scans every local worktree, makes about
140 GitHub reads and runs many `git` operations. Measured on the owner's Mac:

| Measurement | Value |
|---|---|
| Concurrent `next-task.mjs` processes | **114** |
| Oldest run | **2 h 56 min**, still running |
| Runs from one model label (`DeepSeek V4.1 Flash`) | **~31** |
| Host load average | **624 – 1006** (1-, 5- and 15-minute) |
| My own `--claim` runs | 75 min and 17 min, neither completed |

`sample` on a 2-hour-old run shows it inside `uv__run_timers` -> `Function::Call`, i.e. **actively
running JavaScript**, not deadlocked. The run is not stuck; the machine is so oversubscribed that a
20-minute operation takes hours, and every run's snapshot protocol sees the other runs' writes,
which produces the churn STOP:

```
next-task: snapshot changed (attempt 1); refreshing and rereading before any further write
next-task: STOP: authoritative refs kept changing; run again for a fresh decision
```

Consequences: sessions cannot pick work at all (five consecutive failures of my own before this),
the machine is unusable for every other purpose, and each hung run keeps contributing.

**Not covered by an existing row.** `HYGIENE-picker-bootstrap` (fresh-clone modules and shallow
history) and `PICKER-session-worktree` (per-session working folders) are both active, neither packet
mentions concurrency, and neither stops a second, fifth or hundredth run in the same clone.

## Proposed change (for the builder; changeable)

A **per-clone single-flight lock** in `scripts/next-task.mjs`:

1. Before any GitHub or Git read, atomically create `.git/next-task-run.lock` (`openSync` with `wx`)
   holding `{ pid, startedAt }`.
2. A run that finds the lock and whose recorded pid is **alive** prints one plain line
   (`another picker run is in progress on this clone; wait for it, or rerun in a minute`) and exits
   with the existing WAIT code (4), writing no marker. It does not queue, so no pile-up can form.
3. A **stale** lock (recorded pid dead, or older than 30 minutes) is taken over, so a crash cannot
   block the clone forever.
4. The lock is released on every exit path, including `fail()` and an uncaught throw.

Bounds: this governs one clone only. Two clones still race, which is correct (the claim ref is the
real arbiter) and already tested by the ownership suites.

## Red-first tests (`scripts/nextTaskSingleFlight.test.ts`, new)

- Two simultaneous CLI runs against one fixture clone: exactly **one** reaches `NEXT:`; the other
  exits 4 with the plain message and writes no marker.
- A lock whose pid is alive refuses; the same lock with a dead pid is taken over.
- A lock older than the takeover age is taken over even when its pid looks alive (pid reuse).
- The lock file is gone after a normal exit, after a WAIT exit and after a `fail()` STOP.

## Verification

`pnpm check`, the focused suite, `scripts/nextTask.test.ts` and the other picker suites,
`pnpm build`, design-token audit, migration lint, deploy-trigger checks; exact-head required CI is
the landing gate (D-370).

## Owns

- `scripts/next-task.mjs` (the lock helpers and the entry point only)
- `scripts/nextTaskSingleFlight.test.ts` (new)
- `docs/plans/PICKER-single-flight.md` (this packet)
- `docs/plans/assignments.json` (this row)

## Status

- PICKER-single-flight: registered — Qoder · 3f21 — 2026-11-24
