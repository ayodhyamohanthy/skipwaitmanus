# PICKER-claim-race-reread: a lost claim race re-picks instead of spending the snapshot rereads

Read `docs/BRIEF.md`, `AGENTS.md` and current decisions first.

## Why

D-324 ("zero dead ends") and D-321 (11) say a session that reports an error at the claim or the
same task on every retry is a picker defect to fix the same day. Measured on 2026-11-24 with five
or more sessions claiming at once: `node scripts/next-task.mjs --claim` ended twice in
`STOP: authoritative refs kept changing` after three whole snapshot rereads (~45 and ~36 minutes)
without an assignment. The second run then failed closed on GitHub reads under host load.

## Root cause

`requireCurrentRefs` throws `RefSnapshotChanged` when any scoped ref moved between the snapshot and
the write. For a claim, the scope includes the picked task's own work branch. When a rival session
claims that task first, the branch moves, the throw escapes the six-claim loop, and the outer
three-attempt loop re-runs the whole command — including every GitHub read — on the same task. Three
such races end in STOP even though other tasks are free.

## Change (`scripts/next-task.mjs` only)

- `RefSnapshotChanged` carries the scoped refs that moved.
- When the picked task's own work branch is among them, the claim loop treats it as a lost race and
  re-picks inside the same bounded six-claim loop.
- Every other moved ref keeps the existing three-reread stop, so a task whose own heartbeat or lock
  keeps moving still ends in STOP with no write.
- Non-force pushes (first-push-wins), main-by-content, the shared report/landing inputs and every
  eligibility rule are unchanged.

## Tests (`scripts/nextTaskAuthoritativeRefs.test.ts`)

Red first: "treats a rival claim on the picked task as a lost race, not a snapshot abort" fails on
unchanged source (the snapshot-abort path runs, no "another agent claimed A first") and passes with
the change. The existing bounded-churn STOP case still passes. The fixture's `repeat` mutation now
seeds a missing ref from `head` instead of throwing, so a rival claim can be simulated on a branch
that does not exist yet.

## Status

- PICKER-claim-race-reread: todo — branch `agent/queue/picker-claim-race-reread` — synced to D-383.
  Red-first and fix in one commit; required CI on the pull request head is the landing gate. The
  host was at load average ~774 with 57 concurrent picker processes, so the full 29-case suite hit
  Vitest's 20s per-test timeout locally (16 timeouts, no assertion failures); the two focused runs
  completed normally and CI runs the full suite.
