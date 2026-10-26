# D-180-money-label - shared assistant money wording says referrals

Owner decision D-180 (Oct 23-24, iMessage-recorded): public terminology is
referral-only. The goal surfaces were swept surface-by-surface (#598 pattern:
presentation only, internal names unchanged). This row is the shared-source
half for the assistants family, so goal and kit render one wording from one
source (PR 563 review, P2).

## Contract

- `client/src/components/assistants/format.ts`: `creditsLabel(count)` renders
  "N referral" / "N referrals". The function name stays (internal identifier).
- `client/src/components/assistants/ApprovalSheet.tsx`: NOT edited - it
  inherits the shared label (kit page files stay byte-identical, D-132/D-135).
- `client/src/pages/approve.test.tsx`: the one pinned kit assertion
  ("uses 1 of your open slots · 1 credit") moves to the referral wording.
- `server/mcpServer.ts`: assistant-facing descriptions and the server
  `instructions` string say "referral cost" instead of "credit cost".
- `client/src/components/developers/mcpTools.ts`: the Developers gallery
  description for `propose_ask` says "where the referral cost is shown"
  (client-visible copy; its test has no pin on this string).
- `server/mcpRoutes.test.ts`: alignment only if a pin disagrees; tool names
  and the no-payment-verbs pin (:79) stay.
- Internal identifiers never change: `creditCount`, `creditCost`,
  `creditCostIfApproved`, `/api/credits/*` routes, schema, ledger.
- No pricing, flag, plan or behavior change. No released-surface copy change.

## Explicitly out of scope

- `shared/moneyCopy.ts` and every surface it serves (home is RELEASED): that
  sweep is a separate launch-gated owner decision, not this row.
- `GoalApprovalCard.tsx`: its documented D-180 fork resolves back to the
  shared label as a #563 follow-up after this row lands.

## Gates

Tier 1: green CI on the exact head + one independent review by a session that
is neither builder nor fixer (D-151/D-200(4)). Captures: kit /approve sheet
before/after at 1280 and 390 (presentation proof).
