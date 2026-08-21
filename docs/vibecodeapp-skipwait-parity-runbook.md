# skipwait.me × VibecodeApp: Implementation-Parity Runbook

**Target operating model.** The full skipwait.me application will be built and hosted in **VibecodeApp**. The only public production address is **`https://skipwait.me`**. The current managed deployment is retained only as a rollback system until the Vibecode deployment passes every gate in this runbook.

> **Non-negotiable rule:** Do not point `skipwait.me` to VibecodeApp, change the live Chargebee webhook, or carry over production records until the Vibecode staging application has passed the equivalent of the current security, workflow, payment, and mobile quality checks.

## 1. What “same configuration” means

The target must preserve **behavioral and security parity**, not copy incompatible infrastructure line-for-line. Vibecode’s documented platform uses a Hono backend, Prisma with SQLite, Better Auth, cloud storage, environment-variable management, and custom-domain deployments. The current application uses Express/tRPC, Drizzle/MySQL, Clerk, private S3 storage, and Chargebee. The migration must therefore map each guarantee to the correct Vibecode-native equivalent. [1] [2] [3]

| Current skipwait guarantee | VibecodeApp implementation requirement | Acceptance evidence |
| --- | --- | --- |
| React PWA, enterprise-blue design, mobile one-action screens | Rebuild responsive PWA routes in Vibecode; preserve the blue/slate system, DM Sans, `h-dvh` flow shells, no in-flow logos, no mobile page scrolling, and one primary action per step. | Mobile and desktop screenshots for every public and authenticated route. |
| Private server API | Hono backend routes with server-side authorization, validation, rate controls, JSON-safe error responses, security headers, and privacy-safe activity logs. | Unauthenticated, cross-user, cross-company, and admin-denied integration tests. |
| Job Seeker identity | Better Auth account/session boundary; never copy Clerk cookies or existing sessions. | Controlled Job Seeker sign-up, sign-in, sign-out, and session-recovery test. |
| Work-email-only Referrer identity | Better Auth email OTP plus server-side personal-domain rejection, exact company-domain verification, and a single active code lifecycle. | Company OTP reaches the entered address; personal email is rejected; incorrect/expired code fails safely. |
| Exact-company referral routing | Canonical job-link resolution maps only independently verified employers; matching verified employees alone can view/claim the request. | Positive and negative employer-routing tests, including job-board URLs and neighbouring-listing rejection. |
| Private resumes | Fragmented/encrypted upload transport, strict size/MIME/extension/signature validation, server-only private storage, signed temporary access, owner/accepted-Referrer authorization. | Cross-user and cross-company document access receives 401/403; approved participant preview works. |
| Trusted referral lifecycle | Job-link onboarding, required resume, request creation, company inbox, claim, full packet review, approve/decline, approved-only conversation, voluntary progress updates, and no-coverage manual follow-up. | Controlled test accounts complete both role paths on mobile and desktop. |
| Verified payments | Chargebee server API; INR uses Razorpay and USD uses PayPal; all tokens/subscriptions are credited only after signed webhook reconciliation. | Browser return produces no credit; one verified provider event produces one and only one entitlement. |
| Privacy and operations | Export/deletion requests, protected activity logs, administrator role, private notification centre, failure alerts, data-retention procedure, and human support escalation. | Authorized admin operates queues; non-admin access is denied; no private message/resume body in logs. |

## 2. Manual implementation sequence in VibecodeApp

Build in this order. The stages prevent an attractive interface from hiding missing authorization, payment, or data controls.

