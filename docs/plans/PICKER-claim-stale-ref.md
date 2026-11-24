# PICKER-claim-stale-ref: a claim re-picks when its branch vanished, instead of crashing (D-324, D-321 (11))

## The defect, measured

`claim()` decides a marker's parent from the pick's snapshot (`pick.lockExists`, `pick.work`), but the
snapshot is taken **before** the run's GitHub reads and the local-state scan. Another session's merge
can delete the branch on origin in between, and then `tip()` runs `git rev-parse` on a ref that no
longer exists.

Observed on 2026-11-24 in this clone, `--claim "DeepSeek V4.1 Flash · ce78"`:

```
next-task: Error: git rev-parse failed with status 128: fatal: ambiguous argument
'refs/remotes/origin/agent/architect/skippy-auto-send': unknown revision or path not in the working tree.
    at readGitOutput (scripts/provenanceGitOutput.mjs:49:11)
    at tip (scripts/next-task.mjs:543:21)
    at claim (scripts/next-task.mjs:764:75)
EXIT=1
```

The sequence is exact: the snapshot listed the architect lock, PR #1510 merged
(`a561edfa5`), the branch was deleted on origin, and the claim then threw instead of re-picking.
The same run had already printed `snapshot changed (attempt 1)` — the protocol detected the change
but the write path still trusted the stale boolean.

## What changes

`scripts/next-task.mjs`:

1. `claimParentOf(name, { onOrigin, tip, origin, required })`, exported and pure: the parent is the
   branch tip **when the ref is on origin now**, `origin/main` when a lock is gone (a fresh claim),
   and `null` when a work branch is gone and the pick is therefore stale.
2. `claim()` uses it for every marker:
   - `takeover` / `green`: a missing work branch returns `false`, so the run re-picks.
   - `land`: both parents are resolved **before** the landing slot is taken, so a stale pick never
     leaves a half-taken slot.
   - `unblock` / `architect` / `resync` / `review`: a lock that is gone is a fresh claim from main,
     and the marker verb is `Claim` (not `Takeover`), read from the refs at write time.
   - `fix-main` / `fix`: a missing parent returns `false` and the run re-picks.
3. `pick.lockExists` is no longer read for a parent or a marker verb; it stays in the pick for the
   printed text only.

Not changed: the snapshot protocol, the retry bounds, `pushMarker`, ownership, `--status`, report
semantics, and every product file.

## Red-first tests (`scripts/nextTaskClaimParent.test.ts`)

- A ref on origin yields its tip.
- A lock deleted after the snapshot yields `origin/main` (fresh claim), never a crash.
- A work branch deleted after the snapshot yields `null` (stale pick), never an invented parent.
- `tip()` is never called for a ref that is not on origin — the exact call that threw status 128.

## Verification

- `scripts/nextTaskClaimParent.test.ts` 4/4 green; `scripts/nextTaskNetworkRetry.test.ts` 5/5 green.
- Exact-head required CI is the landing gate (D-370).

## Owns

- `scripts/next-task.mjs` (`claimParentOf` and `claim()` only)
- `scripts/nextTaskClaimParent.test.ts` (new)
- `docs/plans/PICKER-claim-stale-ref.md` (this packet)
- `docs/plans/assignments.json` (this row)

## Status

- PICKER-claim-stale-ref: in progress — DeepSeek V4.1 Flash · ce78 — 2026-11-24 — branch agent/queue/picker-claim-stale-ref
