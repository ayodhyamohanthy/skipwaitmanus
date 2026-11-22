# Admin approvals retirement acceptance

Task: `D-048-K-admin-approvals`. Runtime PR: #1347. Merge: `612640a7addce30d6d88c2b3b6e28fd6481c4977` on November 20, 2026.

## Evidence

- `receipt.json` and the four PNGs: clean signed-out browser checks of the queue and synthetic record path at 1280×900 and 390×844 with device scale factor 2 on mobile. Each page served the retirement web SHA, one goal page and one Sign in action, without overflow, private approval reads, page exceptions or business mutations.
- `sentry.json`: both production route-scoped searches for new issues since the runtime merge returned zero matches and no additional page.
- `release.json`: GitHub readbacks for final-head and merged-main CI, web deployment, the preceding API rollout, and the completed full release smoke. The smoke verified web `612640a7` with API `dc1ce93f7`. Its successful `release/verified` status belongs to the API deployment commit.
- The synthetic signed-in state comparison remains in `client/src/pages/goal/admin-approvals/retirement/`: 18 states at both widths, 36/36 pixel-identical and API-equivalent before/after pairs.

The live browser checker blocked all non-canonical origins and locally fulfilled telemetry POSTs. Its two resource-error messages per page are retained in the receipt. They are not presented as a clean console. No sign-in, OTP, approval decision, payment or wallet mutation was performed. Signed-in production admin decisions were not exercised.

The first release-verification run, 44785612428, skipped while an API deployment was active. It does not establish acceptance. Run 44787928172 actually performed the smoke and passed.

The stopped local full gate remains red/incomplete. The retirement packet preserves its five failures across four unchanged test files, the bounded isolated reruns, the passing focused/compiler/build checks, and the separate successful CI evidence. No full local pass is claimed.

Rollback: revert PR #1347. The whole Kit layer is not retired until `D-048-K-kit` lands.
