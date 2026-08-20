# How to Transfer skipwait.me to VibeCodingApp

## Recommended approach

Use **two separate artifacts** rather than a single enormous chat prompt. The first is the full source snapshot, which preserves the working React/TypeScript application, database schema, tests, and documentation. The second is the product specification, which prevents an AI builder from accidentally weakening the privacy, payment, or company-verification rules while changing the implementation.

| Artifact | What it contains | How to use it |
| --- | --- | --- |
| **Source snapshot ZIP** | Application source, database schema, tests, package manifests, and project documentation. It excludes dependencies, builds, logs, secrets, and private data. | Prefer a VibeCodingApp ZIP/GitHub import if available. Otherwise keep it as a private reference repository and upload only the required folders/files. |
| `docs/skipwait-vibecodingapp-handoff.md` | The master product brief, UI system, user flows, schema, API contract, payment rules, privacy boundary, and acceptance tests. | Upload this file to the VibeCodingApp project. If file upload is unavailable, paste the master prompt first and then sections 2–12 in order. |
| `docs/pre-launch-checklist.md` | Founder operating checklist for domains, payments, legal, support, monitoring, beta, and expansion. | Keep this open during deployment; it is not source code. |

> **Never upload or paste secrets.** Do not transfer `.env` files, database URLs, Clerk keys, Chargebee/Razorpay/PayPal/Resend credentials, webhook passwords, JWT secrets, real resumes, customer exports, or payment events. Enter new credentials directly in VibeCodingApp’s secret manager after its codebase exists.

## Step-by-step transfer

1. **Create a fresh private VibeCodingApp project.** Select its full-stack TypeScript/React option if available. Do not begin from an unaudited public template that adds a public job marketplace or generic social layer.
2. **Import the source snapshot** through its private ZIP or GitHub import. If importing only a brief, upload `skipwait-vibecodingapp-handoff.md` and paste the master prompt at the start of that file.
3. **Give the builder this first instruction:**

   ```text
   Read the attached skipwait-vibecodingapp-handoff.md completely before changing code. Preserve its privacy, exact-company routing, server-side entitlement, company-email-only Referrer sign-in, and no-fake-activity rules. Do not use demo users, sample referrals, placeholder resumes, testimonials, public employee lists, or client-side payment fulfillment. First report the files, routes, schema, and tests you will preserve; then make changes in small testable milestones.
   ```

4. **Configure the new environment in VibeCodingApp’s secure settings.** Add authentication, database, private object storage, payment, email, and error-monitoring credentials manually. Use new/rotated development keys first. Do not reuse the current production webhook or point it at the new project until the receiver is verified.
5. **Migrate the schema before data.** Create the tables, ownership constraints, indexes, and unique/idempotency constraints from the handoff. Run authorization, atomic-claim, document-access, and payment-reconciliation tests with isolated test data.
6. **Rebuild and verify milestone by milestone.** Complete Job Seeker flow, Referrer company-email OTP/inbox, candidate review/approved conversation, payment ledger/webhooks, notifications/privacy/admin, and PWA/mobile behavior in that order. Require the acceptance checklist to pass after each milestone.
7. **Keep the new project private until the launch checklist passes.** Bind a staging domain first. Create a new staging webhook. Only after live receiver verification should you bind `skipwait.me`, change canonical authentication origins, and configure the live Chargebee webhook for the new deployment.

## What transfers automatically vs. what requires a new setup

| Area | Transfer via source/specification | Reconfigure independently in VibeCodingApp |
| --- | --- | --- |
| User interface and flows | Yes | Validate visual behavior at 375×812 and desktop after import. |
| Business rules and tests | Yes | Run against the new database and server runtime. |
| Database schema | Yes | Apply migrations; do not copy production records without a separate migration plan. |
| Authentication | No credentials | Create/attach the new production instance, allowed origins, redirects, and work-email verification settings. |
| Private resume storage | No file data or keys | Create a private bucket and server-only signed-URL access policy. |
| Chargebee/Razorpay/PayPal | No credentials/webhooks | Add new environment secrets, validate price IDs, configure separate staging/live webhooks, and run controlled payments. |
| Resend/error notifications | No credential | Verify a sender and set only the server-side API key. |
| Domain and DNS | No | Bind `skipwait.me` to one deployment only and update DNS/SSL per the platform’s instructions. |

## Minimum acceptance evidence before moving traffic

The VibeCodingApp project should not receive the production domain or live payment traffic until it has: a passing production build; typed code; automated authorization, upload, payment-idempotency, OTP, and exact-company-routing tests; visual mobile checks; an unsigned canonical webhook receiver returning HTTP 401; and two controlled live payment reconciliations—India/INR through Razorpay and international/USD through PayPal.

## Safe data-migration rule

Source code is safe to transfer after excluding credentials and private logs. **Real user data is a separate project.** Before moving any accounts, requests, resumes, payment history, or administrator records, define source and target ownership, obtain backups, write a mapping and rollback plan, run a redacted test migration, reconcile row counts and attachment access, and gain any required legal/privacy approval. Do not use an AI project-import feature as a customer-data migration tool.
