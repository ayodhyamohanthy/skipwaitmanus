// One-off notice to active Pro/Max subscribers that messaging referrers
// directly has ended (owner decision D-012 item 3). Run it only through
// scripts/notify-premium-dm-change.ts, which is a dry run unless --apply.
//
// Nothing here moves money or credits. A subscriber who wants the pro-rata
// refund or the bonus credits writes to support, and the owner handles each
// choice through the existing, reviewed billing tools.
//
// Offer (D-020): cash refunds go only to whoever paid. A person is offered
// "refund_or_credits" when at least one of their active paid plans is a
// provider subscription they paid for; a plan bought as a gift by someone
// else, or never billed through a provider, gets "credits_only".
//
// Idempotency: the in-app notification's unique eventKey is the claim. An
// email goes out only in the run that created that notification, and every
// email outcome is written to operationalActivityLogs, so a re-run never
// emails anyone twice. Failed emails are retried only with --resend-failed;
// an email whose outcome was never recorded (a crash mid-send) is listed as
// unconfirmed for a manual check instead of being re-sent blindly.
import { z } from "zod";
import { isPaidSubscriptionPlan, type PaidSubscriptionPlan } from "../shared/subscriptionPlans";
import type { TransactionalEmailInput, TransactionalEmailResult } from "./emailDelivery";
import { noticeCopy, type NoticeCopy, type NoticeOffer } from "./premiumDmChangeNoticeCopy";

export const NOTICE_EVENT_PREFIX = "d012-dm-change";
export const NOTICE_EMAIL_ACTION = "notice.d012_dm_change.email";

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

export type NoticeRecipient = {
  readonly userId: number;
  readonly eventKey: string;
  readonly email: string | null;
  readonly plan: PaidSubscriptionPlan;
  readonly status: "active" | "non_renewing";
  readonly providerBilled: boolean;
  readonly gifted: boolean;
  readonly offer: NoticeOffer;
};

export type EmailOutcome = "success" | "failure";

/** Plain reads and writes; every decision is made in this module. */
export type NoticeStore = {
  listPaidWallets(): Promise<readonly NoticeWalletRow[]>;
  giftsForSubscriptions(subscriptionIds: readonly string[]): Promise<readonly NoticeGiftRow[]>;
  existingNotificationKeys(eventKeys: readonly string[]): Promise<ReadonlySet<string>>;
  insertNotificationOnce(input: { userId: number; eventKey: string; title: string; body: string }): Promise<"created" | "exists">;
  /** Latest recorded email outcome per eventKey. */
  emailOutcomes(eventKeys: readonly string[]): Promise<ReadonlyMap<string, EmailOutcome>>;
  recordEmailOutcome(input: { eventKey: string; outcome: EmailOutcome; reason: string }): Promise<void>;
};

export type NoticeMailer = (input: TransactionalEmailInput) => Promise<TransactionalEmailResult>;
export type NoticeMode = "dry-run" | "apply" | "resend-failed";

const emailSchema = z.string().trim().email().max(320);

/** Same rule as the credit summary: a paid plan, renewing or ending at term end, inside its paid term. */
export function isActivePaidWallet(row: NoticeWalletRow, now: Date): boolean {
  return isPaidSubscriptionPlan(row.plan)
    && (row.subscriptionStatus === "active" || row.subscriptionStatus === "non_renewing")
    && row.subscriptionCurrentTermEnd !== null && row.subscriptionCurrentTermEnd > now;
}

/** One recipient per canonical person (or per users row when it has no person). */
export function planNoticeAudience(rows: readonly NoticeWalletRow[], now: Date, gifts: readonly NoticeGiftRow[] = []): NoticeRecipient[] {
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
    const gifted = billed.some(giftedBySomeoneElse);
    const paidByThem = billed.some(row => !giftedBySomeoneElse(row));
    return {
      userId: ordered[0].userId,
      eventKey: `${NOTICE_EVENT_PREFIX}:${key}`,
      email,
      plan: ordered.some(row => row.plan === "max") ? "max" : "pro",
      status: ordered.some(row => row.subscriptionStatus === "active") ? "active" : "non_renewing",
      providerBilled: billed.length > 0,
      gifted,
      offer: paidByThem ? "refund_or_credits" : "credits_only",
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
};

export type NoticeResults = {
  notificationsCreated: number;
  emailsSent: number;
  emailsFailed: number;
  emailsSkippedNoAddress: number;
  alreadyNotifiedAndEmailed: number;
  failedUserIds: number[];
  unconfirmedUserIds: number[];
};

export type NoticeReport = { mode: NoticeMode; audience: NoticeAudienceSummary; copy: NoticeCopy; results: NoticeResults | null };

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
  };
}

