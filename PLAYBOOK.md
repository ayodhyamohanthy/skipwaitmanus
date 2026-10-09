# PLAYBOOK.md — SkipWait.me final global product & monetization playbook

Provenance: converted on 2026-09-24 from the founder's `roadmap.docx`
(`~/iCloud Drive (Archive)/Documents/startup ideas/skipwait/audit/`) into
markdown so coding agents can read task IDs and update progress reliably.
Word-level text, tables, task IDs and section numbering are preserved; bold was
dropped because the source paragraph style bolded the whole document, and the
PDF's "text / Copy" code-box labels were removed.

Pages 30-131 of the source PDF append three earlier drafts of this playbook
("Master Build & Growth Playbook", "SECTION 0: RULES FOR THE AI AGENT"). They
are deliberately **not** in this file: their version numbering and limits
disagree with Sections 0-14 below. Sections 0-14 are the single authority, and
this file is the source of truth for every task ID (`V0-01` … `V8-07`).

---

> SkipWait.me — Final Global Product & Monetization Playbook
>
> Document: PLAYBOOK.md
>
> Product: SkipWait.me
>
> Audience: AI coding agents, developers, designers, and the founder
>
> Objective: Build the most trusted place to request and manage job referrals, starting in India and expanding market by market.

> Instruction for the AI coder: Read this entire document and the existing repository before changing anything. Start with the first unchecked task in the current version of PROGRESS.md. Complete one task, test it, update the documentation, report your results, and stop. Do not start another task until instructed.

## 0. Rules for every AI coding agent

### 0.1 Work one task at a time

> For each coding session:

> Read PLAYBOOK.md, PROGRESS.md, and DECISIONS.md.
>
> Select the first unchecked task in the current version.
>
> Before editing, report:
>
> What already exists.
>
> What you intend to change.
>
> Files and systems affected.
>
> Tests you will run.
>
> Migration and rollback steps, if relevant.
>
> Implement only that task and directly necessary fixes.
>
> Run relevant tests.
>
> Update PROGRESS.md and CHANGELOG.md.
>
> Record meaningful architectural or product decisions in DECISIONS.md.
>
> Report what changed, what passed, what remains blocked, and how the founder can verify it.
>
> Stop.
>
> If a task is too large, divide it into numbered subtasks in PROGRESS.md before implementing it.

### 0.2 Preserve the existing application

> Audit the existing code, database, authentication, hosting, storage, analytics, and integrations first.
>
> Do not rebuild a working product because a different stack is fashionable.
>
> Do not migrate frameworks, databases, auth providers, or hosting without a documented business or technical reason and founder approval.
>
> Never discard existing user data to make a migration easier.
>
> Use database migrations. Do not manually change production tables.

### 0.3 Obtain approval before consequential actions

> Ask the founder before:

> Spending money or enabling a service that requires a payment method.
>
> Sending user data to a new third-party provider.
>
> Changing production DNS, authentication, billing, or infrastructure.
>
> Running a destructive migration.
>
> Publishing legal documents or employment-outcome claims.
>
> Opening a new country or market.
>
> Changing who can see personal data.
>
> Changing referral limits or paid-access rules.
>
> If approval is missing, mark the task BLOCKED and stop. Do not report it as complete.

### 0.4 Required repository files

| File | Purpose |
|---|---|
| PLAYBOOK.md | This product, engineering, and business plan. |
| CURRENT_STATE.md | Inventory of the actual existing application. |
| PROGRESS.md | Task checklist, test evidence, blockers, and release gates. |
| DECISIONS.md | Dated decisions, alternatives, costs, and approvals. |
| CHANGELOG.md | Features and fixes actually shipped. |
| .env.example | Configuration variable names; never secrets. |
| RELEASE_CHECKLIST.md | Deployment, migration, smoke tests, backups, and rollback. |
| MARKET_LAUNCH.md | Country-by-country operational and legal readiness when expansion begins. |

> In PROGRESS.md, use [ ] for pending and [x] for tested completion. Mark blocked or deferred tasks explicitly, with a reason and owner.

> Critical security, privacy, verification, accurate-status, and billing requirements cannot be deferred to make a launch deadline.

### 0.5 Definition of done

> Every applicable user-facing task must:

> Work at 360px mobile width and on desktop.
>
> Support keyboard navigation, visible focus, and accessible errors.
>
> Have loading, empty, success, and failure states.
>
> Validate input and permissions on the server.
>
> Protect private data from unrelated users.
>
> Handle duplicate submissions and relevant concurrent actions.
>
> Include tests for changed business rules and authorization.
>
> Emit privacy-safe analytics events where analytics is enabled.
>
> Avoid secrets and personal information in logs and analytics.
>
> Document new configuration, migrations, and rollback steps.
>
> Preserve existing working functionality.
>
> Use accurate copy: no promised referral, interview, or job.
>
> Aim for mobile Lighthouse performance ≥85 on public pages. Measure it rather than claiming it.

## 1. What SkipWait is building

### 1.1 The product promise

> Find the right person to ask for the right job.

> SkipWait helps a job seeker find an available employee who may be willing to refer them. It also helps employees handle requests at a pace and quality level they choose.

> The referrer—not SkipWait—decides whether to help. The employer decides whether to consider the candidate.

> SkipWait must never confuse these events:

> A job link exists.
>
> The job has been checked and appears current.
>
> A seeker sent a request.
>
> An employee accepted or claimed it.
>
> The employee confirmed submitting a referral.
>
> The employer acknowledged or reviewed it.
>
> An interview, offer, or hire occurred.
>
> A request, acceptance, and submitted referral are three different outcomes.

### 1.2 Initial market and expansion principle

> Start with Bengaluru and Visakhapatnam. Build concentrated supply at a limited number of companies and in a limited set of role categories.

> Expand to more Indian cities, then international markets, only when each market has real referral supply, credible job information, moderation capacity, and an operational owner.

