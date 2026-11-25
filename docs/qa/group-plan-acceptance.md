# Group Plan acceptance and readiness

**Overall: UNVERIFIED — no Group full-stack journey has run.** This is D-315 build-ahead
preparation for GROUP-qa, dependent on GROUP-buyer-ui and GROUP-candidate-ui. It does not
complete either dependency, authorize activation, or make GROUP-qa eligible to land or be marked done.

## Baseline and read receipt — 2026-11-25

| Item | Evidence / limit |
| --- | --- |
| Source audit | Main `f7020bb3789e562f3e7b970da6d45469fc9fbc18`; local `origin/main` matched this SHA during this edit. Static inspection only. |
| Current claim | GPT-6.1 Sol · 65d2; branch `agent/queue/group-qa`; takeover/head `2f5024b0def6c0d87ea4469e056b21d5cc79f90c`. This branch has not integrated the audit main; it is not a tested runtime candidate. |
| Previous outcome | Source branch previously held only the empty `999f0f5c4` claim, “Claim GROUP-qa: Claude Code · 297e”; no QA implementation or QA PR in the primary's inspection. The acceptance document and both assigned QA code files were absent. |
| Read receipt | Primary reports current-instruction/decision preflight through D-405. This edit reread BRIEF, PRD, AGENTS, COLLABORATION, GROUP-bulk-oct31, GROUP-plan-split (including §§6.11/9), and the newest register entries D-400–D-403/D-405 on the audit main. D-400's founder protection remains binding; D-405's grant-bound MCP approval is not Group consent authority. |
| Goal | L6 saved progress: recover a paid allocation without losing work or paying twice. L3: candidate-approved referrals use the existing creator and can lead to the next request. No measured funnel or outcome evidence yet. |

## Inspected prerequisites

On the audit main, the only Group source modules are `shared/groupPlanRecipients.ts` and
`server/groupPlanQuote.ts`, with their unit tests. The latter exports pure pricing/discount helpers;
`quoteGroupPlan` appears only in a comment, not as an export. Neither module has a production caller.

Missing on that main: `shared/groupPlan.ts`, `server/groupPlanFlags.ts`,
`docs/plans/GROUP-schema-contract.md`, `e2e/group-plan-schema.e2e.ts`,
`e2e/group-plan.e2e.ts` and `e2e/group-plan-fixtures.ts`. No Group models, declared environment
flags/Worker passthrough, provider adapter, orders, checkout, settlement, claim, grants, recovery,
delegation/send service, mounted API or buyer/candidate UI are delivered there. The packet's
required disabled defaults are therefore not runtime-verified.

The primary inspected these remote artifacts; their stated states/heads are a dated inspection,
not evidence that the packet's semantic acceptance was delivered:

