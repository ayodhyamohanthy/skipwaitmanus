# PICKER-vanished-lock-tip: a lock ref that vanished before the claim falls back to main

| Field | Value |
|---|---|
| Queue row | `PICKER-vanished-lock-tip` in `docs/plans/assignments.json` (status lives there) |
| Tier | 2 (picker claim path; no product, money, sign-in or data change) |
| Lane | `picker-vanished-lock` |
| Branch | `agent/queue/picker-vanished-lock-tip` |
| Decisions | D-321 (11) (an error at the claim is a picker defect, fixed the same day), D-324 (zero dead ends), D-166 (a branch must match a queue row) |

## 1. The crash

A real `--claim` run died with exit 1 and picked nothing:

```
next-task: Error: git rev-parse failed with status 128: fatal: ambiguous argument
'refs/remotes/origin/agent/architect/skippy-auto-send': unknown revision
    at tip (scripts/next-task.mjs:543)
    at claim (scripts/next-task.mjs:764)
```

## 2. Cause

`loadBranches` read the architect lock from the snapshot, so `pick.lockExists` was true. Between that read and `claim()`, another session merged the lock (PR #1510) and a concurrent prune dropped the remote-tracking ref. `tip()` uses `git()`, which throws, so the whole pick failed instead of claiming.

Every session that picked the same row hit the same crash, which is the dead end D-321 (11) and D-324 name.

## 3. The change

`lockTipWith({ exists, tipOf, main })` re-checks the ref with `onOrigin()` and falls back to `origin()` (main) when it is gone, which is exactly what a lock that never existed uses. It is applied to the `unblock`, `architect`/`resync` and `review` claims. The `fix` claim now refuses (`onOrigin` false) instead of claiming from a ref it cannot read.

No allocation, eligibility, exit-code meaning or printed output changes.

## 4. Tests

`scripts/nextTaskVanishedLock.test.ts` 3/3: the vanished ref claims from main, a real lock still takes over, and a snapshot that already said "no lock" still claims from main.

## Status

One line per task (D-134).
- PICKER-vanished-lock-tip: review — agent/queue/picker-vanished-lock-tip — DeepSeek v4.1 Flash · 11c6 — 2026-11-24. Fix and regression test as above; lands on green required CI (D-370).