> Being technically accessible worldwide does not make SkipWait a useful global marketplace.

### 1.3 User groups

> Seeker: Requests a job-specific referral.
>
> Referrer: A willing employee who verifies control of an approved work-email address and opts in to receive requests. The same person may also be a seeker.
>
> Platform admin: Handles verification review, company records, moderation, support, and settings.
>
> Employer admin: A separately authorized company representative using employer tools.
>
> Partner: Later, an approved university, career community, or integration partner.

### 1.4 Two referral modes

| Mode | Behavior |
|---|---|
| Choose a referrer | A seeker chooses a specific available, opted-in employee. That person may accept or decline. |
| Company pool | A seeker submits to an eligible pool of opted-in employees. One eligible employee claims the request. |

> Choice is a core feature. Pool mode is an alternative for seekers who prefer it or when a suitable individual is not available.

### 1.5 The mature product

> At full maturity, SkipWait can provide:

> Reliable company and job information.
>
> Verified, opted-in referrer discovery.
>
> Direct and pool referral workflows.
>
> Private candidate profiles, resumes, and messaging.
>
> Accurate referral and application tracking.
>
> Job feeds with source and freshness information.
>
> Explainable matching.
>
> Optional AI-assisted career tools.
>
> Employer job and referral-workflow software.
>
> Clearly labelled paid job promotion.
>
> Approved ATS integrations.
>
> Country-aware language, privacy, payments, and support.
>
> A partner API and optional mobile applications.
>
> These are the destination. The roadmap determines when to build them.

## 2. Non-negotiable product and business rules

> No payments between seekers and referrers.
>
> No guaranteed referral, interview, offer, or job.
>
> No paid access to individual referrers.
>
> No paid priority in referral pools.
>
> No paid increase to referral-request limits. Limits exist to protect users from spam.
>
> No platform payments to employees based on referrals or hires.
>
> No selling resumes, messages, work emails, or private seeker information.
>
> No employer access to marketplace conversations simply because they concern that employer.
>
> Sponsored jobs and content must be visibly labelled.
>
> No invented company counts, job openings, response rates, or testimonials.
>
> No scraping LinkedIn or prohibited sources.
>
> No automated rejection or hidden ranking based on protected or sensitive traits.
>
> Referrers must follow their employer’s referral policy.
>
> Users must control whether they are discoverable and what information is shown.
>
> A company’s existing employee referral bonus, if any, is governed by that company and remains outside SkipWait.

## 3. What “global go-to platform” actually means

> SkipWait becomes the go-to platform through marketplace performance and trust, not by shipping a large number of screens.

> The founder should assess five conditions in each supported market.

### 3.1 Liquidity

> For jobs and companies promoted by SkipWait, seekers can usually find an eligible, available person—not an empty company page or an inactive profile.

```
Track:
```

> Percentage of relevant job views with at least one eligible referrer.
>
> Available referrers per active company and function.
>
> Requests that receive a response before their deadline.
>
> Time to first response.

### 3.2 Trust

> Referrer verification is accurately described.
>
> Job freshness is visible.
>
> Abuse reports are handled.
>
> Referrer anonymity and seeker data remain protected.
>
> Request statuses reflect what really happened.

### 3.3 Repeat value

> Referrers continue participating without feeling spammed.
>
> Seekers return when applying to other relevant jobs.
>
> Companies renew because their workflow improves.
>
> Users recommend SkipWait voluntarily.

### 3.4 Sustainable revenue

> Revenue comes from software, approved promotion, and optional career tools—not purchased employee endorsements.

> Measure employer retention, gross margin, acquisition cost, and support burden.

### 3.5 Market-specific readiness

> A supported country has applicable policies, support ownership, suitable payment and email providers where needed, localized product assumptions, and checked data handling.

> Important: “Global go-to platform” is an ambition, not a checkbox an AI coder can mark complete. Public claims about market leadership require independent evidence.

## 4. Core product rules

### 4.1 Referrer verification

> A work-email-verified label means SkipWait confirmed that a person controlled an email address at an approved company domain at the time of verification.

> It does not prove permanent employment, seniority, hiring authority, or employer permission to refer.

```
Requirements:
```

> Verify through a short-lived email link or code.
>
> Rate-limit verification attempts.
>
> Match approved exact domains to companies.
>
> Support multiple approved domains per company.
>
> Block known personal and disposable domains.
>
> Put unknown domains into review; do not treat them as approved.
>
> Require re-verification at least every six months.
>
> Stop showing expired, paused, or suspended referrers as available immediately.
>
> Store a server-keyed HMAC of the normalized full work email and its domain after verification—not a plaintext work email in the referrer profile.
>
> Keep verification secrets and HMAC keys server-side.
>
> Never include a work-email value or hash in public responses or analytics.
>
> Alternative verification methods, such as employer-admin confirmation or manual review, may be added later. Each method must have an accurate label; none should be presented as stronger than it is.

### 4.2 Multiple company affiliations

> Design the data model so a person can eventually have separately verified relationships with more than one company. Each affiliation has its own verification, status, settings, and referral eligibility.

> For the initial release, the product may support only one active referrer affiliation per user to reduce complexity. Do not design the database so multi-company support later requires a destructive rewrite.

> When someone changes employers, expire or revoke the old affiliation for new requests. Preserve historical request records accurately.

### 4.3 Discoverability and anonymity

> Discoverability is off by default.
>
> Verification does not automatically make a referrer public.
>
> Referrers set availability, function preferences, capacity, and visible profile details.
>
> Anonymous mode shows only broad, consented context, such as “Engineering referrer at Acme.”
>
> Do not combine exact title, team, level, and location in a way that defeats anonymity.
>
> Accepting a request does not automatically reveal the referrer’s personal contact details.

### 4.4 Seniority and match context

> Normalize company-specific titles for routing:

