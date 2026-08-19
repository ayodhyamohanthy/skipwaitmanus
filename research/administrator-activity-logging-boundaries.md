# Administrator activity logging boundaries

The activity system records **material server-side workflow requests** made by authenticated users, including their normalized route, HTTP method, response status, duration, resource reference, and outcome. Existing domain events such as referral creation, request claim, review decision, document upload, work-email enrollment, personal-invite claim, opportunity publication, and administrator recovery actions remain separate, higher-level events.

The administrator viewer may show the actor account, timestamp, action, resource reference, company domain where independently known, and minimized troubleshooting metadata. It must never record or display document bytes or file names, resume contents, referral messages, target URLs, OTPs, email-verification codes, auth headers, session values, invitation codes, payment instruments, or raw request bodies.

Every log remains administrator-only. Unauthenticated or denied requests may be represented as anonymous operational failures, but they are never associated with guessed user identities. Event search is limited to stored, minimized fields such as actor, action, company domain, resource ID, and outcome.
