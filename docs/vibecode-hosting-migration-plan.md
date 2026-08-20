# skipwait.me Full Migration to VibecodeApp

**Decision.** VibecodeApp can be the intended production host for the full skipwait.me application, including the public site and its deployed backend. This is **not** a DNS-only switch. The current application is a React/TypeScript + Express/tRPC + Drizzle/MySQL system using Clerk, private S3 document storage, Chargebee, Resend, and server-side authorization. Vibecode deploys its own Hono backend, SQLite/Prisma database, Better Auth sessions, cloud storage, environment-variable manager, and custom-domain routing. The backend therefore needs a controlled **replatform and data migration**, not an unsafe file copy. [1] [2] [3]

> **Cutover rule:** The current production system remains the source of truth until a separately deployed Vibecode staging release passes functional, security, payment, document-access, and data-integrity verification. Do not point `skipwait.me` at Vibecode before those checks pass.

## 1. Current platform inventory

| Capability | Current implementation | Vibecode target | Migration requirement |
| --- | --- | --- | --- |
| Web application | React 19, TypeScript, Tailwind 4, Vite PWA | Vibecode web application | Recreate the product UI and route behavior; retain the enterprise-blue design and mobile fixed-view rules. |
| Server API | Express 4, tRPC 11, private HTTP routes | Hono backend routes | Rebuild the server-side contracts. Never convert authorization or payment fulfillment into browser logic. |
| Database | Drizzle ORM over MySQL/TiDB | Prisma over Vibecode SQLite | Map every table, index, relationship, enum, and UTC timestamp; import data only through a controlled migration script and reconciliation report. |
| Job Seeker identity | Clerk | Better Auth email OTP/session system | Rebuild the identity boundary. Preserve account/email mapping only after consented, verified migration; require a new secure session rather than carrying cookies or session tokens. |
| Referrer identity | Clerk company-email OTP with company-domain checks | Better Auth email OTP plus server-side company-domain verification | Preserve the company-email-only rule, single-code OTP lifecycle, and exact-company access authorization. |
| Private resumes | Encrypted fragmented upload to private S3 objects with signed URLs | Vibecode Cloud storage, server-side private access | Recreate encrypted uploads, size/type/signature validation, owner checks, staging cleanup, and approved-participant-only resume access. Do not make resumes public URLs. |
| Payments | Chargebee server API; Razorpay for INR and PayPal for USD; webhook-based fulfillment | Chargebee server API through Vibecode Hono backend | Preserve the existing verified Chargebee catalog and server-only entitlement logic. Change the host-bound live environment only after domain cutover. |
| Notifications/errors | Private in-app notifications; Resend operational alerting | Vibecode backend + Resend environment variables | Keep notification authorization and privacy-safe activity logging server-side. |
| Authorization/operations | Admin activity, privacy queue, token recovery, exact-company referral routing | Vibecode Hono routes + Prisma transaction boundaries | Rebuild all role/owner checks and test forbidden paths before importing production data. |

## 2. Why this must be a replatform, not a source upload

Vibecode’s documented backend uses **Hono**, **SQLite with Prisma**, and **Better Auth**. The current source depends on Express, tRPC, Drizzle/MySQL, Clerk, and storage helpers provided by the current hosting environment. These components are not drop-in compatible. [2] [3]

The existing Vibecode workspace file panel accepts operational documents but does not accept a source archive. The secure product specification and transfer guide are already uploaded there as text documents. The verified **source-only ZIP** remains the reference archive for a supported future source-import, Git, SSH, or manual porting route. It excludes credentials, customer data, resumes, payment events, local logs, builds, and dependencies.

The existing workspace also displayed an `API Error: 402 insufficient credit balance` while attempting agent-generated code changes. Until the account has sufficient Vibecode agent capacity, do not ask the agent to start the backend rewrite; a partial, untested rebuild would weaken the launch posture.

## 3. Required migration sequence

