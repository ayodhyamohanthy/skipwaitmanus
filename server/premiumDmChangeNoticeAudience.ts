// Who gets the D-012 item 3 notice, and what each person is offered. Pure:
// server/premiumDmChangeNotice.ts reads the rows and runs the notice.
//
// Offer (D-020): cash refunds go only to whoever paid. A person is offered
// "refund_or_credits" when at least one of their active paid plans is a
// provider subscription they paid for; a plan bought as a gift by someone
// else, or never billed through a provider, gets "credits_only".
//
// Verified referrers (D-020: anyone whose canonical person has a verified
// work email): the DM gate (server/dmReferrerGate.ts) also closes their
// plan-based and mutual-follow messages with ordinary members and their
// replies in existing threads with members they have no accepted request
// with. The approved text says "Everything else in your plan stays the same",
// which understates that for them, so each recipient carries
// verifiedReferrer, decided with the gate's own person-wide test.
import { z } from "zod";
import { isPaidSubscriptionPlan, type PaidSubscriptionPlan } from "../shared/subscriptionPlans";
import { hasVerifiedReferrerProfile, type DmGateProfileRow, type DmGateUserRow } from "./dmReferrerGate";
import type { NoticeOffer } from "./premiumDmChangeNoticeCopy";

export const NOTICE_EVENT_PREFIX = "d012-dm-change";

export type NoticeWalletRow = {
  readonly userId: number;
  readonly canonicalPersonId: number | null;
  readonly email: string | null;
  readonly plan: string;
  readonly subscriptionStatus: string | null;
  readonly subscriptionCurrentTermEnd: Date | null;
  readonly subscriptionId: string | null;
};

/**
 * A gift purchase that created this provider subscription. buyerUserId is null
 * when the buyer was not signed in; buyerCanonicalPersonId lets a gift bought
 * from another login of the same person count as paid by them.
 */
export type NoticeGiftRow = { readonly subscriptionId: string; readonly buyerUserId: number | null; readonly buyerCanonicalPersonId: number | null };

/**
 * Read with the DM gate's queries: every users row of the recipients'
 * canonical persons, and the verified-work-email profiles among them.
 */
export type NoticeReferrerFacts = { readonly personRows: readonly DmGateUserRow[]; readonly verifiedProfiles: readonly DmGateProfileRow[] };

export type NoticeRecipient = {
  readonly userId: number;
  readonly eventKey: string;
  readonly email: string | null;
  readonly plan: PaidSubscriptionPlan;
  readonly status: "active" | "non_renewing";
  readonly providerBilled: boolean;
  readonly gifted: boolean;
  readonly offer: NoticeOffer;
  readonly verifiedReferrer: boolean;
};

const emailSchema = z.string().trim().email().max(320);
const NO_REFERRER_FACTS: NoticeReferrerFacts = { personRows: [], verifiedProfiles: [] };

/** Same rule as the credit summary: a paid plan, renewing or ending at term end, inside its paid term. */
export function isActivePaidWallet(row: NoticeWalletRow, now: Date): boolean {
  return isPaidSubscriptionPlan(row.plan)
    && (row.subscriptionStatus === "active" || row.subscriptionStatus === "non_renewing")
    && row.subscriptionCurrentTermEnd !== null && row.subscriptionCurrentTermEnd > now;
}

/** One recipient per canonical person (or per users row when it has no person). */
export function planNoticeAudience(rows: readonly NoticeWalletRow[], now: Date, gifts: readonly NoticeGiftRow[] = [], referrers: NoticeReferrerFacts = NO_REFERRER_FACTS): NoticeRecipient[] {
  const groups = new Map<string, NoticeWalletRow[]>();
  for (const row of rows) {
    if (!isActivePaidWallet(row, now)) continue;
    const key = row.canonicalPersonId === null ? `u${row.userId}` : `p${row.canonicalPersonId}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return Array.from(groups.entries()).map(([key, group]): NoticeRecipient => {
    const ordered = [...group].sort((a, b) => a.userId - b.userId);
    const email = ordered.map(row => emailSchema.safeParse(row.email ?? "")).find(parsed => parsed.success)?.data ?? null;
    const personUserIds = new Set(ordered.map(row => row.userId));
    const personId = ordered[0].canonicalPersonId;
    const boughtByThem = (gift: NoticeGiftRow) => (gift.buyerUserId !== null && personUserIds.has(gift.buyerUserId)) || (personId !== null && gift.buyerCanonicalPersonId === personId);
    const giftedBySomeoneElse = (row: NoticeWalletRow) => gifts.some(gift => gift.subscriptionId === row.subscriptionId && !boughtByThem(gift));
    const billed = ordered.filter(row => Boolean(row.subscriptionId));
    const paidByThem = billed.some(row => !giftedBySomeoneElse(row));
    const everyLogin = new Set(personUserIds);
    if (personId !== null) for (const row of referrers.personRows) if (row.canonicalPersonId === personId) everyLogin.add(row.id);
    return {
      userId: ordered[0].userId,
      eventKey: `${NOTICE_EVENT_PREFIX}:${key}`,
      email,
      plan: ordered.some(row => row.plan === "max") ? "max" : "pro",
      status: ordered.some(row => row.subscriptionStatus === "active") ? "active" : "non_renewing",
      providerBilled: billed.length > 0,
      gifted: billed.some(giftedBySomeoneElse),
      offer: paidByThem ? "refund_or_credits" : "credits_only",
      verifiedReferrer: hasVerifiedReferrerProfile(Array.from(everyLogin), referrers.verifiedProfiles),
    };
  }).sort((a, b) => a.userId - b.userId);
}

export type NoticeAudienceSummary = {
  subscribers: number;
  pro: number;
  max: number;
  renewing: number;
  endingAtTermEnd: number;
  providerBilled: number;
  withoutProviderSubscription: number;
  withEmail: number;
  withoutEmail: number;
  alreadyNotified: number;
  refundOrCredits: number;
  creditsOnly: number;
  gifted: number;
  /** Subscribers whose person has a verified work email (D-020); see the header. */
  verifiedReferrers: number;
};

export function summarizeAudience(recipients: readonly NoticeRecipient[], notified: ReadonlySet<string>): NoticeAudienceSummary {
  const count = (test: (recipient: NoticeRecipient) => boolean) => recipients.filter(test).length;
  return {
    subscribers: recipients.length,
    pro: count(r => r.plan === "pro"),
    max: count(r => r.plan === "max"),
    renewing: count(r => r.status === "active"),
    endingAtTermEnd: count(r => r.status === "non_renewing"),
    providerBilled: count(r => r.providerBilled),
    withoutProviderSubscription: count(r => !r.providerBilled),
    withEmail: count(r => r.email !== null),
    withoutEmail: count(r => r.email === null),
    alreadyNotified: count(r => notified.has(r.eventKey)),
    refundOrCredits: count(r => r.offer === "refund_or_credits"),
    creditsOnly: count(r => r.offer === "credits_only"),
    gifted: count(r => r.gifted),
    verifiedReferrers: count(r => r.verifiedReferrer),
  };
}
