# PICKER-fetch-retry: one dropped Git fetch must not stop every session (D-324, D-321 (11))

## The defect, measured

Same class as `PICKER-network-retry` (PR #1503), on the run's **first** network step.

`refreshAuthoritativeRefs()` calls the authoritative ref fetch **once**:

```
tryGit("-c","fetch.pruneTags=false","-c","remote.origin.pruneTags=false","fetch","-q",
       "--prune","--no-tags","--refmap=","origin", ...refspecs)
```

If that single call returns `null`, the picker prints

```
next-task: STOP: authoritative ref refresh failed; check origin access and run again; no marker written
```

and exits 2 without picking anything. Observed on this host right after PR #1503 landed:
replaying the **exact** same fetch by hand succeeded in **11.7 s**, so the failure was
transport (the same proxy that drops about one GitHub read in sixty), not permission.
Every read-level retry added by #1503 is downstream of this step, so it could not help.

## What changes

`scripts/next-task.mjs`:

1. `FETCH_ATTEMPTS = 3` and `fetchAttemptsFor(failed, attempts)`, both exported so the bound is
   testable without a network.
2. `fetchWithRetry(args)` runs the authoritative fetch up to `FETCH_ATTEMPTS` times with a short
   linear wait (500 ms, then 1 s) between attempts.
3. `refreshAuthoritativeRefs()` uses it. **Everything after stays exactly as it was:** when every
   attempt fails the same `fail(..., 2)` STOP prints, with the same message and exit code, so
   "unknown stays unknown" and nothing is claimed or pushed.

Not changed: the refspecs and prune flags, every other Git read, the GitHub read retry from
#1503, writes, ownership, `--status`, report semantics, and all product code. The other two
`fetch` call sites (`mainInputsUnchanged`, `reportParentFor`) are deliberately left alone: both
already treat a failed fetch as "snapshot changed, reread", which is the correct behaviour and is
covered by their own suites.

## Red-first tests (`scripts/nextTaskFetchRetry.test.ts`)

The suite drives the **real picker CLI** against a real bare origin, with a preload that makes the
first N `git fetch` calls fail with a transport error (`syncBuiltinESMExports` is required, or the
named ESM binding is not patched and the test passes vacuously).

- **Retries and finishes:** with the first fetch failing, the run does not print the STOP and
  reaches `NEXT:`; the mock's fetch log shows **at least 2** fetches.
- **Still fails closed:** with every fetch failing, the STOP prints, the exit code is 2, and
  exactly `FETCH_ATTEMPTS` fetches were attempted.
- **The policy:** `fetchAttemptsFor` is bounded and never exceeds `FETCH_ATTEMPTS`.

Mutation check: with `scripts/next-task.mjs` reverted to `origin/main`, all **3 of 3** tests fail;
with the fix they pass. This is why the earlier draft of this suite was discarded: without
`syncBuiltinESMExports` it passed under both implementations, which is a vacuous guard.

## Verification

- `scripts/nextTaskFetchRetry.test.ts` 3/3 green with the fix, 3/3 red without it.
- `pnpm check`, `pnpm build`, design-token audit, migration lint, deploy-trigger checks.
- Exact-head required CI is the landing gate (D-370).

## Owns

- `scripts/next-task.mjs` (`refreshAuthoritativeRefs` and the fetch helpers only)
- `scripts/nextTaskFetchRetry.test.ts` (new)
- `docs/plans/PICKER-fetch-retry.md` (this packet)
- `docs/plans/assignments.json` (this row)

## Status

- PICKER-fetch-retry: done — 1518 merged; row stamped done. Code and its red-first suite verified on main (`scripts/next-task.mjs`).
