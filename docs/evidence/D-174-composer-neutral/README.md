# D-174 composer-neutral verification

Task: `D-174-seeker-journey-build.composer-neutral`. Source `7d98e8426`; mobile label repair `a6fae4e72`; integrated candidate `b40946c102e8eeb188090a027a3fcbc418ce6528`. This is synthetic client evidence, not production delivery, account access, a money transaction or a live funnel measurement.

## Behavior and automated proof

The real `useAskComposer` and `AskDrawer` use the same cost condition and Send state for either directory availability value. The request body contains no `expectedCoverage`; the server still decides delivery and any shortfall. Pending/error quotes still block button and keyboard submission. Parsed send responses select the delivered/pool first clause and exactly one consent-gated event. Failed or malformed responses emit neither event and keep the draft. Existing personal-link/first-look precedence, durations, refund clauses, amounts, sign-in/post handoffs and idempotency remain.

- Before changing the hook, `coverageNeutral.test.tsx` failed 6 cases and passed 7. The repaired suite passes 13/13.
- The first combined affected run passed 145/146. Its one remaining assertion expected the old drawer title; after correction, the three relevant suites passed 76/76. All other eight suites passed in the first run. The later mobile-label repair passes all 18 drawer cases.
- [Required CI 44798029528](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44798029528) on `b40946c10` passes typecheck, all three test shards and their aggregate, production build and real E2E journeys. Earlier composition `0138681da` also passed [CI 44795761567](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44795761567).
- Local TypeScript, production build, token audit, migration lint, deploy-trigger coverage, whitespace and test-integrity checks pass. Test-integrity reports zero violations with the PR's explicit assertion map; no test is removed or skipped.
- The redundant full local gate passed TypeScript but was stopped after two unchanged Git-history fixture timeouts: the review-verdict refresh in `scripts/nextTask.test.ts` (21.403 s) and the 400-commit classifier case (68.077 s). It has no final full-suite totals and did not reach its chained build. A green full local run is not claimed; completed full-suite proof is the exact-candidate CI above.

## Visual proof

These captures use the actual hook/drawer and compiled production CSS, with an isolated auth adapter and synthetic API responses in the local fixture. Desktop is 1280×900; phone is 390×844. `open`/`waiting` in filenames describe the fixture's old directory boolean, never a displayed availability label or proof a real employee exists.

| State | Desktop | Phone |
|---|---|---|
| Availability true, balance 0 | [capture](compose-open-balance0-1280.png) | [capture](compose-open-balance0-390.png) |
| Availability false, balance 0 | [capture](compose-waiting-balance0-1280.png) | [capture](compose-waiting-balance0-390.png) |
| Availability true, balance 3 | [capture](compose-open-balance3-1280.png) | [capture](compose-open-balance3-390.png) |
| Availability false, balance 3 | [capture](compose-waiting-balance3-1280.png) | [capture](compose-waiting-balance3-390.png) |
| Profile/resume response pending | [capture](loading-1280.png) | [capture](loading-390.png) |
| Server shortfall, draft retained | [capture](send-error-1280.png) | [capture](send-error-390.png) |
| Parsed delivered confirmation | [capture](delivered-1280.png) | [capture](delivered-390.png) |
| Parsed waiting-pool confirmation | [capture](pool-1280.png) | [capture](pool-390.png) |

All captures were inspected. Both availability/balance variants show the same cost and Send control; text and actions fit at both widths. A long secondary confirmation label clipped in the phone grid during inspection; shortening it to `New request` fixed the clipping while retaining the handler. The final phone confirmation and delivered desktop capture contain the repaired label; the earlier desktop pool capture contains the longer label, which fits there. The loading capture holds profile setup pending; dormant level-price pending/error guards are proven by the focused tests, not misrepresented as live flag-on screenshots.

The first fixture build omitted Tailwind utilities and was corrected to use the production stylesheet before accepted captures. Some browser screenshot/click operations timed out; successful captures followed target readback. Confirmation-state capture used DOM click evaluation after the browser's ordinary click timed out twice. These screenshots prove layout and rendered handler results; normal click/send behavior is separately covered by the component and real E2E runs. The fixture and its synthetic responses never ship as product data. `captures.json` records SHA-256 hashes of the 16 accepted PNGs.

## Release acceptance

[PR #1401](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1401) merged through protected auto-merge at `0ee387d5f81cdb1a288b509bb145530fd6d87e45`, with final head `5aff97c5b28894c8fb04e6627371e347908648ea`. [Final PR CI 44801592838](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44801592838), [main CI 44802248564](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44802248564) and [Pages release 44802248475](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44802248475) succeeded. The final PR MySQL job applied 54 deploy files then zero on replay, and passed 13 real E2E journeys. The combined affected local run also passed all 146 tests in 11 files after integration; the redundant full local gate remains explicitly incomplete as recorded above.

Canonical browser readback of `https://skipwait.me/explore/wipro?open` confirms exact web SHA `0ee387d5f81cdb1a288b509bb145530fd6d87e45`, `Request a referral`, `Send referral request` and `Uses 1 from your balance when a verified employee can see it` at 1280×900 and 390×844. Both have zero horizontal document overflow. Inspected live captures: [desktop](live-compose-1280.png), [phone](live-compose-390.png). The session already had a demo login; this check performed read-only rendering and no sign-in/reset, upload, send, notification, checkout or money action. It does not claim live delivered/pool transaction or analytics execution; those outcomes are proven synthetically and by E2E.

The compatible API remains `e8e161a06797a1c29d8e16fbec858bb361803c04`; no server/shared/schema/Worker source changed between that API source and the web merge. Canonical readiness returned HTTP 200, `service=skipwait-api`, `state=ready`, exact `commitSha`; `EXPECTED_SHA=e8e161a06797a1c29d8e16fbec858bb361803c04 bash scripts/verify-cloudflare-container-release.sh` printed `RUNTIME CONVERGED` with direct origin closed (HTTP 404). API active-instance/control-plane changes are neither needed nor claimed for this client-only release. The first Python HTTP probe received 403; successful browser/curl readbacks supply the acceptance.

`release.json` records the actual merge, checks, surface identities and capture checksums. D-371 was read and changes no composer contract. Queue closeout only follows this evidence; it is not a second runtime or pricing change.
