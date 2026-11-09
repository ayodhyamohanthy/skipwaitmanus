# D-180 referral-copy preparation — local evidence

Isolated PREP for the D-180 presentation sweep, authorized by the founder's
Nov 9 parallel-build grant (D-308/D-309). Registration packet
`docs/plans/D-180-referral-copy-prep.md` is still under review in PR #1078, so
this branch is **authorized isolated PREP**: no picker claim, no review, no
landing, no production action.

- Branch: `agent/d180prep/d1b4-referral-copy`
- Worktree: `skipwaitmanus-d180prep` (own clean worktree, cut from `origin/main` at `0aa3a9eeb9a841d4ee6502857eb7bbede6ba061f`)
- Session identity: `Qoder · d1b4`
- Scope: presentation-only. No prices, allowances, payment behavior, backend
  senders, feature flags, legal text, RELEASED or goal surfaces were touched.

## Captures (before state)

`kit-emails-before-1280.png`, `kit-emails-before-390.png`

- Route: `/emails` (kit template gallery; goal surfaces off).
- Source: local dev server on `localhost:3000`, API mocked at the network layer
  by `design/goal-ui/tools/capture-live.mjs`; no database, no provider keys.
- **Synthetic / auth simulation:** the page is the public template reference.
  It contains no real person, company, code, price or account. The six-dot
  block is a placeholder, never sample digits.
- These are **before-change evidence** of the forbidden public nouns D-180
  retires: the template names `Ask accepted` / `Ask passed` and the footer
  `3 free credits every month; extra asks use credits. Referrers are never
  paid and never ask you for money.` They are not proof of a corrected state.

## Red-first test

`scripts/referralCopyPrep.test.ts` (new, allowlisted) fails on the current copy
before any source change. Command and verbatim result:

```
pnpm exec vitest run scripts/referralCopyPrep.test.ts
Tests  3 failed | 6 passed (9)
```

Failing cases and their first reported violations:

- `D-180 public money copy > names referral requests, never credits or the noun ask`
  — 11 violations, e.g. `FREE_ASKS_CHIP: 3 free credits every month -> credits`,
  `askCostLine: balance known: Uses 1 of your 2 credits -> credits`,
  `askCostLanding: fairRule: Every ask costs the same: 1 credit ... -> ask`.
- `D-180 kit email gallery > names the referral stages with referral nouns`
  — `Ask accepted -> Ask`, `Ask passed -> Ask`.
- `D-180 kit email gallery > describes each stage with referral nouns, never credits or the noun ask`
  — triggers `claims a pending ask`, `The ask stays active`, `An ask has no
  verified employees`, `waiting asks become reviewable`.

The six passing cases are the unchanged-fact controls that must stay green:
the detector's vacuity guard (catches `credits`/`ask`, allows the verb),
catalog-derived allowance, referrers never paid, accepted-not-completed,
no guaranteed/completed referral, and the live 1-charge / empty-wallet block.

Baseline on the same head: `shared/moneyCopy.test.ts`,
`shared/moneyCopy.item7.test.ts` and `server/moneyCopy.test.ts` pass (22 tests).
Catalog/ledger/refund/card regressions pass unchanged (66 tests):
`server/creditLedgerRules.test.ts`, `server/creditLedgerContract.test.ts`,
`server/db.askCreditRefund.test.ts`, `server/creditCycles.cardValidation.test.ts`,
`server/chargebeeRefund.test.ts`, `client/src/components/plans/planCatalog.test.ts`.
`pnpm check` and `node scripts/design-token-audit.mjs` pass on this head.

**This test is red by design.** It must not land alone: the source hunks that
turn it green are the blocked ones below. Landing it before them would break
required CI.

## Scope blocker (reported, not worked around)

Turning the red test green needs `shared/moneyCopy.ts` (`CREDIT_RULE`,
`askCostLine`, `creditUsedPhrase`, `creditReservedPhrase`, `askCostLanding`) and
`client/src/pages/Emails.tsx` (two names, four triggers). Each string is pinned
by tests outside this packet's allowlist:

- `client/src/pages/policyPages.test.tsx:100`
- `client/src/pages/explore/ask.costQuote.test.tsx:299,337,383,399,420,448`
- `client/src/pages/exploreDrawer.test.tsx:189,259`
- `client/src/pages/explore.test.tsx:122`
- `client/src/pages/ask.test.tsx:104`
- `client/src/pages/adminApprovalRecord.test.tsx:32,34`
- `client/src/pages/adminApprovalQueue.test.tsx:39`
- `client/src/pages/GoalLanding.test.tsx:50,56` (goal surface, excluded)
- `client/src/pages/emails.test.tsx:18-19`
- `client/src/pages/systemGalleries.test.tsx:43-45`
- `client/src/pages/goal/system/systemPages.goal.test.tsx:16`
- `client/src/components/thread/threadModel.ts` (its own `1 credit is used`)

The packet says a new source/test/semantic edit outside its list needs a bounded
correction through Instinct first, and a hunk that depends on a future behavior
change is left unchanged and reported. No source edit was made.

The `FREE_ASKS_CHIP` hunk is already carried by the in-review branch
`agent/copy/free-asks-chip-terminology` (row D-180-a-free-asks-chip), which
updates that string and exactly these pins. This branch does not duplicate it.

Pricing-dependent strings were left out of the test on purpose and are reported,
not promised: the `extra asks use credits` tail, the `Add a credit pack` top-up,
`PAID_PLANS_SENTENCE`, the payment template trigger, and the D-132 V2 strings.
