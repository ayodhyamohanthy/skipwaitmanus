# System gallery repair evidence

Local synthetic evidence for D-048-system-repair, not production, real installation, delivery, payment, or browser permission proof. D-180 shared wording remains separate and unchanged. Production flags are unchanged.

## Reproduce

From the repository root with pinned dependencies and Chrome installed:

```sh
BILLING_ENV=test CHARGEBEE_SITE=dummy CHARGEBEE_API_KEY=dummy CHARGEBEE_WEBHOOK_SECRET=dummy DATABASE_URL=postgres://localhost:5432/dummy VITE_GOAL_SURFACES=system PORT=3017 pnpm dev
node design/goal-ui/captures/system/capture.mjs fixed 390
node design/goal-ui/captures/system/capture.mjs fixed 1280
```

For baseline use source 45892c43f821559accedf5bbc101b73474aac5c0 plus this capture script, changing phase to baseline. The script loads only local pages, mocks API calls and Notification/install events, seeds only a synthetic draft and blocks HTTPS destinations. It is not a real browser API availability test. Source in each manifest is the source actually rendered, not a later evidence commit. The capture script hash identifies the committed recipe. Baseline and fixed used this same script. The default unbounded first capture attempt timed out before completion; the retained results are the subsequent width-bounded runs.

64 baseline and64 fixed images cover32 states at390x844 DPR2 and1280x900 DPR1. PNG390 files are780 pixels wide, not390 CSS pixels. Manifests record actions, synthetic fixtures, source SHA, command, viewport, DPR, scroll width, Loading colors, warnings and console output. Baseline has6 missing-action warnings (Got it / Maybe later at both widths); fixed has none. All retained runs have0 horizontal overflow. These are not clean-console runs: auth configuration and resource403 messages exist on every page and are retained. Their origin is not established here; do not infer product-runtime success or silently discard them.

Loading baseline bars computed white; fixed bars235/235/235 and visible Loading text. Actual before/after pixels inspected at both widths. All fixed matrix contact sheets inspected for spacing/overflow, and Loading1280, accepted-install390 and denied-permission390 inspected at readable detail. This does not prove every13 email template visually; six structural branches have pixels, all13 selectors have component tests. No real console/native prompt/live signed-in assertion is made.

## Tests and open gates

red-tests.log:13/13 failures reproduced before implementation. focused-tests.log:40/40 pass across five test files, including unchanged legacy AppStates/Offline/goalSurfaces. token-audit.log passes. Existing tests were not changed. The new tests pin dismissed/reopened sheets, offered install outcomes, notification outcomes/no call on Maybe later, Loading and retry, four goal contracts/fetch-free render, offline draft/malformed/safe retry destinations,404 links and all13 email selector branches.

Local default typecheck heap-aborted and a larger-heap attempt exceeded the execution window. Full local gate is unverified, not waived. Exact candidate hosted required CI and separate technical review are still required before normal protected landing. This evidence does not mark the task done.