| Stage | You implement in Vibecode | Do not do yet | Required proof before advancing |
| --- | --- | --- | --- |
| **A. Staging project** | Create a separate staging deployment, backend, database, private storage, Auth setup, Logs access, and Environment configuration. | Do not add `skipwait.me`, Chargebee live credentials, or production data. | Staging URL works over HTTPS; secrets are absent from source and browser output. |
| **B. Security foundation** | Roles, Better Auth, Job Seeker flow, work-email Referrer OTP, admin guard, private storage abstraction, security headers, activity log, privacy queue. | Do not build a public employee directory, public resumes, or browser-side token crediting. | Authorization and document tests all pass. |
| **C. Core referral value loop** | Job-link resolution, resume upload, referral request, exact-company inbox, claim, review, approve/decline, conversation, voluntary progress updates, notifications, no-coverage queue. | Do not add bulk sharing, streaks, fabricated social proof, ranking, or opaque AI scoring. | Controlled end-to-end role tests and mobile visual checks pass. |
| **D. Growth and operations** | Personal invite, company-coverage invite, opportunity sharing, Admin Flow Health, referral-quality instrumentation, error alerts, privacy tools. | Do not log contacts, resume bodies, private messages, or share payload content. | Aggregate dashboards work with synthetic test records only; privacy regression tests pass. |
| **E. Payments** | Chargebee checkout, country/currency validation, test webhook, idempotent entitlement, recovery/cancellation. | Do not use live keys, live webhook URL, or public payments. | Test INR and USD provider events reconcile exactly once. |
| **F. Data rehearsal** | Export, transform, import, and reconcile only a non-production test set first. | Do not delete, mutate, or bulk-copy production data. | Counts, foreign keys, timestamps, attachment ownership, and rollback report reconcile. |
| **G. Production rehearsal** | Configure production environment values, deploy at Vibecode’s temporary production hostname, and run the full test matrix. | Do not update DNS or the live Chargebee webhook. | All P0 routes, security, onboarding, storage, and payment tests pass. |
| **H. Cutover** | Bind `skipwait.me`, update DNS exactly as Vibecode displays, update the Chargebee live webhook, and run controlled live checks. | Do not retire the old deployment immediately. | HTTPS, canonical host, signed webhook, one INR payment, one USD payment, and rollback procedure pass. |

## 3. Production environment parity

Enter these in **Vibecode’s Environment** UI only. Use the existing secret values from their respective provider accounts; never paste them into chat, source files, database records, uploaded documents, client bundles, or browser storage.

| Configuration group | Required production meaning | Important values / rule |
| --- | --- | --- |
| Canonical host | All live routes and provider callbacks identify the same domain. | `APP_URL=https://skipwait.me`; trusted origins include only required production and staging origins; production cookies are Secure and HTTP-only. |
| Chargebee live boundary | Live credentials are selected only on the canonical host. | `CHARGEBEE_LIVE_ENABLED=true`; `CHARGEBEE_LIVE_DOMAIN=skipwait.me`; `CHARGEBEE_LIVE_SITE=skipwait`; dedicated live API key; distinct live webhook secret. |
| Chargebee test boundary | Staging and preview routes remain isolated from live billing. | Test site/key/webhook secret only; never route preview traffic through live fulfillment. |
| Payment routing | India uses INR/Razorpay; international customers use USD/PayPal through Chargebee. | Server validates country/currency/item-price pairing. There is no manual browser override and no direct client credit. |
| Better Auth | New secure sessions are created on Vibecode. | Use a new high-entropy production secret; configure trusted origins, OTP sender, session security, and company-email Referrer rule. Do not migrate Clerk session cookies. |
| Private storage | Resume files are never public. | Use private bucket/container, server-side signing credentials, strict private CORS, encrypted fragments, final signature/type checks, and cleanup job. |
| Database | Application data remains server-authorized and recoverable. | Vibecode Prisma/SQLite production database; migration journal; daily backup/export procedure; no BLOB resume storage. |
| Resend | Operational failures reach the account owner without exposing content. | Use the verified sender `noreply@updates.skipwait.me`; retain privacy-safe, deduplicated error alerts. |
| Admin | The durable administrator remains `ayodhya@skipwait.me`. | Bootstrap only through an authenticated, auditable server-side role action; verify after a new Vibecode session is created. |

## 4. Domain and live-webhook cutover

Vibecode requires a deployed application, adding the domain in its deployment dashboard, and applying the precise CNAME/ALIAS target it displays. Do not guess DNS records. [1]

1. Deploy and validate a Vibecode production candidate using its supplied temporary hostname.
2. Open **Deployments → Domain**, add `skipwait.me`, and record the exact required DNS target.
3. Update the authoritative DNS provider with that exact target. Do not mix a legacy target, manually guessed A record, or an old Manus target.
4. Wait for Vibecode verification. Test `https://skipwait.me`, canonical redirect behavior, PWA manifest, public pages, and protected API boundaries.
5. Set the new production application’s live-billing host configuration to exactly `skipwait.me`.
6. Change the live Chargebee webhook receiver to `https://skipwait.me/api/chargebee/webhook` and confirm an unsigned probe returns 401.
7. Use Chargebee’s provider-originated test delivery. It must be accepted but must create no entitlement unless it is a real reconciled provider payment event.
8. Run one controlled legitimate INR/Razorpay transaction and one controlled legitimate USD/PayPal transaction. Reconcile Chargebee, database ledger, activity log, and entitlement exactly once for each.
9. Maintain a measured rollback window. If a P0 defect appears, restore the prior DNS record first; do not attempt an ad-hoc database rollback in a browser.

