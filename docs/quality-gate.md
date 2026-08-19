# skipwait.me Quality Gate

## Operating Standard

Every release is treated as a **quality-gated production change**, not merely a code change. A reported user failure is a release blocker until it has a reproducible failure mode, a targeted repair, an automated regression, and a verified build. A passing unit test alone is not sufficient when the affected path crosses authentication, a gateway, storage, payment, or a mobile interaction.

## Release-Blocking Journeys

| Journey | Required checks | Release-blocking failure examples |
|---|---|---|
| Public entry and onboarding | Mobile viewport, routing, job-link validation, employer-resolution evidence | Disabled or dead CTA; job link routed to a job board instead of the employer |
| Job Seeker referral request | Resume selection, gateway-safe fragment upload, server signature validation, private attachment authorization, credit deduction | Lost resume; HTML gateway response; non-owner document access; credit charged before request exists |
| Referrer participation | Company-email verification, exact-domain inbox filtering, private candidate preview, exclusive claim, free approve/decline | Personal-email enrollment; cross-company request access; multiple claims |
| Approved conversation | Participant-only authorization, unread state, message send/read flows | Conversation before approval; outsider access; identity leakage |
| Credits and subscriptions | IP-based payment route selection, catalog display, server-side checkout intent, idempotent verified webhook fulfillment, cancellation | Browser-based credit grant; wrong currency/amount; duplicate fulfillment |
| Sharing and invitations | Recipient-benefiting links, one-tap channels, anti-self-invite checks, verified-conversion rewards | Forced sharing; reward before verified conversion; exposed private request data |
| Privacy and notifications | Account-owned data export, deletion-review flow, no-store private notifications, mark-read ownership | Immediate destructive deletion; cross-account notification access; cached private content |
| Administrator operations | Database role enforcement, audit logs, recovery adjustment validation, privacy-review authorization | UI-only admin controls; non-admin token adjustment; unlogged security-sensitive action |

## Mandatory Verification Before a Checkpoint

The release owner must run the full sequential Vitest suite, TypeScript checking, and a production build. Changed user-facing pages must also receive desktop and 375×812 mobile visual review. New or changed HTTP routes require positive, unauthenticated, unauthorized, and invalid-input tests. Private-resource routes must include an ownership or exact-company negative test.

## Operations Monitoring Rules

Runtime monitoring prioritizes material request failures, payment fulfillment anomalies, private-document upload failures, work-email enrollment errors, employer-resolution failures, and administrator recovery actions. Logs and administrator alerts must never include resume bytes, target-role URLs, OTPs, payment details, authentication secrets, or other private user content. Alerts describe only the minimum safe routing and status metadata needed to diagnose a fault.

## Defect Response Protocol

1. Reproduce from browser, network, server, and storage evidence without exposing user data.
2. Identify whether the root belongs to the client, gateway, authentication, server contract, storage, database, payment provider, or UI state.
3. Repair the narrowest secure boundary; preserve server-side authorization and validation.
4. Add a regression at the lowest useful layer and an integration test when a boundary is crossed.
5. Run the quality gate again, visually verify affected mobile screens, and publish only after all checks pass.

## Current Automated Coverage Baseline

The project uses Vitest regressions for role ownership, exact-company routing, document access and binary signatures, gateway-safe resume upload fragments, payment lifecycle and idempotent fulfillment, private conversations, work-email verification, privacy workflows, notifications, mobile fixed-viewport shells, security headers, and administrator-only routes. New defects must extend—not bypass—this baseline.
