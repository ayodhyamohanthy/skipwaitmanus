# Packet P0-goal-shell-sign-out: the goal shell's account avatar opens the account menu

Row `P0-goal-shell-sign-out` (Tier 1, sign-out). Ruling: D-412 (6). P0 under D-019: fix, verify live, report.

## 1. The defect
On every page that renders `GoalAppShell` (`/explore`, `/explore/:company`, `/requests`, `/ask`, `/inbox`, the seeker and referrer conversation views, `/post-opportunity`, the assistant connect route), the bottom-left avatar on desktop and the top-left avatar on phones is a `<button aria-label="Account menu">` with no handler. `GoalAppShell` passes `account={{ initials }}` and no `menu`, so `GoalShell`'s `AccountSlot` falls back to the inert `Avatar`. A signed-in person cannot open the account menu or sign out. Owner report, Nov 27: "https://skipwait.me/explore im unable to logout the bottom left profile dp is not functional".

## 2. The change
`client/src/components/goal/GoalAppShell.tsx`: when signed in, pass `menu: <AccountMenu />` (the same menu `client/src/components/AppShell.tsx` renders on every other shell route: notifications, messages, requests, settings, language, referrer items, Sign out with `clearPrivateReferralBrowserData()` then `signOut()`). Signed out stays as today (no avatar, language picker shown). Nothing else changes.

## 3. Tests
`client/src/components/goal/goalAppShell.signOut.test.tsx`: signed in, the avatar opens a menu with "Sign out"; choosing it clears private browser data and calls the session sign-out once; signed out, no account button renders.

## 4. Owns
`client/src/components/goal/GoalAppShell.tsx`, `client/src/components/goal/goalAppShell.signOut.test.tsx`, this packet; and, because the account menu now renders on goal pages: `client/src/test/goalPagesBoundary.test.ts` (AccountMenu and NotificationBell audited as goal-styled), `client/src/test/goalShellHarness.tsx` (stubs the bell so the harness stays network-free), `client/src/pages/myRequests.goal.test.tsx` and `client/src/pages/myRequests.pendingStates.test.tsx` (stub the menu so their fetch counts stay their own).

## 5. Done when
Required CI green; after deploy, a signed-in session on skipwait.me opens the menu from the avatar on `/explore` at 1280 and 390 and signs out.

## Status