| Level | Broad description |
|---|---|
| L1 | Intern / fresher |
| L2 | Junior |
| L3 | Mid-level |
| L4 | Senior |
| L5 | Staff / manager |
| L6 | Principal / senior manager |
| L7 | Director |
| L8 | Executive |

> Functions: Engineering, Product, Design, Data, Sales, Marketing, Operations, HR, Finance, and Other.

> The seeker confirms the job’s suggested level. Referrers provide a level for routing but choose whether it appears publicly.

> If disclosure permits, show contextual labels:

> Strong context match: At least one level above the job and in the same function.
>
> Good context match: At or above the job level.
>
> Limited seniority match: Below the job level.
>
> These labels describe available information. They do not predict whether someone will refer a candidate or whether the employer will respond.

> Do not reveal a hidden level indirectly through a badge. Show team relevance only with the referrer’s consent.

### 4.5 Company and job accuracy

> A seeker-submitted job link is not proof that a role is open. In V1, label it as provided by the seeker.

> When SkipWait later lists jobs, each job needs:

> An identified source.
>
> A posted or first-seen date where known.
>
> A last-checked date.
>
> An active, paused, closed, or stale state.
>
> A working source or application link where available.
>
> Do not present stale or unsourced listings as verified openings.

> The initial application must store but not server-fetch arbitrary user-submitted URLs. Later extraction requires approved sources and defenses against server-side request forgery and unsafe redirects.

### 4.6 Referral-policy eligibility

> Referrers agree to follow employer policy. Let them state whether they believe they may refer external candidates and pause if uncertain.

> An employee’s self-declaration must not be presented as company authorization. If SkipWait learns a specific employer prohibits the proposed workflow, the platform needs an admin-controlled restriction for that company.

> For international jobs, do not assume a referrer can submit candidates across countries or job categories. Respect known employer criteria and clearly identify what has not been independently checked.

### 4.7 Direct and pool eligibility

> A direct recipient must:

> Have a currently valid approved company affiliation.
>
> Be opted in, active, and under capacity.
>
> Match the recipient criteria they selected.
>
> Not be banned or suspended.
>
> A pool participant must satisfy those conditions and additionally:

> Have a normalized level at least target level − 1; and
>
> Match the target function or explicitly accept requests outside their function.
>
> Recheck eligibility when a request is sent and when it is accepted or claimed.

> Pool previews show only minimal information. A seeker’s private resume becomes available only to the selected direct recipient or successful claimant, subject to the seeker’s sharing choice.

### 4.8 Anti-spam limits

```
Use server-configurable defaults:
```

| Rule | Initial limit |
|---|---|
| Active requests per seeker | 5 |
| Active requests per seeker at one company | 2 |
| Direct attempts at one company in a rolling 30 days | 2 |
| Concurrent requests for the same company and job | 1 |
| New accepts or claims per referrer per UTC month | 10 by default, adjustable by referrer |

> REQUESTED, ACCEPTED, and CLAIMED count as active. REFERRED does not.

> A declined direct attempt still counts toward the rolling limit. Converting a direct request to pool does not erase the direct attempt.

> A referrer may also set a maximum number of currently owned, unresolved requests. Set a sensible default and enforce a server-side upper bound.

> Limits, deduplication, and capacity must be enforced transactionally, including simultaneous submissions and claims. A scheduled counter reset must not be the only enforcement mechanism.

> Paid accounts do not get more referral slots.

### 4.9 Request lifecycle

```
DRAFT → REQUESTED
```

```
Direct:
REQUESTED → ACCEPTED | DECLINED | EXPIRED | WITHDRAWN
```

```
Pool:
REQUESTED → CLAIMED | EXPIRED | WITHDRAWN
```

```
ACCEPTED or CLAIMED → REFERRED | CLOSED | WITHDRAWN
```

```
REFERRED → INTERVIEWING | OFFER | HIRED | REJECTED | CLOSED
INTERVIEWING → OFFER | HIRED | REJECTED | CLOSED
OFFER → HIRED | REJECTED | CLOSED
Only the owning referrer can mark a request REFERRED, after confirming they submitted the referral through their employer’s process.
```

> A seeker may report interviewing, an offer, a hire, or rejection. Label these self-reported unless independently verified through an authorized employer integration.

> Allow a self-reported milestone to skip an earlier optional milestone. Do not silently rewrite history.

> Deadlines
>
> Direct recipient: 5 × 24 hours to respond.
>
> Direct reminder: after approximately 3 × 24 hours, if pending.
>
> Pool: expire after 7 × 24 hours if unclaimed.
>
> Store timestamps in UTC and display them using the user’s time zone. Workers and notification jobs must be idempotent.

> Pool release
>
> A claimant who cannot proceed may release a request with a reason. If the original deadline is still valid, return the same request to the pool and prevent that claimant from immediately reclaiming it.

> Direct-to-pool conversion
>
> Allow one seeker-approved conversion on the same request after an unanswered expiry or an eligible decline such as capacity or wrong team.

> Reconfirm the role, eligibility, and limits. Log the original direct attempt. Do not automatically reroute a request declined because the company is not hiring.

> Withdrawal
>
> A seeker may withdraw before a referral is submitted. After REFERRED, they may close tracking but must not erase the historical fact that a submission was reported.

> Every transition, release, conversion, and administrative correction must create an immutable event.

### 4.10 Requests and messaging

> Request messages are job-specific.
>
> Initial seeker pitch limit: 600 characters.
>
> In-app messaging begins after acceptance or claim unless a separate pre-acceptance design is approved.
>
> Phone numbers and personal emails remain private by default.
>
> Detect possible payment solicitations and attempts to bypass safety rules.
>
> Provide a report process; do not automatically ban people solely because a keyword filter matched.

### 4.11 Resumes and private files

