# REVIEWER-ISOLATION-1: demo review accounts are refused on effectful routes

Tier 1 (identity, money surfaces). Lane: queue. Branch: agent/queue/reviewer-isolation-oct25. PR #678, head fa8cca10 (code complete, in review).

## Why (binding)

Razorpay / app-store review sign-ins previously got ordinary sessions: the demo
seeker could create a real hosted checkout cart, notify real employees (ask
creation), message members, post opportunities, claim real asks, and - with the
opt-in demo admin - touch admin surfaces. The "no real data" comment on the
login route was never isolation. This task makes the review environment
least-privilege before any reviewer credential handover (Razorpay handover is
the recorded blocker, Oct 25).

## What is built (PR #678)

1. **Route layer.** A guard keyed on the server-provisioned `reviewer_` openId
   prefix (`isReviewerOpenId` / `refuseReviewerExternalAction` in
   `server/_core/reviewerLogin.ts`). openIds with that prefix are minted only
   by the reviewer-login provision path and carried in the signed session
   token - not user input, no extra identity store. Guarded routes answer 403:
   "Demo review accounts can browse the product but cannot take actions that
   reach real members." About 50 route sites across 14 files: ask lifecycle,
   share cards, DMs, follows, blocks, opportunity post/renew/close, all
   employer mutations (GETs stay open), company-claim send/confirm, work-email
   OTP send + verify, referrer Slack webhooks, personal-invite claims,
   availability, safety reports/suggestions + admin decisions, assistant
   connections/tokens/approvals/developer-apps, privacy erasure, all admin
   surfaces.
2. **Entitlement layer.** A reviewer payment is parked as requires_review and
   the owner is alerted; a subscription event resolving to a `reviewer_` user
   records the event, grants nothing, and alerts the owner to cancel/refund in
   Chargebee.
3. **Checkout layer.** Reviewer checkouts resolve to the Chargebee TEST site
   (`CHARGEBEE_TEST_SITE` / `CHARGEBEE_TEST_API_KEY`), failing closed when the
   vars are unset; test-site events cannot authenticate on the live site.

Deliberately open: browsing, pricing preview, hosted cart creation (merchant
review needs the billing path to exist; an unpaid abandoned cart reaches no
one).

## Honest edges (bounded limitations - do not claim isolation-complete)

1. A real charge entered on the hosted page is prevented from granting
   anything and alerted for refund, but the provider-side charge itself can
   only be avoided by the reviewer not entering real card details - the
   handover instructions must say so.
2. Reads are scoped by account.id; whether the demo accounts carry
   pre-existing bindings to real data from earlier testing is unverified (no
   read-only DB access exists).
3. forgot-password, OAuth and MCP endpoints are anonymous/token surfaces, not
   reviewer-specific; no demo tokens can be created since developer-apps is
   guarded.

## Verified at build time

server/_core/reviewerIsolation.test.ts (3), server/reviewerIsolationRoutes.test.ts
(32: 31 effectful routes assert flat 403 before any dep runs; a real member
falls through), server/dmRoutes.test.ts (reviewer send -> 403, nothing sent),
tsc --noEmit clean, full suite 8 shards green (4,610 tests).

## Remaining (the row stays open until these land)

1. Independent Tier 1 review (non-builder model, D-151) and merge of #678.
2. Deploy, then set CHARGEBEE_TEST_SITE and CHARGEBEE_TEST_API_KEY (wrangler
   secrets; vault: "Chargebee skipwait-test site API key (TEST site only)").
3. Run scripts/reviewer-binding-check.mjs; live no-send proof.
4. Only then: reviewer credential handover for the Razorpay resubmission
   (stays draft for owner approval; never automatic).

## Owns

The 24 files listed on the registry row (server/_core/reviewerLogin.ts,
server/_core/reviewerIsolation.test.ts, server/reviewerIsolationRoutes.test.ts,
shared/reviewerAccounts.ts, scripts/reviewer-binding-check.mjs, and the guarded
route + test files named there).
