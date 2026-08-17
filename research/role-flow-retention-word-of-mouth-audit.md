# skipwait.me: Role Flow, Retention, and Word-of-Mouth Audit

**Author:** Manus AI  
**Scope:** Current product experience only; payment work is deliberately out of scope.  
**Product stance:** Build a trusted career-help network, not an attention product. The intended return behaviour is to make progress on a real job or help a real person—not to create habitual, anxious checking.

## Executive assessment

skipwait.me already has a strong product thesis: it makes a warm introduction feel **private, bounded, and human**. The current product has several good foundations for this. It delays sign-in until the user commits to sending, protects Referrer identity, persists referral drafts, restricts resume access until a verified employee claims, and provides an ethical company-invite card that never exposes candidate information. These choices remove anxiety rather than manufacturing it.

The important gap is not a lack of hooks; it is a lack of a **persistent relationship after the first meaningful action**. A Job Seeker can submit a request but has no dedicated request home or clear status timeline to return to. A Referrer can help once but has no lightweight “impact and next useful action” loop. The Admin can diagnose raw activity but cannot quickly see where a role flow is losing trust or liquidity. The next product priority should therefore be a role-aware **Return Home** rather than more acquisition surfaces.

> **North-star principle:** Every return prompt must answer one useful question: *“What changed, what can I do next, and why is it worth my attention?”*  
> If it cannot, skipwait.me should not send it.

| Current strength | Why it matters psychologically | Present gap |
|---|---|---|
| Delayed sign-in and draft persistence | Reduces early commitment anxiety and preserves user agency. | The post-sign-in return destination is not a durable personal home. |
| Verified work-email / hidden Referrer model | Creates safety, seriousness, and discretion. | The benefit of returning after verification is not made visible enough. |
| Required resume with optional extra documents | Makes the request concrete and signals respectful effort. | Users do not get an ongoing “application packet” they can reuse. |
| Private Opportunity Wall | Turns anonymous employee supply into discovery without exposing people. | It lacks a reason to revisit beyond browsing a static list. |
| Company Invite Card | Uses a specific, privacy-safe ask to create supply. | The invitation is not yet framed as strongly around recipient benefit and one trusted person. |
| Admin activity log | Enables privacy-safe diagnosis. | It is an event ledger, not a flow-health or liquidity dashboard. |

## 1. Current end-to-end journeys

### 1.1 Job Seeker: from intent to referral request

The Job Seeker route is intentionally narrow. The landing page offers a clear “I need a referral” decision. Onboarding asks only for a first name and a valid Target Role URL, saves the draft locally, and moves to the resume step. The user can select a resume before authentication; sign-in is requested only when they press **Send private referral request**. After successful submission, the system privately routes the request to verified employees of the company inferred from the job link. The success state provides a hiring-manager email draft, a remaining-token view, and a company-specific invite card.

This flow already uses several healthy behavioural mechanics. The user sees an immediate, meaningful next action rather than a long form; draft persistence protects unfinished work; the resume requirement signals that the ask is respectful; and the post-send explanation reduces uncertainty about privacy and routing. These are consistent with candidate-experience research emphasizing clarity, respect for the candidate’s time, and timely communication rather than form length or performative engagement.[1] [2]

| Journey moment | Current user thought | Current hook | Recommendation |
|---|---|---|---|
| Landing | “Can this actually help me?” | Two role-specific paths; 3 included requests; privacy-led copy. | Add a truthful outcome promise: “You will always see what stage your request is in.” |
| Target Role URL | “This feels quick and specific.” | Small form, link validation, draft saved. | Recognize the employer domain immediately: “We’ll privately route this to verified employees at `company.com`.” |
| Resume selection | “I have done my part.” | Required resume; optional support material; delayed sign-in. | Show a lightweight completion cue: “Application packet ready” rather than a generic file list. |
| Secure send | “Will this expose me or waste my time?” | Sign-in at the moment of commitment; private routing explanation. | Before send, show a one-line expectation: “One employee may claim; identities remain hidden.” |
| Success | “What happens now?” | Company routing explanation and editable email draft. | Replace the terminal success page with a durable request timeline and a meaningful return action. |
| Re-entry | “Is there any update?” | Account menu and settings only. | Create **My Requests** as the default signed-in destination, with only active requests, state changes, and relevant opportunities. |

