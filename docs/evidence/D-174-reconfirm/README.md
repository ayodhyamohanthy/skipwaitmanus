# Old waiting-request reconfirmation: verification receipt

Task: `D-174-held-ask-reconfirm`; implementation branch
`agent/queue/d174-held-ask-reconfirm`; decisions checked through D-371.
The source switch `ASK_RECONFIRM_ENABLED` is **false**. No production
activation, live request, email, payment or database operation was performed.

## Passing local checks

- Red-first server regression: 9 failed / 3 passed before implementation.
  Old held/waiting requests were delivered and charged without consent.
- Red-first UI regression: 4 failed / 3 passed before the control existed.
- `pnpm vitest run server/askReconfirm.test.ts server/db.coverageDelivery.test.ts server/coverageDeliverySweep.test.ts server/dailyMoneyCheck.test.ts server/db.askCostStored.test.ts server/askInviteClaim.test.ts server/askInviteReservation.test.ts --maxWorkers=2`: **180 passed**.
- `pnpm vitest run client/src/pages/myRequests.reconfirm.test.tsx --maxWorkers=1`:
  **6 passed**. Tests cover success/refetch, no control without pending consent,
  feature-off compatibility, HTTP failure, offline failure and a mismatched
  response. The unrelated shell is isolated; existing shell suites are unchanged.
- `pnpm check`; `pnpm build` (client, prerender, server and postbuild);
  design-token audit; migration lint; deploy-trigger coverage; `git diff --check`.
- `pnpm exec playwright test --list --config e2e/playwright.config.ts` discovers
  **28 tests**, including the new synthetic consent/capture journey. Listing
  validates discovery only, not browser behavior.

The first post-implementation UI run failed to find its first control during
whole-shell rendering; an isolated rerun reproduced it and the following run
timed out. The mutation-focused suite now isolates the unrelated shell instead
of increasing timeouts or weakening its request/control assertions. The full
page is still the browser-capture target.

## Browser evidence: not yet verified

`capture.mjs` bundles the actual `MyRequests`, request row/control, request API
and `GoalAppShell` with the production-built CSS. It substitutes a synthetic
signed-in identity and the default-off constant **in the isolated bundle only**.
It refuses to run if the production source switch is not false. No runtime
source flag is edited and no request reaches a real API.

Reference lock: `DESIGN.md`, `design/goal-ui/pick/my-asks.mobile.png` and the
existing My Requests row/GoalButton. Preserve the white canvas, hairline list,
Instrument Sans/JetBrains Mono roles, ink outline action, 44px phone target and
existing page hierarchy. No new palette, cards or second black action.

The standalone browser launch timed out. The app browser loaded the local
fixture, but snapshot calls timed out and screenshot capture required a visible
desktop window. **No local image or visual acceptance is claimed.**

The existing CI browser suite now includes `e2e/reconfirm.e2e.ts`: it starts the
same local synthetic server, checks the complete page at 1280/390, verifies no
horizontal overflow and the phone target, exercises an error followed by a
successful retry, and attaches awaiting/error screenshots at both widths.
Inspect those actual CI images before claiming visual acceptance.

To reproduce locally after building:

```sh
node docs/evidence/D-174-reconfirm/capture.mjs
```

Or run with `--serve` to receive a structured local URL for an existing browser.
`/review?width=390` and `/review?width=1280` provide fixed-width iframe previews;
`/requests` renders the actual page in the browser's own viewport. The first
Confirm intentionally returns a synthetic 503; the second succeeds. These
fixtures never ship in the production bundle.

The full local Vitest run and exact-head required CI remain pending. An initial
full local invocation was stopped by the tool's 120-second background limit,
without a final result; the longer bounded run is separate. No green full-suite,
MySQL concurrency, protected landing or release acceptance is certified here.
