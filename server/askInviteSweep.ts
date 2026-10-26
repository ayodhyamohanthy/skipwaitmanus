import { and, asc, eq, inArray, isNull, isNotNull, lte, ne, or } from "drizzle-orm";
import { askInviteLinks, notifications, operationalActivityLogs, referralRequests } from "../drizzle/schema";
import { getDb } from "./db";
import type { LedgerTx } from "./creditLedger";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

export const ASK_INVITE_SWEEP_BATCH = 200;

export type AskInviteSweepCandidate = { id: number; referralRequestId: number; createdAt: Date };
type AskInviteSweepDeps = {
  listDue: (nowMs: number, limit: number) => Promise<AskInviteSweepCandidate[]>;
  expireOne: (candidate: AskInviteSweepCandidate, nowMs: number) => Promise<{ changed: boolean }>;
};

const validDateMs = (value: Date | string | null | undefined): number | undefined => {
  if (value == null) return undefined;
  const milliseconds = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
};

/** Oldest links first, including asks closed after the candidate list was read. */
export async function listDueAskInviteLinks(nowMs: number, limit: number): Promise<AskInviteSweepCandidate[]> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  const now = new Date(nowMs);
  const askNoLongerWaiting = or(
    ne(referralRequests.status, "pending"),
    eq(referralRequests.waitingForCoverage, false),
    isNotNull(referralRequests.referrerId),
  );
  const claimedAskClosedForOther = and(
    askNoLongerWaiting,
    or(isNull(referralRequests.referrerId), isNull(askInviteLinks.claimedByUserId), ne(referralRequests.referrerId, askInviteLinks.claimedByUserId)),
  );
  const due = or(
    and(eq(askInviteLinks.status, "active"), lte(askInviteLinks.expiresAt, now)),
    and(eq(askInviteLinks.status, "claimed"), lte(askInviteLinks.reservationExpiresAt, now)),
    and(eq(askInviteLinks.status, "active"), askNoLongerWaiting),
    and(eq(askInviteLinks.status, "claimed"), claimedAskClosedForOther),
  );
  return db.select({ id: askInviteLinks.id, referralRequestId: askInviteLinks.referralRequestId, createdAt: askInviteLinks.createdAt })
    .from(askInviteLinks)
    .innerJoin(referralRequests, eq(referralRequests.id, askInviteLinks.referralRequestId))
    .where(and(inArray(askInviteLinks.status, ["active", "claimed"]), due))
    .orderBy(asc(askInviteLinks.createdAt), asc(askInviteLinks.id))
    .limit(Math.max(0, Math.min(ASK_INVITE_SWEEP_BATCH, Math.floor(limit))));
}

async function writeInviteNotice(tx: LedgerTx, userId: number | null, requestId: number, linkId: number, suffix: string, title: string, body: string): Promise<void> {
  if (userId === null) return;
  const eventKey = `ask-invite:${linkId}:${suffix}`;
  await tx.insert(notifications).values({ userId, category: "status", kind: "ask_invite_expired", title, body, eventKey, refId: requestId })
    .onDuplicateKeyUpdate({ set: { eventKey } });
}