### 1.2 Referrer: from discretionary help to repeat contribution

The Referrer flow begins with an explicit identity proposition: “Give referrals through your verified work email.” After secure sign-in, a person verifies a company email via OTP, then sees only private requests matching that company. They claim a request before viewing the candidate’s documents, review the context, approve or decline, and then receive a concise completion state with a company-invite card.

The present flow is strong at **risk reduction**: Referrers are not publicly searchable, they control whether they act, and they get contextual documents only after claim. This is essential because job referral is a reputational act. However, approval currently leads to a fairly final state. It should instead create a gentle contributor loop: *help → see private impact → choose a small next action → return when there is genuinely another relevant request.*

| Journey moment | Current user thought | Current hook | Recommendation |
|---|---|---|---|
| Referrer landing or invite | “Will I be publicly visible or pressured?” | Strong privacy assurance and opt-in sign-in. | Keep this framing; add one proof point about control: “You can decline, snooze, or leave any time.” |
| Work email verification | “Is this worth the extra step?” | OTP at the exact point where company access is needed. | Explain the immediate payoff before the OTP: “This unlocks only your company’s private inbox.” |
| Company inbox | “Is there a real person I can help?” | Role URL, document count, exclusive claim button. | Add a succinct *candidate readiness* summary after claim—not before—to reward commitment without exposing too much. |
| Review decision | “Can I help responsibly?” | Resume preview, download, optional note, approve/decline. | Add **Save for later** with an honest expiry and a candidate-visible, non-shaming status. Do not use countdown pressure. |
| Completion | “Did my action matter?” | Approval/decline acknowledgement and invite card. | Provide a private impact receipt: “You made a warm-introduction decision for one person.” Avoid outcome claims that are not verified. |
| Re-entry | “Why open this again?” | No dedicated Referrer home. | Create **My Company Inbox** with only new, claimed, or saved requests; use opt-in company-specific notifications. |

### 1.3 Opportunity Wall: discovery becomes a supply loop

The Opportunity Wall is skipwait.me’s best existing growth surface. It is public to browse, makes the company—not an employee—the visible unit, pre-fills the Job Seeker’s target link, and includes an employee-side “Share an opportunity” path. It also allows a visitor to share a company-coverage invitation through native sharing or copy.

The Wall works because the artifact is useful before it is promotional: a person can find an opportunity, and a worker can surface a hiring signal without becoming public. It should remain a **bounded directory of verified company signals**, not become an infinite social feed. A clear end state and real filtering are more trustworthy than engagement-maximizing scroll patterns.

### 1.4 Admin: from raw diagnostics to marketplace stewardship

The Admin route correctly focuses on privacy-safe operational activity, avoids document and OTP contents, and supports filtering. That is a solid diagnostic foundation. It does not yet help the operator answer the three questions that determine marketplace health:

1. **Demand:** Are Job Seekers completing a request and receiving a clear status?
2. **Supply:** Which verified company corridors have requests but no active Referrer coverage?
3. **Trust:** Where do people abandon, receive errors, or fail to return after a meaningful event?

The Admin should be a **stewardship console**, not a surveillance console. It should report aggregated, privacy-preserving flow health—never private candidate contents or employee identity.

## 2. The psychological hooks skipwait.me should deliberately use

The hooks below are not intended to make people compulsively open the app. They are designed to make helpful action feel clear, safe, and socially worthwhile.