> Private storage only.
>
> Initial PDF maximum: 5 MB.
>
> Validate the file signature and size server-side.
>
> Only authorized participants may obtain access.
>
> An unclaimed pool viewer never receives the resume.
>
> Use short-lived signed URLs or an authenticated file proxy.
>
> A signed URL can remain usable until it expires; keep expiries short and never log the URL.
>
> Recheck access before issuing each new link.
>
> Revoke future access after decline, release, withdrawal, or suspension.

## 5. Monetization: what customers pay for

### 5.1 Primary business: employer software

> The most defensible long-term business is B2B software for employers:

> Authorized company pages.
>
> Job publishing and management.
>
> Employee opt-in invitations.
>
> Company-approved referral workflows.
>
> Aggregate, privacy-safe analytics.
>
> Later, ATS connections and internal referral-program software.
>
> The employer pays for workflow software and support. It does not buy endorsements from individual employees.

> Suggested packages to validate

| Package | Intended buyer | Possible scope |
|---|---|---|
| Employer Pilot | Early design partner | Limited job workspace and agreed feedback period. |
| Employer Team | Growing company | Authorized job management, team permissions, basic aggregate reporting. |
| Employer Enterprise | Large organization | Advanced permissions, SSO if needed, audit exports, approved integrations, contractual support. |

> Pricing hypotheses—not launch prices: Interview buyers about a Team plan around ₹15,000–₹40,000/month in India and custom enterprise contracts. Test willingness to pay and delivery cost before publishing prices or building billing.

### 5.2 Sponsored jobs

> An employer may pay for clearly labelled placement in a job feed.

```
Rules:
```

> Job must meet the same source and freshness standards as organic jobs.
>
> Label sponsorship clearly.
>
> Do not secretly change organic relevance rankings.
>
> Do not change which employees can receive referral requests.
>
> Do not suggest that sponsorship guarantees a referral or an applicant outcome.

### 5.3 Optional seeker career tools

```
Possible paid tools:
```

> Resume tailoring.
>
> Practice interviews.
>
> Job-search organization.
>
> Advanced personal analytics.
>
> These tools must be useful independently of referral access. They cannot buy more referral attempts, preferred routing, special access to employees, or better treatment from referrers.

> Start only after user research shows people value them and after AI/provider costs are understood.

### 5.4 Later enterprise and partner revenue

> White-label internal referral software.
>
> Approved ATS integrations.
>
> Contracted partner APIs.
>
> Enterprise implementation and support.
>
> Do not sell access to private candidate data without an appropriate, specific, consented workflow.

### 5.5 Employer privacy boundary

> An employer admin may manage jobs and view permitted aggregate data. They may not automatically:

> Read marketplace seeker–referrer conversations.
>
> Download marketplace resumes.
>
> See anonymous referrers’ identities.
>
> Inspect individual employee activity.
>
> See every request mentioning their company.
>
> A separate employer application workflow may provide candidate information only when the candidate has explicitly joined that workflow and appropriate access has been designed.

> Use minimum group sizes and guard against revealing individuals through report filters.

### 5.6 Revenue gates

> Before implementing live billing, the founder must:

> Conduct real employer discovery interviews.
>
> Identify the budget owner and purchasing process.
>
> Confirm the pain point and paid deliverables.
>
> Check employer referral-policy concerns.
>
> Obtain credible pilot interest.
>
> Approve provider, pricing, cancellation, refund, tax, support, and contractual terms.
>
> The AI agent can document findings supplied by the founder. It must not fabricate interviews, commitments, or revenue.

> Track monthly recurring revenue, gross margin, paid conversion, churn, acquisition cost, support cost, and renewal.

## 6. Architecture for a global platform

### 6.1 Stack rule

> Keep the current stack if it works.

> If the repository is essentially greenfield, a reasonable option to evaluate is Next.js with TypeScript, PostgreSQL, managed authentication, private file storage, and server-side authorization.

> Supabase, Vercel, Cloudflare, PostHog, Sentry, and any email or payment provider are options, not mandatory migrations. Verify current pricing, business-use terms, data handling, and limits.

> Do not make a provider decision based solely on a claimed free tier.

### 6.2 System modules

> Maintain clear boundaries for:

> Public pages and SEO.
>
> Seeker application.
>
> Referrer application.
>
> Platform administration.
>
> Employer workspaces.
>
> Verification and company affiliations.
>
> Request eligibility and lifecycle.
>
> Jobs and freshness.
>
> Private files and messages.
>
> Notifications and background jobs.
>
> Analytics and monitoring.
>
> Billing and entitlements.
>
> Optional AI services.
>
> Partner and ATS integrations.
>
> Permission-sensitive business rules belong on the server, not only in UI components.

### 6.3 Target data concepts

> Create tables incrementally as versions need them. Existing names may differ; map before migrating.

> Identity
>
> users
>
> user_roles
>
> seeker_profiles
>
> private_files
>
> notification_preferences
>
> Companies and referrers
>
> companies
>
> company_domains
>
> blocked_domains
>
> company_affiliations
>
> referrer_profiles
>
> verification_challenges
>
> company_policy_restrictions
>
> A company_affiliation should record the user, approved company, verification method, restricted work-email HMAC, verification dates, and status.

> The referrer_profile holds discoverability, level, function, team visibility, capacity, and preferences for that affiliation.

> Jobs and requests
>
> jobs
>
> referral_requests
>
> request_attempts
>
> referral_events
>
> messages
>
> notifications
>
> A request needs the seeker, company, job identity or seeker-provided job snapshot, target level/function, mode, current owner if any, status, deadline, and privacy choices.

> request_attempts preserves each direct recipient, claim, release, and conversion. A single current-referrer field is not enough history.

```
referral_events is append-only.
```

> Trust and operations
>
> reports
>
> moderation_actions
>
> audit_log
>
> app_settings
>
> feature_flags
>
> data_rights_requests
>
> consent_records
>
> Monetization and employer software
>
> employer_accounts
>
> employer_memberships
>
> plan_catalog
>
> entitlements
>
> billing_customers
>
> subscriptions
>
> billing_events
>
> invoices
>
> job_promotions
>
> Do not store raw payment-card data.

