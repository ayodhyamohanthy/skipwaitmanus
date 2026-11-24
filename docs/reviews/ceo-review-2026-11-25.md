# CEO review — 2026-11-25

Assignment: `NEXT: CEO REVIEW (D-085)`, picked by `DeepSeek V4.1 Flash · 0564` at main `c1e31c93a`.
This is the review's own record: the decision log since the last one, the board and its blocks, the
scorecard numbers, the highest-leverage gap, and the recommendations with their strongest
counter-argument (D-023). It changes no product, price, legal text, login rule or money path.

## 1. Decisions since the last review

| ID | One line | Status |
|---|---|---|
| D-387 | Live QA can no longer pass silently; catalog sync stops counting retired items; seekers see no sample asks; fresh sessions start the picker first time | adopted |
| D-388 | Web deploy catches up after a red main; per-session working folders; dependency advisories patched; live QA acceptance reopens; stale old-design removals rebuilt fresh | adopted |
| D-389 | The remaining launch checks are proven live with the two demo accounts; the WorkOS 400 on cookie sessions gets its own row; the picker's Tier 1 text matches D-370 | adopted |
| D-390 | `LAUNCH-live-qa` waits on `OPS-live-qa-journeys`; PR #1540 does not land before that run is recorded | unblock ruling |
| D-391 | `D-174-expiry-clock-removal` block cleared by D-385's packet; the reconfirm dependency reconciled to done | unblock ruling |
| D-392 | Chargebee's bot check, not the card form, stops the automated TEST payment; the international-card proof comes from one owner payment, verified, refunded and cancelled by the runner | owner choice |
| D-393 | Test accounts test everything in a sandbox; the admin sees every sign-in and request; one support page per person | adopted |
| D-394 | Search goes live: company typeahead now, the jobs list once real sources exist, one box for title, link, company or website | adopted |
| D-395 | `D-178.read` block cleared; worktree contention resolved by D-388; PR #1522 lands | unblock ruling |
| D-396 | `D-048-p3-premium` block cleared; the landed repair satisfies the dependency; registry reconciliation to its holder | unblock ruling |

## 2. The board and its blocks

Board at pick time: the task list holds 430 rows. The picker's per-priority board reads `D-212` 47/52,
`D-174` 17/20, `BANDED-release` 10/10, `D-048-p3` 124/138, `D-178` 4/5. The stored `status` in
`docs/plans/assignments.json` reads 313 done, 96 todo, 19 owner, 2 in-review.

The stored status lags the board: rows still reading `todo` are counted as landed by the picker from
their merged pull requests (D-373 (6)). The board's numbers are the truth; the stored status is not.
That gap is itself worth closing, but it is bookkeeping, not product.

**Red or blocked rows, and whether the block needs a ruling:**

| Row | State | Holder | Does it need an unblock? |
|---|---|---|---|
| `LAUNCH-live-qa` | red, waiting | Claude Code · c2ed, quiet 8 h | **No.** D-390 already ruled it: it waits on `OPS-live-qa-journeys`, and PR #1540 must not land before that run is recorded. |
| `OPS-live-qa-journeys` | red, waiting | DeepSeek V4.1 Flash · e9e1, quiet 4 h | **No.** Its block names `QA-sandbox-requests` (D-393), which is green on PR #1569 with an active holder. The block clears when #1569 lands. |
| `D-174-seeker-journey-build` | red, pr-red | Claude Code · 695b, quiet 1 h | **No.** Active holder; PR #1575 is 21 behind main. |
| `SEARCH-universal` | red, waiting | DeepSeek V4.1 Flash · 5aa3, quiet 0 h | **No.** Built ahead of its dependency (D-315), not for landing. |
| `QA-demo-test-billing` | in progress | DeepSeek V4.1 Flash · f2a2, quiet 0 h | **No.** Active holder. |
| `D-180-referral-words` | in progress | DeepSeek V4.1 Flash · 3aec, quiet 0 h | **No.** Active holder. |
| `BANDED-release` | owner | — | **No.** D-392 put it at `owner` with one checklist; the owner's TEST-card payment is the only step left. |
| `D-048-dark-mode` | owner | — | **No.** Parked for the owner's own call. |

