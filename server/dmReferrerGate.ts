// Direct-message referrer gate (owner decision D-012 item 3, privacy page promise:
// "Job Seekers and Referrers can message only after the Referrer accepts that
// specific request").
//
// When either party is a verified referrer, a direct message can be sent, in a
// new or an existing thread, only after a referral request links the two people
// and that request's referrer accepted it. No plan, follow or earlier thread
// opens it sooner. Two members who are not verified referrers keep the member
// rules in server/dmRoutes.ts and sendDirectMessage (thread, mutual follow, plan).
//
// Who counts as a verified referrer: a profile with a verified work email.
// Work-email verification enrolls the profile as accountType "referrer"; a
// referrer who later saves their profile as a job seeker (both seeker and
// referrer) keeps the verified work email and can still claim and review asks,
// so the verified work email, not the current accountType, is the test.
// Each party is the whole canonical person: every users row sharing its
// canonicalPersonId counts, so an alias row cannot sidestep the gate.
import { and, inArray, isNotNull, or } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { profiles, referralRequests, referralTransitionEvents, users } from "../drizzle/schema";
import { dmSendBlockFor, type DmSendBlock, type ReferrerDmGate } from "../shared/directMessages";
import { postApprovalReferralStatuses, type ReferralStatus } from "../shared/referral";

export type DmGateUserRow = { readonly id: number; readonly canonicalPersonId: number | null };
export type DmGateProfileRow = { readonly userId: number; readonly workEmailVerifiedAt: Date | null };
export type DmGateRequestRow = { readonly id: number; readonly jobSeekerId: number; readonly referrerId: number | null; readonly status: ReferralStatus };
export type DmGateEventRow = { readonly referralRequestId: number; readonly fromStatus: string; readonly resultingStatus: string };

/** Plain reads; every decision is made in the pure functions below. */
export type DmGateStore = {
  usersByIds(ids: readonly number[]): Promise<readonly DmGateUserRow[]>;
  usersByPersons(personIds: readonly number[]): Promise<readonly DmGateUserRow[]>;
  verifiedProfiles(userIds: readonly number[]): Promise<readonly DmGateProfileRow[]>;
  acceptedRequestsBetween(a: readonly number[], b: readonly number[]): Promise<readonly DmGateRequestRow[]>;
  /** Transition events of these requests that went into or out of an accepted status. */
  acceptanceEvents(requestIds: readonly number[]): Promise<readonly DmGateEventRow[]>;
};

/**
 * Statuses that only exist after the referrer accepted. "closed" also ends
 * unclaimed expired asks, so a closed request counts only with a recorded
 * transition into or out of one of these (an approve event, or a later step
 * such as offer -> closed when the approval predates migration 0058's events).
 */
const OPEN_AFTER_ACCEPTANCE: readonly ReferralStatus[] = ["approved", "intro_made", "interview", "offer"];
const ACCEPTED_STATUS_NAMES: ReadonlySet<string> = new Set(OPEN_AFTER_ACCEPTANCE);

export function isAcceptanceEvidence(event: DmGateEventRow): boolean {
  return ACCEPTED_STATUS_NAMES.has(event.resultingStatus) || ACCEPTED_STATUS_NAMES.has(event.fromStatus);
}

export function personUserIds(userId: number, own: readonly DmGateUserRow[], siblings: readonly DmGateUserRow[]): number[] {
  const personId = own.find(row => row.id === userId)?.canonicalPersonId ?? null;
  const ids = new Set<number>([userId]);
  if (personId !== null) for (const row of siblings) if (row.canonicalPersonId === personId) ids.add(row.id);
  return Array.from(ids).sort((x, y) => x - y);
}

export function hasVerifiedReferrerProfile(userIds: readonly number[], rows: readonly DmGateProfileRow[]): boolean {
  return rows.some(row => userIds.includes(row.userId) && row.workEmailVerifiedAt !== null);
}

/** True when one request links the two people and its referrer accepted it. */
export function hasAcceptedLink(a: readonly number[], b: readonly number[], requests: readonly DmGateRequestRow[], events: readonly DmGateEventRow[]): boolean {
  return requests.some(request => {
    if (request.referrerId === null) return false;
    const links = (a.includes(request.jobSeekerId) && b.includes(request.referrerId)) || (b.includes(request.jobSeekerId) && a.includes(request.referrerId));
    if (!links) return false;
    if (OPEN_AFTER_ACCEPTANCE.includes(request.status)) return true;
    return request.status === "closed" && events.some(event => event.referralRequestId === request.id && isAcceptanceEvidence(event));
  });
}

