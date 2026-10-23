# skipwait.me PRD (product truth)

One page. DECISIONS.md owns rulings; this owns what the product is, who it serves, and what ships next. Update in the same PR as the slice that changes it (D-088).

## Who it serves
Job seekers and job referrers (owner, Oct 21 02:50 IST, D-089). Every product, design and growth choice is judged by their happiness: task success, trust, effort saved. Anything that would annoy either side is reported, not shipped.

## The seeker journey (D-174, owner Oct 23; with D-170, D-171, D-175, D-176)
1. "Where do you want a referral?": the seeker types a company name and picks it from the company list we maintain.
2. The company's live jobs appear, fetched from verified sources only. The company's own careers page is the truth; job portals such as LinkedIn are for discovery (D-175). Greenhouse boards are verified today; each further source joins after its own check (D-170). A list we cannot fetch reliably says so; an incomplete list is never called complete, and no opening is invented.
3. Filters (location, seniority and the like), then the seeker picks a job. Keyword search works without a job link, and a pasted link still works (D-170). A link verified as another employer's offers to switch company and keeps the draft; the seeker confirms the switch (D-171).
4. "Ask for a referral", a few questions, a resume, send.
5. Routing: an available verified employee gets it; otherwise it waits in the company's pool (the existing waiting queue, D-061/D-062) for verified employees who join later. After saving, the seeker is told plainly which happened, never promised an immediate referral (D-176).
6. At launch an ask does not expire (D-174). Runtime today still closes asks on the 7-day and 90-day clocks until the row `D-174-expiry-clock-removal` lands.

