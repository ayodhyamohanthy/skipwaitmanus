# LAUNCH-qa-fixes: live-QA findings from release 73be7b31 (D-371)

Status: todo. Row `LAUNCH-qa-fixes`, branch `agent/queue/launch-qa-fixes`, decision D-371 (4). The owner said "go ahead" on Nov 20, 2026.

## 1. Findings (signed-in QA, Nov 20, deploy run 44757175398)

1. **Sample rows.** A verified referrer who has never reviewed and has nothing waiting sees two rows labelled "SAMPLE · NOT REAL REFERRAL REQUESTS" on `/referrer-home`. AGENTS.md says to never ship preview chips or sample data in the product. Fix: show the honest empty state instead.
   - Code: `client/src/pages/goal/referrer-home/GoalReferrerHome.tsx`, `Waiting`, and `showSamples` in `client/src/components/referrer-home/referrerData.ts`.
2. **Shell title.** `/referrer/impact` and `/invite` show "skipwait.me" as the page title in the top bar.
   - Cause: `shellPageTitle` in `client/src/components/goal/useGoalShellMeta.ts` has no entry for them.
   - Fix: add titles for every signed-in route that falls back today: `/referrer/impact`, `/invite`, `/messages`, `/support`, `/premium` and `/agents`.

## 2. Out of scope

The user-facing "ask" wording belongs to `D-180-referral-words` and `D-344-shell-referral-words`, which D-371 moved into the launch block.

## 3. Done means

- Focused tests are written red first.
- `referrerHomeGoal.test.tsx` asserts there are no sample rows and that the empty state shows.
- `useGoalShellMeta.test.ts` covers every route title.
- Captures of `/referrer-home`, `/referrer/impact` and `/invite` at 1280 and 390, from the deployed release, signed in as the reviewer referrer and seeker.