## 5. Global-standard user-value and growth parity

The goal is not to imitate every global product mechanic. The goal is to preserve the mechanisms that create **real professional value**, while rejecting tactics that inflate activity at the cost of trust. Referrals reduce matching friction; marketplaces require dense, relevant supply; and quality-based incentives work best when anchored to verified value rather than broad invitation volume. [4] [5] [6]

| Loop | User trigger | Product action to preserve or build | Success measure | Trust guardrail |
| --- | --- | --- | --- | --- |
| **Demand value** | A Job Seeker has a real job link. | Resolve the true employer, show company confirmation, collect a private request packet, and route only to matching verified employees. | Valid-link → completed request rate. | Never guess employer identity or expose employee identities. |
| **Supply value** | An employee has a verified company email. | One private company inbox with complete candidate context and a clear, free decision. | Verification → first meaningful review. | No personal-email Referrer login, quota, or payment friction. |
| **Liquidity** | A company has waiting demand but no employee. | Queue the request privately, reserve the transparent credit, and offer one trusted employee invitation. | Coverage conversion and time to first review. | No fictional availability, cold-contact scraping, or bulk invitations. |
| **Queue availability** | A verified employee intentionally opens real referral-review capacity. | Atomically allocate each slot to the next eligible held request, then send that Job Seeker a private Queue Open Alert. | Held request → available-for-review progression. | Do not reveal employee identity, slot count, or queue rank; never make candidates compete. |
| **Private Fast-Track Link** | A verified employee wants to share a company-specific referral entry point. | Create one opaque account-owned link and one generated non-identifying company-scoped vanity alias for the exact verified company; resolve either publicly to company label only; assign a valid matching request only to the link owner. | Link open → valid private request rate. | Never expose employee identity, candidate rank, capacity, promise of review, or a bypass of the employer application process. |
| **Resolution** | A Referrer reviews a packet. | Claim, approve/decline with reason, then open private conversation only after approval. | Timely factual resolution. | A Referrer retains full discretion; no approval pressure. |
| **Outcome value** | An accepted referral advances. | Voluntary private milestones: introduction, interview, offer, or closure; factual notification to the other participant. | Approved → participant-confirmed next milestone. | No outcome-contingent payment, public feed, or hiring ranking. |
| **Return value** | A participant returns to the app. | Show one factual status and one useful next action, not a feed of generic advice or notifications. | Active request owner and active verified Referrer retention. | No streaks, compulsion loops, or irrelevant reminders. |
| **Organic sharing** | A user has just received real value. | One recipient-benefiting personal/company invitation with clear context and server-side qualified-conversion attribution. | Verified invite conversion. | No contact import, self-invite, bulk sharing, or rewards before verified downstream value. |
| **Referrer love** | An employee helps safely. | Private impact history, optional availability preferences, and acknowledgment of completed helpful actions. | Repeat voluntary contribution. | No public leaderboard, employee ranking, or referral quota. |
| **Trust flywheel** | A user shares sensitive career information. | Private documents, explicit privacy controls, export/deletion route, supportable recovery, and transparent payment state. | Support incidence and recovery success. | No public resumes, dark patterns, or browser-side fulfillment. |

### Global product rules to keep

The following choices are already stronger than the common marketplace shortcut and must be carried into Vibecode: exact-company routing, company-email-only Referrer verification, private resume access, free Referrer participation, real no-coverage handling, full review context before decision, post-acceptance private conversation, voluntary factual progress, and server-only payment fulfillment.

**Queue Open Alerts are required parity.** The Vibecode build must implement the private availability allocation described in [`queue-open-alerts-spec.md`](./queue-open-alerts-spec.md): verified employees open voluntary capacity; the server allocates capacity only to eligible held requests; and only the affected Job Seeker receives a factual in-app alert. This is a value loop, not a position-jumping or waitlist-virality loop.

**Referrer Fast-Track Links are required parity.** The Vibecode build must implement [`referrer-fast-track-links-spec.md`](./referrer-fast-track-links-spec.md): only a Referrer with a verified exact-company work-email domain receives an opaque branded link and a generated non-identifying vanity path in the form `/refer/{company-slug}/{alias}`; public resolution reveals only the active company label; a request must independently resolve to that same employer; and the server assigns that request to the verified link owner. The branded copy must remain factual—“Private referral requests at {company} via Skipwait.me”—and must never imply a skipped application process, guaranteed review, candidate priority, queue position, or Referrer identity.