> Integrations, later
>
> ats_connections
>
> integration_jobs
>
> integration_events
>
> api_clients
>
> api_audit_events
>
> Use stable identifiers, foreign keys, appropriate uniqueness constraints, and indexes. Store timestamps in UTC. Use migrations for all schema changes.

### 6.4 Authorization

> Enforce row-level security or equivalent server-side authorization for every private entity.

```
Test access as:
```

> The owner.
>
> An unrelated seeker.
>
> An unrelated referrer.
>
> An eligible pool viewer.
>
> The selected recipient.
>
> An authorized employer admin.
>
> A platform admin.
>
> RLS alone does not conceal sensitive columns in a readable row. Keep work-email hashes, authentication details, and other restricted fields in private tables or server-only responses.

> Platform and employer admin roles must be assigned through trusted approval flows. A person with a company email cannot grant themselves company-admin privileges.

### 6.5 Concurrency and idempotency

```
Test at least:
```

> Two employees claiming the same pool request.
>
> Two seekers’ submissions hitting the same user’s remaining limit.
>
> Multiple accepts reaching a referrer’s capacity.
>
> Withdrawal racing with “mark referred.”
>
> Expiry racing with acceptance or conversion.
>
> Duplicate job-import events.
>
> Duplicate payment-provider webhooks.
>
> Use transactions, appropriate locks or conditional updates, uniqueness constraints, and idempotency keys.

> Live authorization and capacity must still work if a scheduled job runs late.

### 6.6 Security and operational readiness

> Server-side validation and output encoding.
>
> Auth and OTP rate limiting.
>
> Secret management and rotation.
>
> Private uploads and restricted storage.
>
> Privacy-safe logging.
>
> Audit records for sensitive admin actions.
>
> Backups and tested restore procedures as scale warrants.
>
> Monitoring, alerting, and an incident-response owner.
>
> Data deletion and retention procedures.
>
> Dependency and access reviews.
>
> Later enterprise security reviews and independent assessments when buyers require them.
>
> Do not claim SOC 2 certification or statutory compliance without the actual audit or legal assessment.

### 6.7 International foundations

```
Store:
```

> Country using standard country codes.
>
> Locale using standard language/region identifiers.
>
> IANA time zone.
>
> Currency using standard currency codes.
>
> Job location separately from seeker location.
>
> Work-arrangement and location eligibility separately.
>
> Do not assume a candidate living in one country is eligible for a role in another. Collect only job-relevant eligibility information when needed, and have counsel review sensitive cross-border questions.

> Translate UI and transactional content only for markets SkipWait actually supports. Legal text needs qualified review in each supported language and jurisdiction.

## 7. Essential screens

| Screen | Required behavior |
|---|---|
| Landing | Accurate promise, seeker/referrer CTAs, how it works, trust boundaries, no invented counts. |
| Onboarding | Role selection, progress indicator, privacy and discoverability choices. |
| Seeker dashboard | Requests, status, remaining limits, and relevant next actions. |
| Company page | Reviewed company information, real availability, careers link, honest empty state. |
| Choose referrer | Opted-in cards, permitted context, match explanation, availability, anonymity. |
| Request form | Job details, confirmed level/function, mode, pitch, file-sharing explanation. |
| Referrer inbox | Direct, pool, owned, and history views; capacity and pause controls. |
| Request detail | Immutable timeline, allowed actions, private files, later messaging. |
| Settings | Profile visibility, notifications, reporting, and data-rights controls. |
| Admin | Company/domain review, reports, users, settings, and audited actions. |
| Job feed | Sourced current jobs, freshness details, clear sponsored labels. |
| Employer workspace | Authorized jobs, members, privacy-safe reporting, plan and billing. |

> Use simple, calm, trustworthy language. Do not send a seeker into a request form if a company has no viable referral path.

## 8. Version roadmap — build in order

> Copy these checklists into PROGRESS.md.

> A version is complete only when its required tasks and release gate pass. Founder-owned legal, pricing, account, and launch decisions must be identified as founder-owned; an AI agent cannot complete them by writing code.

#### V0 — Audit the existing product

> Goal: Know what actually exists before changing it.

- [ ] V0-01: Inventory repository, framework, routes, database, authentication, storage, integrations, deployment, and current costs. Create CURRENT_STATE.md.
- [ ] V0-02: Map existing working functionality to this roadmap. Create PROGRESS.md, DECISIONS.md, CHANGELOG.md, .env.example, and RELEASE_CHECKLIST.md.
- [ ] V0-03: Audit private-data exposure, auth permissions, file access, secrets, dependency risks, mobile UX, accessibility, and misleading copy.
- [ ] V0-04: Document the stack decision. Preserve working components unless a migration is justified and approved.
- [ ] V0-05: Establish local, staging, and production change procedures; migrations, backups, and rollback.
- [ ] V0-06: Configure or repair automated build, lint, typing, and tests.
- [ ] V0-07: Establish approved error monitoring and minimal privacy-safe analytics.
- [ ] V0-08: Draft legal, conduct, support, reporting, and launch procedures for founder/legal review.
- [ ] V0-09: Run a staging smoke test and list the smallest safe path to V1.

> Gate: There is an accurate system map. Critical existing exposures are fixed or production access is restricted.

#### V1 — Verified referral marketplace

> Goal: A seeker can send and track a direct or pool request involving a real verified, willing referrer.

