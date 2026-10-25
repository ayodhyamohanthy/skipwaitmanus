# Whole-platform goal-design coverage and quality brief (Oct 25, 2026)

Scope anchors (owner, iMessage, Oct 25):
- "The ui of pages are not redesigned as per goal focused design so push that to repo" (phonemsg-01M5STDB8BJW12X5Y4HF8EHZV3)
- "Entire platform should only have goal focused design" (phonemsg-01M5STEZ4F7S410PFJ6ASSS43Y)
- "Not reskinning" (phonemsg-01M5STFBWMKPCM7AZ2ERKZC5XS)
- "A proper goal focused ui and ux" (phonemsg-01M5STFM8C562Z826QDRP8VGYR)

Reading of the mandate: every page, role, and state redesigned around what the
person is trying to accomplish (what they see first, what they need to know, the
one next action, how they finish). Not new colours or components on old layouts.
Frozen product rules and working payment/auth functionality are preserved.

## 1. What counts as goal-focused (frozen bar, D-048 / DOCTRINE)

A page passes only if it is restructured, not restyled:
- Goal line in the person's own words at the top.
- One next step in a bordered block with one black commit.
- Honest status and cost before every ask.
- GoalStates for loading, empty, error, offline; no dead kit states.
- Dot + text status (no pills), mono numerals, blue #1D4ED8 only as verified
  mark (dark: #60A5FA), zero colour literals, zero kit imports.
- Captures at 1280 and 390 reviewed before merge; real journey completion
  proof (desktop + 390) before calling the page complete.

A token swap or component overlay on the old layout fails this bar by
construction and is rejected at review.

## 2. Coverage today (main @ 216066dd, Oct 25)

Production renders goal-focused UI on 1 of 45 declared surfaces: home (V9
landing). Every other route serves legacy kit pages. This is the gap the owner
is looking at.

- Merged in main, goal-structured, gated OFF in production (goalSurfaceOn, not
  in RELEASED): sign-in (GoalSignIn), ask, explore, explore-company, inbox,
  requests, post-opportunity. Release = adding the id to RELEASED; #592 queues
  releases R1/R4 and unblocks four held rows.
- Open implementation PRs (16): queue #565, live-review find/queue/
  conversations #566, inbox #569, start #570, onboarding #571, share/suggest/
  landed #572, alerts #573, referrer+impact #575, referrer-home+setup #576,
  invite #577, email-review #579, assistants lane #563, BYOR #632, pricing
  #666 (frozen banded display), device sign-in prefill #655, agent/queue/
  landing #625.
- Registered with an owner row, no design or implementation yet (#656 packets,
  open): money (plans, premium, pricing), auth (verify, signin), account
  (settings, profile, alerts, messages, support), admin (6 rows), employer
  (4), public (policy/system/links), marketing (home-signed-in, discovery,
  public-profile).
- No comp, no packet row beyond registration: skippy; per-page dialogs and
  non-GoalStates on legacy pages.

## 3. Flow vs reskin assessment of existing work

The D-048 program is a flow redesign, not a reskin. Verified examples from
reviewed PRs:
- #569 inbox: restructured next-step-first; one Reply commit; statuses as dot
  + text. Old list-and-actions layout replaced.
- #571 onboarding: re-sequenced into goal steps, one commit per step, instead
  of the kit form page.
- #565 queue: goal-first ordering with privacy-safe decision recovery; not the
  kit table.
- #666 pricing: replaces the fee+credits page with the frozen banded family
  read-only display; layout and information order changed, not just styling.

Caveats that keep this honest:
- Merging every open PR still leaves the registered-only surfaces (settings,
  profile, messages, support, policy, admin, employer, billing/premium,
  verify, system/links, public-profile, discovery, home-signed-in, skippy) on
  legacy kit. Those need new flow designs, not merges.
- My PASS verdicts are source + capture reviews against the bar above. Live
  journey-completion proof (signed-in desktop + 390 flows) is the QA lane and
  is not implied by any design PASS.
- Several reviewed populated 390 captures are 2x full-page stitches; below-
  fold reachability there stays UNVERIFIED until viewport-true captures exist.

## 4. Definition of done for the mandate

Per surface: passes the bar in section 1, captures reviewed at 1280 and 390,
id added to RELEASED, legacy fallback removed or unreachable.
Platform-wide: every route in goalSurfaces.ts served by its goal surface, and
each core journey (sign-in, ask, inbox reply, queue decision, plans/billing
read, onboarding) proven end to end on desktop and 390 by QA.
No surface is reported complete on tokens alone; no platform-complete claim
while any route still serves the kit page.

## 5. Ownership

- Coordinator: assignment, merge/release sequencing (#592, RELEASED edits),
  recording this brief.
- Designer (this agent): design review of open PRs at exact heads; new comps
  for undesigned surfaces when assigned.
- QA: live journey-completion proof.