**K-factor targets and invitation-based position jumping are prohibited parity.** The Vibecode build must not reward peer invitations with queue advancement, application priority, capacity visibility, or a review guarantee. Queue Open Alerts continue to allocate strictly by original eligible hold time and ID within the exact company corridor. Qualified invitation credits remain possible only after verified downstream value and never alter another Job Seeker’s access to a Referrer.

The following are deliberately **out of scope** even if they are common elsewhere: public employee directories, opaque candidate scoring, job-outcome guarantees, fabricated reviews or testimonials, false scarcity, broad referral blasts, contact scraping, reward spam, streaks, paid Referrer decisions, and a public activity feed. Employment-related automated candidate assessment creates heightened governance requirements; Skipwait must remain a human-controlled connection and workflow product. [7]

## 6. Global readiness after core parity

| Capability | When to add it | Minimum standard |
| --- | --- | --- |
| Company-corridor operations | When 20+ unanswered requests expose repeated demand at the same employer. | One-company-at-a-time employee activation plan with aggregate demand metrics and no candidate disclosure. |
| Status-service promise | When the manual follow-up team can reliably meet it. | Factual response window and a transparent fallback; never an invented ETA. |
| Privacy-safe cohort metrics | Before running any growth experiment. | Aggregate activation, first-review time, coverage conversion, qualified-invite conversion, and resolution progression—never message or resume contents. |
| Referrer impact history | After voluntary progress updates create meaningful outcomes. | Private, participant-controlled history with no public ranking or gamification. |
| Localization and regional operations | One market at a time after policy/support readiness. | Native-language review, accessibility, data-retention policy, local support route, and payment/legal validation. |
| Public educational content | After real usage patterns exist. | Consented or aggregate-only “how it works” assets; never fabricated outcomes, counts, testimonials, or identities. |

## 7. Manual verification checklist

| Area | Owner’s manual check | Pass condition |
| --- | --- | --- |
| Public routes | Test landing, Privacy & Trust, target-role onboarding, internal openings, plans, and offline state on mobile/desktop. | No horizontal scrolling; one clear next action; no stale Bridge wording or public employee data. |
| Job Seeker | Submit a controlled link and test resume upload, request state, no-coverage state, share, notifications, approved conversation, and voluntary progress. | Correct employer only; document private; exact credit treatment; factual recovery on failure. |
| Referrer | Use a real controlled company inbox to test OTP, personal-domain rejection, opaque and vanity Fast-Track Link creation, candidate packet, claim, approve/decline, conversation, and progress update. | OTP goes only to entered work email; either Fast-Track public resolution reveals only the exact company; unrelated employer cannot access any packet. |
| Admin | Sign in as `ayodhya@skipwait.me`, inspect activity, privacy requests, token recovery, and coverage follow-up. | Non-admin sees no admin route or data; logs contain no document or message bodies. |
| Billing | Run Chargebee test then controlled live checks only at final cutover. | India routes to INR/Razorpay; international routes to USD/PayPal; no duplicate credit or browser-return credit. |
| Domain | Validate temporary Vibecode host, then `skipwait.me` after DNS update. | HTTPS is valid; canonical host selected; webhook and app route are on the same host. |
| Rollback | Preserve old host and export artifacts for the agreed window. | DNS can be reverted; records and private attachments have documented recovery evidence. |

## References

[1]: [Vibecode — Deploying Your App](https://www.vibecodeapp.com/docs/deploying/guide)

[2]: [Vibecode — Backend and Auth](https://www.vibecodeapp.com/docs/features/backend-auth)

[3]: [Vibecode — Cloud](https://www.vibecodeapp.com/docs/features/vibecode-cloud)

[4]: [Federal Reserve Bank of Philadelphia — Job Referrals and the Labor Market](https://www.philadelphiafed.org/the-economy/macroeconomics/how-do-job-referrals-impact-the-us-labor-market)

[5]: [Stripe Atlas — Andrew Chen on Marketplaces](https://stripe.com/guides/atlas/andrew-chen-marketplaces)

[6]: [MIS Quarterly — Rewards or Upgrades? Incentive Designs in Referral Programs](https://misq.umn.edu/misq/article/50/2/673/3630/Rewards-or-Upgrades-Incentive-Designs-in-Referral)

[7]: [European Commission — Regulatory Framework for AI](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