- [ ] V1-01: Add the minimum identity, role, company-affiliation, request, event, and private-file model. Test permissions.
- [ ] V1-02: Repair or implement login, logout, recovery, banned-user handling, and auth throttling.
- [ ] V1-03: Add reviewed companies, approved exact-domain mappings, pending-domain review, and directory search.
- [ ] V1-04: Add seeker onboarding and optional private PDF upload.
- [ ] V1-05: Implement real work-email verification, challenge expiry, throttling, and HMAC storage.
- [ ] V1-06: Add referrer onboarding, discoverability opt-in, anonymity, criteria, pause control, and capacity.
- [ ] V1-07: Build accurate company pages and privacy-safe referrer counts.
- [ ] V1-08: Implement request transitions, attempts, events, limits, deduplication, deadlines, and concurrency protection.
- [ ] V1-09: Build direct referrer choice and job-specific request submission.
- [ ] V1-10: Build eligible pool previews, atomic claims, releases, and approved direct-to-pool conversion.
- [ ] V1-11: Build the referrer inbox and accept, decline, claim, release, and confirm-submitted actions.
- [ ] V1-12: Build seeker tracking, withdrawal, authorized resume access, and labelled self-reported outcomes.
- [ ] V1-13: Add idempotent expiry, reminder, and digest workers.
- [ ] V1-14: Add in-app notifications, preferences, and approved transactional emails where configured.
- [ ] V1-15: Add basic admin company approval, suspension, safe merging, bounded settings, and audit records.
- [ ] V1-16: Publish accurate landing/settings/help flows and founder/legal-reviewed policies.
- [ ] V1-17: Test the full journey using separate seekers and referrers, including simultaneous pool claims and forbidden resume access.

> Gate: A real invited user can complete the flow without a mock verification, false status, or private-data leak. Public launch requires approved legal copy and staffed support.

#### V1.5 — Trust and safety

> Goal: Keep the marketplace usable as volume increases.

- [ ] V1.5-01: Automate re-verification notices and renewal; enforce expiry even if a worker is late.
- [ ] V1.5-02: Add authorized in-app messaging after acceptance or claim.
- [ ] V1.5-03: Add user and request reports, moderation queue, decision history, and an appeal/contact path.
- [ ] V1.5-04: Flag possible payment solicitation and privacy bypasses for proportionate review.
- [ ] V1.5-05: Add same-company hand-off with seeker approval before a new colleague gets private information.
- [ ] V1.5-06: Add honest response statistics only where there is sufficient history.
- [ ] V1.5-07: Implement tested export, correction, deletion, and retention workflows.
- [ ] V1.5-08: Review endpoint rate limiting, file safety, admin access, alerts, and regression tests.

> Gate: Users can report problems and exercise data controls; moderators can act without ad hoc production database edits.

#### V2 — Reliable jobs and discovery

> Goal: Seekers can find current jobs where a referral may actually be possible.

- [ ] V2-01: Add sourced-job fields, source provenance, posted/checked dates, and freshness states.
- [ ] V2-02: Curate a limited set of current roles at companies with available referrers.
- [ ] V2-03: Add permitted public ATS or employer feeds one source at a time; verify reuse terms.
- [ ] V2-04: Deduplicate imported jobs and handle closed or stale listings.
- [ ] V2-05: Build a job feed with location, function, level, and work-arrangement filters.
- [ ] V2-06: Connect job pages to eligible, opted-in referrers without exposing private information.
- [ ] V2-07: Add stale-job and incorrect-company reporting.
- [ ] V2-08: Measure the share of promoted job views with an available referrer.

> Gate: Users can distinguish a sourced current job from a seeker-submitted link and see when it was last checked.

#### V3 — Healthy growth and network effects

> Goal: Grow through actual supply, useful pages, and permission-based invitations.

- [ ] V3-01: Add optional colleague invitations and attribution; no contact-list uploads.
- [ ] V3-02: Add a no-supply interest flow instead of sending requests to an empty pool.
- [ ] V3-03: Publish SEO company and location pages only where data and availability are real.
- [ ] V3-04: Add sourced educational content with review dates.
- [ ] V3-05: Add opt-in public referrer profiles with anonymity protections.
- [ ] V3-06: Add consented success-story and share-card tools with accurate status labels.
- [ ] V3-07: Pilot Visakhapatnam alumni/community attribution with optional affiliation.
- [ ] V3-08: Measure referral supply, response quality, activation, returning usage, and acquisition sources.

> Gate: Acquisition leads to genuine opportunities, not fabricated coverage or spam.

#### V4 — Employer product and first revenue

> Goal: Sell a useful employer workflow without monetizing individual employee endorsements.

- [ ] V4-01: Document real employer interviews, buyer roles, policy concerns, and pilot interest supplied by the founder.
- [ ] V4-02: Define the validated employer package and its exact paid deliverables.
- [ ] V4-03: Add employer accounts and independently approved company-admin membership.
- [ ] V4-04: Build authorized employer job creation, publishing, editing, pausing, and closing.
- [ ] V4-05: Define a separate, consented employer candidate workflow if the package requires candidate-level data.
- [ ] V4-06: Build privacy-safe aggregate employer reporting and test re-identification risks.
- [ ] V4-07: Add server-enforced plan entitlements that do not affect marketplace referral access.
- [ ] V4-08: Obtain founder approval for provider, entity readiness, contracts, tax/invoices, refunds, and support.
- [ ] V4-09: Build sandbox checkout using an approved provider; do not store card details.
- [ ] V4-10: Verify webhook signatures and handle duplicate or out-of-order events.
- [ ] V4-11: Add customer billing status, cancellation, invoices, and support paths.
- [ ] V4-12: Test tenant isolation, permissions, consent, failed payments, refunds, and entitlement expiry.
- [ ] V4-13: Add labelled sponsored jobs only if validated and separately approved.

> Gate: An employer understands what it buys, receives the contracted feature, and can cancel. If there is no validated demand, pause billing rather than creating speculative subscriptions.

#### V5 — Optional AI and career tools

> Goal: Reduce effort without making opaque hiring predictions.

