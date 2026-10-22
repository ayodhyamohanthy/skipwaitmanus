# Packet D-065-B: the daily money check gains the D-034 slice checks

> Read `docs/BRIEF.md` first, then this packet.

| Field | Value |
|---|---|
| Queue row | §3b `D-065-daily-money-check` follow-up (add the row `D-065-B` when you claim) |
| Decisions | D-065 ("plus one check per money-rule slice as each ships"), D-034, D-047 |
| Risk tier | 2 (read-only) |
| Size | S |
| Implementer | any model |
| Branch | `agent/<model>/d065b-slice-checks` |
| Depends on | D-065 live (`eed80e5f`, PR #317) |
| Verified against | `main` `681ea79` |

## 1. Current behaviour
`server/dailyMoneyCheck.ts` (PR #317) runs daily and emails the owner. It checks:
- every wallet against its ledger (`getFullCreditLedgerAudit`);
- one purchase credit per credited payment;
- payments parked for review;
- refunds that no payment explains;
- checkouts pending for more than a day.

Its dependencies are injected (`DailyMoneyCheckDeps`), so each check is a list function plus a formatter.

## 2. Add two checks (same pattern: a dependency, a bounded query, findings with ids only)
1. **`ask_spent_while_waiting`** (D-034, D-047): a `tokenTransactions` row of kind `credit_spend` whose key starts with `ask-delivery:` while its ask (`referenceId`) still has `waitingForCoverage = true`. A delivery spend must flip the ask to visible in the same transaction, so any row here is a fault.
2. **`spend_reversed_twice`**: two or more rows share one non-null `reversesTransactionId`. The unique index should prevent this; the check proves it stays true.

Each finding line carries ids and counts only, like the existing ones.

## 3. Tests first (in `server/dailyMoneyCheck.test.ts`, with the existing dependency fakes)
- Each check reports its seeded fault, and nothing on a clean fixture.
- The email lists them under their names.
- The job still writes nothing to money tables.

## 4. Files
`server/dailyMoneyCheck.ts`, `server/dailyMoneyCheck.test.ts`, the §3b row.

## 5. Definition of done
Gate green; push; API CONVERGED. Row done. Tier 2.

Note for later money packets: P0-allocated-ask-stuck, D-038-A, D-038-B and D-035 each add their own check here (see each packet's §9).