| Stage | Work | Acceptance evidence | Domain/payment state |
| --- | --- | --- | --- |
| **A. Freeze the specification** | Use the uploaded `skipwait-vibecodingapp-handoff.txt`, `vibecodingapp-transfer-guide.txt`, and this migration plan as the implementation contract. | Product owner approves the parity scope and explicitly rejects fabricated activity, public resumes, browser-side payment crediting, and non-company Referrer sign-in. | Current domain and current hosted application remain live. |
| **B. Establish Vibecode staging** | Deploy the rebuilt app first at a separate `*.vibecode.run` URL. Enable backend, database, auth, storage, logs, and environment-variable configuration. | Staging URL loads; production logs are available; no production secrets are visible in source, browser, or uploaded files. | No DNS or Chargebee webhook changes. |
| **C. Rebuild privacy/security primitives first** | Implement Better Auth sessions; Job Seeker and Referrer role boundaries; company-email OTP; admin authorization; private document storage; activity log; privacy requests. | Automated tests prove unauthenticated, cross-user, cross-company, admin, document, and message access is denied. | No production data import. |
| **D. Rebuild primary workflows** | Implement role URL identification; onboarding; encrypted resume upload; request creation; Referrer claim/review; approve/decline; approved-only conversation; voluntary factual progress updates; no-coverage follow-up. | Controlled test accounts complete both journeys on mobile and desktop, with no page-scroll regressions. | No public launch traffic. |
| **E. Rebuild monetization correctly** | Implement Chargebee checkout creation, host-aware INR/USD route validation, subscription cancellation, signed webhook verification, idempotent server-side token/subscription fulfillment, and recovery flow. | Chargebee test event produces exactly one entitlement change; browser callbacks alone produce none. | Test site only; webhook points at Vibecode staging endpoint. |
| **F. Migrate data deliberately** | Export schema and records from the current database; transform IDs/foreign keys/timestamps; transfer only authorized private objects; validate counts and referential integrity; preserve a rollback copy. | Reconciliation totals, attachment count/hash report, and sampled ownership checks all pass. | Keep the old deployment live and read-only until acceptance. |
| **G. Production launch rehearsal** | Configure production secrets in Vibecode’s Environment tab, deploy production, set `skipwait.me` in Vibecode’s Domain tab, and generate the precise DNS target. | HTTPS, canonical redirect, health endpoint, OTP origins, CORS/cookies, storage access, logs, and monitoring all pass on the Vibecode deployment URL. | Do not change public DNS yet. |
| **H. Controlled cutover** | Change the authoritative DNS record for `skipwait.me` to the Vibecode deployment target, verify Vibecode Domain status, then update the live Chargebee webhook to `https://skipwait.me/api/chargebee/webhook`. | Signed provider-originated live webhook reaches the new backend and creates no duplicate entitlement. One controlled INR and one controlled USD payment reconcile exactly once. | `skipwait.me` moves to Vibecode only after evidence is recorded. |
| **I. Stabilize and retire** | Monitor errors, upload failures, OTP completion, webhook delivery, entitlement reconciliation, and authorization denials. Retain the old deployment only for the agreed rollback window. | Daily launch dashboard has no unresolved P0 incident; rollback plan is tested. | Retire old runtime and rotate/revoke old secrets after the retention window. |

## 4. Secret and configuration map

All values below must be entered directly into Vibecode’s **Environment** controls by the account owner or through an approved secure secret-management path. They must not be pasted into the chat, uploaded handoff files, source archive, database rows, browser local storage, or client bundles. [1]

| Service | Vibecode production configuration | Do not do |
| --- | --- | --- |
| Chargebee | Live site, live API key, live webhook secret, `CHARGEBEE_LIVE_DOMAIN=skipwait.me`, and the correct production/test separation. | Do not reuse the temporary managed-domain setting after DNS cutover; do not expose webhook secrets. |
| Razorpay / PayPal | Retain existing gateway configuration inside Chargebee: INR/Razorpay for India and USD/PayPal for international traffic. | Do not replace provider routing with a client-side currency selector or direct browser fulfillment. |
| Resend | Production API key and `noreply@updates.skipwait.me` as the approved sender. | Do not embed the key in frontend code or upload it as a workspace file. |
| Authentication | Better Auth email-OTP configuration; trusted production origins; Referrer domain-verification logic. | Do not allow a personal email to claim a Referrer identity; do not migrate existing session cookies. |
| Storage | Private bucket/container configuration, server-only signing credentials, and private CORS policy. | Do not use publicly readable resume URLs or store document bytes in SQLite rows. |
| Database | Vibecode-managed SQLite/Prisma schema with backed-up import artifacts and an account-recovery process. | Do not overwrite the current MySQL data or run destructive imports without a reconciliation/rollback plan. |

## 5. Cutover gate for `skipwait.me`

Vibecode’s documented custom-domain workflow requires a deployed web app, adding the domain in the deployment dashboard, applying the specific CNAME/ALIAS DNS records shown by Vibecode, and verifying the domain before deployment. [4]

