# skipwait.me — VibeCodingApp Build Handoff

**Purpose.** This document is the build specification for recreating **skipwait.me**, a mobile-first private job-referral product. Upload this file to VibeCodingApp if it accepts project briefs, then paste the master prompt in the next section into its chat. Build the product in small verified milestones; do not replace core privacy rules with placeholders.

> **Product promise:** skipwait.me is the fastest trusted way to ask for or give a job referral. A Job Seeker shares one real job link and a resume. Only verified employees of the employer behind that link may review it. Employee identities stay hidden unless a Referrer chooses to claim and approve the request.

## 1. Copy-paste master prompt for VibeCodingApp

```text
Build a production-minded, mobile-first PWA named skipwait.me. It is a private job-referrals product with two roles: Job Seeker and Referrer. Do not create a generic job board, public referral marketplace, public employee directory, social feed, testimonials, ratings, fake activity, demo referrals, or fabricated social proof.

Use React + TypeScript + Tailwind (or your strongest equivalent), responsive PWA support, a server API, relational database, secure private object storage, and real authenticated user sessions. Use the design and feature requirements in the attached skipwait-vibecodingapp-handoff.md as the source of truth.

Implement in this order and test each milestone before moving to the next:
1. Shared design system, landing page, mobile navigation, and fixed-viewport flow shell.
2. Job Seeker flow: job URL -> resume upload -> authenticated private request -> status screen.
3. Referrer work-email OTP enrollment and exact-company private inbox.
4. Candidate preview, atomic claim, free approve/decline, and approved-only private conversation.
5. Credit entitlements, payment-intent ledger, webhook-only fulfillment, and plan screens.
6. Private notification center, settings, data export/deletion request, and admin operational dashboard.

Important non-negotiable rules:
- Mobile screens are h-dvh fixed-viewport with no full-page vertical scrolling. One primary action per screen; every flow has a Back escape route.
- Use enterprise blue #0B57D0, slate neutrals, DM Sans, white cards, and no purple/violet.
- Referrer review, approve, decline, and post-approval conversation must always be free.
- Referrers use a verified company-email OTP flow only. Reject consumer email domains. Do not ask for a password or let a personal email enroll as a Referrer.
- Resolve the employer from the job URL and route the request only to verified employees with the exact matching work-email domain. Never route a request to a job board domain such as linkedin.com or wellfound.com.
- Keep Referrer identities hidden. A Referrer sees a candidate’s note, target job link, and securely authorized resume before deciding. The Job Seeker sees no Referrer identity until the Referrer chooses to claim and approve.
- Only the Job Seeker and assigned Referrer may message, and only after the request is approved.
- All resumes are private object-storage files. Validate allowlisted types and binary signatures server-side. Issue short-lived signed access URLs only for the owner or assigned Referrer.
- Credits are fulfilled on the server from verified payment webhooks only. Never add credits from a browser success URL or client callback.
- Never seed fake requests, fake notifications, fake users, reviews, ratings, or social proof. Use honest empty states with a useful next action.
- Build loading, empty, offline, access-denied, malformed-response, and retry states. HTML or malformed API responses must show a concise recovery message, never raw JSON parser errors.

At each milestone, add automated tests for authorization, ownership, idempotency, and the core user action. Show me the result of each test and production build before declaring it complete.
```

## 2. Product scope and role model

| Role | Primary goal | What the role can do | What it must never see or do |
|---|---|---|---|
| **Job Seeker** | Send a private referral request for one real role. | Submit role URL, upload resume, optionally add a short note, track request status, share a voluntary invite, buy credits, and message only after approval. | Cannot browse or reveal employees, claim a request, access another user’s documents, or message before approval. |
| **Referrer** | Review and decide whether to help with requests at their own company. | Verify a company email by OTP, see only exact-company requests, preview candidate context, claim one request atomically, approve or decline for free, share public internal openings, and message after approval. | Cannot enroll with a personal email, access another company’s requests or documents, reveal identity before choosing to help, or pay to review a request. |
| **Administrator** | Protect trust, solve verified support problems, and observe only minimized operational data. | Review privacy requests, monitor aggregate flow health, inspect privacy-safe activity logs, and make documented token corrections. | Must not access private documents or use activity data as a candidate/employee surveillance feed. |

