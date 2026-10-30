import { runBillingReviewOutbox } from "./billingReviewOutbox";
import { createJobCatalogSync } from "./jobSources/sync";
// The scheduled jobs the Worker cron runs (contract: shared/scheduledJobs.ts).
// Each window runs at most once (server/scheduledJobRunner.ts); a job's window
// is a whole number of cron periods so every period lands in exactly one.
import { ASK_TTL_DAYS } from "../shared/referral";
import { createAskExpirySweep } from "./askExpirySweep";
import { createAskInviteSweep } from "./askInviteSweep";
import { createCoverageDeliverySweep } from "./coverageDeliverySweep";
import { createDailyMoneyCheck } from "./dailyMoneyCheck";
import { createFirstLookRelease } from "./firstLookRelease";
import { createPlanCreditCycleJob } from "./planCreditCycleJob";
import { createReferralTimers } from "./referralTimers";
import { createChargebeePendingReconcile, createSubscriptionPendingReconcile } from "./chargebeePendingReconcile";
import { createDataExportSweep } from "./dataExport";
import { createWorkEmailReverifySweep } from "./workEmailReverifySweep";
import { createWorkEmailOtpPurgeJob } from "./workEmailOtpPurge";
import type { ScheduledJobDefinition } from "./scheduledJobRunner";

const MINUTE = 60_000;

export const SCHEDULED_JOBS: readonly ScheduledJobDefinition[] = [
  {
    name: "ask-expiry-sweep",
    description: `Closes asks no verified employee claimed within ${ASK_TTL_DAYS} days, freeing the seeker's slot and returning any credit the ask reserved`,
    windowMs: 60 * MINUTE,
    leaseMs: 5 * MINUTE,
    run: createAskExpirySweep(),
  },
  {
    name: "ask-invite-expiry",
    description: "Expires BYOR links and reservations, releases waiting asks, and sends one-time notices",
    windowMs: 60 * MINUTE,
    leaseMs: 5 * MINUTE,
    run: createAskInviteSweep(),
  },
  {
    name: "first-look-release",
    description: "Opens asks written from a post to the rest of the company once the poster's 48-hour first look lapses without a decision",
    windowMs: 60 * MINUTE,
    leaseMs: 5 * MINUTE,
    run: createFirstLookRelease(),
  },
  {
    name: "plan-credit-cycles",
    description: "Opens monthly plan-credit cycles inside yearly terms and expires carried-over and lapsed plan credits, idempotent per wallet per cycle",
    windowMs: 60 * MINUTE,
    leaseMs: 10 * MINUTE,
    run: createPlanCreditCycleJob(),
  },
  {
    name: "chargebee-pending-reconcile",
    description: "Re-checks Chargebee checkouts still pending after 15 minutes and credits the paid ones the webhook missed; unmatched paid ones go to review with an alert",
    windowMs: 60 * MINUTE,
    leaseMs: 5 * MINUTE,
    run: createChargebeePendingReconcile(),
  },
  {
    // GO-LIVE-1b ruling 3: a paid pass always activates - the hourly safety net
    // under a missed webhook. Paid pending pass checkouts activate from their
    // provider checkout page; expired unpaid ones are marked cancelled.
    name: "chargebee-subscription-reconcile",
    description: "Re-checks pending pass checkouts older than 10 minutes (up to 3 days) and activates the paid ones the webhook missed; expired unpaid checkouts are marked cancelled",
    windowMs: 60 * MINUTE,
    leaseMs: 5 * MINUTE,
    run: createSubscriptionPendingReconcile(),
  },
  {
    name: "work-email-reverify-sweep",
    description: "DRY RUN: counts verified referrers past the 90-day work-email re-check (grandfathered to 16 Oct 2026 + 90 days); changes nothing",
    windowMs: 60 * MINUTE,
    leaseMs: 5 * MINUTE,
    run: createWorkEmailReverifySweep(),
  },
  {
    name: "data-export-sweep",
    description: "Builds requested personal-data export ZIPs (size-capped) and drops expired ones after 7 days",
    windowMs: 60 * MINUTE,
    leaseMs: 5 * MINUTE,
    run: createDataExportSweep(),
  },
  {
    name: "work-email-otp-purge",
    description: "Drops spent and expired work-email OTP codes, receipts and rate limits, and rewrites any legacy plaintext address to its one-way fingerprint",
    windowMs: 60 * MINUTE,
    leaseMs: 5 * MINUTE,
    run: createWorkEmailOtpPurgeJob(),
  },
  {
    name: "coverage-delivery-retry",
    description: "Offers waiting and held asks to their company's available referrers, oldest first: spends the credit at first visibility (D-034) and holds a creditless ask once (D-047)",
    windowMs: 60 * MINUTE,
    leaseMs: 5 * MINUTE,
    run: createCoverageDeliverySweep(),
  },
  {
    name: "referral-timers",
    description: "D-038: reminds a referrer 24 h before their 48-hour hold lapses and returns an unclaimed claim or allocation to colleagues; the Referred deadline steps run only when switched on",
    windowMs: 60 * MINUTE,
    leaseMs: 5 * MINUTE,
    run: createReferralTimers(),
  },
  {
    name: "daily-money-check",
    description: "Read-only daily audit: every wallet against the ledger, one purchase credit per credited payment, parked payments and refunds, stale checkouts; emails the owner any mismatch, never writes",
    windowMs: 24 * 60 * MINUTE,
    leaseMs: 15 * MINUTE,
    run: createDailyMoneyCheck(),
  },
  { name: "billing-review-retry", description: "Retries durable billing review notifications; expired ambiguous submissions need operator reconciliation", windowMs: 60 * MINUTE, leaseMs: 5 * MINUTE, run: () => runBillingReviewOutbox() },
  {
    // D-174-job-catalog (packet section 5.5): daily refresh of catalog rows
    // from verified boards. Does nothing while JOB_CATALOG_ENABLED is false.
    name: "job-catalog-sync",
    description: "Refreshes catalog jobs from verified company boards: upserts the full fetch, closes jobs missing from it, marks a failed source failing without touching jobs",
    windowMs: 24 * 60 * MINUTE,
    leaseMs: 15 * MINUTE,
    run: createJobCatalogSync(),
  },
];
