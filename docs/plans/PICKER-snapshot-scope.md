# PICKER-snapshot-scope: every agent can claim work while other agents are busy

Read docs/BRIEF.md, AGENTS.md and current decisions first.

## Why

Owner, November 21 2026, to this Claude Code session: "check whats blocking, all agents should be able to get work". Sessions reported the official picker exiting with `STOP: authoritative refs kept changing` before any task was assigned, on current main and in clean clones. This is the picker defect D-321 (11) and D-324 ("zero dead ends") say to fix the same day. No decision changes; every eligibility, FIFO, lease, ownership and CI rule stays as it is.

## Root cause

`PICKER-authoritative-ref-refresh` (#1393) made every marker write compare a snapshot of refs taken at the start of the run with origin, just before the push. The snapshot covered every task's work, review, architect and heartbeat refs, any agent ref ending in any task's slug, the report log, the landing slot and `main`. A claim spends minutes between the snapshot and the push (the GitHub reads: open and closed pull requests, CI, release lights). Any change anywhere in that set during those minutes aborted the claim; three aborts in a row ended in the STOP above.

The set changes constantly in normal work:
- other sessions' heartbeats, claims, task-branch pushes and reports;
- every landing on `main` (D-371 auto-land merges green pull requests continuously);
- the claim's own auto-land step, which can update a pull request branch or merge to main between that run's snapshot and its own push.

Measured on origin on Nov 21: about four updates to these refs every ten minutes in a quiet hour, so three consecutive clean windows of several minutes were unlikely, and the chance fell further with every agent added.

## Change (`scripts/next-task.mjs` only)

1. **Scoped comparison.** A write compares only its own inputs:
   - its task's work, review, architect and heartbeat refs, and any agent ref ending in its slug;
   - the shared report log and landing slot (reports can hold lanes, and the slot is shared);
   - red-main fix locks;
   - the refs the write names, and the task-list branch when `NEXT_TASK_LIST_REF` is not `origin/main`.

   Another task's heartbeat, claim or push no longer invalidates the write.
2. **Main by content.** When `main` moved, the write stands only if all of these still hold on current main:
   - the task's row is unchanged;
   - its dependencies' rows are unchanged;
   - its decision sync (`outOfSyncOf`) is unchanged;
   - its branch has not reached main since the decision (landed).

   Otherwise the picker rereads and picks again, as before. A red-main fix claim, which has no task row, still requires main to be exactly unchanged.
3. **Unchanged:**
   - Non-force pushes keep first-push-wins on the written ref itself.
   - Retries stay bounded (three snapshot rereads, six claim races).
   - Unreadable or shallow history still stops with no write.
   - The documented recheck-to-push race is not closed; no atomic multi-ref protocol is added.

## Tests (`scripts/nextTaskAuthoritativeRefs.test.ts`)

Red first: the first two cases below reproduced the exact STOP on unchanged source.
- Another task's heartbeat keeps moving during every GitHub read: task A is claimed, one push, no STOP.
- Main keeps moving with the same tree: task A is claimed from the decided main, one push, no STOP.
- Control (passes before and after): main changes task A's own row (it now depends on W): the picker rereads and claims W, never A.

All 17 earlier cases still pass, including:
- bounded churn on the picked task's own heartbeat still stops with no write;
- a created report-log, landing-slot, review or architect input still forces a reread;
- deleted and new refs, report and heartbeat push retries, unavailable origin and shallow history behave as before.

## Status

- PICKER-snapshot-scope: done in this pull request — Claude Code · d891 — 2026-11-21 — branch `agent/queue/picker-snapshot-scope`. Red-first `4a7ad51e3`, fix `74ceef1de`. All 29 picker and auto-land suites pass locally (524 tests, run without the sandbox proxy variable, which the picker CLI re-executes under). Required CI on the pull request head is the landing gate; a live `--claim` after it lands is the acceptance check.