## 3. Experience and visual direction

The application should feel like an enterprise productivity PWA rather than a job marketplace. Use **DM Sans**, a white and `slate-50` surface system, white cards with restrained slate borders, and **enterprise blue `#0B57D0`** for the primary action and active states. Use green only for confirmed success and amber/rose only for truthful warnings or failures. Do **not** use purple or violet.

Every core mobile screen must fit in one device viewport. Use a `h-dvh min-h-dvh overflow-hidden` application shell with a fixed or sticky safe-area-aware footer. Keep the top header to a Back action and, where appropriate, a compact notification bell plus account menu. In flow headers, do not display a large logo; use navigation clarity instead. Use one obvious primary button, short helpful microcopy, accessible focus states, and a concise empty-state action rather than paragraphs explaining the marketplace is empty.

| Surface | Required interaction | Primary action |
|---|---|---|
| Landing | Choose a role without signing in first. | “I need a referral” or “I give referrals” |
| Job URL | Paste a complete HTTP/HTTPS job link. Show a verified employer badge only when evidence is sufficient. | Continue |
| Resume | Resume is required; supporting documents are optional. Selecting a file is the main action. | Add your resume / Send private request |
| Referrer inbox | Show one private request at a time or a concise state tab. | Review candidate |
| Candidate preview | Show URL, candidate note, and authorized resume before the decision. | Claim and review / Approve / Decline |
| Notifications | Show one update at a time, unread first, with a direct destination. | Read update |

## 4. Core flows and business rules

### Job Seeker private referral request

1. The user chooses **I need a referral** and pastes a valid job URL.
2. The server canonicalizes the URL and resolves the actual employer domain using conservative evidence. Accept known ATS/careers links and structured job-posting evidence only when the organization and official domain agree. If the employer cannot be proven, ask for the employer’s careers-page link; never guess or route to the job-board host.
3. The user attaches a resume. Allow PDF, DOC, DOCX, PNG, or JPEG only; validate MIME type, filename, size, and binary signature on the server.
4. Sign in only when needed to securely upload or submit. Preserve the locally selected resume through sign-in on the same device.
5. Create the request only after server authorization. If no verified employee exists for the exact company domain, do not spend a credit. Instead show one concise voluntary company-coverage invite action.
6. When coverage exists, debit one Job Seeker referral credit in the server transaction and notify matching verified Referrers privately.
7. Show a truthful progress screen: **Sent → Claimed → Reviewed**. Show an optional Referrer decision note only to the owning Job Seeker.

### Referrer work-email, review, and decision

1. The user chooses **I give referrals** and enters a work email. Reject consumer domains such as Gmail, Outlook, iCloud, Yahoo, Proton, and equivalent personal providers.
2. Send an OTP directly to the entered company email. Do not use a password flow. Persist enrollment only after the identity provider confirms that exact email is verified.
3. Use the verified domain to return only unclaimed requests for that exact resolved employer. A `new` request is visible to all matching verified employees until one claims it.
4. Before a claim, provide a private candidate preview containing the candidate note, target role URL, and signed resume/document links. Do not disclose document storage keys.
5. Claim must be atomic: one employee can win; all others immediately lose access.
6. The claimant may approve or decline without any payment or credits. Approval enables a private conversation; decline does not.

### Private conversation and notifications

The system may create a private conversation only after an `approved` decision. The API must verify on every read and write that the caller is either the Job Seeker who owns the request or the verified Referrer assigned to that request. New messages, claims, decisions, verified company-coverage rewards, verified personal-invite rewards, and administrator token adjustments create account-owned notification records.

The notification center has an unread bell badge, loads only the signed-in account’s display-safe notifications, supports mark-as-read, and sends the user to the relevant Request, Referrer Inbox, or Settings screen. Responses use `Cache-Control: private, no-store`; do not return internal user IDs or object-storage keys.

## 5. Credits, plans, payments, and referral rewards