1. Create and validate the Vibecode production deployment using its `*.vibecode.run` hostname.
2. In Vibecode **Deployments → Domain**, add `skipwait.me` and capture the exact target shown by Vibecode.
3. At the DNS provider, replace the old apex record with the exact CNAME/ALIAS target from Vibecode; configure `www` redirect only if desired.
4. Wait for Vibecode domain verification and confirm HTTPS plus the public route and authenticated API behavior.
5. Set the Vibecode production application’s live Chargebee host setting to `skipwait.me`.
6. Change the live Chargebee webhook URL to `https://skipwait.me/api/chargebee/webhook` and run the provider-originated delivery test.
7. Execute one controlled Razorpay-INR payment and one controlled PayPal-USD payment with legitimate test actors, reconcile in Chargebee and the new database, and confirm exactly-one entitlement behavior.
8. Keep a defined rollback window. If P0 failures arise, restore the previous DNS record first, then investigate; never attempt a data rollback from a browser session.

## 6. Current migration blockers

| Blocker | Why it matters | Safe next action |
| --- | --- | --- |
| Vibecode agent returned 402 insufficient credit balance | The full server/database/auth port cannot be generated or validated without executable agent capacity. | Restore sufficient Vibecode agent capacity, then use the staged rebuild prompt below. |
| The workspace supports documents, not source-archive imports | The complete codebase cannot be safely replaced through the file panel alone. | Use a supported Git, SSH, CLI, or source-import path if Vibecode exposes one; otherwise rebuild from the uploaded implementation specification in controlled stages. |
| Different backend/auth/database runtimes | A cosmetic UI port would omit security, billing, document, and data controls. | Rebuild server primitives before moving the domain or production data. |
| No completed data migration | Real user records and private resumes require controlled export, transform, verification, and rollback. | Perform a reconciled staging migration only after the target backend passes automated authorization tests. |
| `skipwait.me` still points to the legacy deployment | A DNS switch now would produce a broken or incomplete public application. | Do not repoint DNS until the Vibecode deployment passes the full cutover gate. |

## 7. Vibecode staged rebuild prompt

Use the following in the SkipWait.me Vibecode workspace **only after the account has sufficient agent capacity**. It is intentionally staged so that the agent cannot silently replace a working application with an incomplete prototype.

```text
Read these workspace files in full before editing code:
1. skipwait-vibecodingapp-handoff.txt
2. vibecodingapp-transfer-guide.txt
3. vibecode-hosting-migration-plan.txt

We are migrating a production-grade job-referral PWA. Do not build a prototype and do not change the custom domain, production DNS, payment gateway, or production secrets yet.

First, inspect the current codebase and return a concise implementation plan that maps each existing product capability to Vibecode Hono, Prisma/SQLite, Better Auth, cloud storage, and server-side environment variables. Flag every incompatible dependency. Do not use sample users, fabricated referrals, testimonials, tokens, payments, messages, or resumes.

Then implement only Stage C from the migration plan in a staging environment: Better Auth roles, Job Seeker identity, company-email-only Referrer OTP, admin authorization, private cloud-storage document model, privacy-safe activity logging, and protected API boundaries. All resumes must remain private and server-authorized. Add tests for unauthenticated, cross-user, cross-company, and admin-denied access. Do not copy real production data or secrets.

Stop after Stage C, run the production build and tests, and report the exact evidence. Wait for approval before implementing workflows, payments, data migration, or domain cutover.
```

## 8. Execution status — 20 August 2026

The existing **SkipWait.me** Vibecode workspace now contains the secure implementation specification, transfer guide, this hosting-migration plan, and the staged rebuild prompt as supported text documents. The constrained Stage C instruction has been submitted to the workspace agent. It explicitly limits work to a staging foundation and forbids changes to production DNS, custom-domain configuration, deployment, payment settings, live webhook settings, secrets, and production data.

No target-platform code, database, deployment, authentication configuration, payment configuration, customer record, or DNS change is treated as migrated until Vibecode returns an auditable build/test result and the result is independently reviewed. The current managed deployment therefore remains the production source of truth and rollback path.

## References

[1]: https://www.vibecodeapp.com/docs/deploying/guide "Vibecode: Deploying Your App"
[2]: https://www.vibecodeapp.com/docs/features/backend-auth "Vibecode: Backend and Auth"
[3]: https://www.vibecodeapp.com/docs/features/vibecode-cloud "Vibecode: Cloud"
[4]: https://www.vibecodeapp.com/docs/deploying/custom-domain "Vibecode: Connect a Custom Domain"