No block in the queue is stale, and none needs a ruling this review. Every red row is either already
ruled or held by an active session.

## 3. The numbers (`node scripts/scorecard.mjs`, last 7 days)

- Merged pull requests: **80** in the sampled day (product code 27, scripts 14, docs only 39, tests only 0, unknown 0). The sample covers 1 day of the 7, so these are floors.
- Product-code merges with no queue row: **1** (#1491).
- Tier 1 code merges without an independent pass: **19** — expected under D-370, which removed the review dependency.
- Open-to-merge: median **0.3 h**, longest **7.8 h**.
- Reverts: **0**.
- Board reports: **341** (green 37, red 6, blocked 41, review 187, landed 70).
- Live API `0e0de783` and live web `0ce4c488` were behind main at the time of the read; the deploy runs for the newest merges were in progress, so the release was catching up, not stuck.

The engineering machine is fast and stable: 80 merges, no reverts, a median of 18 minutes from open to
merge. The bottleneck is not throughput.

## 4. The highest-leverage gap

**Nothing is on sale.** `BANDED_SALES_ENABLED` is false, the legacy packs are paused, passes are unsold,
and `BANDED-release` — the only row that turns revenue on — sits at `owner` waiting for one TEST-card
payment the owner makes in his own browser (D-392). Every other row in the queue is polish on a product
that currently earns nothing.

**Second: verified-referrer supply has no live mechanism.** The product's promise is that a request
reaches a verified employee at that company. When none exists, the request waits free — correctly, but
it does not get referred. The queue has no row that grows supply: `D-015`'s founder supply sprint is
still `in progress` in the register, `D-064` set its day-30 review for Nov 18, and neither the register
nor the queue records that review's outcome. Search (D-394) makes demand visible; nothing makes supply
grow.

## 5. Recommendations (D-023: rated, with the strongest counter-argument)

**1. The owner makes the one TEST-card payment so sales can turn on. Rating 9/10.**
It is the only thing between the product and revenue, it is already specified as a single checklist
(D-392), and it moves the metric that matters: paying seekers.
*Strongest counter-argument:* selling before coverage exists risks the worst outcome for word of mouth —
a seeker pays, sends a request, and waits because no verified employee at that company can see it. The
refund path exists, but the trust damage does not reverse. That is an argument for sequencing supply
work alongside the sale, not for leaving sales off indefinitely.

**2. Register one measured supply row, or record that supply is owner work. Rating 8/10.**
The gap in §4 is real and no row owns it. A row could measure, per company, the waiting demand against
verified coverage (the `D-018` panel and `D-086` demand list already count both) and name the companies
where one more verified referrer would unblock the most requests.
*Strongest counter-argument:* D-087 forbids any post, signup, spend or message in the owner's name
without a per-item yes, and D-015 already frames supply as the founder's own sprint. An agent-built
"supply" row risks becoming automated outreach, which is spam, brand damage and a rule violation. If the
owner wants supply to stay his own work, the honest outcome is to record that and close the gap in the
register rather than queue a row nobody may execute.

**3. Close the stored-status gap in `assignments.json`. Rating 6/10.**
96 rows read `todo` that the board counts as landed. It costs every session a little time and makes the
queue look four times longer than it is.
*Strongest counter-argument:* the picker already computes landed evidence from merged pull requests, so
the stale status changes no decision; a bulk rewrite risks marking a row done that still owes acceptance
(the exact dead end D-383 corrected). Worth doing only row by row, with the acceptance checked.

## 6. Queue order

No reorder is proposed. The oldest-first order already puts the launch and banded rows first, and every
red row is either ruled or held by an active session. Recommendation 2, if the owner wants it, adds one
row rather than moving any.