| Product | Entitlement | India price | Global reference | Rule |
|---|---:|---:|---:|---|
| Free | 3 Job Seeker referral requests per monthly cycle | Free | Free | Monthly credits reset; Referrer decisions remain free. |
| Credit packs | 1, 5, or 10 non-expiring credits | ₹99 per credit | $1 per credit | Packs supplement monthly allowance and do not expire. |
| Pro | 10 requests per monthly cycle | ₹599 | $7 | Localized price display identifies **India price**, the struck-through global reference, and a truthful savings percentage where applicable. |
| Max | 30 requests per monthly cycle | ₹1,299 | $15 | Same transparent regional presentation and server enforcement. |

Route India billing to Razorpay/INR and non-India USD payments to the configured international provider through Chargebee. The user must not choose INR/USD manually. Create a server-side checkout intent before checkout; fulfill a credit or subscription only after a verified payment webhook reconciles provider event, hosted page, amount, currency, invoice, and opaque checkout intent. Make webhook handling idempotent using provider event IDs. Browser redirects are UI-only and never authoritative for entitlement.

Use voluntary, recipient-benefiting referral sharing. Grant mutual extra credit only after a new user’s verified conversion satisfies anti-abuse checks: disallow self-invites, duplicate account/reward claims, and reuse of the same normalized email hash. Give Referrer and Job Seeker one reward after verified company coverage is completed; never reward raw link spam.

## 6. Data model to implement

Build the relational model below. You may rename fields for the target backend, but preserve ownership, indexes, unique constraints, and lifecycle semantics.

| Entity | Essential fields | Key invariants |
|---|---|---|
| `users` | id, auth provider user ID, name, email, role (`user`/`admin`), timestamps | Auth identity is unique; administrator authorization is server-side. |
| `profiles` | userId, accountType, workEmailDomain, workEmailVerifiedAt, onboarding fields | One profile per user; a Referrer’s eligibility derives from a verified non-personal domain. |
| `jobs` / `companyOpportunities` | resolved company domain, role data, public URL, owner | Never treat a job-board host as the employer. Public openings show company level only, not employee identity. |
| `referralRequests` | jobId, jobSeekerId, nullable referrerId, personalPitch, status, referrerMessage, savedAt | Claim conditional on `referrerId IS NULL`; approval controls conversation access. |
| `referralAttachments` | ownerId, nullable request ID, safe filename, private storage key, MIME, size | Files are private; never expose keys to the browser. |
| `messages` | requestId, senderId, recipientId, body, readAt | Both callers must be approved-request participants. |
| `notifications` | userId, category, title, body, readAt, createdAt | Always query by authenticated owner; serve a safe projection only. |
| `tokenBalances` / `tokenTransactions` | userId, role, monthly/purchased balances, plan, cycle, transaction kind | Entitlements and debits execute server-side in transactions. |
| `paymentFulfillments` / subscription intents/events | provider event ID, checkout intent, user, amount, currency, status | Provider events and checkout intents are uniquely idempotent. |
| invite/reward tables | inviter, joiner, code/hash, company domain, status, reward count | Prevent duplicate rewards by unique joiner/email/invitation constraints. |
| `operationalActivityLogs` / `privacyRequests` | minimized action metadata, privacy-review status | Do not log resume text, URL query strings, OTPs, payment data, documents, or secrets. |

## 7. Route map and API behavior

Create a route set equivalent to the following. Keep APIs authenticated where noted and return concise safe errors, never HTML fallback pages.

| Route | Purpose |
|---|---|
| `/` | Landing page with two role CTAs and public Internal Openings entry. |
| `/start` | Job Seeker URL onboarding. |
| `/request` | Resume attachment and private request submission. |
| `/requests` | Owning Job Seeker’s fixed-viewport request status page. |
| `/inbox` | Verified Referrer exact-company inbox. |
| `/referrer` | Work-email enrollment and assigned-request decision context. |
| `/conversation/:requestId` | Approved-request participant-only conversation. |
| `/share` | Voluntary personal invite link and one-tap share surfaces. |
| `/notifications` | Account-owned updates and read/action flow. |
| `/settings`, `/privacy` | Work-email settings, data export, deletion-request initiation, and trust information. |
| `/wall`, `/post-opportunity` | Anonymous company-level internal openings and verified employee posting. |
| `/admin/*` | Role-protected activity, flow health, privacy review, and documented token recovery. |

