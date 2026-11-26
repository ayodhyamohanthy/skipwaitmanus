// REL-review-email-retry: durable owner notices independent of the user-email cap.
import { and, asc, eq, gte, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { referralReviewDeliveries } from "../drizzle/schema";
import { getDb } from "./db";
import { JobRunStoreUnavailableError } from "./jobRunStore";

export const REVIEW_DELIVERY_ALERT_LEASE_MS = 5 * 60_000;
const BATCH = 50;
type AlertSender = (input: { subject: string; text: string }) => Promise<{ sent: boolean }>;

async function database() {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  return db;
}

/** A fifth attempt abandoned mid-send is unknown, never a reason for send six. */
async function recoverFinalLeases(now: Date) {
  const db = await database();
  const expired = and(eq(referralReviewDeliveries.channel, "email"), eq(referralReviewDeliveries.status, "leased"),
    gte(referralReviewDeliveries.attemptCount, 5), lt(referralReviewDeliveries.leaseExpiresAt, now), isNull(referralReviewDeliveries.ownerAlertStatus));
  const rows = await db.select({ id: referralReviewDeliveries.id, leaseOwner: referralReviewDeliveries.leaseOwner })
    .from(referralReviewDeliveries).where(expired).orderBy(asc(referralReviewDeliveries.id)).limit(BATCH);
  for (const row of rows) {
    await db.update(referralReviewDeliveries).set({ status: "unknown", lastError: "final_send_outcome_unknown", nextAttemptAt: null,
      leaseOwner: null, leaseExpiresAt: null, ownerAlertStatus: "pending" }).where(and(eq(referralReviewDeliveries.id, row.id), expired,
      row.leaseOwner === null ? isNull(referralReviewDeliveries.leaseOwner) : eq(referralReviewDeliveries.leaseOwner, row.leaseOwner)));
  }
}

const dueAlert = (now: Date) => and(eq(referralReviewDeliveries.channel, "email"), gte(referralReviewDeliveries.attemptCount, 5),
  inArray(referralReviewDeliveries.status, ["failed", "unknown"]), or(eq(referralReviewDeliveries.ownerAlertStatus, "pending"),
    and(eq(referralReviewDeliveries.ownerAlertStatus, "leased"), lte(referralReviewDeliveries.ownerAlertLeaseExpiresAt, now))));

/** Batches owed alerts; a refused or unacknowledged provider send always stays recoverable. */
export async function deliverReviewOwnerAlerts(now: Date, send: AlertSender, fail: (error: Error) => void): Promise<void> {
  await recoverFinalLeases(now);
  const db = await database();
  const rows = await db.select({ id: referralReviewDeliveries.id, requestId: referralReviewDeliveries.referralRequestId, status: referralReviewDeliveries.status })
    .from(referralReviewDeliveries).where(dueAlert(now)).orderBy(asc(referralReviewDeliveries.id)).limit(BATCH);
  const leaseOwner = `owner-alert:${randomUUID()}`;
  const claimed: typeof rows = [];
  for (const row of rows) {
    const result = await db.update(referralReviewDeliveries).set({ ownerAlertStatus: "leased", ownerAlertLeaseOwner: leaseOwner,
      ownerAlertLeaseExpiresAt: new Date(now.getTime() + REVIEW_DELIVERY_ALERT_LEASE_MS) })
      .where(and(eq(referralReviewDeliveries.id, row.id), dueAlert(now)));
    if (Number(result[0]?.affectedRows ?? 0) === 1) claimed.push(row);
  }
  if (!claimed.length) return;
  let sent = false;
  try {
    const result = await send({ subject: "Referrer review email gave up after 5 attempts", text: claimed.map(row =>
      `The review email for referral request ${row.requestId} (channel: email) exhausted its 5-attempt budget. ${row.status === "unknown" ? "The last send outcome is unknown." : "The provider did not confirm delivery."} No further user email will be sent for this delivery.`).join("\n") });
    sent = result.sent;
    if (!sent) fail(new Error("Review delivery owner alert was not delivered; retry remains pending"));
  } catch {
    fail(new Error("Review delivery owner alert transport failed; retry remains pending"));
  }
  for (const row of claimed) {
    try {
      const result = await db.update(referralReviewDeliveries).set({ ownerAlertStatus: sent ? "sent" : "pending", ownerAlertLeaseOwner: null,
        ownerAlertLeaseExpiresAt: null, ownerAlertSentAt: sent ? now : null })
        .where(and(eq(referralReviewDeliveries.id, row.id), eq(referralReviewDeliveries.ownerAlertStatus, "leased"), eq(referralReviewDeliveries.ownerAlertLeaseOwner, leaseOwner)));
      if (Number(result[0]?.affectedRows ?? 0) !== 1) fail(new Error("Review delivery owner alert lost its acknowledgement lease"));
    } catch { fail(new Error("Review delivery owner alert acknowledgement failed; its lease will retry")); }
  }
}