| Hook | Practical expression in skipwait.me | Ethical boundary |
|---|---|---|
| **Goal clarity** | One role choice; one target URL; one next action. | Never hide the actual workload or payment requirement. |
| **Progress and closure** | “Role saved → packet ready → request routed → employee claimed → decision shared.” | Only display real system events; no fake progress or artificial waiting. |
| **Agency and autonomy** | Hidden identity, explicit claim, decline, sign-out, and notification choices. | No prechecked contact import, auto-invites, or difficult opt-outs. |
| **Trust through transparency** | Explain what data is visible to whom at every handoff. | Do not imply a referral is guaranteed or that an employee has viewed a request unless true. |
| **Identity-based contribution** | “I help people access the opportunities my company already has.” | Do not pressure employees to make referrals that risk their reputation. |
| **Reciprocity** | After receiving help, invite one relevant employee or share a useful opportunity. | Make the give-back optional and recipient-benefiting—not debt or guilt. |
| **Social currency** | Share an anonymous, verified company opportunity or company-coverage invitation. | Never reveal candidate, Referrer, role-request, or document details. |
| **Competence and efficacy** | Resume packet readiness; high-quality request context; thoughtful-referral checklist. | No meaningless badges or inflated “impact” claims. |
| **Belonging** | A quiet “private company coverage” network with clear norms. | No follower counts, popularity contests, or public leaderboards. |

Research supports the direction of these choices. In online communities, reciprocity and a sense of belonging can reinforce participation; the transferable product lesson is to make exchanges fair, useful, and norm-governed rather than merely extractive.[3] Candidate-experience evidence likewise points to transparent expectations, respect, and efficiency as the durable mechanisms—not friction or surprise.[1] [2]

## 3. What to strengthen first

### Priority 0 — Create role-aware Return Homes

Build two signed-in homes and make them the default re-entry points after a meaningful action.

**Job Seeker: My Requests.** The page should show only active requests, a plain-language state timeline, the next expected event, the date of the last real update, and a small “find another relevant opening” action. Example state copy: “Request sent privately to eligible employees at `company.com`.” If nothing has changed, say that plainly—never use simulated activity.

**Referrer: My Company Inbox.** The page should show new requests, saved requests, and requests the person has already decided on. It should include a small, optional “Share a hiring signal” entry. The correct recurring reason to open is a new, relevant company request—not a daily streak.

> **The retention loop should be state-driven, not calendar-driven.** A return is earned when a request moves, a relevant opportunity appears, or a person chooses to contribute again.

### Priority 1 — Make status transparency the core Job Seeker promise

The most powerful Job Seeker hook is not a badge or a token counter. It is **relief from the black box**. Define the request lifecycle in user language and expose it consistently:

| Internal reality | Job Seeker-facing wording | Allowed notification |
|---|---|---|
| Request created | “Your request was privately routed to eligible employees.” | Immediate confirmation. |
| Employee claims request | “A verified employee has chosen to review your request.” | Immediate, factual update. |
| Referrer makes a decision | “Your request has a new outcome. Open to see the next step.” | Immediate outcome update. |
| No claim yet | “No employee has claimed this request yet. Your request remains private.” | Only a user-chosen, low-frequency check-in—never a guilt prompt. |
| Request closes | “This request is now closed. You can reuse your packet for another opportunity.” | Closure and reuse path. |

This uses the same candidate-experience principle that Gallup highlights: transparent role expectations and efficient treatment of a candidate’s time affect how people evaluate the process.[1]

### Priority 2 — Make the Referrer contribution feel safe, finite, and meaningful

Referrers need a product that protects their judgement. Add a three-part review frame:

1. **Readiness:** “Resume attached; role link verified; request is private.”
2. **Choice:** “Claim, save for later, or decline. You control the introduction.”
3. **Closure:** “A decision was recorded; the candidate receives a respectful status.”

The post-decision state should deliver a modest **impact receipt**—not gamified points. For example: “You made a thoughtful decision on one private request.” Then offer exactly one optional next action: “Share an anonymous hiring signal” or “Invite one trusted teammate to cover `company.com`.”

The invitation should benefit the recipient first. Harvard Business School research found recipient-benefiting referral incentives can outperform sender-benefiting ones because they preserve reputational benefit for the sender while reducing the recipient’s action cost.[4] In skipwait.me, that means the copy should lead with: **“This gives a trusted colleague a private way to help or find help at their company”**, not “Help me grow coverage.”

### Priority 3 — Turn company coverage into a clean word-of-mouth loop

The existing `CompanyInviteCard` is the right mechanism. Improve its framing and placement rather than multiplying share buttons.

