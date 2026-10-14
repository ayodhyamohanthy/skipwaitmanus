// Scheduled job "plan-credit-cycles": the safety net behind webhook-confirmed renewals.
//
// Renewals open a plan cycle in the webhook (applyChargebeeSubscriptionEvent).
// Nothing fires at the monthly boundaries inside a yearly term, at a dated
// carryover expiry, or when a cancelled plan's term runs out, so each hourly
// window finds the job-seeker wallets with such a step due and hands each to
// reconcileSeekerCredits. That function re-checks everything under the wallet
// row lock and keys every grant and expiry row (one plan grant per subscription
// cycle, one expiry per grant), so a concurrent read, a webhook in flight or a
// repeated window can never grant or expire twice. Leftovers wait for the next
// window; reads reconcile the caller's own wallet too.
import { and, asc, eq, gt, isNotNull, lte, ne } from "drizzle-orm";
import { planCreditGrants, tokenBalances } from "../drizzle/schema";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { seekerCycleDue } from "./creditCycles";
import { getDb, reconcileSeekerCredits } from "./db";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

export const PLAN_CREDIT_CYCLE_BATCH = 500;

export type PlanCreditCycleDeps = {
  listDue: (now: Date, limit: number) => Promise<number[]>;
  reconcile: (userId: number, now: Date) => Promise<{ changed: boolean }>;
};

/** Job-seeker wallets with a cycle step due: paid plans (yearly cycle, lapse), stale Free cycles holding credits, dated grants past expiry. */
export async function listWalletsDueForCreditCycle(now: Date, limit: number): Promise<number[]> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  // Paid wallets are few; page through all of them by id and keep the ones with a step due.
  const paid: Array<typeof tokenBalances.$inferSelect> = [];
  for (let afterId = 0; paid.length < limit;) {
    const page = await db.select().from(tokenBalances).where(and(eq(tokenBalances.role, "job_seeker"), ne(tokenBalances.plan, "free"), gt(tokenBalances.id, afterId))).orderBy(asc(tokenBalances.id)).limit(limit);
    paid.push(...page.filter(wallet => seekerCycleDue(wallet, now)));
    if (page.length < limit) break;
    afterId = page[page.length - 1].id;
  }
  const staleFree = await db.select({ userId: tokenBalances.userId }).from(tokenBalances).where(and(eq(tokenBalances.role, "job_seeker"), eq(tokenBalances.plan, "free"), ne(tokenBalances.monthlyCycleKey, currentMonthlyCycleKey(now)), gt(tokenBalances.monthlyCreditsRemaining, 0))).orderBy(asc(tokenBalances.id)).limit(limit);
  const expiredGrants = await db.select({ userId: planCreditGrants.userId }).from(planCreditGrants).where(and(eq(planCreditGrants.role, "job_seeker"), eq(planCreditGrants.status, "active"), isNotNull(planCreditGrants.expiresAt), lte(planCreditGrants.expiresAt, now))).orderBy(asc(planCreditGrants.expiresAt)).limit(limit);
  const due = new Set<number>([...paid.map(wallet => wallet.userId), ...staleFree.map(row => row.userId), ...expiredGrants.map(row => row.userId)]);
  return Array.from(due).slice(0, limit);
}

export function createPlanCreditCycleJob(deps: PlanCreditCycleDeps = { listDue: listWalletsDueForCreditCycle, reconcile: reconcileSeekerCredits }) {
  return async ({ nowMs }: JobRunContext): Promise<JobRunOutput> => {
    const now = new Date(nowMs);
    const output: JobRunOutput = { processed: 0, failed: 0 };
    for (const userId of await deps.listDue(now, PLAN_CREDIT_CYCLE_BATCH)) {
      try {
        if ((await deps.reconcile(userId, now)).changed) output.processed += 1;
      } catch (error) {
        output.failed += 1;
        if (output.firstError === undefined) output.firstError = error;
      }
    }
    return output;
  };
}
