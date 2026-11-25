# PICKER-tier1-wording: Tier 1 hand-outs say what D-370 says, land on green required CI (D-389)

Tier 2 · lane `picker-tier1-wording` · branch `agent/queue/picker-tier1-wording` · epic D-212

## The defect

D-370 (owner, Nov 20): green required CI alone lands every pull request at every tier, with no independent
review. The picker still prints, for Tier 1 builds (`scripts/nextTaskText.mjs`, the `task.tier === 1`
branches near lines 51 and 106 on `b6e07c27`):

- "open a DRAFT pull request ... Never land it yourself: `next-task.mjs` hands the review to a different session."
- "Tier 1: once green, set ... to review ... and stop; ... hands the review to a different session."

On Nov 24, builders of `BANDED-catalog-family` and others had to override this text by instruction; a
builder following it literally parks Tier 1 work in draft waiting for a review that never comes.

## The fix (technical correction implementing D-370)

1. Tier 1 hand-out text matches Tier 2/3: push, open the pull request, mark it ready, turn on auto-merge
   (merge commit), and land on green required CI; set the status to done in the same pull request.
2. Check `scripts/nextTaskCore.mjs`: if a Tier 1 path still routes a review stage that contradicts D-370
   (for example `needsReview` and the `tier1` hand-outs), align it with D-370 only where it does; if
   `PROCESS-no-review-no-model` already made it inert, change only the text and say so here.
3. No change to claims, locks, red-main handling, money/sign-in safety checks or required CI.

## Tests (red first)

`scripts/nextTask.test.ts` (or a focused `scripts/nextTaskTier1Text.test.ts`): a Tier 1 build hand-out
contains no "DRAFT", no "different session" and names auto-merge on green required CI.

## Acceptance

Picker suites and `pnpm check` green; required CI green.

## What changed (Nov 24, DeepSeek V4.1 Flash · 019f)

- `scripts/nextTaskText.mjs`: the `task.tier === 1` branches of the build/resume hand-out and of the
  make-green hand-out are gone, so every tier prints one landing instruction. That instruction now names
  marking the pull request ready and turning on auto-merge (merge commit) before waiting for green
  required CI. The D-235 handoff to the next eligible task is kept for every tier.
- `scripts/nextTaskCore.mjs`: **unchanged, because the review routing is already inert.** `needsReview` is
  `INDEPENDENT_REVIEW_REQUIRED && reviewNeeded(...)`, and `scripts/sessionPolicy.mjs` sets
  `INDEPENDENT_REVIEW_REQUIRED = false` unless `SKIPWAIT_LEGACY_REVIEW_RULES=on`, which only the test run
  sets (`vitest.config.ts`). No Tier 1 path routes a review stage in production; only the printed text
  contradicted D-370.
- `scripts/nextTask.test.ts` and `scripts/nextTaskReviewWording.test.ts`: the two assertions that pinned the
  superseded draft-and-wait wording now pin the D-370 landing instruction. The second file was not in this
  row's `owns`; it is added there in the same pull request, because a test that pins superseded wording has
  to move with the correction.
- `docs/DELEGATION.md` §4 step 7: the Tier 1 "open a draft pull request ... and stop" bullet is replaced by
  one rule for every tier (D-370), and its stale "fast-forward main" wording becomes the merge-commit
  button D-082/D-200 require.

## Status

- PICKER-tier1-wording: done — a2e8acece30cc4c051aae73415810fc14566f83d (PR #1564, merged Nov 24 2026; required CI green, local `pnpm check` exit 0)