export function decideReferrerDmGate(facts: { readonly senderIsReferrer: boolean; readonly recipientIsReferrer: boolean; readonly accepted: boolean }): ReferrerDmGate {
  if (!facts.senderIsReferrer && !facts.recipientIsReferrer) return { kind: "not_referrer_pair" };
  if (facts.accepted) return { kind: "accepted" };
  return { kind: "acceptance_required", senderRole: facts.senderIsReferrer && !facts.recipientIsReferrer ? "referrer" : "member" };
}

export async function resolveReferrerDmGate(store: DmGateStore, senderUserId: number, recipientUserId: number): Promise<ReferrerDmGate> {
  const own = await store.usersByIds([senderUserId, recipientUserId]);
  const personIds = Array.from(new Set(own.flatMap(row => (row.canonicalPersonId === null ? [] : [row.canonicalPersonId]))));
  const siblings = personIds.length > 0 ? await store.usersByPersons(personIds) : [];
  const sender = personUserIds(senderUserId, own, siblings);
  const recipient = personUserIds(recipientUserId, own, siblings);
  const verified = await store.verifiedProfiles([...sender, ...recipient]);
  const senderIsReferrer = hasVerifiedReferrerProfile(sender, verified);
  const recipientIsReferrer = hasVerifiedReferrerProfile(recipient, verified);
  if (!senderIsReferrer && !recipientIsReferrer) return decideReferrerDmGate({ senderIsReferrer, recipientIsReferrer, accepted: false });
  const requests = await store.acceptedRequestsBetween(sender, recipient);
  const closedIds = requests.filter(request => request.status === "closed").map(request => request.id);
  const openAccepted = hasAcceptedLink(sender, recipient, requests, []);
  const events = !openAccepted && closedIds.length > 0 ? await store.acceptanceEvents(closedIds) : [];
  return decideReferrerDmGate({ senderIsReferrer, recipientIsReferrer, accepted: openAccepted || hasAcceptedLink(sender, recipient, requests, events) });
}

export class DirectMessageReferrerGateError extends Error {
  constructor(readonly block: DmSendBlock) { super(block.error); this.name = "DirectMessageReferrerGateError"; }
}

export function assertReferrerDmGateOpen(gate: ReferrerDmGate): void {
  const block = dmSendBlockFor(gate);
  if (block) throw new DirectMessageReferrerGateError(block);
}

/** Works on the pool and inside a transaction (sendDirectMessage rechecks under its locks). */
export type DmGateDb = Pick<MySql2Database<Record<string, never>>, "select">;

export function drizzleDmGateStore(db: DmGateDb): DmGateStore {
  return {
    usersByIds: ids => db.select({ id: users.id, canonicalPersonId: users.canonicalPersonId }).from(users).where(inArray(users.id, [...ids])),
    usersByPersons: personIds => db.select({ id: users.id, canonicalPersonId: users.canonicalPersonId }).from(users).where(inArray(users.canonicalPersonId, [...personIds])),
    verifiedProfiles: userIds => db.select({ userId: profiles.userId, workEmailVerifiedAt: profiles.workEmailVerifiedAt }).from(profiles).where(and(inArray(profiles.userId, [...userIds]), isNotNull(profiles.workEmailVerifiedAt))),
    acceptedRequestsBetween: (a, b) => db.select({ id: referralRequests.id, jobSeekerId: referralRequests.jobSeekerId, referrerId: referralRequests.referrerId, status: referralRequests.status }).from(referralRequests)
      .where(and(inArray(referralRequests.status, [...postApprovalReferralStatuses]), or(and(inArray(referralRequests.jobSeekerId, [...a]), inArray(referralRequests.referrerId, [...b])), and(inArray(referralRequests.jobSeekerId, [...b]), inArray(referralRequests.referrerId, [...a]))))),
    acceptanceEvents: requestIds => db.select({ referralRequestId: referralTransitionEvents.referralRequestId, fromStatus: referralTransitionEvents.fromStatus, resultingStatus: referralTransitionEvents.resultingStatus }).from(referralTransitionEvents)
      .where(and(inArray(referralTransitionEvents.referralRequestId, [...requestIds]), or(inArray(referralTransitionEvents.resultingStatus, [...OPEN_AFTER_ACCEPTANCE]), inArray(referralTransitionEvents.fromStatus, [...OPEN_AFTER_ACCEPTANCE])))),
  };
}

export function loadReferrerDmGate(db: DmGateDb, senderUserId: number, recipientUserId: number): Promise<ReferrerDmGate> {
  return resolveReferrerDmGate(drizzleDmGateStore(db), senderUserId, recipientUserId);
}
