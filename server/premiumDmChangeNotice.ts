// One-off notice to active Pro/Max subscribers that messaging referrers
// directly has ended (owner decision D-012 item 3). Run it only through
// scripts/notify-premium-dm-change.ts, which is a dry run unless --apply.
//
// Nothing here moves money or credits. A subscriber who wants the pro-rata
// refund or the bonus credits writes to support, and the owner handles each
// choice through the existing, reviewed billing tools.
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
import { noticeCopy, type NoticeCopy } from "./premiumDmChangeNoticeCopy";

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

export type NoticeRecipient = {
  readonly userId: number;
  readonly eventKey: string;
  readonly email: string | null;
  readonly plan: PaidSubscriptionPlan;
  readonly status: "active" | "non_renewing";
  readonly providerBilled: boolean;
};

export type EmailOutcome = "success" | "failure";

/** Plain reads and writes; every decision is made in this module. */
export type NoticeStore = {
  listPaidWallets(): Promise<readonly NoticeWalletRow[]>;
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
export function planNoticeAudience(rows: readonly NoticeWalletRow[], now: Date): NoticeRecipient[] {
  const groups = new Map<string, NoticeWalletRow[]>();
  for (const row of rows) {
    if (!isActivePaidWallet(row, now)) continue;
    const key = row.canonicalPersonId === null ? `u${row.userId}` : `p${row.canonicalPersonId}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return Array.from(groups.entries()).map(([key, group]): NoticeRecipient => {
    const ordered = [...group].sort((a, b) => a.userId - b.userId);
    const email = ordered.map(row => emailSchema.safeParse(row.email ?? "")).find(parsed => parsed.success)?.data ?? null;
    return {
      userId: ordered[0].userId,
      eventKey: `${NOTICE_EVENT_PREFIX}:${key}`,
      email,
      plan: ordered.some(row => row.plan === "max") ? "max" : "pro",
      status: ordered.some(row => row.subscriptionStatus === "active") ? "active" : "non_renewing",
      providerBilled: ordered.some(row => Boolean(row.subscriptionId)),
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
  };
}

export class NoticeEmailNotConfiguredError extends Error {
  constructor() { super("Email delivery is not configured (ZeptoMail or Resend). Stopped after the first subscriber; configure email, then run --resend-failed and --apply again."); this.name = "NoticeEmailNotConfiguredError"; }
}

export async function runPremiumDmChangeNotice(store: NoticeStore, mailer: NoticeMailer, options: { mode: NoticeMode; effectiveDate: string; now: Date }): Promise<NoticeReport> {
  const copy = noticeCopy(options.effectiveDate);
  const recipients = planNoticeAudience(await store.listPaidWallets(), options.now);
  const keys = recipients.map(recipient => recipient.eventKey);
  const notified = await store.existingNotificationKeys(keys);
  const audience = summarizeAudience(recipients, notified);
  if (options.mode === "dry-run") return { mode: options.mode, audience, copy, results: null };

  const outcomes = await store.emailOutcomes(keys);
  const results: NoticeResults = { notificationsCreated: 0, emailsSent: 0, emailsFailed: 0, emailsSkippedNoAddress: 0, alreadyNotifiedAndEmailed: 0, failedUserIds: [], unconfirmedUserIds: [] };
  const deliver = async (recipient: NoticeRecipient) => {
    if (recipient.email === null) { results.emailsSkippedNoAddress += 1; return; }
    const sent = await mailer({ to: recipient.email, subject: copy.email.subject, text: copy.email.text }).catch((): TransactionalEmailResult => ({ sent: false, reason: "delivery_failed" }));
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
    const claim = notified.has(recipient.eventKey) ? "exists" : await store.insertNotificationOnce({ userId: recipient.userId, eventKey: recipient.eventKey, title: copy.notification.title, body: copy.notification.body });
    if (claim === "created") { results.notificationsCreated += 1; await deliver(recipient); continue; }
    if (earlier === "success") results.alreadyNotifiedAndEmailed += 1;
    else if (earlier === "failure") results.failedUserIds.push(recipient.userId);
    else if (recipient.email === null) results.emailsSkippedNoAddress += 1;
    else results.unconfirmedUserIds.push(recipient.userId);
  }
  return { mode: options.mode, audience, copy, results };
}