- [ ] V5-01: Approve an AI provider, cost limit, data-processing arrangement, user notice, and off switch.
- [ ] V5-02: Add optional, editable resume extraction with explicit file-handling controls.
- [ ] V5-03: Add optional pitch drafting that the seeker reviews before sending.
- [ ] V5-04: Add job-requirement overlap explanations; never present a “hiring probability” as fact.
- [ ] V5-05: Suggest eligible referrers with understandable, consented reasons.
- [ ] V5-06: Protect against malicious job descriptions, prompt injection, unexpected provider retention, and cost overruns.
- [ ] V5-07: If buyer demand is validated, add separately billed career tools that do not change referral access.

> Gate: AI assists users, does not make hidden employment decisions, and stays within approved privacy and cost controls. If no provider is approved, keep AI disabled and do not market it as available.

#### V6 — Country-by-country international expansion

> Goal: Support additional markets with real supply and operational readiness.

- [ ] V6-01: Create a repeatable country-launch checklist in MARKET_LAUNCH.md.
- [ ] V6-02: Review relevant privacy, data-transfer, employment-claim, marketing, consumer, and payment requirements with qualified advisers.
- [ ] V6-03: Audit all location, locale, time-zone, language, and currency assumptions.
- [ ] V6-04: Establish local job-source permissions and referral-policy handling.
- [ ] V6-05: Check whether cross-border candidate and referrer eligibility differs by employer or role.
- [ ] V6-06: Add market-appropriate translated UI and reviewed transactional/legal content.
- [ ] V6-07: Add regional payment and invoicing only for approved paid products.
- [ ] V6-08: Establish support and moderation ownership for each market.
- [ ] V6-09: Test complete seeker and referrer flows with actual in-market users.

> Gate: Each advertised market has useful supply and a supported, accurate experience—not just a country name in a dropdown.

#### V7 — Enterprise and integrations

> Goal: Become a dependable employer referral-workflow provider.

- [ ] V7-01: Add approved ATS connections with scoped employer authorization.
- [ ] V7-02: Distinguish “submitted by a referrer” from “received by an ATS” and “reviewed by an employer.”
- [ ] V7-03: Add tenant-isolated internal referral workflows for contracted employers.
- [ ] V7-04: Add enterprise permissions, audit exports, and SSO where validated by buyers.
- [ ] V7-05: Add contractual support procedures, integration monitoring, and failure recovery.
- [ ] V7-06: Review security requirements with actual buyers; pursue independent assessments when justified.
- [ ] V7-07: Load-test requests, claims, jobs, employer dashboards, and billing events.

> Gate: Employers can use the software reliably without gaining unauthorized access to marketplace users or other tenants.

#### V8 — Ultimate global platform

> Goal: Extend a proven marketplace and employer business into referral infrastructure.

- [ ] V8-01: Add a scoped, monitored partner API where partner demand is proven.
- [ ] V8-02: Add a PWA and, if usage justifies it, native apps that reuse server-enforced rules.
- [ ] V8-03: Consider a browser extension only where site terms and user permissions allow it; never reveal anonymous referrers.
- [ ] V8-04: Add moderated community and professional-learning features only with operational capacity.
- [ ] V8-05: Add advanced fraud controls with human review and appeal.
- [ ] V8-06: Publish sufficiently anonymized research with correct labels for self-reported outcomes.
- [ ] V8-07: Review country-level liquidity, trust, employer renewal, unit economics, and user research before claiming category leadership.

> Gate: The platform has demonstrable repeat value across supported markets and sustainable employer revenue. “Global go-to” remains an earned market position, not a software release name.

## 9. Go-to-market plan for the founder

> Phase 1 — Build referral supply
>
> Select approximately 25 target companies in and around the Bengaluru opportunity set.
>
> Verify company names, sites, and domains before importing them.
>
> Recruit a mix of willing employees across roles and levels.
>
> Treat five available referrers per company as a planning goal, not a number to advertise before achieving it.
>
> Ask employees to opt in explicitly.
>
> Open seeker access first where referral supply is real.
>
> Review response times and request quality every week.
>
> Phase 2 — Bengaluru launch
>
> Use founder networks, alumni groups, professional communities, meetups, and useful content. Follow community rules. Do not mass-message employees or job seekers.

> Share success stories only with consent and accurate status descriptions.

> Phase 3 — Visakhapatnam and alumni pilot
>
> Work with universities, alumni, and professional communities. Make college affiliation optional. Review age-related requirements before enrolling students.

> The promise is access to relevant opportunities and people—not guaranteed placement.

> Phase 4 — Employer sales
>
> Interview employers that already have active referral programs. Identify workflow pain, purchasing authority, privacy concerns, and the value of job management or internal referral software.

> Sell a product they can actually use, not access to private conversations or “guaranteed referred candidates.”

> Phase 5 — India and international markets
>
> Expand only when each market has:

> Relevant jobs.
>
> Available referrers.
>
> Support ownership.
>
> Source permissions.
>
> Employer-policy handling.
>
> Appropriate legal and payment readiness.

## 10. Metrics and analytics

### 10.1 North Star Metric

> Distinct requests reaching referrer-confirmed REFERRED each week.

> This measures a confirmed referral submission reported through SkipWait. It does not mean the employer accepted the application.

### 10.2 Marketplace health

```
Track:
```

> Relevant job views with at least one available, eligible referrer.
>
> Available referrers by company, function, and market.
>
> Median first-response time.
>
> Share of requests answered before expiry.
>
> Direct acceptance and pool-claim rates.
>
> Accepted/claimed-to-confirmed-submitted rate.
>
> Referrer retention.
>
> Seeker repeat usage.
>
> Stale-job and abuse-report rates.
>
> Illustrative early goals to test against real baselines: response rate above 40%, median first response below 48 hours, and approximately five available referrers at each active launch company.

> These are hypotheses, not claims.

### 10.3 Commercial health

```
Track:
```

> Employer pilot activation.
>
> Trial-to-paid conversion.
>
> Monthly recurring revenue.
>
> Employer renewal and churn.
>
> Direct delivery/support costs.
>
> Gross margin.
>
> Acquisition cost and payback.
>
> Refunds and failed payments.

