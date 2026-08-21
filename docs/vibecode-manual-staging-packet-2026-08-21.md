# SkipWait.me → VibecodeApp: Manual Staging Packet

**Purpose.** Use this packet to continue the SkipWait rebuild yourself in VibecodeApp. It is designed to keep the current verified source deployment as the rollback reference until the Vibecode staging application proves functional and security parity.

> **Do not change `skipwait.me` DNS, bind the domain, copy real customer data, add live payment credentials, alter the live Chargebee webhook, or disable the current application during these steps.** This is a staging rebuild only.

## 1. Open the staging workspace

Open the existing Vibecode workspace: <https://www.vibecodeapp.com/workspace/019e0270-08e6-735f-8291-5bbb2b667f58>.

The workspace contains a submitted rebuild request and several update groups, but its build completion could not be independently verified. First, open **Logs** and **Code**. If the prior request is still running, let it finish. If it has failed or stopped, paste **Prompt 1** below into the workspace chat. Do not use “Deployments,” “Payment,” “Env Var,” or “Auth” to configure production values yet.

| Before you proceed | Pass condition |
| --- | --- |
| Existing application | It is identified as a non-production staging target; any unrelated legacy code is replaced or isolated. |
| Temporary deployment | A Vibecode temporary HTTPS URL exists. It is **not** `skipwait.me`. |
| Secrets | No provider key, database export, Clerk cookie, Chargebee live credential, Resend key, or customer record appears in source code, browser output, or prompts. |
| Evidence | You can open the project’s file tree, build log, and test command/output. |

## 2. Prompt 1 — secure foundation only

Copy and paste the following prompt exactly if the first milestone has not completed. This is intentionally limited: it establishes secure architecture before visual/product work.

```text
We are rebuilding skipwait.me in this workspace as a STAGING-ONLY production-grade job-referral PWA. Replace the unrelated current application with a clean baseline, but do not touch any external production system.

Hard safety boundary: DO NOT bind or change skipwait.me, DNS, live Chargebee webhook, live payment providers, production secrets, production database, production storage, customer data, real resumes, real users, or existing source deployment. Do not fabricate users, referrals, payments, messages, resumes, reviews, activity, rankings, testimonials, or sample social proof.

First inspect the current codebase. Then implement ONLY Milestone 1 and stop for review:

1. Create a clean React PWA with enterprise blue #0B57D0, slate surfaces, DM Sans, mobile-first h-dvh flow shells, no mobile page scrolling, one primary action per flow screen, and no purple/violet.
2. Use Better Auth with two roles: Job Seeker and Referrer. Preserve administrator access as an auditable server-side role assignment for ayodhya@skipwait.me, but do not create a real account or paste any credential.
3. Implement server-enforced company-email-only Referrer OTP. Personal email domains must be rejected server-side; the one-time code must be sent only to the entered company email; wrong and expired codes must fail safely.
4. Add protected server routes, role guards, authentication/session handling, security headers, validation, JSON-safe errors, rate controls, and privacy-safe activity logging.
5. Add a private document-storage abstraction. No document may be public or served from a permanent URL. Do not upload a real resume.
6. Create tests that prove unauthenticated, non-admin, cross-user, and cross-company access is denied. Add tests for the work-email rule and private-storage authorization boundary.

Use Vibecode-native Hono, Prisma/SQLite, Better Auth, cloud storage, and server environment variables where appropriate. Do not imitate Express, tRPC, Drizzle, MySQL, or Clerk line-by-line.

Run the type check, tests, and production build. When finished, report: exact files created/changed; test command and results; build result; temporary staging URL; and known gaps. Stop before referral workflows, payments, data migration, live configuration, or domain cutover.
```

## 3. Verify Milestone 1 before asking for more

Use **Code** and **Logs** to verify the following. Do not rely on a chat claim such as “done.”

| Check | Evidence required to pass |
| --- | --- |
| Better Auth roles | Server-side role middleware/guards exist; role checks are not merely hidden UI elements. |
| Work-email Referrer flow | Code rejects personal domains on the server and tests show OTP delivery targets the typed company address. |
| Private files | Storage helper uses private objects and authorization checks; no document URL is hard-coded or public. |
| Access controls | Tests deny unauthenticated, non-admin, cross-user, and cross-company access. |
| Activity log | Event metadata is privacy-safe; it contains no resume body, private-message body, or document URL. |
| Staging isolation | No live keys, custom domain, real-data import, or live webhook configuration appears. |

If any row fails, keep the project in **Milestone 1** and ask Vibecode to repair only the failed control. Do **not** move to product flows yet.

## 4. Prompt 2 — core referral workflow

Paste this only after every Milestone 1 control has evidence.