| Trigger moment | Specific one-person ask | Recipient benefit | Safety boundary |
|---|---|---|---|
| Job Seeker request successfully routed | “Know one trusted person at `company.com`?” | They can opt into a private company inbox; the candidate is never exposed. | No auto-send; no role details. |
| Referrer approves or declines | “Invite one teammate to help cover this company.” | Shared load; more chances that future requests find a willing reviewer. | Avoid rewarding volume or approval rate. |
| Employee publishes an opportunity | “Share this anonymous company signal with someone who may benefit.” | The recipient sees a real opportunity, not an ad. | Use only public/shareable role data. |
| Opportunity Wall visitor sees a company they know | “Work there or know someone who does?” | They can add private coverage with a verified work email. | No contact upload or unsolicited message. |

The app should measure invite **quality**, not blast volume: invite created, recipient opened, verified work email, first inbox view, and first meaningful action. Yale’s summary of word-of-mouth research is useful here: free access and referral incentives can complement each other when a product has real social value, but the cost of spending relationship capital still matters.[5] skipwait.me should therefore ask for one appropriate colleague, at a high-trust moment, not a contact-list broadcast.

### Priority 4 — Give the Opportunity Wall a re-entry reason

Keep the Wall small, current, and practical. Add only features that create genuine relevance:

* Follow a small number of companies or roles, with explicit opt-in alerts when a **new verified opportunity** appears.
* Let Job Seekers save a role packet and reuse it for a new matching opportunity.
* Give verified employees a low-effort “hiring signal” re-post or refresh action, with an expiry reminder they control.
* Add a truthful company-coverage marker only when it is safe to aggregate, such as “private coverage available” rather than a headcount. Never imply that a Referrer is available or obliged to help.

## 4. Re-sign-in and retention design

Re-sign-in should feel like returning to unfinished real-world work, not logging back into a social network. The first screen after a legitimate re-authentication should restore the prior context where possible.

| User state on return | Default destination | First message | One relevant action |
|---|---|---|---|
| Drafted Job Seeker request | Saved draft | “Your role link and packet are still here.” | Continue request. |
| Active Job Seeker request | My Requests | “Here is the latest verified status.” | View request or explore matching openings. |
| Verified Referrer with new company request | My Company Inbox | “A private request is ready to review at `company.com`.” | Review or save for later. |
| Verified Referrer with no new request | My Company Inbox | “No new private requests right now.” | Share an opportunity or manage notification preference. |
| Admin | Flow Health | “Here are the paths that need attention today.” | Inspect a failed stage, not individual private content. |

Use **permission-based notifications**. After a user gets value, ask: “Would you like an update when this request changes?” or “Would you like private inbox alerts for `company.com`?” This aligns return behaviour with a user’s intention. Dark-pattern research warns against guilt-based reminders, fake scarcity, and endless engagement; in a career product, these tactics would directly undermine the trust the platform depends on.[6] [7]

## 5. Admin product: measure marketplace health without surveilling people

The current activity log should remain available for diagnostics. The present operational ledger contains only two recorded action categories—`admin.activity_viewed` and `company_referral.inbox_viewed`—so it cannot yet measure end-to-end activation, request progression, or invitation quality. Add a high-level dashboard above it with aggregate, privacy-safe metrics.

| Health question | Metric | Why it matters | Privacy rule |
|---|---|---|---|
| Are Job Seekers activating? | Landing → role choice → target link → resume → authenticated send conversion. | Locates cognitive-load and sign-in friction. | Aggregate by day and route only. |
| Is supply responding? | Request routed → claimed → decision median time, by company corridor. | Shows whether coverage has liquidity. | Suppress small cohorts; never expose employee names. |
| Is trust breaking? | Verification errors, upload failures, denied access, abandonment after a step. | Detects product failures before they become word-of-mouth damage. | Metadata only. |
| Is the network growing organically? | Invite created → opened → work email verified → first meaningful action. | Separates valuable invitation from superficial sharing. | Do not track private message contents. |
| Is retention earned? | Return after a verified state change; packet reuse; opportunity-to-request conversion. | Measures usefulness rather than daily active time. | No intrusive behavioural profiling. |

