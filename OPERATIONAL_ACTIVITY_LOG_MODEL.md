# Operational Activity Log Model

The administrator log is an **operations and diagnostics** record, not a surveillance feed. It records the actor, action category, outcome, affected company or resource identifier, and a deliberately minimized metadata summary. It never stores document bytes, resume text, referral-email content, Clerk tokens, OTP values, session cookies, or message bodies.

| Event category | Recorded metadata | Excluded data |
| --- | --- | --- |
| Document upload and secure retrieval | File type, byte count, attachment identifier, outcome | File bytes, signed URL, document filename, document text |
| Company referral request | Request identifier, company domain, attachment count, notified-employee count | Resume content, Job Seeker email, employee identities shared with Job Seeker |
| Work-email enrollment | Company domain and success/failure status | Full work email, OTP, Clerk challenge data |
| Claim and decision | Request identifier, company domain, action outcome | Candidate document content and referral message text |
| Opportunity post | Opportunity identifier, company domain, posting kind | Employee identity on the public card |

Only an application user whose persisted `users.role` is `admin` can request the activity feed. The administrator view is limited to the most recent 250 events and supports an action-text filter. It shows the actor’s account name or email only within the protected administration screen.
