// Drizzle reads and writes for server/premiumDmChangeNotice.ts. Plain queries
// only; the notice module makes every decision.
import { and, asc, eq, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { giftSubscriptionFulfillments, notifications, operationalActivityLogs, tokenBalances, users } from "../drizzle/schema";
import { NOTICE_EMAIL_ACTION, type EmailOutcome, type NoticeGiftRow, type NoticeStore } from "./premiumDmChangeNotice";

export type NoticeDb = Pick<MySql2Database<Record<string, never>>, "select" | "insert">;

const CHUNK = 500;
function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "ER_DUP_ENTRY") return true;
  return "cause" in error && isDuplicateKeyError(error.cause);
}

export function drizzleNoticeStore(db: NoticeDb): NoticeStore {
  return {
    listPaidWallets: () => db.select({
      userId: tokenBalances.userId,
      canonicalPersonId: users.canonicalPersonId,
      email: users.email,
      plan: tokenBalances.plan,
      subscriptionStatus: tokenBalances.subscriptionStatus,
      subscriptionCurrentTermEnd: tokenBalances.subscriptionCurrentTermEnd,
      subscriptionId: tokenBalances.subscriptionId,
    }).from(tokenBalances).innerJoin(users, eq(users.id, tokenBalances.userId)).where(inArray(tokenBalances.plan, ["pro", "max"])),

    // Any gift purchase that produced the subscription marks it as bought by
    // the gift's buyer, whatever the fulfillment status says now.
    async giftsForSubscriptions(subscriptionIds) {
      const found: NoticeGiftRow[] = [];
      for (const batch of chunks(subscriptionIds)) {
        const rows = await db.select({ subscriptionId: giftSubscriptionFulfillments.subscriptionId, buyerUserId: giftSubscriptionFulfillments.buyerUserId, buyerCanonicalPersonId: users.canonicalPersonId })
          .from(giftSubscriptionFulfillments).leftJoin(users, eq(users.id, giftSubscriptionFulfillments.buyerUserId))
          .where(inArray(giftSubscriptionFulfillments.subscriptionId, batch));
        for (const row of rows) if (row.subscriptionId !== null) found.push({ subscriptionId: row.subscriptionId, buyerUserId: row.buyerUserId, buyerCanonicalPersonId: row.buyerCanonicalPersonId });
      }
      return found;
    },

    async existingNotificationKeys(eventKeys) {
      const found = new Set<string>();
      for (const batch of chunks(eventKeys)) {
        const rows = await db.select({ eventKey: notifications.eventKey }).from(notifications).where(inArray(notifications.eventKey, batch));
        for (const row of rows) if (row.eventKey !== null) found.add(row.eventKey);
      }
      return found;
    },

    async insertNotificationOnce(input) {
      try {
        await db.insert(notifications).values({ userId: input.userId, category: "system", title: input.title, body: input.body, eventKey: input.eventKey });
        return "created";
      } catch (error) {
        if (isDuplicateKeyError(error)) return "exists";
        throw error;
      }
    },

    async emailOutcomes(eventKeys) {
      const latest = new Map<string, EmailOutcome>();
      for (const batch of chunks(eventKeys)) {
        const rows = await db.select({ resourceId: operationalActivityLogs.resourceId, outcome: operationalActivityLogs.outcome }).from(operationalActivityLogs)
          .where(and(eq(operationalActivityLogs.action, NOTICE_EMAIL_ACTION), inArray(operationalActivityLogs.resourceId, batch)))
          .orderBy(asc(operationalActivityLogs.id));
        for (const row of rows) if (row.resourceId !== null && (row.outcome === "success" || row.outcome === "failure")) latest.set(row.resourceId, row.outcome);
      }
      return latest;
    },

    async recordEmailOutcome(input) {
      await db.insert(operationalActivityLogs).values({ actorUserId: null, action: NOTICE_EMAIL_ACTION, outcome: input.outcome, resourceType: "notification_event", resourceId: input.eventKey, metadata: JSON.stringify({ reason: input.reason }) });
    },
  };
}
