# Packet D-065-C: the daily money check finds delivery spends by their real key

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Written by Claude Code as CEO (D-085) on Oct 22 2026, from a finding of the independent review of PR #395. The picker hands this task out; do only what it prints. The register wins any conflict.

## Why
The D-065 daily money check has a finding, `ask_spent_while_waiting`, that should fire when an ask is still marked waiting for coverage (D-034) although its first-visibility spend was already taken. It can never fire in production. `listAskDeliverySpendsWhileWaiting` in `server/dailyMoneyCheck.ts` looks up `credit_spend` rows with `referenceId` equal to the bare request id (`ids.map(String)`), but every ledger spend is written as `<referenceId>#<n>` (`spendCreditsTx` in `server/creditLedger.ts`): the delivery spend is `<requestId>#1`, with idempotency key `ask-delivery:<requestId>#1` (pinned by `server/db.coverageDelivery.test.ts`). Its test fixture (`server/dailyMoneyCheck.test.ts`, the D-065-B slice) writes `referenceId: String(requestId)`, a shape production never writes, so the suite passes. A money check that cannot fire is a silent failure (AGENTS.md 0a).

## What
1. **Red first.** In `server/dailyMoneyCheck.test.ts`, write the delivery spend in the real shape (`referenceId: "<requestId>#1"`, `idempotencyKey: "ask-delivery:<requestId>#1"`), or better, through `spendCreditsTx` itself, and show the finding is missed today.
2. **Fix the lookup.** Match the delivery spend by its real key: `referenceId` in `<id>#1` ... `<id>#32` for the page of waiting ids (the same bound `refundLedgerSpendTx` uses), keep the `ask-delivery:` idempotency-key filter, and read the request id from the part before `#`. Nothing else in the check changes; it still writes nothing.
3. **Keep the controls.** A legacy create charge (another key) is still no finding; a delivered ask (`waitingForCoverage` false) is still no finding; paging by id still covers every waiting ask.

Owned paths: `server/dailyMoneyCheck.ts` (`listAskDeliverySpendsWhileWaiting` only) and `server/dailyMoneyCheck.test.ts`. Tier 2: it changes no money, only what the check sees. Done: red-first test, fix, full gate green, landed by fast-forward (D-134 (6)), status set here.

## Status
One line per task, `<id>: in progress — <who> — <date> — branch <b>` when it starts and `<id>: done — <sha>` when it is live (D-134).
