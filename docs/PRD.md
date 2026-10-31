# skipwait.me PRD (product truth)

One page. DECISIONS.md owns rulings; this owns what the product is, who it serves, and what ships next. Update in the same PR as the slice that changes it (D-088).

## Who it serves
Job seekers and job referrers (owner, Oct 21 02:50 IST, D-089). Every product, design and growth choice is judged by their happiness: task success, trust, effort saved. Anything that would annoy either side is reported, not shipped.

## Growth loops (D-087)
Every slice is tagged with the loop it feeds. Referrer supply is the bottleneck.

| Loop | Name | Feed (output that becomes the next input) | Ships with |
| --- | --- | --- | --- |
| L1 | demand-to-supply | public ask counts attract verified employees | demand list, /suggest-company |
| L2 | seeker invites referrer | a seeker's one-time link brings their own insider | bring-your-own-referrer |
| L3 | outcome-to-next-ask | a real referral outcome creates the next ask | post-outcome prompts only |
| L4 | employee request-inbox | an employee's link routes asks to them | request-inbox link |
| L5 | sourced bonus pages | sourced bonus figures pull search traffic | bonus pages (source + date) |
| L6 | saved progress | saved drafts/setups bring the seeker back | existing drafts |

## Happiness measures (count-only, weekly three-count report)
- Seeker: asks answered within 5 days vs expired.
- Referrer: second action within 30 days; median time to first action.
- Annoyance: report-as-annoying taps; per idea opened / acted / annoying counts.