export class NoticeEmailNotConfiguredError extends Error {
  constructor() { super("Email delivery is not configured (ZeptoMail or Resend). Stopped after the first subscriber; configure email, then run --resend-failed and --apply again."); this.name = "NoticeEmailNotConfiguredError"; }
}

/**
 * The credits_only text (gifted or unbilled plans) awaits the owner's approval
 * (D-020). A writing run that would notify or email anyone with it stops
 * before its first write unless the operator confirms that approval.
 */
export class NoticeCopyNotApprovedError extends Error {
  constructor(readonly creditsOnlyRecipients: number) {
    super(`${creditsOnlyRecipients} subscriber(s) would get the credits_only notice (gifted or unbilled plan), whose text the owner has not approved yet. Nothing was written or sent. Get the owner's approval of that text, record it in docs/DECISIONS.md under D-020, then re-run with --credits-only-copy-approved.`);
    this.name = "NoticeCopyNotApprovedError";
  }
}

export async function runPremiumDmChangeNotice(store: NoticeStore, mailer: NoticeMailer, options: { mode: NoticeMode; effectiveDate: string; now: Date; creditsOnlyCopyApproved?: boolean }): Promise<NoticeReport> {
  const copy = noticeCopy(options.effectiveDate);
  const wallets = (await store.listPaidWallets()).filter(row => isActivePaidWallet(row, options.now));
  const subscriptionIds = Array.from(new Set(wallets.flatMap(row => (row.subscriptionId ? [row.subscriptionId] : []))));
  const gifts = subscriptionIds.length > 0 ? await store.giftsForSubscriptions(subscriptionIds) : [];
  const recipients = planNoticeAudience(wallets, options.now, gifts);
  const keys = recipients.map(recipient => recipient.eventKey);
  const notified = await store.existingNotificationKeys(keys);
  const audience = summarizeAudience(recipients, notified);
  if (options.mode === "dry-run") return { mode: options.mode, audience, copy, results: null };

  const outcomes = await store.emailOutcomes(keys);
  const writesTo = (recipient: NoticeRecipient) => options.mode === "resend-failed"
    ? notified.has(recipient.eventKey) && outcomes.get(recipient.eventKey) === "failure"
    : !notified.has(recipient.eventKey);
  const creditsOnlyWrites = recipients.filter(recipient => recipient.offer === "credits_only" && writesTo(recipient)).length;
  if (creditsOnlyWrites > 0 && options.creditsOnlyCopyApproved !== true) throw new NoticeCopyNotApprovedError(creditsOnlyWrites);
  const results: NoticeResults = { notificationsCreated: 0, emailsSent: 0, emailsFailed: 0, emailsSkippedNoAddress: 0, alreadyNotifiedAndEmailed: 0, failedUserIds: [], unconfirmedUserIds: [] };
  const deliver = async (recipient: NoticeRecipient) => {
    if (recipient.email === null) { results.emailsSkippedNoAddress += 1; return; }
    const { email } = copy.byOffer[recipient.offer];
    const sent = await mailer({ to: recipient.email, subject: email.subject, text: email.text }).catch((): TransactionalEmailResult => ({ sent: false, reason: "delivery_failed" }));
    await store.recordEmailOutcome({ eventKey: recipient.eventKey, outcome: sent.sent ? "success" : "failure", reason: sent.reason });
    if (sent.sent) { results.emailsSent += 1; return; }
    results.emailsFailed += 1;
    results.failedUserIds.push(recipient.userId);
    if (sent.reason === "not_configured") throw new NoticeEmailNotConfiguredError();
  };

  for (const recipient of recipients) {
    const earlier = outcomes.get(recipient.eventKey);
    if (options.mode === "resend-failed") {
      if (notified.has(recipient.eventKey) && earlier === "failure") await deliver(recipient);
      continue;
    }
    const { notification } = copy.byOffer[recipient.offer];
    const claim = notified.has(recipient.eventKey) ? "exists" : await store.insertNotificationOnce({ userId: recipient.userId, eventKey: recipient.eventKey, title: notification.title, body: notification.body });
    if (claim === "created") { results.notificationsCreated += 1; await deliver(recipient); continue; }
    if (earlier === "success") results.alreadyNotifiedAndEmailed += 1;
    else if (earlier === "failure") results.failedUserIds.push(recipient.userId);
    else if (recipient.email === null) results.emailsSkippedNoAddress += 1;
    else results.unconfirmedUserIds.push(recipient.userId);
  }
  return { mode: options.mode, audience, copy, results };
}