### 10.4 Privacy-safe events

> signup_completed
>
> onboarding_completed
>
> work_email_verified
>
> referrer_discoverability_enabled
>
> company_viewed
>
> job_viewed
>
> request_started
>
> request_submitted
>
> request_limit_hit
>
> request_accepted
>
> request_declined
>
> request_claimed
>
> request_released
>
> request_converted_to_pool
>
> request_referred
>
> request_expired
>
> request_interviewing_self_reported
>
> request_hired_self_reported
>
> report_submitted
>
> invite_sent
>
> invite_accepted
>
> employer_job_published
>
> employer_trial_started
>
> employer_subscription_activated
>
> employer_subscription_cancelled
>
> Do not send emails, resumes, message bodies, OTPs, work-email hashes, signed URLs, payment details, or unfiltered job URLs to analytics.

## 11. Legal, privacy, and launch responsibilities

> AI agents may draft text and implement workflows. The founder and qualified advisers must approve legal and commercial decisions.

> Before inviting real users, establish:

> Reviewed Terms, Privacy Policy, and Referral Code of Conduct.
>
> Accurate disclosure of what verification means.
>
> Clear notice that referrals and employment outcomes are not guaranteed.
>
> Discoverability and resume-sharing controls.
>
> A staffed channel for reports, grievances, privacy requests, and company corrections.
>
> Access, correction, deletion, and retention procedures.
>
> Secure secrets, HTTPS, backups, monitoring, and production support.
>
> A working—not mocked—email verification flow.
>
> Applicable Indian privacy obligations, including the Digital Personal Data Protection framework as applicable at launch.
>
> Before expanding internationally, review the applicable laws and operating requirements for each market. Potentially relevant regimes include EU and UK GDPR and applicable US state privacy laws, but requirements depend on where and how the service operates.

> Before charging, separately review business registration, contracts, invoices, tax, payment-provider availability, refunds, and customer support.

> Do not claim “GDPR compliant,” “DPDP compliant,” “GST compliant,” or “SOC 2 certified” merely because a page, template, or checklist exists.

## 12. Required release tests

> At every relevant version gate, test the following with separate user accounts.

> Identity and privacy
>
> Users cannot appoint themselves platform or employer admins.
>
> Unknown company domains cannot activate verified referrers.
>
> Expired verification blocks new requests and claims.
>
> Work emails and hashes are not visible to ordinary users.
>
> An anonymous profile cannot be identified through unintended detail combinations.
>
> Requests
>
> Unrelated users cannot view or change one another’s requests.
>
> Nonselected employees cannot access a direct request’s resume.
>
> Pool viewers cannot obtain a resume before claiming.
>
> Two simultaneous pool claims produce exactly one owner.
>
> Concurrent submissions cannot exceed seeker limits.
>
> Concurrent accepts/claims cannot exceed referrer limits.
>
> An accepted request is not labelled submitted.
>
> Expiry, release, conversion, withdrawal, and correction preserve history.
>
> Jobs
>
> A seeker-supplied URL is not labelled a verified opening.
>
> Closed or stale sourced jobs are handled correctly.
>
> Job-import duplicates do not create repeated listings.
>
> Employer and billing
>
> A work-email holder cannot self-appoint as company admin.
>
> Employer A cannot access Employer B’s tenant.
>
> Employers cannot read marketplace private messages by default.
>
> Aggregate reports cannot reveal an individual through filters.
>
> Only verified payment-provider events activate paid entitlements.
>
> Duplicate or out-of-order webhooks do not create incorrect access.
>
> Cancellation, failed payment, and refunds work as described.
>
> Experience and release
>
> Core flows work at 360px and desktop widths.
>
> Forms provide understandable validation and retry states.
>
> Database migrations have staging evidence.
>
> Backups and rollback steps are documented.
>
> Public product claims match actual functionality and data.

## 13. Prompts for your AI coder

> First prompt: start the audit
>
> Read PLAYBOOK.md in full. Perform V0-01 only. Inspect the existing repository and create CURRENT_STATE.md with the actual stack, user flows, database, authentication, storage, deployments, integrations, costs, and known risks. Do not rewrite or add user-facing features. Report what you verified and stop.

> Prompt to continue
>
> Read PLAYBOOK.md, PROGRESS.md, and DECISIONS.md. Select the first unchecked task in the current version. State your intended files, implementation, tests, and rollback needs before editing. Implement only that task. Run tests, update PROGRESS.md and CHANGELOG.md, report results and blockers, and stop.

> Prompt before a new version
>
> Review every task and the release gate for version [VERSION]. Test the complete seeker, referrer, and relevant admin or employer flows with separate accounts on mobile and desktop. Check private-data access and accurate referral statuses. List failures and founder-owned blockers. Do not mark the version complete unless the gate actually passes.

> Monetization review prompt
>
> Evaluate the proposed paid feature against PLAYBOOK.md. Identify the buyer, exact deliverable, permissions, consent, costs, billing lifecycle, and whether it changes access to employees or referral outcomes. Do not enable production payments without explicit approval.

> Security review prompt
>
> Audit authorization, verification, files, company affiliations, concurrency, limits, analytics, and payment webhooks where applicable. Fix critical issues in the current version first. Add regression tests, document unresolved risks, and stop.

## 14. Final product principle

> SkipWait should become the place people choose because:

> The jobs are current.
>
> The referrers are real, willing, and relevant.
>
> Employees retain control over their time and privacy.
>
> Seekers know what happened to their requests.
>
> Employers receive useful, authorized software.
>
> Payments never buy a person’s endorsement.
>
> Each supported market actually works.
>
> Build one verified step at a time. Earn the position of “global go-to”; never claim it merely because the roadmap is complete.

> For your AI coders: Upload this as PLAYBOOK.md, not just as a PDF. Markdown lets coding agents read the task IDs and update progress reliably. You can also export the same document to PDF for sharing with people.
