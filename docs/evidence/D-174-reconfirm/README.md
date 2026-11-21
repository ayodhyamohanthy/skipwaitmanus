# Old waiting-request reconfirmation: verification receipt

Task: `D-174-held-ask-reconfirm`; implementation branch
`agent/queue/d174-held-ask-reconfirm`; decisions checked through D-371.
The source switch `ASK_RECONFIRM_ENABLED` is **false**. No production
activation, live request, email, payment or database operation was performed.

## Verified dormant implementation

[CI 44918233505](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44918233505)
passed every required check on final runtime source `d514aa883`: all three unit
shards and aggregate, compiler, both production build modes, scope/integrity
checks, migration apply/replay and all browser journeys. The seven local client
cases include native error-feedback scrolling; the existing 180 server cases
cover consent, delivery, stored costs, money checks and invite interactions.

All four retained images from that run were downloaded and inspected. The
repaired phone prompt/action and error/retry state are clear of fixed navigation.
Desktop controls and feedback remain readable. The browser checks no horizontal
overflow, a 44px phone target, actual overlay hit-tests, and error-then-success
recovery. [`captures.json`](captures.json) records the source, run, dimensions and
SHA-256 of the unedited images in [`after/`](after/). The earlier failed visual
baseline is preserved separately in [`before/`](before/).

D-373/D-374 were read against newer main `1c6dc427a`; their QA transport,
automatic landing and bonus-copy rulings do not change this feature. That main
composition adds no reconfirmation runtime change. The source flag remains
false. Protected landing and canonical disabled-runtime acceptance are tracked
separately on [PR #1437](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1437).

## Passing local checks

- Red-first server regression: 9 failed / 3 passed before implementation.
  Old held/waiting requests were delivered and charged without consent.
- Red-first UI regression: 4 failed / 3 passed before the control existed.
- `pnpm vitest run server/askReconfirm.test.ts server/db.coverageDelivery.test.ts server/coverageDeliverySweep.test.ts server/dailyMoneyCheck.test.ts server/db.askCostStored.test.ts server/askInviteClaim.test.ts server/askInviteReservation.test.ts --maxWorkers=2`: **180 passed**.
- `pnpm vitest run client/src/pages/myRequests.reconfirm.test.tsx --maxWorkers=1`:
  **7 passed**, including feedback scrolling after an error. Tests cover
  success/refetch, no control without pending consent, feature-off compatibility,
  HTTP/offline failure and a mismatched response. The unrelated shell is
  isolated; existing shell suites are unchanged.
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

## First integrated CI and follow-up (history)

[CI 44913737056](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44913737056)
on integrated head `e5b060c98` passed typecheck, both build modes and the browser
job. Its unit shards passed 8,171 tests and failed three inventory/documentation
checks: missing goal-boundary registration, missing coverage-map registration,
and the brief exceeding 10 KB. The component is now registered under the moved
My Requests surface, with its D-193 owner, and the brief is 10,237 bytes. All
**63 tests** in those three suites pass locally. No assertion or gate is removed.

The existing browser upload ran only on failure, so the successful run's four
attached synthetic screenshots were not retained. The CI workflow now retains
only `awaiting-*.png`/`error-*.png` consent fixtures for one day, on successful
runs too; the existing failure-trace upload and all checks are unchanged.
Subsequent successful CI and inspected images are recorded above.

## Browser inspection and phone repair

[CI 44916286695](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44916286695)
passed every required check on `d92126d2a` and retained the synthetic images.
All four were downloaded and inspected; the originals are in `before/`.
The 390px error message was behind the fixed bottom navigation even though
DOM visibility and the full browser journey passed. This is a real visual
defect, so that green run is not final visual acceptance.

The new error now precedes the prompt, brings itself into view on failure,
and the new helper sentence is shorter;
the existing request cost and conversation/withdraw path are unchanged.
The browser test additionally hit-tests the Confirm control and the alert
against overlays. Mobile screenshots capture the actual 390×844 viewport
after the control is brought into view; desktop captures retain the full page.
The subsequent repair CI and inspected images are recorded above.

## Reproducing browser evidence

`capture.mjs` bundles the actual `MyRequests`, request row/control, request API
and `GoalAppShell` with the production-built CSS. It substitutes a synthetic
signed-in identity and the default-off constant **in the isolated bundle only**.
It refuses to run if the production source switch is not false. No runtime
source flag is edited and no request reaches a real API.

Reference lock: `DESIGN.md`, `design/goal-ui/pick/my-asks.mobile.png` and the
existing My Requests row/GoalButton. Preserve the white canvas, hairline list,
Instrument Sans/JetBrains Mono roles, ink outline action, 44px phone target and
existing page hierarchy. No new palette, cards or second black action.

The local standalone browser launch timed out. The app browser loaded the local
fixture, but snapshot calls timed out and screenshot capture required a visible
desktop window. No local browser success is claimed; the inspected images above
come from the identified CI artifact, not the unavailable desktop renderer.

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

No full local Vitest pass is claimed. An initial invocation hit the tool's
120-second background limit; the longer run was stopped after Git-fixture and
page tests timed out under host load and current main had been composed.
It has no final totals and is not an exact-candidate gate. The full integrated
CI results above are separate. Protected landing and canonical deployment
receipts are tracked on the pull request; no activation is authorized here.