| Artifact | Inspected content | Acceptance still outstanding |
| --- | --- | --- |
| [#1629](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1629) — MERGED; merge `8362b0b156fee0f02eaa979aee7be23009747c96` | Only one status-line change in GROUP-plan-split. | Shared contracts, disabled flag wiring and schema blueprint; merging the status line did not deliver them. |
| [#1644](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1644) — buyer draft; head `47b1afcb10d805af8beb86c30adb2a29c32095b2` | Only its own status line. | Buyer route/navigation, purchase/add-one/recovery screens, component and pixel evidence. |
| [#1647](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1647) — API draft; head `b39f3c2dbf82c6ff0a3fda5b1bdb4a613826e9b0` | Only its own status line. | Real service composition, authorization, jobs, database/provider integration and route-stack proof. |

Primary will report this dependency-delivery discrepancy. This handoff changes no queue/dependency
state. Parser/pricing unit coverage cannot establish a full-stack result; no substitute DTOs,
internal mock services, empty tests, skips or scaffolds are added.

## Harness prerequisites before execution

- Reuse `e2e/playwright.config.ts`: it collects `*.e2e.ts`, runs one worker with no retries,
  blocks service workers and retains failure traces/screenshots. Its webServer starts
  `scripts/e2e-server.mjs` even for direct-SQL specs; a schema-only test still needs that setup.
- `e2e/banded-schema.e2e.ts` is a reference for mysql2/promise + Drizzle and a UUID-named,
  isolated database restricted to localhost/127.0.0.1. `E2E_DATABASE_URL` is an existing QA
  input, never a production URL. Require strict SQL mode on every connection, including the
  extra `connect()` factory's concurrent connections; close all connections and drop only the
  created fixture database in `finally`. Database availability/setup and Group migration proof
  remain UNVERIFIED; do not point the harness at production or apply production SQL here.
- Reuse the watched browser contexts/sign-in helpers in `e2e/fixtures.ts` with fictional buyer,
  two candidates and verified referrer, plus ownership-negative actors. Use actual mounted
  application routes, identity resolution, MySQL transactions, creator, ledger and outbox.
  Mock provider/email only at their external boundary; never replace internal services or ledgers.
- Provider component contracts, Group schema and explicit versioned policy fixtures remain
  missing/unverified. Fixtures must name their assumptions and cannot infer GROUP-terms §8
  answers about eligibility, discount combination, terms, additions or founding treatment.
  Unresolved production terms must refuse a payable intent.
- No new environment keys or dependencies are needed for this docs step. Keep Group creation
  and delegated-send defaults disabled when delivered. Provider TEST keys stay inside Actions;
  no live recipients, card or money. If provider automation is blocked, use the current owner
  evidence route and record the gap; never work around a captcha/bot check.

## Required full-stack assertions

Every row is **NOT RUN / UNVERIFIED**. The assertions below are required future evidence,
not descriptions of observed behavior.

| Journey / boundary | Assertions through the real stack | Result |
| --- | --- | --- |
| Initial purchase and add-one replay | Confirm immutable recipients/quote/components; verify paid seats once. Same-key replay returns the original result; changed bodies require fresh confirmation. Race duplicate/concurrent additions; failed additions preserve original seats, grants and counts. | NOT RUN / UNVERIFIED |
| Payment negatives and partial payment | Unsigned/unpaid, wrong site/customer/invoice/item/quantity/amount/currency, browser success and active-but-unpaid subscription cannot grant or email. Partially paid components remain visible/recoverable, never a wholly paid order. Duplicate/reordered events satisfy each obligation once without a legacy/buyer grant. | NOT RUN / UNVERIFIED |
| Candidate claim | Bind only the paid allocation's exact verified alias to its canonical candidate. Buyer, wrong/unverified candidate, stolen/expired/replayed token and suspended/deleted accounts cannot claim. Concurrent aliases cannot bind two people; no account creation, merge or login from payment. Refund-before-claim prevents activation. | NOT RUN / UNVERIFIED |
| Allocation grants and real spends | Two allocations funded by one invoice retain distinct receipts/lots and confirmed terms. Replay never refills a spent cycle or overwrites a plan. Execute included-at-level → free → purchased-at-level through the creator; outside-band uses only free. No spend before visibility; insufficient allowance holds. Pre-pickup withdrawal reverses once; every decline and historical pickup keep the charge spent. | NOT RUN / UNVERIFIED |
| Privacy and authorization | Cross-buyer/group/order/candidate access is denied. Buyer DTOs reveal no account existence, private history, unrelated balance, login, resume bytes, referrer identity or reply. Names/files stay hidden until the referrer's own acceptance; block and document/DM controls persist. No tokens/recipient lists/private data enter logs, analytics or artifacts. | NOT RUN / UNVERIFIED |
| Consent, approval, denial and revocation race | Payment/claim grants no delegation. Candidate grants scoped, expiring, revocable draft/propose permission and approves exact job/note/owned files/current cost. Denial spends nothing. Race approve/approve, revoke/send and refund/approval under real locks; interruption after creator commit reconciles to one request and audit result on replay. | NOT RUN / UNVERIFIED |
| Per-allocation refund/cancellation | Refund-before-paid/grant blocks later activation; replay revokes only attributable unspent units once. Spent/partial/ambiguous refunds go to review without negative balances. Cancellation ends only the applicable included term. Preserve other recipients, free balances and later-purchase lots, including two invoices at the same level and late renewal events. | NOT RUN / UNVERIFIED |
| Provider/email crash and uncertain acknowledgment | Interrupt before/after provider call, binding, settlement, grant and email acceptance; persist uncertainty and reconcile after process restart. Leases/caps/backoff and recipient/day limits survive replay. Acknowledged sends do not repeat; unacknowledged provider acceptance is not inbox delivery or an exactly-once promise. Lost admin-alert acknowledgment stays recoverable; failed allocations retry without repeating successful ones. | NOT RUN / UNVERIFIED |
| Disabled defaults and accepted-obligation recovery | Pin absent-by-default UI/CTA and server creation/send refusal before reads or provider/email writes; missing schema/config fails visibly before side effects. Existing consumer obligations remain intact. Accepted Group payment/refund/outbox recovery continues when new creation/send is off. | NOT RUN / UNVERIFIED |
| Buyer/candidate screen states | Exercise loading, empty, validation, stale quote, pending/refused/partial payment, partial activation, email retry, offline/error, claim and consent/revoke/recovery states. Inspect clean-browser captures at 1280 and 390; persist truthful allocation and request results behind each screen. | NOT RUN / UNVERIFIED |

## Evidence required to replace UNVERIFIED

After the missing services/screens land, integrate current main and implement the assigned QA files
against those actual contracts. Record the exact tested commit, migration path/checksum and MySQL
metadata/apply-twice result, catalog/policy fixture versions, flag settings and sanitized command/CI
output. Link persisted order/allocation/provider-component receipts, actual request ids and ledger
source/debit/reversal/outbox rows before/after replay, race and restart; synthetic test data only.
Retain redacted external receipts plus inspected 1280/390 captures for money, consent and recovery
states; check traces/screenshots for credentials, tokens and recipient data before publication.

No runtime tests, typecheck, build, database connection, provider/email call or browser capture ran
for this docs-only handoff. There is no tested runtime SHA, migration checksum, payment verification,
activated benefit, provider-accepted email, full-stack pass or release evidence. GROUP-qa remains
UNVERIFIED. GROUP-release separately requires child acceptance, recorded GROUP-terms answers,
BANDED-release and explicit Group activation authority plus exact API/web release proof.
