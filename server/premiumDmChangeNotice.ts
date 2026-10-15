// One-off notice to active Pro/Max subscribers that messaging referrers
// directly has ended (owner decision D-012 item 3). Run it only through
// scripts/notify-premium-dm-change.ts, which is a dry run unless --apply.
// Who gets which text: server/premiumDmChangeNoticeAudience.ts.
//
// Nothing here moves money or credits. A subscriber who wants the pro-rata
// refund or the bonus credits writes to support, and the owner handles each
// choice through the existing, reviewed billing tools.
//
// Idempotency: the in-app notification's unique eventKey is the claim. An
// email goes out only in the run that created that notification, and every
// email outcome is written to operationalActivityLogs, so re-running --apply
// never emails anyone twice. An email whose outcome was never recorded (a
// crash mid-send) is listed as unconfirmed for a manual check.
//
// A recorded failure is not proof of non-delivery: the transactional mailer
// reports any error, including its own 10-second timeout after the provider
// may already have accepted the email, as delivery_failed, and it passes no
// provider idempotency key. So --resend-failed on its own only lists the
// failed user ids; it emails only the ids the operator passes in
// confirmedUndeliveredUserIds after checking each one in the provider's log.
import type { TransactionalEmailInput, TransactionalEmailResult } from "./emailDelivery";
import type { DmGateProfileRow, DmGateUserRow } from "./dmReferrerGate";
import { noticeCopy, type NoticeCopy, noticeMessageFor } from "./premiumDmChangeNoticeCopy";
import { isActivePaidWallet, planNoticeAudience, summarizeAudience, type NoticeAudienceSummary, type NoticeGiftRow, type NoticeRecipient, type NoticeWalletRow } from "./premiumDmChangeNoticeAudience";

export { NOTICE_EVENT_PREFIX, isActivePaidWallet, planNoticeAudience, summarizeAudience } from "./premiumDmChangeNoticeAudience";
export type { NoticeAudienceSummary, NoticeGiftRow, NoticeRecipient, NoticeReferrerFacts, NoticeWalletRow } from "./premiumDmChangeNoticeAudience";

export const NOTICE_EMAIL_ACTION = "notice.d012_dm_change.email";

export type EmailOutcome = "success" | "failure";

/** Plain reads and writes; every decision is made in this module and the audience module. */
export type NoticeStore = {
  listPaidWallets(): Promise<readonly NoticeWalletRow[]>;
  giftsForSubscriptions(subscriptionIds: readonly string[]): Promise<readonly NoticeGiftRow[]>;
  /** The DM gate's reads: every users row of these canonical persons. */
  usersByPersons(personIds: readonly number[]): Promise<readonly DmGateUserRow[]>;
  /** The DM gate's reads: profiles of these users with a verified work email. */
  verifiedProfiles(userIds: readonly number[]): Promise<readonly DmGateProfileRow[]>;
  existingNotificationKeys(eventKeys: readonly string[]): Promise<ReadonlySet<string>>;
  insertNotificationOnce(input: { userId: number; eventKey: string; title: string; body: string }): Promise<"created" | "exists">;
  /** Latest recorded email outcome per eventKey. */
  emailOutcomes(eventKeys: readonly string[]): Promise<ReadonlyMap<string, EmailOutcome>>;
  recordEmailOutcome(input: { eventKey: string; outcome: EmailOutcome; reason: string }): Promise<void>;
};

export type NoticeMailer = (input: TransactionalEmailInput) => Promise<TransactionalEmailResult>;
export type NoticeMode = "dry-run" | "apply" | "resend-failed";

export type NoticeResults = {
  notificationsCreated: number;
  emailsSent: number;
  emailsFailed: number;
  emailsSkippedNoAddress: number;
  alreadyNotifiedAndEmailed: number;
  failedUserIds: number[];
  unconfirmedUserIds: number[];
  /** --resend-failed: ids the operator listed whose last recorded email did not fail (nothing sent to them). */
  confirmedButNotFailedUserIds: number[];
};

