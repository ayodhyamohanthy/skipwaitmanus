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

A local synthetic current-main test produced two failures: the intercepted SDK envelope retained synthetic private-link context, and the Clarity guard allowed a sensitive sign-in return target. Fetch was stubbed and the DSN used `.invalid`. No live person's information or production telemetry was tested. Production telemetry enablement and actual exposure remain unverified. Detailed unfixed examples remain private under D-223(7).

## Serialization and preservation
The prior PR #632 fixer explicitly agreed after comparing all four paths against main (2026-10-28 21:09 UTC) that this main repair may land first. Main has no commits on these paths since the PR merge-base. The registered BYOR row keeps its id, branch and full scope. It now waits for this repair's actual output because it must integrate the shared telemetry code before its later review/landing, not to encode an ordering preference. No active claim is taken over and no review verdict is changed.

Preserve the PR #632 F2/F3 functionality and tests when building this carrier or later integrating it:
- `/r/` and `/api/ask-invites/` sensitive-path handling with `/claim` suffix preserved;
- breadcrumb `data.url`, `from` and `to` handling plus the beforeSend backstop;
- sensitive, double-encoded and malformed return-target rejection, including search passed from initClarity;
- the synthetic envelope and sign-in return-target tests from `b2b2e17a`, without removal or weakening.

Later BYOR integration takes the union of this repair and those hunks. Re-run the two library suites and the 103-test lib/AskInviteLink slice on that union, with output. Preserve PR #632's history. Other BYOR landing, sheet and sweep changes stay there.

## Implementation acceptance
1. Commit real failing tests before the fix, using synthetic values and an intercepted transport only.
2. Sanitize request headers and relevant error context in beforeSend rather than editing App.tsx. Cover the confirmed private advisory regression cases in the four owned files without publishing unfixed exploit instructions.
3. Keep ordinary paths useful, preserve non-string context and prevent sensitive-return tracking. No broad activation/config changes.
4. Run focused tests, full exact-candidate gate, and exact required GitHub CI. Record resource/time failures honestly.
5. Draft Tier 1 PR, official claim and independent different-model review remain mandatory. Neither this packet nor serialization establishes reviewer eligibility or a verdict. No self-review or landing by a builder/fixer. No live API dispatch.

## Status
Registration only. Not implemented, reviewed, shipped or verified in production.
