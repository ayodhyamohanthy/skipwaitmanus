# D-132 audit: first-pass findings (Oct 23 2026, 01:10 IST)

Pricing model is D-146 (D-132 only). Method: code read at `main` 7eac937e with file:line; NO test has been run for items marked "read only". Nothing here changes live behaviour. Flags stay off. No Chargebee apply.
Items refer to the 11 numbered checks in `docs/plans/D-132-pricing-v2.md`.

| # | Item | First-pass result | Next |
|---|---|---|---|
| 1 | Flags off is today | Test added (`client/src/planFamilyFlagsOff.test.ts`): the client flag is false for unset, "false" and empty `VITE_PLAN_FAMILY_V2`; `App.tsx` routes `/plans` to the legacy `Plans` unless the flag is on; the server gate is off for an empty or false env. Server cost is flat 1 with `ASK_LEVEL_COST` off (`db.askLevelCost.test.ts`). Limit: the route check reads App.tsx source, it does not mount the whole app. | Done (limit noted) |
| 2 | Level stored once | FAIL. The level is re-classified at create (`db.ts:1960`), delivery (`db.ts:2706`), the quote (`privateReferralRoutes.ts:709`) and the agent paths (`seekerAgentDeps.ts:141`, `skippieSeekerDeps.ts:164`). No stored cost on `referralRequests`; only an unrelated `creditCost` column at `drizzle/schema.ts:1243`. Next free migration after `drizzle/deploy/0105_ask_pinned_work.sql`. | Red test, then migration `0106`, store level+cost+source at creation, read it everywhere |
| 3 | Short of credits | FAIL on the client. The quote returns `shortfall` server-side, but `Ask.tsx` and `explore/*` show no "This ask costs N credits. You have M. Add K more." line and no one-tap top-up. | Red test, then build behind the flag |
| 4 | Refunds by bucket | Likely OK, read only. `refundLedgerSpendTx` (`db.ts:2344`) returns each credit to its source bucket once, with a unique reversal row; level-scaled multi-bucket spends are handled (`db.ts:2383`). Needs a test for a multi-credit ask across buckets and a replay. | Add test |
| 5 | Send again and reopened asks | Unverified. Depends on item 2 (stored cost). | After item 2 |
| 6 | Daily money check | FAIL. `server/dailyMoneyCheck.ts` has no check of a spend against a stored ask cost. | After item 2 |
| 7 | One ask-cost line | Done in this PR (flag off keeps today's text byte for byte). `askCostLine` in `moneyCopy.ts` takes an optional `cost` and states it in every line, with the short-of-credits sentence when cost exceeds the balance. New `askCostLanding(levelCost)` gives the landing step, the "nothing spent while it waits" card and the fair rule; `GoalLanding.tsx` and `GoalLandingV9.tsx` read it behind `VITE_ASK_LEVEL_COST`, so "Every ask costs the same" and "1 credit only" disappear when levels are on. Tests in `moneyCopy.test.ts`. Not wired: the Explore composer (`useAskComposer.tsx`) still calls `askCostLine` without `cost` because it has no role level until the user pastes a link; the ask page already shows the quoted cost (item 3). | Function done; composer wiring open |
| 8 | Plans page | Unverified. `PlansV2.test.tsx` has 8 tests; no source-text guard that every number comes from `shared/planFamily.ts`. | Add guard test |
| 9 | Mentor and referrers | Unverified; Mentor is data only per the packet. | Add a guard test |
| 10 | Config | Verified: `server/configContract.test.ts` passes (5 tests) with the four flags in `.env.example` (all false) and `ASK_LEVEL_COST`, `PLAN_FAMILY_V2` in `src/worker.ts` container env keys. The two `VITE_` flags are build-time and not container env. | Done |
| 11 | V2 credit rule | Partial. `CREDIT_RULE_V2` (`shared/moneyCopy.ts:70`) states the per-level and per-bucket rules and "paid credits never expire". Not yet checked line by line against the live `CREDIT_RULE` refund cases (lapsed 48-hour hold, pass reason, reopened ask). | Compare, add test |

Order of work: 2 (migration, red tests first) then 5, 6, 3, 7, 4, 8, 9, 11, 1, 10. Each lands as its own PR with CI green, flags off.