For all JSON consumers, use a shared parser that catches malformed or HTML responses and returns an intentional fallback such as “This update is unavailable right now. Try again.” Do not show `Unexpected token '<'` or raw parser diagnostics to an end user.

## 8. Security, privacy, and ethical product guardrails

> **Privacy boundary:** skipwait.me should protect a person who is asking for help and a person who may choose to give it. Convenience must not override ownership or consent.

Enforce authorization server-side for every sensitive action. Do not rely on client routing or hidden buttons. Use signed URLs for object storage, private cache headers for personal data, secure session cookies/tokens, input validation, output projection, security headers, request-size limits, and minimum-necessary activity logs. Resume access belongs only to the upload owner and the Referrer assigned through the atomic claim.

Use no dark patterns. Do not fabricate notifications or a busy marketplace. Sharing must be optional, targeted, and truthful. Do not make users pay to decide whether to help. Do not make “hyper-addictive” design depend on pressure, deceptive scarcity, unwanted outreach, or social manipulation. Ethical daily utility comes from accurate request state, prompt private messages after approval, useful internal openings, and clear earned-credit updates.

## 9. Acceptance checklist

Do not call the project complete until all checks below pass.

- [ ] The 375×812 mobile version of every core screen fits in one viewport without page scrolling.
- [ ] Job URL employer matching rejects ambiguous or job-board-only evidence and never routes to the job board domain.
- [ ] An unrelated user and a user from another verified company cannot list, preview, claim, download, decide, or message on a referral request.
- [ ] Two matching Referrers cannot both claim the same request.
- [ ] Candidate preview is available before a Referrer decides; documents use authorized signed URLs and no storage keys leak.
- [ ] Conversation is denied before approval and to all non-participants after approval.
- [ ] Free monthly credit reset, purchased credit persistence, plan entitlement, webhook reconciliation, duplicate-event idempotency, and admin adjustment auditability are tested.
- [ ] Referrer review and decisions are free in both UI and API.
- [ ] Notification list, unread badge, mark-read, empty state, and direct actions are tested.
- [ ] HTML/malformed API responses show concise recovery text; no raw JSON parser token is exposed.
- [ ] Production build, TypeScript check, automated tests, and a real-device work-email OTP test pass.

## 10. What to provide to the VibeCodingApp builder

Provide this Markdown file first. Then provide only the following configuration through its secure secrets/integration settings, **never inside a prompt, source file, or repository**:

| Integration | Needed for | What to provide |
|---|---|---|
| Authentication provider (currently Clerk) | Secure Job Seeker login and company-email OTP verification | Publishable key, server secret, allowed redirect URLs, and verified sender/domain settings. |
| Database | Ownership, lifecycle, balances, notifications, admin records | Secure database connection configured through the platform’s secret manager. |
| Private object storage | Resumes and attachments | Bucket configuration and server-only credentials; no public bucket. |
| Chargebee + Razorpay + PayPal | Localized checkout and webhook-driven fulfillment | Server-only API keys, webhook secret, product/price identifiers, and test-mode callback URL. |
| Email provider (Resend) | Minimized material error alerts only | Server-only API key and verified `noreply@updates.skipwait.me` sender. |

Do **not** send a VibeCodingApp agent any current private keys, webhook secrets, database URLs, Clerk tokens, payment credentials, or real user data. Use the product requirements above; configure credentials directly in the platform’s secret manager after the skeleton exists.

## 11. Recommended build process

Start by pasting the master prompt. Ask the builder to first produce a clickable mobile UI with **real empty states only**, then ask it to add the server/database authorization layer before payments. After it shows the schema and API contract, compare the result against the acceptance checklist section by section. Make payment work the final milestone because entitlement security depends on stable request ownership and ledger design.

If VibeCodingApp supports project files, upload this document. If it only supports chat, paste the master prompt first, then paste sections 3–9 in sequence. Ask it to preserve the checklist as a project `TODO.md` and to mark items complete only after a corresponding automated test passes.
