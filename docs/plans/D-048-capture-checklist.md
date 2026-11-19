# D-048 capture checklist — what every goal capture set must show

Every goal surface proves itself with captures from the synthetic fixtures,
never from a real account or a production backend. The harness is
`scripts/kit-screens/capture.mjs --goal <id> --fixture <00_goal fixture>`
against a local build with `VITE_GOAL_SURFACES` naming the id; output lands in
`design/goal-ui/captures/<id>/<state>-<1280|390>.png`.

## Every capture set, every surface

- **Both viewports.** 1280px (web, @1x) and 390px (mobile, @2x). A set with
  only one viewport is not evidence.
- **The goal line.** The page's single goal statement is visible without
  scrolling at both widths.
- **The one next step.** Exactly one primary action is visible and reachable
  above the bottom navigation at 390px after the page settles; secondary
  actions are visually secondary.
- **The lock state before acceptance.** Where the surface gates content or
  actions (verification, plan, consent, acceptance), the locked state is
  captured before the unlocked one, and the locked state names what unlocks
  it.
- **The states a surface must survive.** From the shared fixtures or a
  surface-local fixture of the same shape: loading (request still in flight),
  empty (a real zero, not an error), error (a 500 answer says so and offers
  retry, never a fake 0), offline (the request never answers). Surfaces add
  their own state fixtures beside the shared `00_goal-*` set when their
  content has more states.
- **Settled, not mid-animation.** The capture waits for fonts, actions and a
  settle delay; drawer or modal captures are taken after the overlay is fully
  open.
- **No horizontal overflow.** The report's `horizontalOverflowPx` is 0 at
  both widths; `unmatchedApi` is empty and `consoleErrors` is empty.
- **Auth and build state stated.** The caption records the fixture name, the
  persona (seeker / verified referrer), the build's `VITE_GOAL_SURFACES`
  value and the commit SHA. A capture without these is a screenshot, not
  evidence.

## Never in a fixture

- The comps' sample names: Fernhill Bank, Kestrel Pay, the R-8F3K2 refs.
- The retired pro/max plans or any price copy that is not the live frozen
  truth (D-132/D-152).
- Real people, real companies' private data, or anything from production.