/** resendAwaitingProviderCheck: a --resend-failed run without confirmed ids, which only listed failedUserIds. */
export type NoticeReport = { mode: NoticeMode; audience: NoticeAudienceSummary; copy: NoticeCopy; results: NoticeResults | null; resendAwaitingProviderCheck: boolean };

export class NoticeEmailNotConfiguredError extends Error {
  constructor(readonly userId: number) {
    super(`Email delivery is not configured (ZeptoMail or Resend). Stopped at user ${userId}, who was not emailed because no provider was configured. Configure email, then run --resend-failed --confirmed-undelivered ${userId}, then --apply again.`);
    this.name = "NoticeEmailNotConfiguredError";
  }
}

/**
 * Texts the owner has not approved for a group (D-020). A writing run that
 * would notify or email anyone in such a group stops before its first write
 * unless the operator confirms that approval:
 * - credits_only (gifted or unbilled plans): --credits-only-copy-approved;
 * - verified referrers (their person has a verified work email), for whom
 *   "everything else stays the same" understates the change (open question
 *   under D-020: a third text, or the owner accepts the current one):
 *   --verified-referrer-copy-approved.
 */
export class NoticeCopyNotApprovedError extends Error {
  readonly creditsOnlyRecipients: number;
  readonly verifiedReferrerRecipients: number;
  constructor(blocked: { creditsOnly: number; verifiedReferrers: number }) {
    const reasons = [
      ...(blocked.creditsOnly > 0 ? [`${blocked.creditsOnly} subscriber(s) would get the credits_only notice (gifted or unbilled plan), (text approved Oct 15, D-020); confirm with --credits-only-copy-approved`] : []),
      ...(blocked.verifiedReferrers > 0 ? [`${blocked.verifiedReferrers} subscriber(s) have a verified work email, so the change also closes their messages with members who are not referrers, who get the verified-referrer variant of the notice (approved Oct 15, D-020); confirm with --verified-referrer-copy-approved`] : []),
    ];
    super(`${reasons.join("; ")}. Nothing was written or sent. Get the owner's answer, record it in docs/DECISIONS.md under D-020, then re-run with the matching flag.`);
    this.name = "NoticeCopyNotApprovedError";
    this.creditsOnlyRecipients = blocked.creditsOnly;
    this.verifiedReferrerRecipients = blocked.verifiedReferrers;
  }
}

export type NoticeRunOptions = {
  mode: NoticeMode;
  effectiveDate: string;
  now: Date;
  creditsOnlyCopyApproved?: boolean;
  verifiedReferrerCopyApproved?: boolean;
  /** --resend-failed only: user ids checked in the provider log as not delivered. */
  confirmedUndeliveredUserIds?: readonly number[];
};

async function loadRecipients(store: NoticeStore, now: Date): Promise<NoticeRecipient[]> {
  const wallets = (await store.listPaidWallets()).filter(row => isActivePaidWallet(row, now));
  const subscriptionIds = Array.from(new Set(wallets.flatMap(row => (row.subscriptionId ? [row.subscriptionId] : []))));
  const gifts = subscriptionIds.length > 0 ? await store.giftsForSubscriptions(subscriptionIds) : [];
  const personIds = Array.from(new Set(wallets.flatMap(row => (row.canonicalPersonId === null ? [] : [row.canonicalPersonId]))));
  const personRows = personIds.length > 0 ? await store.usersByPersons(personIds) : [];
  const userIds = Array.from(new Set([...wallets.map(row => row.userId), ...personRows.map(row => row.id)]));
  const verifiedProfiles = userIds.length > 0 ? await store.verifiedProfiles(userIds) : [];
  return planNoticeAudience(wallets, now, gifts, { personRows, verifiedProfiles });
}

