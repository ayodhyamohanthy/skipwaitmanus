# D-180 referral-copy preparation — local evidence

Isolated PREP for the D-180 presentation sweep, authorized by the founder's
Nov 9 parallel-build grant (D-308/D-309) and registered by PR #1078, merged to
`main` at `69627919`. The row is on `main`, so the picker claim is legitimate.

- Branch: `agent/d180prep/d1b4-referral-copy`
- Worktree: `skipwaitmanus-d180prep` (own clean worktree, cut from `origin/main` at
  `0aa3a9eeb9a841d4ee6502857eb7bbede6ba061f`)
- Session identity: `Qoder · d1b4`
- Picker claim: `f9121732` on `agent/queue/d180-referral-copy-prep`
- Scope: presentation-only. No prices, allowances, payment behavior, backend
  senders, feature flags, legal text, RELEASED or goal surfaces were touched.

## Captures

Before (`kit-emails-before-1280.png`, `kit-emails-before-390.png`, committed in
`21f2e0df`) and after (`kit-emails-after-1280.png`,
`kit-emails-after-390.png`, this commit).

- Route: `/emails` (kit template gallery; goal surfaces off).
- Source: a local dev server started from this worktree on `localhost:3100`
  (`PORT=3100 BILLING_ENV=test` + fixture `CHARGEBEE_*`), API mocked at the
  network layer by `design/goal-ui/tools/capture-live.mjs`; no database, no
  provider keys. The 404s the driver logs are its own unmocked `/api/` routes.
- **Synthetic / auth simulation:** the page is the public template reference.
  It contains no real person, company, code, price or account. The six-dot
  block is a placeholder, never sample digits.
- Before evidence shows the retired public nouns: nav names `Ask accepted` /
  `Ask passed`, and the footer `3 free credits every month; extra asks use
  credits. ...`.
- After evidence shows `Referral accepted` / `Referral passed` and the footer
  `3 free referrals every month; extra asks use credits. ...`. The footer's
  second clause is still old terminology and is blocked on pricing — see
  "Reported, not promised" below. These captures are not proof of a fully
  corrected public surface.

## Red-first test

`scripts/referralCopyPrep.test.ts` (new, allowlisted) failed on the pre-change
copy. Verbatim:

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

After the source change the same file is green: `Tests 9 passed (9)`. The six
unchanged-fact controls stayed green throughout: the detector's vacuity guard
(catches `credits`/`ask`, allows the verb), catalog-derived allowance,
referrers never paid, accepted-not-completed, no guaranteed/completed referral,
and the live 1-charge / empty-wallet block.

## Source change (allowlisted)

`shared/moneyCopy.ts` — public presentation strings only; every amount, charge,
card requirement, accounting semantic, timing, expiration and recovery rule is
unchanged (the `ASK_TTL_DAYS` / `COVERAGE_WAIT_DAYS` interpolations and the
`cost` arithmetic are untouched):

- `FREE_ASKS_CHIP` -> `${FREE_ASKS_PER_MONTH} free referrals every month`
  (allowance still derived from the catalog, never hardcoded).
- `CREDIT_RULE`, `CREDIT_RULE_SHORT`, `REFERRED_REOPEN_SENTENCE`: the noun
  "ask"/"credit" -> "referral request"; "the credit stays spent" -> "it stays
  charged". The expiry clause "as long as the credit itself has not expired"
  now reads "as long as the month or plan it came from has not ended by then" —
  the same rule as the existing `CREDIT_ENDED_CAVEAT`, rephrased because the
  noun had to go.
- `askCostLine`: local `credits()` helper -> `requests()`; all five branches
  (waiting, availability unknown, balance unknown, short, empty) now speak of
  referral requests; the empty-wallet top-up hint "Add a credit pack in Plans
  and credits" -> "Top up in Plans" (no pack named, no offer invented).
- `creditUsedPhrase(false)` -> "1 referral request is used".
- `askCostLanding(false).waitBody` / `.fairRule` -> referral-request wording.

`client/src/pages/Emails.tsx` — local display names and trigger nouns only; all
verified sender subject/body quotes are byte-identical:

- `Ask accepted` -> `Referral accepted`, `Ask passed` -> `Referral passed`.
- Triggers: "claims a pending ask" -> "claims a pending referral request";
  "The ask stays active" -> "The referral request stays active"; "An ask has no
  verified employees" -> "A referral request has no verified employees";
  "waiting asks become reviewable" -> "waiting referral requests become
  reviewable".
- Untouched: the goal-twin guard (`goalSurfaceOn("system")` -> `GoalEmails`),
  the shared footer, and the "Payment receipt / failed" trigger.

## Wording pins updated (allowlisted, same assertion counts)

`shared/moneyCopy.test.ts`, `shared/moneyCopy.item7.test.ts`,
`server/moneyCopy.test.ts`: only the direct strings above. Behavior, amount,
negative and unrelated controls are unchanged; nothing was deleted, skipped,
focused or relaxed.

One guard needed a matching edit, disclosed here: "never calls referrals free
without the monthly limit" banned `free (?:job )?referrals`, which the new chip
would now trip. It reads `free (?:job )?referrals(?! every month)`, the same
form the in-review `agent/copy/free-asks-chip-terminology` branch uses, so a
bare "free referrals" claim is still caught and only the stage-qualified chip
passes.

