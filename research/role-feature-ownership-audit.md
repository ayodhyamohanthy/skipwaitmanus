# skipwait.me Role and Feature Ownership Audit

## Product boundary

The current product is a **private, company-matched referral workflow**. A Job Seeker requests help for one role and supplies their resume. A verified employee at that exact company chooses whether to review, accept, decline, and—only after acceptance—continue a private request-scoped conversation. The active application must not expose an alternate direct-referral or generic-messaging path.

## Active flow ownership

| Feature | Job Seeker | Referrer | Administrator | Required authorization boundary |
|---|---|---|---|---|
| Landing role choice and job-link onboarding | Starts a request | Chooses the company-email route | — | Public entry only; no identity exposure |
| Resume and optional candidate note | Uploads and submits | Views only after exact-company preview/claim | Troubleshoots without document contents | Owner or assigned exact-company Referrer only |
| Employer routing and coverage invitation | Receives company routing result; may invite one trusted employee when coverage is absent | Verifies matching work email to create coverage | Audits unresolved routes | Employer domain must never be a job-board domain |
| Request status timeline | Views own request and factual state | Creates claim/review transitions | Audits aggregate flow health | Job Seeker owns only their own request |
| Company inbox, preview, claim, save | — | Views only exact-company pending work; claims atomically | Audits only metadata | Verified work-email domain and exclusive claim required |
| Approve or decline | Sees decision outcome and any optional decision note | Chooses freely after candidate review | Audits metadata | Assigned Referrer only; one decision per request |
| Private conversation | May read/send only after approval | May read/send only after approval | Never reads message content | Exactly the two participants of the approved request |
| Referral credits and payments | Uses paid or monthly request credits | Always free for review and referral actions | Can apply recovery credits with a case record | Server-side entitlement and fulfillment only |
| Personal sharing | Voluntary personal invite link and recipient-benefiting reward | Voluntary coverage share to one colleague | Reviews flow health | Verified conversion and anti-self-invite checks |
| Opportunity publishing | May browse public opportunities | Publishes only with verified company email | Audits activity | Verified work-email profile required server-side |

## Confirmed findings awaiting remediation

| Finding | Why it matters | Correct owner | Remediation direction |
|---|---|---|---|
| Legacy tRPC `referrals.create`, `referrals.review`, and generic `messaging.send` procedures remain exposed although their screens are not active routes. | They can bypass current exact-company routing and approved-request conversation rules. | Shared security boundary | Retire these procedures and preserve only the active request-scoped HTTP workflow. |
| Referrer decision notes are persisted and included in a notification, but the Job Seeker request screen does not display the decision note. | A meaningful response can be hidden, leaving a confusing dead end after a decision. | Job Seeker status flow | Return the safe decision note with the Job Seeker’s own request and display it only after review. |
| The opportunity-publishing wizard lets a signed-in person complete fields before the server confirms their verified company-email profile. | A Referrer can spend effort before being sent into work-email recovery. | Referrer opportunity flow | Add an early verified-work-email readiness gate and a direct recovery action. |

## Retention standard

Daily usefulness should come from real changes: a request claim, a recorded decision, a new exact-company inbox item, a response in an accepted conversation, or a relevant company opportunity. The product must not use fabricated activity, forced sharing, public rankings, countdown pressure, or unrelated daily streaks.
