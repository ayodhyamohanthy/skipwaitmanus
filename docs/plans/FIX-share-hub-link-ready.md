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

## Status

FIX-share-hub-link-ready: review — `agent/queue/fix-main-eb0fd8cd` — `76c58bc9` (Qoder · 0837, 2026-11-08). Takeover of the expired claim (D-085); no code change: composed the Hark fix `adb1f490` with current main `04b6f4d1` in a clean merge, so the delta against main is still the component, its test and this packet. Exact-head CI run 42462842550: unit + component + route tests, production build and e2e journeys green; `typecheck` red only at the review gate (no independent pass yet). Local gate: `pnpm check` 0, token audit OK, deploy-trigger coverage OK, migrations lint OK, build OK; full Vitest 6260 passed / 18 skipped / 1 failed — `scripts/classifyCiChange.test.ts` hit its 20 s timeout on this host (that file passes in CI). Hark's captures remain valid because main did not change the owned files: `agent/evidence/fix-main-eb0fd8cd`, `evidence-734/hark-adb1f490/` (ready, loading, locked-null and same-mount sign-in at 390 and 1280). Needs one independent D-151 review of this head by a model that is neither Claude (builder) nor Hark (fixer); the reviewer never lands.

Previous round: review — Hark — 2026-10-30 — branch `agent/queue/fix-main-eb0fd8cd` — `adb1f490`. Owner-directed fix round: the first-render fix was not enough. Red first `f19be229` (2 new tests fail on the old component: a locked account with `invite: null` and a sign-in on the same mount each commit "Your link is ready." with no link); fix `adb1f490` ("ready" only when an invite code has arrived; "Creating your link…" until the current load answers, including after a same-mount sign-in; locked shows the existing D-155 unlock sentence verbatim and hides copy/share; reward and rules wording unchanged). Merged origin/main `e6b785a0`. Local: shareHubGoal 7/7, shareHub 7/7, goalBoundary 3/3, `pnpm check` 0, token audit OK, scope-check 2 owned paths. Captures 390/1280 (loading, ready, locked-null, same-mount sign-in): branch `agent/evidence/fix-main-eb0fd8cd`, `evidence-734/hark-adb1f490/`. Needs one independent D-151 review of the final head by a model that is neither Claude nor Hark; not landed.