## Roadmap (status board)
| Slice | Loop | Owner lane | Status |
| --- | --- | --- | --- |
| GO-LIVE-1b (PR #359) | - | QA + build | landed (#359); passes stay off (`PASS_SALES_ENABLED = false`, D-146) |
| W0 goal shell (PR #361) | L6 | build | live (#361) |
| W1 comps: /explore + ask drawer (w1-comps) | L1 | build | live (#362), reviewed in #472; the redesign to the doctrine is D-048-p3-live-review-find (D-150) |
| Demand list (D-086) | L1 | build | approved; queued as `D-086-demand-list`, packet to write (D-154); its build follows BYOR (D-162); mocks in hand |
| BYOR one-time link (idea 2) | L2 | build | approved (D-090); packet `docs/plans/D-090-BYOR.md`; building now, ahead of the demand list (owner word, D-162) |
| Employee request-inbox link (idea 1) | L4 | packet to write (`D-089-request-inbox`, D-163) | build after idea 2 |
| Sourced bonus pages (idea 3) | L5 | packet written (`docs/plans/D-099-bonus-pages.md`, D-163) | build after ideas 2 and 1 and the demand list |
| Bedrock AI provider plan | - | build | plan with owner; AWS access needed |

## Demand-list copy (D-086, verbatim)
- "{N} people are asking for a referral at {Company}." (N from 3 up; for 1-2 people D-086 (2) gives only "A few people asking", and the D-086 packet proposes the full sentence; never a count of 0 — D-086 (2), D-162)
- Empty: "No one has asked for {Company} yet." / "Nobody at {Company} is waiting right now. We'll tell you if that changes."
- Bonus honesty: "Most companies pay their own referral bonus when a referral they make is hired. That programme is your employer's and they pay it - skipwait.me never pays referrers."

## Claim-your-company (D-107, draft)
Free aggregate-only company dashboard, behind COMPANY_CLAIM_ENABLED and VITE_COMPANY_CLAIM (off). No per-person data or account-role changes. Same-account, single-use email link. Current-month aggregates hidden below 3 referrers or answered asks. See docs/DECISIONS.md D-107. QA and delivery verification required before enablement.

## Go-to-market (D-102, changeable)
- Basic referrer participation stays free. Seekers search for a company, see its job listings where available, and request a referral. Availability is internal routing only (D-176), never a browse status, label, chip or open-first grouping. After sending, explain whether the request reached verified employees or is waiting in the company's pool (D-176); exact wording follows terminology review.
- No fake counters, countdowns or "only N spots". Every number is from the DB and may be zero.
- Public launch when the 10 most-asked companies each have a verified referrer (confirmed by the owner, Oct 21; no payment test in the trigger).
- Loops L1 to L4. Measure: asks per company, companies with a verified referrer, asks answered within 5 days, reports-as-annoying.

## Skippy (in-product assistant, code name Skippie; D-136 to D-143, D-201)
Skippy is a chat front door to what the product already does. It asks, shows an approve or deny card, then acts through the same server functions as the normal pages. User-facing name Skippy (founder's final word, Oct 22). Code and routes keep the name Skippie for now.
- **Audiences:** seekers (ask for a referral by chat), admins (read first, then approved actions), and seekers' own AI agents (only with permission).
- **Rules (binding):** same checks as the pages, never a second rulebook (D-137). Live prices, never hardcoded. Never promises a referral. Basic referring is free and referrers receive no payout (D-055). D-196 approves a prospective opt-in paid referrer plan with level-matched first access; it is not implemented, and its price, contents and access window remain owner-controlled.
- **Model and cost:** free model first. Paid model only with the owner's one-word yes and a hard daily cap. Per-user and global daily caps (D-138).
- **Words and data:** the seeker writes or confirms the final note. Resume-to-AI consent first. Provider data terms confirmed before launch (D-139).
- **Approvals:** cards inside Skippie. Money cards show exact amount, currency and undo cost, one-use, short expiry, fresh re-login, payment through Chargebee checkout only. Text in user data is never an instruction (D-140).
- **Seeker agents:** seeker-granted, scoped, limited, expiring (7 days default, 30 max), revocable, hashed key shown once, ask-me-every-time by default, never buy credits, audit log (D-141). Referrers see "sent via the seeker's assistant" (D-142).
- **Build order and proof:** Step 1 admin read-only. Step 2 seeker ask-only (flag on only for the test seeker). Step 3 in-chat plan or credit choice via Chargebee. Step 4 admin approval cards. Step 5 agents draft-only. Step 6 agents send with ask-every-time. Step 7 opt-in auto-send within limits. Each step ships behind a flag that stays off in prod until proven with screenshots or test output. Nothing live-money until test payments pass. Step 5 is built behind `SKIPPIE_AGENT_ENABLED` (off in prod): the seeker grants an agent on `/agents` (scope, limits, seven days by default, capped at 30, instant revoke, pause-all), the key is shown once and stored hashed, the agent can look up companies/prices and draft asks only (no send, no purchases, lower call caps than people), and every call lands in the seeker-readable audit log. **Status (D-201, Oct 23):** steps 1, 2, 4 and 5 are on `main`, all flags off. No flag goes on in production until SKIPPY-fix (S-1 SSRF, S-2 to S-6) lands with its live proof. Step 3 sells credit packs only (D-146), with a one-use money card and a fresh sign-in (SKIPPY-stepup). In step 6 an agent may only request a send and the seeker approves each one; referrers see "Sent via the seeker's assistant" on agent asks.
- **Before any seeker-facing launch:** confirm provider data terms, set the global spend cap, pass the red-team injection test, founder sees a demo on the live URL, run a trademark and name-clearance search for "Skippy" (also a known food brand).

## Pricing
One source of truth: [`docs/PRICING.md`](PRICING.md) (D-219, owner freeze Oct 25: banded seeker plans Early to Mid, Mid to Senior and Senior to Executive with per-level extra referrals; 3 free referrals a month at any level with a verified card; legacy packs paused; passes off). The D-132 credit-dropdown model and the D-152 plan names are superseded. Decisions are recorded in `docs/DECISIONS.md` before anything is built on them. Writing rule (D-153, frozen): intent reaches users faster anywhere - every page says plainly what users can do, what they get and what it costs, and promises only what works today.

## Institute bulk purchase - approved build direction (Oct 31)

Build bulk plans and referrals for institutes using candidate email lists, with a permitted 10% institution discount and payment-verified activation plus transactional activation emails. This is the founder's new explicit feature direction, not a consumer-price change or automatic go-live. Preserve candidate identity/privacy, current catalog, money, ownership and independent-review gates. Discount stacking and precise on-behalf delegation are open in the [build packet](plans/INSTITUTES-bulk-oct31.md). Sources: `phonemsg-01M6892F33T035JZSAA1917NKY`, `phonemsg-01M6896AS74F9S9T45Y9M9FY75`. No live recipients or payment were supplied.