The directory shows companies and jobs, never referrer availability: no "Open to requests" / "Not open yet" labels, chips, open-first grouping or availability counts (D-176, replacing D-169). Built so far: the directory without availability labels (#609), posted roles on the company door with the ask composer in place (#612, #614). The company door still shows "Not open yet" (`ExploreCompany.tsx`), which row `D-176-availability-framing-removal` removes.

More job supply (D-177, packet `docs/plans/D-177-recruiter-posts-referral-drives.md`): recruiters and HR post job descriptions; verified employees publish referral drives; an "internal" opportunity is one outside candidates can see and ask for that was shared by email rather than on a careers page, labelled as employee-shared, never "careers-page confirmed". Completed referrals are validated through ATS connections where a company consents; a referrer's self-report is never labelled ATS-verified (D-179).

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
- Seeker: asks answered within 5 days vs still unanswered (asks do not expire at launch, D-174).
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
| Seeker journey: company, live jobs, filters, ask, pool (D-174) | L1 | build | partly landed (#609, #612, #614); continues as `D-174-seeker-journey-build` |
| No ask expiry at launch (D-174) | - | build | `D-174-expiry-clock-removal`, todo; runtime expiry still live |
| No availability framing on the company door (D-176) | L1 | build | `D-176-availability-framing-removal`, todo for the door |
| Keyword job search and verified sources (D-170, D-175) | L1 | research + build | feasibility study open; Greenhouse verified |
| Cross-company link switch (D-171) | - | build | inside the journey row |
| Automatic device sign-in prompt (D-172) | - | packet to write | free mechanism to qualify first; Tier 1 |
| Recruiter/HR posts and referral drives (D-177) | L1 | build | `D-177-recruiter-posts-referral-drives`, after the post lane and the journey |
| Agents and Skippy act with screen parity (D-178) | - | build | `D-178-agent-portal-access`, after the assistant and agent lanes; free-allowance question with the owner |
| ATS validation of completed referrals (D-179) | L3 | research + build | packet on draft PR #608 |

## Demand-list copy (D-086, verbatim)
- "{N} people are asking for a referral at {Company}." (N from 3 up; for 1-2 people D-086 (2) gives only "A few people asking", and the D-086 packet proposes the full sentence; never a count of 0 — D-086 (2), D-162)
- Empty: "No one has asked for {Company} yet." / "Nobody at {Company} is waiting right now. We'll tell you if that changes."
- Bonus honesty: "Most companies pay their own referral bonus when a referral they make is hired. That programme is your employer's and they pay it - skipwait.me never pays referrers."

## Claim-your-company (D-107, draft)
Free aggregate-only company dashboard, behind COMPANY_CLAIM_ENABLED and VITE_COMPANY_CLAIM (off). No per-person data or account-role changes. Same-account, single-use email link. Current-month aggregates hidden below 3 referrers or answered asks. See docs/DECISIONS.md D-107. QA and delivery verification required before enablement.

## Go-to-market (D-102, changeable)
- Referrers join any company free. Seekers ask for any company. ~~They see its true state: "Open: N verified employees" / "Not open yet: M people waiting. We'll tell you when {Company} opens."~~ Superseded by D-176 (owner, Oct 24): the directory shows no referrer availability; availability only routes the ask, and the seeker learns after saving whether it reached verified employees or waits in the pool. D-086's k-anonymous demand count (seekers asking, never referrers) is not availability and stands: under 3 shows "a few people". Empty: "No one has asked for {Company} yet."
- No fake counters, countdowns or "only N spots". Every number is from the DB and may be zero.
- Public launch when the 10 most-asked companies each have a verified referrer (confirmed by the owner, Oct 21; no payment test in the trigger).
- Loops L1 to L4. Measure: asks per company, companies with a verified referrer, asks answered within 5 days, reports-as-annoying.

## Skippy (in-product assistant, code name Skippie; D-136 to D-143)
Skippy is a chat front door to what the product already does. It asks, shows an approve or deny card, then acts through the same server functions as the normal pages. User-facing name Skippy (founder's final word, Oct 22). Code and routes keep the name Skippie for now.
- **Audiences:** seekers (ask for a referral by chat), admins (read first, then approved actions), and seekers' own AI agents (only with permission).
- **Rules (binding):** same checks as the pages, never a second rulebook (D-137). Live prices, never hardcoded. Never promises a referral. Referrers never pay or get paid (D-055).
- **Model and cost:** free model first. Paid model only with the owner's one-word yes and a hard daily cap. Per-user and global daily caps (D-138).
- **Words and data:** the seeker writes or confirms the final note. Resume-to-AI consent first. Provider data terms confirmed before launch (D-139).
- **Approvals:** cards inside Skippie. Money cards show exact amount, currency and undo cost, one-use, short expiry, fresh re-login, payment through Chargebee checkout only. Text in user data is never an instruction (D-140).
- **Seeker agents:** seeker-granted, scoped, limited, expiring (7 days default, 30 max), revocable, hashed key shown once, ask-me-every-time by default, never buy credits, audit log (D-141). Referrers see "sent via the seeker's assistant" (D-142).
- **Parity (D-178, owner Oct 24):** whatever a signed-in user can do on screen (find jobs, ask for referrals, pay, manage the account) can be done in natural language in Skippy, by people and by bots, and by outside agents through a reviewed contract (`docs/plans/D-178-agent-portal-access.md`). Parity of capability, never of privilege: same checks, prices, approvals and consent; retries never double-ask or double-charge. Any agent may ask for referrals when the user it acts for has paid referrals, spent with that user's approval; no agent-only purchase or price. Whether an agent may spend the free monthly allowance is the owner's open question: no default either way. Not built end to end yet.
- **Build order and proof:** Step 1 admin read-only. Step 2 seeker ask-only (flag on only for the test seeker). Step 3 in-chat plan or credit choice via Chargebee. Step 4 admin approval cards. Step 5 agents draft-only. Step 6 agents send with ask-every-time. Step 7 opt-in auto-send within limits. Each step ships behind a flag that stays off in prod until proven with screenshots or test output. Nothing live-money until test payments pass. Step 5 is built behind `SKIPPIE_AGENT_ENABLED` (off in prod): the seeker grants an agent on `/agents` (scope, limits, 7-day default expiry capped at 30, instant revoke, pause-all), the key is shown once and stored hashed, the agent can look up companies/prices and draft asks only (no send, no purchases, lower call caps than people), and every call lands in the seeker-readable audit log.
- **Before any seeker-facing launch:** confirm provider data terms, set the global spend cap, pass the red-team injection test, founder sees a demo on the live URL, run a trademark and name-clearance search for "Skippy" (also a known food brand).

## Pricing
One source of truth: [`docs/PRICING.md`](PRICING.md) (D-146: Lovable-style plans with credit dropdowns only; fixed passes off; packs on). Decisions are recorded in `docs/DECISIONS.md` before anything is built on them. Plan names (D-152): Entry level Referrers, Mid level Referrers, Senior level Referrers; plan ids, prices, credits and benefits unchanged. Words (D-173, owner Oct 23): the buyer-facing unit is a "referral" (formerly "credit"); each plan includes a referral allowance and extra referrals are bought in the plan; the free plan keeps 3 free referrals a month. Wording and structure only: allowances, counts, prices and the per-ask cost stay open under the D-132 audit, the server quote states the cost, and money lines change only in the terminology row (#598). Writing rule (D-153, frozen): intent reaches users faster anywhere - every page says plainly what users can do, what they get and what it costs, and promises only what works today.
