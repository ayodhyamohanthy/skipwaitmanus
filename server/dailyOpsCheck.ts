import { and, asc, count, eq, gt, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { jobRuns, operationalActivityLogs, referralRequests, referralReviewDeliveries } from "../drizzle/schema";
import { JOB_RUN_MAX_ATTEMPTS } from "../shared/scheduledJobs";
import { getDb } from "./db";
import { sendTransactionalEmail } from "./emailDelivery";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

const DAY_MS = 24 * 60 * 60_000;
const REVIEW_EMAIL_STUCK_MS = 2 * 60 * 60_000;
const REQUEST_DROUGHT_AVERAGE = 3;
const UNUSED_CODE_THRESHOLD = 5;
const FINDINGS_ID_LIMIT = 50;
const PURGE_BATCH = 200;
const OWNER_EMAIL = "ayodhya@skipwait.me";
const OWNER_COPY_EMAIL = "ayodhya@mail.instinct.com";
const ALL_CLEAR_EMAIL = { subject: "skipwait.me daily ops check · all clear", text: "All clear: no ops invariants failed." };

const purgeMetadataSchema = z.strictObject({ consumed: z.number().int().nonnegative(), expiredUnused: z.number().int().nonnegative() });
const databaseNowSchema = z.tuple([z.array(z.object({ now: z.coerce.date() })).length(1), z.array(z.unknown())]);
type FindingSample = { count: number; rowIds: string[] };
type PurgeCounts = { consumed: number; expiredUnused: number; logIds: number[] };

export type DailyOpsCheckDeps = {
  reviewEmails: (now: Date) => Promise<FindingSample>;
  requests: () => Promise<{ last24Hours: number; last7Days: number }>;
  exhaustedJobs: (now: Date) => Promise<FindingSample>;
  purgeCounts: (since: Date, now: Date) => Promise<PurgeCounts>;
  sendEmail: (input: { subject: string; text: string }) => Promise<boolean>;
};

async function requireDb() {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  return db;
}

async function readReviewEmails(now: Date): Promise<FindingSample> {
  const db = await requireDb();
  const where = and(
    eq(referralReviewDeliveries.channel, "email"),
    inArray(referralReviewDeliveries.status, ["failed", "unknown"]),
    or(gte(referralReviewDeliveries.attemptCount, 5), lt(referralReviewDeliveries.nextAttemptAt, new Date(now.getTime() - REVIEW_EMAIL_STUCK_MS))),
  );
  const [total] = await db.select({ count: count() }).from(referralReviewDeliveries).where(where);
  const rows = await db.select({ id: referralReviewDeliveries.id }).from(referralReviewDeliveries).where(where).orderBy(asc(referralReviewDeliveries.id)).limit(FINDINGS_ID_LIMIT);
  return { count: Number(total?.count ?? 0), rowIds: rows.map(row => `#${row.id}`) };
}

async function readRequests(): Promise<{ last24Hours: number; last7Days: number }> {
  const db = await requireDb();
  let databaseNow: Date;
  try {
    databaseNow = databaseNowSchema.parse(await db.execute(sql`SELECT NOW() AS now`))[0][0].now;
  } catch {
    throw new Error("The database clock could not be read");
  }
  const dayAgo = new Date(databaseNow.getTime() - DAY_MS);
  const weekAgo = new Date(databaseNow.getTime() - 7 * DAY_MS);
  const [last24Hours] = await db.select({ count: count() }).from(referralRequests).where(and(gte(referralRequests.createdAt, dayAgo), lte(referralRequests.createdAt, databaseNow)));
  const [last7Days] = await db.select({ count: count() }).from(referralRequests).where(and(gte(referralRequests.createdAt, weekAgo), lte(referralRequests.createdAt, databaseNow)));
  return { last24Hours: Number(last24Hours?.count ?? 0), last7Days: Number(last7Days?.count ?? 0) };
}

async function readExhaustedJobs(now: Date): Promise<FindingSample> {
  const db = await requireDb();
  const where = and(eq(jobRuns.status, "failed"), gte(jobRuns.attempt, JOB_RUN_MAX_ATTEMPTS), gte(jobRuns.finishedAt, new Date(now.getTime() - DAY_MS)), lte(jobRuns.finishedAt, now));
  const [total] = await db.select({ count: count() }).from(jobRuns).where(where);
  const rows = await db.select({ id: jobRuns.id }).from(jobRuns).where(where).orderBy(asc(jobRuns.id)).limit(FINDINGS_ID_LIMIT);
  return { count: Number(total?.count ?? 0), rowIds: rows.map(row => `#${row.id}`) };
}

async function readPurgeCounts(since: Date, now: Date): Promise<PurgeCounts> {
  const db = await requireDb();
  const byRun = new Map<string, { logId: number; consumed: number; expiredUnused: number }>();
  let afterId = 0;
  for (;;) {
    const rows = await db.select({ id: operationalActivityLogs.id, resourceId: operationalActivityLogs.resourceId, metadata: operationalActivityLogs.metadata })
      .from(operationalActivityLogs)
      .where(and(eq(operationalActivityLogs.action, "work_email_otp.purged"), eq(operationalActivityLogs.outcome, "success"), gt(operationalActivityLogs.id, afterId), gte(operationalActivityLogs.resourceId, since.toISOString()), lte(operationalActivityLogs.resourceId, now.toISOString())))
      .orderBy(asc(operationalActivityLogs.id)).limit(PURGE_BATCH);
    for (const row of rows) {
      let parsed: ReturnType<typeof purgeMetadataSchema.safeParse>;
      try { parsed = purgeMetadataSchema.safeParse(row.metadata ? JSON.parse(row.metadata) : null); } catch { throw new Error(`Invalid work-email purge counts in activity log #${row.id}`); }
      if (!parsed.success) throw new Error(`Invalid work-email purge counts in activity log #${row.id}`);
      const key = row.resourceId ? `run:${row.resourceId}` : `log:${row.id}`;
      if (!byRun.has(key)) byRun.set(key, { logId: row.id, ...parsed.data });
    }
    if (rows.length < PURGE_BATCH) break;
    afterId = rows[rows.length - 1].id;
  }
  const totals = Array.from(byRun.values());
  return {
    consumed: totals.reduce((sum, row) => sum + row.consumed, 0),
    expiredUnused: totals.reduce((sum, row) => sum + row.expiredUnused, 0),
    logIds: totals.slice(0, FINDINGS_ID_LIMIT).map(row => row.logId),
  };
}

async function sendOpsEmail(input: { subject: string; text: string }): Promise<boolean> {
  try {
    const delivery = await sendTransactionalEmail({ to: OWNER_EMAIL, ...input });
    try { await sendTransactionalEmail({ to: OWNER_COPY_EMAIL, ...input }); } catch { /* the owner copy is best effort */ }
    return delivery.sent;
  } catch {
    return false;
  }
}

const defaultDeps: DailyOpsCheckDeps = {
  reviewEmails: readReviewEmails,
  requests: readRequests,
  exhaustedJobs: readExhaustedJobs,
  purgeCounts: readPurgeCounts,
  sendEmail: sendOpsEmail,
};

export function createDailyOpsCheck(overrides: Partial<DailyOpsCheckDeps> = {}) {
  const deps = { ...defaultDeps, ...overrides };
  return async ({ nowMs }: JobRunContext): Promise<JobRunOutput> => {
    const now = new Date(nowMs);
    const since = new Date(nowMs - DAY_MS);
    const [reviewEmails, requests, exhaustedJobs, purgeCounts] = await Promise.all([
      deps.reviewEmails(now), deps.requests(), deps.exhaustedJobs(now), deps.purgeCounts(since, now),
    ]);
    const findings: string[] = [];
    if (reviewEmails.count > 0) findings.push(`review_email_stuck ${JSON.stringify({ count: reviewEmails.count, rowIds: reviewEmails.rowIds })}`);
    if (requests.last24Hours === 0 && requests.last7Days / 7 >= REQUEST_DROUGHT_AVERAGE) {
      findings.push(`request_drought ${JSON.stringify({ last24Hours: requests.last24Hours, last7Days: requests.last7Days, dailyAverage: requests.last7Days / 7 })}`);
    }
    if (exhaustedJobs.count > 0) findings.push(`job_exhausted ${JSON.stringify({ count: exhaustedJobs.count, rowIds: exhaustedJobs.rowIds })}`);
    if (purgeCounts.expiredUnused >= UNUSED_CODE_THRESHOLD && purgeCounts.consumed === 0) {
      findings.push(`work_email_codes_unused ${JSON.stringify({ expiredUnused: purgeCounts.expiredUnused, consumed: purgeCounts.consumed, logIds: purgeCounts.logIds })}`);
    }

    const email = findings.length > 0
      ? { subject: `skipwait.me daily ops check · ${findings.length} finding${findings.length === 1 ? "" : "s"}`, text: findings.join("\n") }
      : now.getUTCDay() === 1 ? ALL_CLEAR_EMAIL : null;
    if (!email) return { processed: 4, failed: 0 };
    try {
      if (await deps.sendEmail(email)) return { processed: 4, failed: 0 };
    } catch (error) {
      return { processed: 4, failed: 1, firstError: error };
    }
    return { processed: 4, failed: 1, firstError: new Error("The daily ops check owner email could not be sent") };
  };
}
