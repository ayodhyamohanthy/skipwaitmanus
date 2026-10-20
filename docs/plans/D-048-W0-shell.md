# Packet W0: the goal shell replaces the kit shell (frame only, no page bodies)

> Read `docs/BRIEF.md`, then `docs/plans/D-048-phase-3-rollout.md` (this is its W0). Phase 2 is
> live; this is the first build. It changes the frame of every shell-wrapped route and touches no
> page body.

| Field | Value |
|---|---|
| Queue row | §3b `D-048` (phase 3, W0) |
| Decisions | D-048, D-070, D-071, D-077, D-063, D-033 |
| Risk tier | 2 (UI only; no money, no auth, no schema) |
| Branch | `agent/<model>/d048-w0-shell` |
| Depends on | phase 2 live (`GoalShell`, `nav.ts`, `--g-*`, `DESIGN.md`, token audit) |
| Blocks | every W1–W7 surface: the comps are drawn inside this shell |

## 1. Why this is first, with the numbers

- **26 of the 70 routes** in `client/src/App.tsx` are wrapped in `<AppShell>`; one frame change
  reaches all of them, and the other 44 are public/legal/employer surfaces that W7 owns.
- **The nav model already disagrees with an approved decision.** Today `AppShell.tsx:18-23` reads
  Explore · Requests · Inbox · Refer. D-070 records Find · My asks · Inbox, plus Referral queue for
  a verified referrer, with Impact as a quiet link (D-077). This is drift, not taste.
- **`GoalShell` is built, tested and imported by nothing.** `client/src/components/goal/` has 24
  primitives, `nav.ts` holds `GOAL_NAV` + `goalNavFor`, and `goalBoundary.test.ts` pins "nothing
  live imports this barrel" — a pin that exists to be broken by exactly this packet.
- **Doing a page before the shell draws it inside the wrong chrome.** `design/goal-ui/pick/*.html`
  are drawn at the goal rail width (88px) and top bar (52px); the kit shell has a wider sidebar and
  a different top bar. W1 without W0 means drawing twice.

## 2. Target behaviour

1. `AppShell` renders `GoalShell` and keeps its own export name, so the 26 call sites do not change.
2. `active` comes from the pathname: `/explore*` → `find`, `/requests*` → `asks`, `/inbox*` → `inbox`,
   `/queue*` and `/referrer-home*` → `queue`. A path that matches none renders no active item.
3. `verifiedReferrer` comes from `useReferrerAccess()` (the shared verified-referrer predicate,
   never the sign-in account's emails).
4. `credits` starts as `null` (the pill renders nothing). Wiring it to `/api/credits/summary` is a
   follow-up, not part of the frame: a wrong balance is worse than no balance.
5. `account.initials` from the signed-in user; the existing `AccountMenu` becomes the avatar's menu.
6. **Nav vocabulary follows D-070** (Find a referral · My asks · Inbox · Referral queue). This is
   the only user-visible copy change in the packet.
7. `/referrer-home` stays reachable from the account menu for a verified referrer, so no page is
   stranded when "Refer" leaves the primary nav.
8. The kit shell's "More" destinations (`/help`, `/assistants`, `/for-companies`) move into the
   account menu. They must remain reachable: a nav change that hides a page is a regression.
9. The money sentence (D-063) stays visible somewhere in the frame — the comp puts it on the plans
   surface, not the shell. **Owner call, see §5.**

## 3. Files

- **In scope:** `client/src/components/AppShell.tsx`; `client/src/components/goal/GoalShell.tsx`
  (only if a prop is missing — `items` is the likely one); `client/src/components/goal/nav.ts` if a
  destination mapping is needed; `client/src/components/AccountMenu.tsx` (the moved links);
  `client/src/components/goal/goalBoundary.test.ts` (its "nothing live imports this barrel" pin);
  the tests that pin `SHELL_TABS`.
- **Out of scope:** every page body. No `client/src/pages/*` file changes in W0.

## 4. Acceptance

- [ ] Every shell-wrapped route renders inside `GoalShell`; no route 404s or loses its page.
- [ ] Nav is correct for three viewers: signed out, signed-in seeker, verified referrer.
- [ ] `/help`, `/assistants`, `/for-companies`, `/profile`, `/work`, `/plans`, `/referrer-home` are
      all reachable from the new frame.
- [ ] Captures at **1280 and 390** for: `/requests`, `/explore`, `/queue`, `/settings` — one per
      rail state, plus one phone.
- [ ] `node scripts/design-token-audit.mjs` clean; `goalBoundary.test.ts` updated with the reason.
- [ ] `pnpm check`, the client suite, `pnpm build`.
- [ ] No page-level CSS removed in this packet (the kit classes stay until each page moves, W1+).

## 5. The three calls this packet cannot make for you

1. **Nav vocabulary.** Adopting D-070's labels (Find a referral · My asks · Inbox · Referral queue)
   changes copy users see today (Explore · Requests · Inbox · Refer). Recommended: adopt, because
   the comps and the decision both say it and the current labels are the drift.
2. **`/referrer-home`.** Today "Refer" is a primary tab. D-070's nav has no slot for it. Recommended:
   account menu, because the primary tab should be the queue (where the work is) and the cockpit is
   a place you visit, not a place you live.
3. **Where the money sentence lives.** Today the kit sidebar carries it. The comp puts it on
   `/plans`. Removing it from the frame is a D-063 decision, not a layout one. Recommended: keep it
   in the frame until W3 moves `/plans` and proves the sentence is where a seeker actually sees it.

## 6. Stop and ask if

- Any route loses a destination in the swap (that is a regression, not a design choice).
- `GoalShell` needs a prop that changes its phase-2 contract in more than an additive way.
- A page body needs a change to fit the new frame — that page moves in its own wave instead.
