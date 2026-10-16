// The scheduled jobs the Worker cron runs (contract: shared/scheduledJobs.ts).
// Each window runs at most once (server/scheduledJobRunner.ts); a job's window
// is a whole number of cron periods so every period lands in exactly one.
import { ASK_TTL_DAYS } from "../shared/referral";
import { createAskExpirySweep } from "./askExpirySweep";
import { createFirstLookRelease } from "./firstLookRelease";
import { createPlanCreditCycleJob } from "./planCreditCycleJob";
import { createChargebeePendingReconcile } from "./chargebeePendingReconcile";
import { createDataExportSweep } from "./dataExport";
import { createWorkEmailReverifySweep } from "./workEmailReverifySweep";
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
];
