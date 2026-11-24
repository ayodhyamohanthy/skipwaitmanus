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

## Status

- PICKER-tier1-wording: in progress — DeepSeek V4.1 Flash · 019f — 2026-11-24 — branch agent/queue/picker-tier1-wording
