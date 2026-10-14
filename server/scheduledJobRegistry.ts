// The scheduled jobs the Worker cron runs (contract: shared/scheduledJobs.ts).
// Each window runs at most once (server/scheduledJobRunner.ts); a job's window
// is a whole number of cron periods so every period lands in exactly one.
import { ASK_TTL_DAYS } from "../shared/referral";
import { createAskExpirySweep } from "./askExpirySweep";
import { createPlanCreditCycleJob } from "./planCreditCycleJob";
import type { ScheduledJobDefinition } from "./scheduledJobRunner";

const MINUTE = 60_000;

export const SCHEDULED_JOBS: readonly ScheduledJobDefinition[] = [
  {
    name: "ask-expiry-sweep",
    description: `Closes asks no verified employee claimed within ${ASK_TTL_DAYS} days and returns the seeker's credit`,
    windowMs: 60 * MINUTE,
    leaseMs: 5 * MINUTE,
    run: createAskExpirySweep(),
  },
  {
    name: "plan-credit-cycles",
    description: "Opens monthly plan-credit cycles inside yearly terms and expires carried-over and lapsed plan credits, idempotent per wallet per cycle",
    windowMs: 60 * MINUTE,
    leaseMs: 10 * MINUTE,
    run: createPlanCreditCycleJob(),
  },
];