```
pnpm exec vitest run scripts/referralCopyPrep.test.ts shared/moneyCopy.test.ts \
  shared/moneyCopy.item7.test.ts server/moneyCopy.test.ts
Test Files  4 passed (4)
     Tests  31 passed (31)
```

`pnpm check` (`tsc --noEmit`) exits 0. `node scripts/design-token-audit.mjs`
reports `OK — no legacy or off-brand hexes in the client surface.`

## Scope blocker (reported, not worked around)

**Superseded on 2026-11-09 16:38 by PR #1079 (`257c1d7f`).** That merge adds an
"Additional manual test allowlist" to the packet, authorizing these exact
literal pins. This branch still edits none of them: the coordinator owns the
combined compose. The counts below are the measurement that prompted the
amendment, kept as the record of what was reported.

The same shared strings are pinned by tests outside this packet's allowlist. On
this head those suites show `Test Files 12 failed | 3 passed (15)` /
`Tests 41 failed | 106 passed (147)`:

| File | Failing tests |
|---|---|
| `client/src/pages/explore/ask.costQuote.test.tsx` | 20 |
| `client/src/pages/home.world.test.tsx` | 4 |
| `client/src/pages/explore.test.tsx` | 3 |
| `client/src/pages/exploreDrawer.test.tsx` | 3 |
| `client/src/pages/policyPages.test.tsx` | 3 |
| `client/src/pages/ask.test.tsx` | 2 |
| `client/src/pages/GoalLanding.test.tsx` | 1 (goal surface, excluded) |
| `client/src/pages/emails.test.tsx` | 1 (nav names list) |
| `client/src/pages/systemGalleries.test.tsx` | 1 (nav names + "The ask stays active") |
| `client/src/pages/home.mobileNav.test.tsx` | 1 (full money sentence) |
| `client/src/components/plans/planCatalog.test.ts` | 1 (money sentence) |
| `client/src/components/thread/threadModel.test.ts` | 1 (coverage-wait copy) |

`client/src/pages/adminApprovalQueue.test.tsx`,
`client/src/pages/adminApprovalRecord.test.tsx` and
`client/src/pages/goal/system/systemPages.goal.test.tsx` pass: the first two
pin `creditReservedPhrase`, which is administrator-only copy, so it was left
unchanged (an earlier attempt to change it was reverted).

For the compose, precisely: `creditReservedPhrase` is
`shared/moneyCopy.ts:132` — `levelCost ? "Credits reserved" : "1 credit
reserved"` — consumed only by `AdminApprovalQueue.tsx`, `AdminApprovalRecord.tsx`
and the goal admin-approvals data, never by a public surface. `257c1d7f`
authorizes the two admin test files' "literal reserved-phrase output only",
which permits their pins to move; it does not by itself require the source
string to change, because D-180's rule covers public nouns. If the compose
does change it, the full set is: that one source line, the `1 credit reserved`
pin in `shared/moneyCopy.item7.test.ts`, `adminApprovalQueue.test.tsx:39`,
`adminApprovalRecord.test.tsx:32,34`, and the goal approval pins; the
`(monthly)` qualifier and request metadata must stay. This branch removed
`creditReservedPhrase` from `scripts/referralCopyPrep.test.ts` (2 lines: the
import and its `REFERRAL_SAFE_COPY` row) when it reverted the over-reach, so
the compose re-adds the row if and only if it changes the phrase.

The packet says a new source/test/semantic edit outside its list needs a bounded
correction through Instinct first, and a hunk that depends on a future behavior
change is left unchanged and reported. No file outside the allowlist was edited.

## Reported, not promised

**Corrected by `257c1d7f`:** the footer tail is not a pricing decision. The
packet's Nov 9 section says the `extra asks use credits` tail "must not be
declared pricing-dependent merely because it contains the old nouns" and must
be replaced with a truthful presentation of the same current allowance/usage.
The paragraph below is this branch's original rationale, kept as the record of
what was reported at `0281201d`; it is no longer the operative reading, and the
tail is still unchanged in this branch because the coordinator owns that
compose. Live facts it must state without inventing an offer:
`FREE_PLAN.creditsPerMonth = 3`, flat default cost of one internal unit,
`CREDIT_PACKS_ON_SALE = true` in code with legacy packs paused by the owner
(D-219), `PASS_SALES_ENABLED = false`.

Original rationale: these strings were deliberately left unchanged and are not
asserted by the new test: the `extra asks use credits` tail of
`ASK_COST_SENTENCE` (so `MONEY_SENTENCE` and `MONEY_SENTENCE_SHORT` still carry
it), `PAID_PLANS_SENTENCE`, the `Add a credit` / `Add credits` top-up labels and
`topUpHref`, the "Payment receipt / failed" template trigger, the D-132 V2
strings (`CREDIT_RULE_V2`, `CREDIT_ENDED_CAVEAT_V2`, `creditUsedPhrase(true)`),
and the server sender copy in `coverageHeldNotice`. Each depends on a pricing
or sender decision that is not live (D-219: legacy packs paused, banded pricing
unactivated), so changing it here would promise behavior the product does not
yet have.

The `FREE_ASKS_CHIP` hunk is also carried by the in-review branch
`agent/copy/free-asks-chip-terminology` (row D-180-a-free-asks-chip); this
branch does not duplicate its pin set.

## Status

Preparation only. No review, landing, release or goal-surface change is
claimed. The out-of-scope pin blocker was reported at `0281201d` and is
resolved on main by `257c1d7f`; the coordinator owns composing those pins and
the footer tail with this branch's hunks.
