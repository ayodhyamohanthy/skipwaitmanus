# FIX-share-hub-link-ready: goal /share hub never shows the link as ready before it exists

**Row:** D-048 (goal UI foundation) · **Tier:** 1 · **Branch:** `agent/queue/fix-main-eb0fd8cd` · **PR:** #734

## What broke

`main` CI was red on `eb0fd8cd` (run [40467542914](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/40467542914)) and on `dc7f71a8`: one test, `shareHubGoal.test.tsx > goal share hub > opens on the goal with the copy commit once the link is ready`, failed intermittently with `Unable to find an element with the text: /invite=PAL-123/`. Other pushes of the same code passed, so the test was timing-dependent.

## Root cause

`GoalShareHub` started with `loading=false`, so on the first render the share link could be treated as ready before the link actually existed. The fix starts the hub in the loading state and only shows the ready/copy state once the link is real. User-visible rule: never tell the user their link is ready before it exists (honest-status D-153).

## Scope

Only `client/src/pages/goal/seeker-small/GoalShareHub.tsx` and its test. No mechanics, pricing, flags, RELEASED, wording of the reward, or navigation changes. The per-party reward-trigger wording findings stay in D-048-copy-goal-twins-trigger-fix, which waits on this row.

## Completion bar

1. Required CI green on the exact PR head (typecheck incl. scope check, unit/component/route tests, production build; the Workers Builds check is a disabled-integration skip and is never evidence).
2. One independent D-151 review of the exact head by a model other than Claude (the builder is Claude family), routed by the coordinator; the reviewer never merges.
3. A 390x844@2x viewport capture of the goal share hub in the ready state, confirming no visual regression from the loading-gate change.
4. Coordinator lands after both pass; the twins fix then merges main forward on its own branch.
