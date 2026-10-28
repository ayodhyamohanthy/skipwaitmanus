# Client telemetry privacy repair

## Goal and scope
Repair the existing client telemetry path without enabling telemetry, BYOR, payments or any release switch. Privacy is Tier 1. No new dependency or production token test.

Row `CLIENT-TELEMETRY.privacy`, branch `agent/queue/client-telemetry-privacy`, lane `client-telemetry`.
Owned code/test paths only:
- `client/src/lib/sentry.ts`
- `client/src/lib/sentry.test.ts`
- `client/src/lib/clarity.ts`
- `client/src/lib/clarity.test.ts`

## Read receipt and evidence
Current main checked 2026-10-28 21:10 UTC: `0ae5dcde041f9694ce590dde4786f72dc9bc7468`. Read BUILD_CONTINUITY, BRIEF, AGENTS, COLLABORATION and D-151/D-184/D-200/D-223/D-225. Existing PR #632 head `b6ac98e261f8fddae8cbc214fd6e1f5d80d43ff5` remains unmerged and awaiting independent review. This is a main privacy repair, not a BYOR activation or a replacement for that review.

Local synthetic current-main qualification produced two failures. Transport was intercepted and no live person's information or production telemetry was tested. Production enablement and actual exposure remain unverified. Detailed findings and fixtures remain private with the coordinator under D-223(7).

## Serialization and preservation
The prior PR #632 fixer explicitly agreed after comparing all four paths against main (2026-10-28 21:09 UTC) that this main repair may land first. Main has no commits on these paths since the PR merge-base. The registered BYOR row keeps its id, branch and full scope. Its dependsOn edge holds ALL picker work, including independent review and landing, until this repair is done. This is a real scheduling effect, not a review-only integration note. It waits for the shared telemetry output that it must integrate. No active claim is taken over and no review verdict is changed. The serialization agreement requires the repair to land first; no claim that normal BYOR review remains available during this dependency hold is made.

Preserve PR #632's complete F2/F3 functionality and tests at b6ac98e2, including the disclosed test expectation correction. Do not remove or weaken them. Detailed route rules and synthetic regression cases are held privately by the coordinator; recover the original scratch reproducer and current-main two-case RED test before implementation. The coordinator holds `D090-advisory-scratchRepro.test.ts` and the current-main qualification output. These private synthetic fixtures are not committed here. Request the original files if not attached to the execution handoff rather than guessing cases.

Later BYOR integration takes the union of this repair and its existing F2/F3 hunks. Re-run the two library suites and the 103-test lib/AskInviteLink slice on that union, with output. Preserve PR #632's history. Other feature changes stay there.

## Implementation acceptance
1. Commit real failing tests before the fix, using synthetic values and an intercepted transport only.
2. Repair the privately reproduced telemetry carriers in the four owned files without editing App.tsx or publishing unfixed exploit instructions. Recover the coordinator-held cases before implementation.
3. Keep ordinary paths useful, preserve non-string context and prevent sensitive-return tracking. No broad activation/config changes.
4. Run focused tests, full exact-candidate gate, and exact required GitHub CI. Record resource/time failures honestly.
5. Draft Tier 1 PR, official claim and independent different-model review remain mandatory. Neither this packet nor serialization establishes reviewer eligibility or a verdict. No self-review or landing by a builder/fixer. No live API dispatch.

## Status
Registration only. Not implemented, reviewed, shipped or verified in production.
