# skipwait.me User-Back Mobile and Organic-Growth Audit

## Scope and standard

This audit reviews the active Job Seeker and Referrer journeys as a private, two-sided referral utility. A successful experience is **not** defined as maximum time in app. It is defined as a person completing a meaningful referral task quickly, understanding the next real state, and voluntarily sharing skipwait.me only when the share helps a specific recipient.

The product should retain users through **real operational value**: a truthful request timeline for Job Seekers, a useful matching-company review inbox for Referrers, and recognition only after a verified contribution. It must not rely on fake demand, hidden employee identity leakage, fabricated testimonials, forced contact import, countdown pressure, public leaderboards, or notifications that do not correspond to a real request update.

## Current journey assessment

| Journey moment | Current state | User-back assessment | Priority |
|---|---|---|---|
| Landing role choice | Two explicit mobile cards, one per role | **Strong.** The decision is clear and avoids premature sign-in. | Preserve |
| Job-link entry | One URL field, validation, reviewed-company confirmation when available | **Strong.** It makes routing the user’s mental model rather than the company directory. | Preserve and extend resolver coverage |
| Resume handoff | Resume is required; sign-in happens only when the user sends | **Strong.** It postpones commitment until value is clear. | Preserve |
| Candidate context | Resume is sent, but a Job Seeker could not add a concise note for the Referrer | **Gap.** A Referrer needs a simple reason to help; an optional note adds useful context without a second mandatory step. | Implement |
| Request success | Real company notification, progress, milestone, share link, and request timeline | **Strong.** The return trigger is a real status change rather than a fabricated activity feed. | Preserve |
| Referrer entry | Company-email OTP and clear personal-email exclusion | **Strong.** It protects the marketplace’s supply side and reduces ambiguity. | Preserve |
| Referrer inbox | Exact-company new count, save-for-later, candidate preview before decision | **Strong.** It creates a meaningful daily utility loop when real requests exist. | Preserve and measure |
| Referrer decision | Preview precedes referral decision; no blind promise | **Strong.** It protects employee autonomy and candidate quality. | Preserve |
| Share surfaces | Personal invite link with targeted email/social actions and reciprocal verified-conversion reward | **Strong.** The invitation can benefit the recipient; reward is server-verified. | Preserve, keep voluntary |

## Evidence-based principles

Employee-referral systems work best when employees can see specific jobs, refer with low administrative burden, and track meaningful referral status. Workable emphasizes quick employee submission, a referrer comment explaining fit, and progress visibility rather than a generic activity feed.[1] Avature similarly describes prioritized job sharing, tracked referrals, configurable status transparency, and shareable job-specific links as engagement mechanisms.[2]

> “Transparency as a Driver for Engagement” should mean notifications on meaningful advancement, not manufactured urgency.[2]

skipwait.me is a two-sided system: Job Seekers create demand while verified employees create trusted supply. Separate but coordinated motivations are required for the two sides, and supply-demand balance should guide incentives.[3] The existing dual reward after a new account verifies a distinct company email is aligned with that principle. It should remain conditioned on a real verified conversion, because weak qualification rules invite self-referrals and incentive leakage.[4]

## Recommended operating loops

| Loop | Trigger | User value | Guardrail |
|---|---|---|---|
| Job Seeker return | Actual request moved from Sent to Claimed or Reviewed | Real status and next action | No “activity” notifications without a persisted status change |
| Referrer return | New exact-company, unclaimed request | Review a candidate before deciding | No notification if no new matching request exists |
| Job Seeker-to-Job Seeker share | Successful request or an invite link the recipient can use | A trusted friend receives the same referral path and both receive a verified-conversion credit | One-person targeted default; no contact scraping or auto-posting |
| Referrer-to-Referrer coverage share | Company has no verified coverage | Invite one trusted colleague at that company | Never reveal the requesting Job Seeker or documents in the invitation |
| Company utility | Referrer sees a real job and candidate context | A controlled decision that protects the employee’s reputation | No gamified public ranking or pressure to accept |

## High-confidence implementation next

1. **Optional Job Seeker note.** Add a compact, optional note to the resume screen and carry it into the exact-company Referrer preview. This gives the Referrer authentic context before a decision without demanding a cover letter.
2. **Meaningful-status notifications only.** Keep return prompts tied to request creation, claim, and decision events. Do not add streaks or artificial daily challenges.
3. **Referrer inbox entry badge.** Extend the already-built New count to the post-OTP Referrer entry point only when matching, unclaimed work exists.
4. **Measurement before more incentives.** Use the admin flow-health view to track unresolved company links, no-coverage requests, preview-to-decision rate, request claim time, and verified invite conversion. Do not increase credits or rewards before observing real conversion and abuse signals.

## Explicitly rejected patterns

- Public referral leaderboards, which could pressure employees or expose identity.
- Fake “someone is reviewing your request” or social-proof notices.
- Mandatory sharing before a user can submit or review a request.
- Daily streaks or engagement tasks unrelated to a real referral outcome.
- Automatic address-book import, mass WhatsApp posting, or prechecked social posting.

## References

[1] [Workable, “How to set up a successful employee referral program”](https://resources.workable.com/hiring-with-workable/successful-employee-referral-program)

[2] [Avature, “Employee Referrals”](https://www.avature.net/employee-referrals/)

[3] [GrowSurf, “Two-Sided Marketplace Referral”](https://www.growsurf.com/glossary/two-sided-marketplace-referral/)

[4] [Voucherify, “Double-sided referrals: worth the hassle or a margin trap?”](https://www.voucherify.io/blog/how-to-launch-a-double-sided-referral-program)