/** Re-checks and closes one due link under ask → link locks; all notices and the audit row commit with it. */
export async function expireAskInviteLink(candidate: AskInviteSweepCandidate, nowMs: number): Promise<{ changed: boolean }> {
  const db = await getDb();
  if (!db) throw new JobRunStoreUnavailableError();
  const closedAt = new Date(nowMs);
  return db.transaction(async tx => {
    const [ask] = await tx.select({ id: referralRequests.id, jobSeekerId: referralRequests.jobSeekerId, status: referralRequests.status, waitingForCoverage: referralRequests.waitingForCoverage, referrerId: referralRequests.referrerId })
      .from(referralRequests).where(eq(referralRequests.id, candidate.referralRequestId)).limit(1).for("update");
    if (!ask) return { changed: false };
    const [link] = await tx.select({ id: askInviteLinks.id, referralRequestId: askInviteLinks.referralRequestId, status: askInviteLinks.status, claimedByUserId: askInviteLinks.claimedByUserId, activeRequestKey: askInviteLinks.activeRequestKey, expiresAt: askInviteLinks.expiresAt, reservationExpiresAt: askInviteLinks.reservationExpiresAt })
      .from(askInviteLinks).where(and(eq(askInviteLinks.id, candidate.id), eq(askInviteLinks.referralRequestId, ask.id))).limit(1).for("update");
    if (!link || (link.status !== "active" && link.status !== "claimed")) return { changed: false };

    const waiting = ask.status === "pending" && ask.waitingForCoverage && ask.referrerId === null;
    // A delivered claim belongs to its insider and remains one-time after pass/acceptance.
    const deliveredToClaimer = link.status === "claimed" && link.claimedByUserId !== null && !ask.waitingForCoverage && ask.referrerId === link.claimedByUserId;
    if (deliveredToClaimer) return { changed: false };

    const ttlExpired = link.status === "active" && (validDateMs(link.expiresAt) ?? 0) <= nowMs;
    const reservationExpired = link.status === "claimed" && link.reservationExpiresAt !== null && (validDateMs(link.reservationExpiresAt) ?? Number.POSITIVE_INFINITY) <= nowMs;
    const askClosed = !waiting;
    if (!askClosed && !ttlExpired && !reservationExpired) return { changed: false };
    const reason = askClosed ? "ask_closed" : reservationExpired ? "reservation_expired" : "link_expired";
    const updated = await tx.update(askInviteLinks).set({ status: "expired", activeRequestKey: null, reservationExpiresAt: null, closedAt })
      .where(and(eq(askInviteLinks.id, link.id), inArray(askInviteLinks.status, ["active", "claimed"])));
    if (Number(updated[0]?.affectedRows ?? 0) !== 1) return { changed: false };

    if (reason === "link_expired") {
      await writeInviteNotice(tx, ask.jobSeekerId, ask.id, link.id, "link-expired", "Your invite link expired", "The one-time link for your ask expired. Your ask is still waiting for a verified employee.");
    } else if (reason === "reservation_expired") {
      await writeInviteNotice(tx, ask.jobSeekerId, ask.id, link.id, "reservation-expired:seeker", "Your ask is back in the queue", "The employee could not take your ask in time. It is back in the company's waiting queue.");
      await writeInviteNotice(tx, link.claimedByUserId, ask.id, link.id, "reservation-expired:claimer", "Your invite reservation lapsed", "The ask is back in the company's waiting queue, so this link can no longer be used.");
    } else if (link.status === "claimed") {
      await writeInviteNotice(tx, link.claimedByUserId, ask.id, link.id, "ask-closed:claimer", "Your reserved ask is no longer available", "The ask closed before this reservation was completed, so the invite can no longer be used.");
    }

    await tx.insert(operationalActivityLogs).values({ actorUserId: null, action: "ask_invite.expired", outcome: "success", resourceType: "ask_invite", resourceId: String(link.id), metadata: JSON.stringify({ requestId: ask.id, linkId: link.id, outcome: reason }) });
    return { changed: true };
  });
}

export function createAskInviteSweep(deps: AskInviteSweepDeps = { listDue: listDueAskInviteLinks, expireOne: expireAskInviteLink }) {
  return async ({ nowMs }: JobRunContext): Promise<JobRunOutput> => {
    if (process.env.BYOR_LINK_ENABLED !== "true") return { processed: 0, failed: 0 };
    const candidates = (await deps.listDue(nowMs, ASK_INVITE_SWEEP_BATCH)).slice(0, ASK_INVITE_SWEEP_BATCH).sort((a, b) => (validDateMs(a.createdAt) ?? 0) - (validDateMs(b.createdAt) ?? 0) || a.id - b.id);
    const output: JobRunOutput = { processed: 0, failed: 0 };
    for (const candidate of candidates) {
      try {
        if ((await deps.expireOne(candidate, nowMs)).changed) output.processed += 1;
      } catch (error) {
        output.failed += 1;
        if (output.firstError === undefined) output.firstError = error;
      }
    }
    return output;
  };
}
