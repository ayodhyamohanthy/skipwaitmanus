import { and, asc, eq, gte } from "drizzle-orm";
import { assistantApprovals, notifications, users } from "../drizzle/schema";
import { getDb } from "./db";
import { sendTransactionalEmail } from "./emailDelivery";
import { configuredPublicOrigin } from "./_core/authPostGuard";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_USERS_PER_RUN = 100;

export type AgentAutoSendDigestDeps = {
  getDb?: typeof getDb;
  sendEmail?: (input: { to: string; subject: string; text: string }) => Promise<{ sent: boolean }>;
  now?: () => number;
};

export function createAgentAutoSendDigest(deps: AgentAutoSendDigestDeps = {}) {
  const getDbImpl = deps.getDb ?? getDb;
  const sendEmailImpl = deps.sendEmail ?? (async input => sendTransactionalEmail(input));
  const nowFn = deps.now ?? (() => Date.now());

  return async (context: JobRunContext): Promise<JobRunOutput> => {
    const db = await getDbImpl();
    if (!db) return { processed: 0, failed: 0, skipped: "database unavailable" };

    const nowMs = context?.nowMs ?? nowFn();
    const since = new Date(nowMs - DAY_MS);
    const dateStr = new Date(nowMs).toISOString().slice(0, 10); // YYYY-MM-DD UTC

    // 1. Read assistantApprovals rows with decidedBy = 'agent_auto', status = 'approved' in past 24h
    const rows = await db
      .select({
        id: assistantApprovals.id,
        userId: assistantApprovals.userId,
        companyDomain: assistantApprovals.companyDomain,
        decidedAt: assistantApprovals.decidedAt,
      })
      .from(assistantApprovals)
      .where(
        and(
          eq(assistantApprovals.decidedBy, "agent_auto"),
          eq(assistantApprovals.status, "approved"),
          gte(assistantApprovals.decidedAt, since),
        ),
      )
      .orderBy(asc(assistantApprovals.decidedAt));

    if (!rows.length) {
      return { processed: 0, failed: 0 };
    }

    // 2. Group by userId, maintaining oldest-first order by earliest decidedAt
    const userGroups = new Map<number, Array<typeof rows[number]>>();
    for (const row of rows) {
      const existing = userGroups.get(row.userId);
      if (existing) {
        existing.push(row);
      } else {
        userGroups.set(row.userId, [row]);
      }
    }

    let processed = 0;
    let failed = 0;
    let firstError: unknown;

    // Bounded to 100 users per run
    const usersToProcess = Array.from(userGroups.entries()).slice(0, MAX_USERS_PER_RUN);

    for (const [userId, approvals] of usersToProcess) {
      try {
        const eventKey = `agent-auto-digest:${userId}:${dateStr}`;
        const count = approvals.length;

        // Idempotency check with durable notifications key (D-060: one email per user per day)
        const inserted = await db
          .insert(notifications)
          .values({
            userId,
            category: "status",
            kind: "agent_auto_digest",
            title: "Daily summary of auto-sent referrals",
            body: `Your assistant sent ${count} referral ${count === 1 ? "request" : "requests"} today.`,
            eventKey,
          })
          .onDuplicateKeyUpdate({ set: { eventKey } });

        // In MySQL, affectedRows === 1 means a new row was inserted; 0 or 2 means duplicate key update
        const isNew = Number((inserted as unknown as [{ affectedRows?: number }])[0]?.affectedRows) === 1;
        if (!isNew) {
          // Already sent digest today for this user
          continue;
        }

        const [user] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        const email = user?.email?.trim();
        if (!email) {
          continue;
        }

        const distinctCompanies = Array.from(
          new Set(
            approvals
              .map(a => a.companyDomain?.trim())
              .filter((d): d is string => Boolean(d)),
          ),
        );

        const companyList = distinctCompanies.length > 0 ? distinctCompanies.join(", ") : "your target companies";

        const subject = "Your daily auto-sent referrals summary";
        // The configured origin (PUBLIC_BASE_URL / WORKOS_REDIRECT_URI), never a hardcoded production host,
        // so a TEST-site digest links to the site that sent it. Same helper the review-email retry uses.
        const agentsUrl = `${configuredPublicOrigin() ?? "https://skipwait.me"}/agents`;
        const text = [
          `Your assistant auto-sent ${count} referral ${count === 1 ? "request" : "requests"} in the past 24 hours for: ${companyList}.`,
          "",
          "You can review your agent activity or turn auto-send off at any time on your agents page:",
          agentsUrl,
          "",
          "To turn off auto-send, visit your agents page and disable auto-send for that grant.",
        ].join("\n");

        await sendEmailImpl({ to: email, subject, text });
        processed++;
      } catch (err) {
        failed++;
        if (!firstError) firstError = err;
      }
    }

    return { processed, failed, ...(firstError ? { firstError } : {}) };
  };
}