```text
Milestone 1 is verified. Keep every staging-only safety boundary unchanged: no skipwait.me DNS or domain binding, no live payment credentials/webhook, no production secrets, no production database/storage, no real data import, and no fabricated activity.

Implement ONLY Milestone 2: the core private referral workflow plus tests.

1. Job Seeker flow: capture a job URL, resolve the real employer only when independently verified, show the identified company, collect a private resume with strict extension/MIME/signature/size checks, and create a referral request. If employer identity is uncertain, stop safely and request a careers-page URL; never guess.
2. Credit behavior: a valid request consumes one credit even when no verified Referrer covers that company. No-coverage requests remain private for manual follow-up. Never credit from client-side state or a browser callback.
3. Exact-company routing: only verified employees at the independently resolved employer can view or claim the request. Employees at LinkedIn, Wellfound, Indeed, Glassdoor, neighbouring companies, or unrelated domains must not see the candidate packet merely because a job was posted on their platform.
4. Referrer inbox: show the candidate’s private note, role URL, and authorized resume preview before a decision. Referrers participate free of charge. Provide one clear accept action and concise factual decline reasons.
5. Conversation: permit Job Seeker–Referrer messaging only after approval. Keep messages private and prohibit public feeds, rank, queue position, or referral guarantees.
6. Notifications: private in-app notification centre with unread badge for workflow events only. Do not create fake activity, public social proof, scarcity, streaks, or reward spam.
7. Preserve the mobile-first UI: one clear action per screen, h-dvh/overflow-safe layout, no page scrolling on phone flows, in-flow header uses Back only, and use blue/slate rather than purple.

Add integration tests for positive and negative employer routing, document ownership, cross-company denial, no-coverage handling, pending-only decisions, and approved-only conversation. Add controlled browser/mobile smoke tests using synthetic records only.

Run type check, test suite, and production build. Report exact evidence and stop. Do not implement payments, production data migration, or domain cutover.
```

## 5. Prompt 3 — operations, growth, and test payments

Paste this only after the Milestone 2 test matrix passes.

```text
Milestone 2 is verified. Preserve the staging-only isolation boundary: do not bind skipwait.me, alter DNS, add live payment credentials, alter the live Chargebee webhook, or import production records.

Implement ONLY the following staging scope:

1. Admin: least-privilege administrator guard, privacy-safe activity log, error-handling queue, token/credit recovery controls, coverage follow-up, and export/deletion request controls. The persistent admin identity is ayodhya@skipwait.me, assigned only by authenticated audited server action.
2. Privacy-safe growth: one-person personal invite, company-coverage invite, voluntary factual share cards for accepted referrals, and private Referrer impact summary. Do not build public employee directories, public resumes, leaderboards, rankings, contact imports, invitation-based queue priority, false scarcity, fabricated reviews, or outcome guarantees.
3. Queue Open Alerts: a Referrer can voluntarily open real review capacity; the server allocates only the next eligible request in original hold-time order for that exact company and notifies only that Job Seeker. Never disclose rank, slot count, employee identity, or capacity. Invitations must never change queue order.
4. Fast-Track Links: verified Referrers may create only company-scoped opaque/non-identifying links. Public resolution reveals the company label only, and a request must independently match the same employer before it is privately assigned. Never promise review or bypass the employer’s application process.
5. Test billing only: use Chargebee test configuration and a test webhook. Validate automatic India INR/Razorpay versus international USD/PayPal routing server-side. Verify a browser return creates no credits, while one verified signed test provider event creates exactly one entitlement and duplicate delivery remains idempotent.

Add focused authorization, privacy, payment-idempotency, and no-queue-manipulation tests. Run the full type check, tests, production build, and temporary-host smoke checks. Report evidence and stop before live credentials, domain cutover, or production data migration.
```

## 6. Staging acceptance checklist

Before any live configuration, all of the following must be evidenced by tests and controlled manual checks.

| Area | Required evidence |
| --- | --- |
| Authentication | Job Seeker signup/signout/session recovery works; Referrer personal email is rejected; code is delivered to the entered company email; wrong/expired OTP fails safely. |
| Employer matching | Tested job-board and careers-page links resolve only the real employer. Unknown employer blocks the request rather than guessing. |
| Referral lifecycle | Synthetic Job Seeker request appears only in an eligible exact-company Referrer inbox; Referrer can review packet, accept or decline; conversation opens only after acceptance. |
| Files | Invalid file types/signatures are rejected; unrelated users and companies receive 401/403; accepted participant gets temporary authorized preview only. |
| Privacy | No employee identity, resume, private message, rank, slot count, or hiring guarantee appears publicly or in logs. |
| Credits | Free allowance, no-coverage consumption, recovery, and server-only fulfillment are covered by tests. |
| Payments | Test-only country/currency routing plus signed-webhook idempotency pass; browser checkout return produces no entitlement. |
| Operations | Non-admin cannot access activity/privacy/token controls; admin logs are safe; error alert does not interrupt a user response. |
| UX | Mobile screens are fixed-viewport, do not scroll, and offer one primary next action. |

## 7. Production cutover is a separate final gate

Only after the full staging checklist passes should you create a **temporary Vibecode production candidate**. Do not point the domain at it yet. Then verify its temporary hostname, live environment isolation, backups, attachment recovery, and rollback procedure.

> **The actual cutover must be a deliberate final session.** Add `skipwait.me` in Vibecode, use the exact DNS target Vibecode shows, then update the live Chargebee webhook to `https://skipwait.me/api/chargebee/webhook`. Verify HTTPS, canonical redirects, authentication callbacks, a signed webhook rejection test, then one controlled INR/Razorpay and one controlled USD/PayPal transaction. Keep the current deployment available during a measured rollback window. [1]

## 8. What to send back for independent review

After each milestone, send the following rather than a summary alone:

1. The Vibecode chat/build report.
2. The relevant **Code** view file list or a zip/export without secrets.
3. Exact test and production-build output.
4. Temporary staging URL and screenshots of the Job Seeker and Referrer mobile flows.
5. A list of all variables configured, using names only—**never values**.
6. Confirmation that `skipwait.me`, DNS, live Chargebee settings, and customer data were not changed.

## References

[1]: [VibecodeApp deployment guide](https://www.vibecodeapp.com/docs/deploying/guide)

[2]: [VibecodeApp backend and authentication documentation](https://www.vibecodeapp.com/docs/features/backend-auth)

[3]: [VibecodeApp cloud documentation](https://www.vibecodeapp.com/docs/features/vibecode-cloud)
