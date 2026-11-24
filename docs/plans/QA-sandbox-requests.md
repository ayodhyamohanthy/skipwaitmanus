# QA-sandbox-requests: the demo accounts test any company and any referral, with no limits, in a sandbox no real person sees (D-393)

Tier 1 · lane `qa-sandbox-requests` · branch `agent/queue/qa-sandbox-requests` · epic D-212

## Why

Owner, Nov 24 (D-393): "there should be some solution to test free referrals and paid referrals in test
accounts" and "test account should be able to test any company, any referrals free or paid there shouldnt be
any limits". Today the demo referrer (`referrer@reviewer.skipwait.me`, `server/_core/reviewerLogin.ts`) is
verified only at `reviewer.skipwait.me`, which is no company, so nothing reaches it; and a request from the demo
seeker to a real company would notify that company's real verified employees. `OPS-live-qa-journeys` (D-389)
step 3 assumes a company the demo referrer belongs to; none exists.

## The rule

A **sandbox request** is any referral request whose seeker is the reviewer demo seeker
(`seeker@reviewer.skipwait.me`, resolved from the canonical account's verified email, never from request
input). Sandbox requests:

1. **Any company, any job link.** The demo seeker may send to every company in the directory (and to a
   discovered company), with the same job-link checks, composer and money rules as everyone else.
2. **No limits.** For the demo seeker: no monthly free-referral cap, no open-request slot cap, no
   two-per-company cap and no send rate limit. Its free referrals still move through the normal ledger with
   keyed rows, so free/withdraw/refund behaviour is exercised; the free allowance simply never runs out.
   For the demo referrer: no open-claim cap.
3. **Reach only the demo referrer.** Delivery, first look, queue allocation, coverage hand-off, the inbox,
   `/queue`, review emails, Slack, in-app notices, release notices and every other referrer surface select
   only the demo referrer for a sandbox request, who acts as a verified employee of whatever company the
   request names, **for sandbox requests only**. No real employee, seeker, company admin or email address is
   ever told about, shown or counted with a sandbox request. Conversely the demo referrer never sees a real
   seeker's request (as today).
4. **Invisible to everything real.** Sandbox requests are excluded from company demand counts, coverage and
   "No referrers yet" states, referrer impact and public profiles, company claim dashboards, the sitemap,
   analytics funnels, the daily ops and money checks' business totals, and any admin metric (admin lists may
   show them labelled "Test").
5. **Privacy rules still run.** D-019(e) holds inside the sandbox (no seeker name or files before the demo
   referrer's acceptance), so the owner can test it.

Decide the request's sandbox status once at creation and carry it on the request (a column needs its own
forward-only migration row first, AGENTS.md "migration first"), or derive it from the seeker's identity at the
few chokepoints (referrer selection for delivery and notification, the counting queries). Either way one
helper (`isSandboxRequest`, `isSandboxAccount`) is the only definition.

**Read before writing:** `server/db.ts` (create, quote, delivery, allocation, first look, claim caps, open-slot
caps), `server/coverageDelivery.ts`, `server/referralReviewDispatch.ts`, `server/reviewDeliveryRetry.ts`,
`server/referrerSlackDelivery*.ts`, `server/companyDemand*.ts`, `server/companyCoverage*.ts`,
`server/impactCard*.ts`, `server/dailyMoneyCheck.ts`, `server/dailyOpsCheck.ts`, `server/_core/reviewerLogin.ts`,
`shared/openAskSlots.ts`, `shared/creditLedger.ts`.

## Hard limits (stop and report rather than work around)

- A sandbox request must never reach a real person by any channel. A daily check flags any sandbox request
  with a non-demo referrer, notification, email or Slack delivery as an incident.
- The demo referrer must never see a real request; the demo seeker's unlimited allowance must never apply to
  any other account.
- No change to prices, plan contents, legal text, the login rule, or any real account's limits.

## Tests (red first)

For each delivery and notification path: a sandbox request to a company with real verified employees reaches
only the demo referrer and writes no notice, email or Slack row for anyone else; a real request never reaches
the demo referrer; the demo seeker sends a fourth and fifth free request in a month and a third open request to
one company; a real seeker still hits every cap; demand/coverage/impact counts ignore sandbox requests; D-019(e)
before and after the demo referrer accepts; withdrawal before pickup returns the free referral once.

## Acceptance

Focused tests, `pnpm check`, required CI. Then, on the deployed exact SHA, as the demo accounts: the demo seeker
sends requests to two real companies (one with real verified employees) beyond the monthly cap, the demo
referrer sees and accepts one without having seen the seeker's name first, the seeker withdraws another before
pickup, and the daily check shows no real recipient. Captures at 1280 and 390.

## Status

- QA-sandbox-requests: todo