export async function runPremiumDmChangeNotice(store: NoticeStore, mailer: NoticeMailer, options: NoticeRunOptions): Promise<NoticeReport> {
  const copy = noticeCopy(options.effectiveDate);
  const recipients = await loadRecipients(store, options.now);
  const keys = recipients.map(recipient => recipient.eventKey);
  const notified = await store.existingNotificationKeys(keys);
  const audience = summarizeAudience(recipients, notified);
  if (options.mode === "dry-run") return { mode: options.mode, audience, copy, results: null, resendAwaitingProviderCheck: false };

  const outcomes = await store.emailOutcomes(keys);
  const confirmed = new Set(options.confirmedUndeliveredUserIds ?? []);
  const failedBefore = (recipient: NoticeRecipient) => notified.has(recipient.eventKey) && outcomes.get(recipient.eventKey) === "failure";
  const writesTo = (recipient: NoticeRecipient) => options.mode === "resend-failed"
    ? failedBefore(recipient) && confirmed.has(recipient.userId)
    : !notified.has(recipient.eventKey);
  const writes = recipients.filter(writesTo);
  const blocked = {
    creditsOnly: options.creditsOnlyCopyApproved === true ? 0 : writes.filter(recipient => recipient.offer === "credits_only").length,
    verifiedReferrers: options.verifiedReferrerCopyApproved === true ? 0 : writes.filter(recipient => recipient.verifiedReferrer).length,
  };
  if (blocked.creditsOnly > 0 || blocked.verifiedReferrers > 0) throw new NoticeCopyNotApprovedError(blocked);
  const results: NoticeResults = { notificationsCreated: 0, emailsSent: 0, emailsFailed: 0, emailsSkippedNoAddress: 0, alreadyNotifiedAndEmailed: 0, failedUserIds: [], unconfirmedUserIds: [], confirmedButNotFailedUserIds: [] };
  const deliver = async (recipient: NoticeRecipient) => {
    if (recipient.email === null) { results.emailsSkippedNoAddress += 1; return; }
    const { email } = noticeMessageFor(copy, recipient);
    const sent = await mailer({ to: recipient.email, subject: email.subject, text: email.text }).catch((): TransactionalEmailResult => ({ sent: false, reason: "delivery_failed" }));
    await store.recordEmailOutcome({ eventKey: recipient.eventKey, outcome: sent.sent ? "success" : "failure", reason: sent.reason });
    if (sent.sent) { results.emailsSent += 1; return; }
    results.emailsFailed += 1;
    results.failedUserIds.push(recipient.userId);
    if (sent.reason === "not_configured") throw new NoticeEmailNotConfiguredError(recipient.userId);
  };

  if (options.mode === "resend-failed") {
    for (const recipient of recipients) {
      if (writesTo(recipient)) await deliver(recipient);
      else if (failedBefore(recipient)) results.failedUserIds.push(recipient.userId);
      else if (confirmed.has(recipient.userId)) results.confirmedButNotFailedUserIds.push(recipient.userId);
    }
    const known = new Set(recipients.map(recipient => recipient.userId));
    for (const userId of Array.from(confirmed)) if (!known.has(userId)) results.confirmedButNotFailedUserIds.push(userId);
    return { mode: options.mode, audience, copy, results, resendAwaitingProviderCheck: confirmed.size === 0 };
  }

  for (const recipient of recipients) {
    const earlier = outcomes.get(recipient.eventKey);
    const { notification } = noticeMessageFor(copy, recipient);
    const claim = notified.has(recipient.eventKey) ? "exists" : await store.insertNotificationOnce({ userId: recipient.userId, eventKey: recipient.eventKey, title: notification.title, body: notification.body });
    if (claim === "created") { results.notificationsCreated += 1; await deliver(recipient); continue; }
    if (earlier === "success") results.alreadyNotifiedAndEmailed += 1;
    else if (earlier === "failure") results.failedUserIds.push(recipient.userId);
    else if (recipient.email === null) results.emailsSkippedNoAddress += 1;
    else results.unconfirmedUserIds.push(recipient.userId);
  }
  return { mode: options.mode, audience, copy, results, resendAwaitingProviderCheck: false };
}
