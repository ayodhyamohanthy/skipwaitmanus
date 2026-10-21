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
| GO-LIVE-1b (PR #359) | - | QA + build | awaiting QA second review + PASS_SALES_ENABLED confirmation |
| W0 goal shell (PR #361) | L6 | build | designer fixes pushed; re-review pending |
| W1 comps: /explore + ask drawer (w1-comps) | L1 | build | pushed; designer review pending; /queue held for #353 |
| Demand list (D-086) | L1 | build | approved; after #361 + drawer review; mocks in hand |
| BYOR one-time link (idea 2) | L2 | design | mocks with owner 3:06 AM; approval pending; takes next free D-number |
| Employee request-inbox link (idea 1) | L4 | design | after idea 2 |
| Sourced bonus pages (idea 3) | L5 | design | after idea 1 |
| Bedrock AI provider plan | - | build | plan with owner; AWS access needed |

## Demand-list copy (D-086, verbatim)
- "{N} people are asking for a referral at {Company}." (singular for 1)
- Empty: "No one has asked for {Company} yet." / "Nobody at {Company} is waiting right now. We'll tell you if that changes."
- Bonus honesty: "Most companies pay their own referral bonus when a referral they make is hired. That programme is your employer's and they pay it - skipwait.me never pays referrers."

## Go-to-market (D-102, changeable)
- Referrers join any company free. Seekers ask for any company and see its true state: "Open: N verified employees" / "Not open yet: M people waiting. We'll tell you when {Company} opens." Under 3 shows "a few people". Empty: "No one has asked for {Company} yet."
- No fake counters, countdowns or "only N spots". Every number is from the DB and may be zero.
- Public launch when the 10 most-asked companies each have a verified referrer. PROPOSAL (unconfirmed): plus one real payment passing end to end.
- Loops L1 to L4. Measure: asks per company, companies with a verified referrer, asks answered within 5 days, reports-as-annoying.
