# PICKER-network-retry: one dropped GitHub read must not stop every session (D-324, D-321 (11))

## The defect, measured

On the owner's Mac, the picker's GitHub reads go through a local HTTPS proxy. A probe of 60
sequential, identical reads of the exact URL the picker uses
(`/repos/ayodhyarammohanthy/skipwaitmanus/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=10`)
returned **59 successes and 1 `TypeError: fetch failed` with `cause=ECONNRESET`**. The same URL
answered HTTP 200 on 3 of 3 direct `curl` calls run a few minutes apart.

`scripts/next-task.mjs` `github()` had **no retry**. A run makes about 140 reads, so the
probability of at least one reset is high, and one reset produced:

```
next-task: fetch failed
NEXT: STOP
cannot read main's CI runs from GitHub; nothing may be picked or pushed until it is known (D-082)
```

That happened on **five consecutive `--claim` runs** (one also stopping at
`authoritative ref refresh failed`). Each run burns 15-25 minutes on this host before stopping,
and the session picks no work at all. D-324 says: "If a session reports WAIT, an error at the
claim, or the same task on every retry, treat it as a picker defect: reproduce it with
`node scripts/next-task.mjs --as "<name>"` and fix it the same day."

Fail-closed is correct and stays. What was wrong is that a *transient transport failure* was
treated as an *answer*: the picker never asked a second time, so a reset that a single retry
would have absorbed silently stopped every lane the session could have taken.

## The ruling applied

- **D-082 / D-085:** "nothing may be picked or pushed" while main's CI is unknown. A read that
  fails on every attempt must still stop the picker. This change keeps that exactly: after the
  bounded attempts the same error propagates and the same STOP prints.
- **D-324 / D-321 (11):** an error at the claim is a picker defect, reproduced and fixed.
- **D-087 / D-009:** workers must not idle. Five stopped runs are lost capacity.

## What changes

`scripts/next-task.mjs`:

1. `GITHUB_READ_ATTEMPTS = 3` (one attempt plus two retries) and
   `isTransientGithubFailure(error)`, both exported so the regression can test the policy itself.
2. `github()` wraps its single `fetch` in a bounded loop:
   - **Retried:** a transport failure (`TypeError: fetch failed`, e.g. `ECONNRESET`, `EAI_AGAIN`)
     and a `5xx` or `429` answer, with a short linear backoff (400 ms, then 800 ms).
   - **Never retried:** any `4xx` (a real answer: bad token, missing route, forbidden), the
     caller's own `AbortError`, and the 15 s `TimeoutError`. A slow GitHub therefore cannot turn
     into a 45 s stall on every one of a run's ~140 reads.
   - The error thrown after the last attempt is the same error as before, so every existing
     `catch` in the picker behaves identically.
3. `githubWrite()` is **not** touched. Writes are governed by the picker's own snapshot protocol
   (a rejected write is a real answer and is handled there); retrying a write blindly could push
   twice.

No change to: which reads are made, what counts as main CI green, the fail-closed STOP, branch
protections, auto-land, claim ownership, `--status`, report semantics, or any product code.

## Red-first tests (`scripts/nextTaskNetworkRetry.test.ts`)

Red: 5 of 5 failed with `GITHUB_READ_ATTEMPTS` / `isTransientGithubFailure` / `github` missing
from the module's exports.

Green, pinning:

- the policy: `ECONNRESET` and `EAI_AGAIN` transport failures, `502` and `429` retry; `400`,
  `401`, `403`, `404`, `410`, `422`, `AbortError`, `TimeoutError` and a non-Error do not;
- `GITHUB_READ_ATTEMPTS === 3`;
- the **real** `github()` returns its answer after one `ECONNRESET` (two fetch calls, resolves
  with the body);
- when every attempt fails, it rejects with the original error after exactly
  `GITHUB_READ_ATTEMPTS` calls, so "unknown" stays unknown and the STOP still fires;
- a `404` is called once and never repeated.

## Verification

- `scripts/nextTaskNetworkRetry.test.ts` 5/5 green.
- The other picker suites (`nextTask`, `nextTaskAuthoritativeRefs`, `nextTaskBlockDedupe`,
  `nextTaskPacketFindingsExit`, `modelProvenance`) green on this branch: they drive the real CLI
  against fixture origins, so they exercise the changed read path end to end.
- `pnpm check`, `pnpm build`, design-token audit, migration lint and deploy-trigger checks.
- Exact-head required CI is the landing gate (D-370).

## Owns

- `scripts/next-task.mjs` (`github`, the new exports and helper only)
- `scripts/nextTaskNetworkRetry.test.ts` (new)
- `docs/plans/PICKER-network-retry.md` (this packet)
- `docs/plans/assignments.json` (this row)

## Status

- PICKER-network-retry: done — 1503 merged; row stamped done. Code and its red-first suite verified on main (`scripts/next-task.mjs`).
