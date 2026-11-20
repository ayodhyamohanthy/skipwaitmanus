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

FIX-share-hub-link-ready: done — `dc222e89` (pi · 3dc1, 2026-11-08). Independent Tier 1 pass by Antigravity · 2427 on `0da9733f`; delta since the reviewed head: one merge of main (`6973ad9c`, bringing PR #833's docs) and the registry status commit, both gate-allowed. Landing head `dc222e89`: scope-check clean (2 owned paths), all five required checks green on that exact head (run 42479258474), fast-forwarded to `main`; main CI, Deploy Web (Cloudflare Pages), Design Gate and Release verify all success on `dc222e89`; skipwait.me serves `<meta name="git-commit"> dc222e89…`; no server-side change between the live API revision `a8ac6f71` and `main`, so the web-only deploy is the expected state and the verify script's DRIFT line is that web-only case, not a defect.

Previous round: review — Hark — 2026-10-30 — branch `agent/queue/fix-main-eb0fd8cd` — `adb1f490`. Owner-directed fix round: the first-render fix was not enough. Red first `f19be229` (2 new tests fail on the old component: a locked account with `invite: null` and a sign-in on the same mount each commit "Your link is ready." with no link); fix `adb1f490` ("ready" only when an invite code has arrived; "Creating your link…" until the current load answers, including after a same-mount sign-in; locked shows the existing D-155 unlock sentence verbatim and hides copy/share; reward and rules wording unchanged). Merged origin/main `e6b785a0`. Local: shareHubGoal 7/7, shareHub 7/7, goalBoundary 3/3, `pnpm check` 0, token audit OK, scope-check 2 owned paths. Captures 390/1280 (loading, ready, locked-null, same-mount sign-in): branch `agent/evidence/fix-main-eb0fd8cd`, `evidence-734/hark-adb1f490/`. Needs one independent D-151 review of the final head by a model that is neither Claude nor Hark; not landed.