## 6. Explicit anti-patterns to reject

skipwait.me should reject the following even if they increase a short-term metric:

| Do not build | Why it is harmful | Better alternative |
|---|---|---|
| Fake “employees are viewing your request” signals | Destroys trust and can exploit anxious Job Seekers. | Show only actual routing, claim, and decision events. |
| Countdown timers for employee response | Pressures Referrers and creates anxiety for Job Seekers. | Use an honest, non-punitive status and optional user-set check-in. |
| Public Referrer leaderboards | Risks reputation, privacy, and low-quality approvals. | Private, non-competitive impact receipts. |
| Contact scraping or automatic invitations | Consumes relationship capital without consent. | One-person, user-composed invite at a meaningful moment. |
| “Invite 10 friends” growth gates | Adds friction and makes help feel transactional. | Optional company-specific coverage invitation. |
| Fabricated testimonials, counts, or success rates | Violates trust and consumer-protection expectations. | Use only verifiable aggregate outcomes, with clear methodology. |
| Daily streaks for job searching or helping | Converts a high-stakes task into an anxiety loop. | State-driven, user-opted return prompts. |

## 7. Recommended build order

The work should be sequenced around the durable product loop—not around social sharing UI.

| Order | Capability | Primary owner journey | Success criterion |
|---|---|---|---|
| 1 | **My Requests** with factual status timeline and return destination | Job Seeker | A submitted user can always see their current state and next appropriate action. |
| 2 | **My Company Inbox** with new / saved / completed request views | Referrer | A verified employee has a clear reason to return only when relevant. |
| 3 | Optional, state-triggered update preferences | Both | Users control whether and when they are contacted. |
| 4 | Referrer impact receipt and one-action contribution prompt | Referrer | A decision can lead to a private invite or opportunity post without pressure. |
| 5 | Improve Company Invite Card copy to emphasize recipient benefit and one trusted person | Both | Shares remain privacy-safe and convert to verified company coverage. |
| 6 | Admin Flow Health dashboard and privacy-safe funnel instrumentation | Admin | Operator can identify friction and corridor coverage gaps without viewing sensitive content. |
| 7 | Opportunity Wall follows and packet reuse | Job Seeker / Referrer | Re-entry occurs because of new relevant value, not routine checking. |

## Conclusion

The most defensible psychological hook for skipwait.me is **certainty with dignity**. A Job Seeker should return because they can see the truthful status of a meaningful ask. A Referrer should return because a private, relevant opportunity to help is waiting—on their terms. An Admin should return because the product clearly shows where trust or marketplace liquidity needs attention. Word of mouth should arise from useful, recipient-benefiting, company-specific artifacts, not from coercive invite mechanics.

The platform should not try to make people “hooked” in the social-media sense. It should make the next helpful action so clear, private, and worthwhile that people choose to come back—and recommend it to the one person for whom it is genuinely useful.

## References

[1]: https://www.gallup.com/workplace/651650/lasting-impact-exceptional-candidate-experiences.aspx "Gallup — The Lasting Impact of Exceptional Candidate Experiences"
[2]: https://pdxscholar.library.pdx.edu/busadmin_fac/121/ "McCarthy et al. — Improving the Candidate Experience"
[3]: https://pmc.ncbi.nlm.nih.gov/articles/PMC9932787/ "Wu et al. — Impact of Social Support and Reciprocity on Consumer Well-Being in Virtual Medical Communities"
[4]: https://www.hbs.edu/faculty/Pages/item.aspx?num=56492 "Gershon, Cryder & John — Why Prosocial Referral Incentives Work"
[5]: https://insights.som.yale.edu/insights/how-should-companies-fuel-word-of-mouth "Yale Insights — How Should Companies Fuel Word of Mouth?"
[6]: https://www.cambridge.org/core/books/digital-behavior/ethics-in-digital-behavior-design/BC3B7FDCA31FC8FE662D3C119F88C311 "Cambridge University Press — Ethics in Digital Behavior Design"
[7]: https://uxpamagazine.org/ethical-ux-patterns-building-trust-without-manipulation/ "UXPA — Ethical UX Patterns: Building Trust Without Manipulation"
