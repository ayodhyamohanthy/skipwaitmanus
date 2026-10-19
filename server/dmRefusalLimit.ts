// Per-sender limit on refused direct-message sends (D-012 item 3).
//
// A refused POST /api/dms/threads/:userId answers 403 with the reason
// referrer_acceptance_required when a verified referrer is involved, and 403
// with the reason mutual_follow_required when the member rules refuse it (no
// plan opens a member thread, D-067). Without a thread, which reason comes
// back tells the sender whether the recipient has a verified work email (that
// is what makes a verified referrer, including a job seeker who is employed;
// AGENTS.md "Product and identity constraints"). So once a sender has
// DM_REFUSAL_LIMIT_PER_HOUR refusals in the last hour, every further refusal
// is the same neutral 429, whatever the recipient. Sends that go through are
// never limited here (the send quota in sendDirectMessage covers those).
//
// The count reads the "dm.sent" denied rows that server/dmRoutes.ts already
// writes for every refusal. The window is computed by the database against
// the database's own createdAt clock (never JS time against DB time).
import { and, count, eq, gt, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { operationalActivityLogs } from "../drizzle/schema";

export const DM_SEND_ACTION = "dm.sent";
export const DM_REFUSAL_LIMIT_PER_HOUR = 10;
export const DM_REFUSAL_WINDOW_MS = 3_600_000;
export const DM_REFUSAL_LIMITED_REASON = "refusal_limited";
/** The client appends "Try again after <time>." from retryAt. */
export const DM_REFUSAL_LIMIT_ERROR = "Too many of your messages could not be sent in the last hour.";

export function isDmRefusalLimited(refusalsInWindow: number): boolean {
  return refusalsInWindow >= DM_REFUSAL_LIMIT_PER_HOUR;
}

export type DmRefusalDb = Pick<MySql2Database<Record<string, never>>, "select">;

/** Unexecuted, so server/dmRefusalLimit.test.ts can pin its SQL. */
export function dmRefusalCountQuery(db: DmRefusalDb, senderUserId: number) {
  return db.select({ refusals: count() }).from(operationalActivityLogs).where(and(
    eq(operationalActivityLogs.actorUserId, senderUserId),
    eq(operationalActivityLogs.action, DM_SEND_ACTION),
    eq(operationalActivityLogs.outcome, "denied"),
    gt(operationalActivityLogs.createdAt, sql`(NOW() - INTERVAL 1 HOUR)`),
  ));
}

export async function countRecentDmRefusals(db: DmRefusalDb, senderUserId: number): Promise<number> {
  const rows = await dmRefusalCountQuery(db, senderUserId);
  return Number(rows[0]?.refusals ?? 0);
}
