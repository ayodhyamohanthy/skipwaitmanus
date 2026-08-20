# Queue Open Alerts: Private Referral Availability Specification

## Product decision

**Queue Open Alerts** are a private availability signal, not a public waitlist. When a **verified Referrer** at an exact target company intentionally opens one or more voluntary referral-review slots, the system allocates each slot to the next eligible held referral request and immediately notifies that Job Seeker that their existing request is now available for review.

> The alert must say what is true: **“A verified employee at {company} can now review your request.”** It must not reveal the employee’s identity, expose the number of remaining slots, promise an interview or job, imply a fabricated queue position, or create a candidate race.

## User value

| Participant | Value received | Required control |
| --- | --- | --- |
| Job Seeker | Their existing private request advances without re-submission or a public employee search. | One notification and one action: **View your request**. No sign-up prompt, sharing gate, or new payment step. |
| Referrer | A deliberate way to help at their real capacity with a complete candidate packet. | Opens, pauses, or closes voluntary review capacity; no quota, fee, public ranking, or penalty for declining. |
| Company corridor | Waiting demand is resolved fairly and privately as verified employee capacity becomes available. | Exact-company matching only, atomic allocation, privacy-safe operational logs, and no fabricated availability. |

## Eligibility and allocation contract

The server must process an availability opening inside one transaction. A slot is eligible only when it belongs to a currently verified Referrer whose work-email domain exactly matches the resolved company domain. A held request is eligible only when it is active, belongs to that same resolved company, is not claimed/approved/declined/closed, has not been allocated to another live slot, and remains authorized for manual follow-up.

1. The Referrer opens an explicit number of slots that reflects real capacity.
2. The server locks the availability record and selects the oldest eligible held request using a deterministic queue order (`held_at_utc`, then request ID).
3. The server creates an immutable allocation record, transitions the request to a factual **`available_for_review`** or equivalent status, and grants the allocated Referrer access to the private packet only.
4. The server creates one in-app Queue Open Alert for the affected Job Seeker and records a privacy-safe activity event.
5. The alert deep-links only to the Job Seeker’s own request. The employee identity remains hidden until the existing approved-referral conversation rule permits contact.
6. A repeated open, retry, webhook, browser refresh, or worker restart must not create another allocation or another alert for the same request/slot pair.

If no held request is eligible, the Referrer sees an honest empty state and no Job Seeker is notified. If a Referrer closes a slot before reviewing it, the server safely returns the request to the held queue and records the state change without leaking the Referrer’s identity.

## Notification contract

| Event | Recipient | Private copy | Action | Delivery controls |
| --- | --- | --- | --- | --- |
| Slot allocated | Affected Job Seeker only | “A verified employee at **{company}** can now review your request.” | View your request | In-app notification immediately; one delivery per allocation ID. |
| Review starts | Affected Job Seeker only | “Your request is being reviewed at **{company}**.” | View your request | Only after the Referrer actually opens the packet/review state. |
| Slot released | Affected Job Seeker only | “Your request is still waiting for a verified employee at **{company}**.” | Invite one trusted employee | Return to truthful held status; no blame or hidden queue rank. |

Email or push channels may be added only after an explicit notification-preference model, deliverability checks, opt-out controls, and a per-user/per-company frequency cap exist. The first implementation is in-app only so that a private referral request does not become an uncontrolled external alert.

## Required data and authorization boundaries

| Record | Minimum fields | Server-only rule |
| --- | --- | --- |
| `referral_availability_slot` | `id`, `referrer_id`, `company_domain`, `opened_at_utc`, `closed_at_utc`, `state` | Created/closed only by the verified Referrer for their own exact company. |
| `referral_slot_allocation` | `id`, `slot_id`, `request_id`, `allocated_at_utc`, `released_at_utc`, `state` | Unique live allocation per slot and request; created only in the allocation transaction. |
| `notification` | Existing owner, event type, request ID, company label, read state | No Referrer identifier, resume metadata, message content, or capacity count in the Job Seeker payload. |
| `activity_log` | Actor role, request ID, company domain, event type, timestamp | Never log resume bytes, OTPs, employee personal email, or private message content. |

## Anti-patterns explicitly excluded

Queue Open Alerts must **not** implement position jumping for invitations, public waitlist rankings, applicant-versus-applicant races, unbounded referral rewards, synthetic scarcity, fixed response promises, employee leaderboards, or a candidate guarantee of review, interview, or employment. A Referrer’s capacity is voluntary and can vary; the product must communicate availability, not manufacture urgency.

The broader growth source provided by the user correctly emphasizes rapid time-to-value, double-sided utility, shareable proof, and compounding account value. For skipwait.me, those principles are implemented through a true company-specific request, private availability advancement, voluntary outcome progress, and recipient-benefiting invitations—not through queue manipulation or public professional data.

## Regression and acceptance tests

1. An unrelated Referrer cannot open capacity for a company they are not verified for.
2. A verified Referrer can allocate only held requests matching their exact company domain.
3. One opening creates one allocation and one private notification for one eligible Job Seeker.
4. Retries and concurrent openings preserve uniqueness and deterministic queue ordering.
5. Unrelated Job Seekers, other Referrers, and non-admin users cannot read allocations, notifications, or candidate packets.
6. The alert contains company label and request action but not Referrer identity, capacity, queue position, message content, or document metadata.
7. Closing an unreviewed slot returns the request to the held state safely and emits no misleading “review” notice.
8. Mobile request history displays the availability status with one clear next action and no page-scrolling regression.
