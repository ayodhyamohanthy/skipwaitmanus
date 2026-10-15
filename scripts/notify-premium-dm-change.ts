/**
 * D-012 item 3 notice to active Pro/Max subscribers: messaging referrers
 * directly has ended. DRY RUN BY DEFAULT: prints the aggregate audience and
 * the exact draft in-app notification and email, and writes or sends nothing.
 * Logic and idempotency rules live in server/premiumDmChangeNotice.ts; the
 * copy lives in server/premiumDmChangeNoticeCopy.ts (owner approves it first).
 *
 * Usage (owner, against the target database):
 *   DATABASE_URL='mysql://…' pnpm tsx scripts/notify-premium-dm-change.ts --effective-date 2026-10-20
 *   DATABASE_URL='mysql://…' pnpm tsx scripts/notify-premium-dm-change.ts --effective-date 2026-10-20 --apply
 *   DATABASE_URL='mysql://…' pnpm tsx scripts/notify-premium-dm-change.ts --effective-date 2026-10-20 --resend-failed
 *   DATABASE_URL='mysql://…' pnpm tsx scripts/notify-premium-dm-change.ts --effective-date 2026-10-20 --resend-failed --confirmed-undelivered 12,34
 *
 * Two copy variants (D-020): "refund_or_credits" for people who paid for
 * their plan (approved as written), "credits_only" for a gifted or
 * never-billed plan (awaiting the owner's approval). A writing run that would
 * notify or email anyone with the credits_only text stops before its first
 * write unless you add --credits-only-copy-approved, which you may do only
 * after the owner's approval of that text is recorded under D-020.
 *
 * Subscribers who are themselves verified referrers (their person has a
 * verified work email, D-020) lose more than the approved text says: the gate
 * also closes their plan-based and mutual-follow messages with members who
 * are not referrers. The dry run counts them ("verifiedReferrers"); a writing
 * run that would notify or email any of them stops before its first write
 * unless you add --verified-referrer-copy-approved, which you may do only
 * after the owner's answer (a third text, or accepting the current one) is
 * recorded under D-020.
 *
 * --apply creates one in-app notification per subscriber (unique eventKey
 * d012-dm-change:<person>) and emails each newly notified subscriber through
 * the transactional mailer, recording every email outcome. Re-running --apply
 * never notifies or emails anyone twice. Unconfirmed user ids (no recorded
 * email outcome, e.g. after a crash) need a manual check in the mail provider
 * log.
 *
 * A recorded email failure MAY STILL HAVE BEEN DELIVERED: the mailer records
 * any error, including its own 10-second timeout after the provider may have
 * accepted the email, as a failure, and it sends no provider idempotency key.
 * So --resend-failed alone sends nothing: it lists the failed user ids. Look
 * each one's address up in the mail provider's log (ZeptoMail, or Resend if
 * that was the active sender), then re-run --resend-failed with
 * --confirmed-undelivered <comma-separated ids that were NOT delivered>.
 * Only those ids, and only while their last recorded email failed, are sent.
 * --effective-date (the day the change went live) is required for both
 * writing modes so the copy states the real date; the dry run defaults to today.
 */
import type { NoticeMode } from "../server/premiumDmChangeNotice";
import { NOTICE_OFFERS } from "../server/premiumDmChangeNoticeCopy";

export type NoticeArgs = { mode: NoticeMode; effectiveDate: string; creditsOnlyCopyApproved: boolean; verifiedReferrerCopyApproved: boolean; confirmedUndeliveredUserIds: number[] };

function parseUserIds(value: string): number[] {
  const parts = value.split(",").map(part => part.trim());
  if (parts.some(part => !/^[1-9]\d{0,9}$/.test(part))) throw new Error(`--confirmed-undelivered needs comma-separated user ids, e.g. 12,34 (got "${value}")`);
  return Array.from(new Set(parts.map(Number)));
}

export function parseNoticeArgs(argv: readonly string[], today: Date = new Date()): NoticeArgs {
  let mode: NoticeMode = "dry-run";
  let effectiveDate: string | null = null;
  let creditsOnlyCopyApproved = false;
  let verifiedReferrerCopyApproved = false;
  let confirmedUndeliveredUserIds: number[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply" || arg === "--resend-failed") {
      const next: NoticeMode = arg === "--apply" ? "apply" : "resend-failed";
      if (mode !== "dry-run" && mode !== next) throw new Error("Use either --apply or --resend-failed, not both.");
      mode = next;
      continue;
    }
    if (arg === "--credits-only-copy-approved") {
      creditsOnlyCopyApproved = true;
      continue;
    }
    if (arg === "--verified-referrer-copy-approved") {
      verifiedReferrerCopyApproved = true;
      continue;
    }
    if (arg === "--confirmed-undelivered") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--confirmed-undelivered needs comma-separated user ids, e.g. 12,34");
      confirmedUndeliveredUserIds = parseUserIds(value);
      i++;
      continue;
    }
    if (arg === "--effective-date") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--effective-date needs a date written YYYY-MM-DD");
      effectiveDate = value;
      i++;
      continue;
    }
    throw new Error(`Unknown option ${arg}. Use --effective-date <YYYY-MM-DD>, --apply, --resend-failed, --confirmed-undelivered <ids>, --credits-only-copy-approved or --verified-referrer-copy-approved.`);
  }
  if (mode !== "dry-run" && effectiveDate === null) throw new Error(`--${mode} needs --effective-date <YYYY-MM-DD>, the day the change went live.`);
  if (confirmedUndeliveredUserIds.length > 0 && mode !== "resend-failed") throw new Error("--confirmed-undelivered only goes with --resend-failed.");
  return { mode, effectiveDate: effectiveDate ?? today.toISOString().slice(0, 10), creditsOnlyCopyApproved, verifiedReferrerCopyApproved, confirmedUndeliveredUserIds };
}

async function main() {
  const args = parseNoticeArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const [{ getDb }, { runPremiumDmChangeNotice }, { drizzleNoticeStore }, { sendTransactionalEmail }] = await Promise.all([
    import("../server/db"), import("../server/premiumDmChangeNotice"), import("../server/premiumDmChangeNoticeStore"), import("../server/emailDelivery"),
  ]);
  const db = await getDb();
  if (!db) throw new Error("Could not connect to the database");
  const report = await runPremiumDmChangeNotice(drizzleNoticeStore(db), sendTransactionalEmail, { ...args, now: new Date() });
  console.log(`Mode: ${report.mode}`);
  console.log(`Audience (aggregate): ${JSON.stringify(report.audience, null, 2)}`);
  for (const offer of NOTICE_OFFERS) {
    for (const [label, variants] of [["", report.copy.byOffer], [" — verified-referrer variant", report.copy.verifiedReferrerByOffer]] as const) {
      const { notification, email } = variants[offer];
      console.log(`\n===== Offer: ${offer}${label} (${offer === "refund_or_credits" ? report.audience.refundOrCredits : report.audience.creditsOnly} subscribers on this offer) =====`);
      console.log(`\n--- In-app notification ---\nTitle: ${notification.title}\n${notification.body}`);
      console.log(`\n--- Email ---\nSubject: ${email.subject}\n\n${email.text}\n`);
    }
  }
  if (report.results) console.log(`Results: ${JSON.stringify(report.results, null, 2)}`);
  if (report.resendAwaitingProviderCheck) console.log(`Nothing was sent. A recorded failure may still have been delivered (a timeout after the provider accepted it). Check each failed user id (${report.results?.failedUserIds.join(", ") || "none"}) in the mail provider log, then re-run --resend-failed --confirmed-undelivered <ids that were not delivered>.`);
  else console.log("Dry run: nothing was written and no email was sent. Re-run with --apply after the owner approves the copy.");
  if (report.audience.creditsOnly > 0 && !args.creditsOnlyCopyApproved) console.log("The credits_only text was approved on Oct 15 (D-020): confirm it at send time with --credits-only-copy-approved.");
  if (report.audience.verifiedReferrers > 0 && !args.verifiedReferrerCopyApproved) console.log(`${report.audience.verifiedReferrers} subscriber(s) have a verified work email and get the verified-referrer variant (approved Oct 15, D-020): confirm it at send time with --verified-referrer-copy-approved.`);
  process.exit(0);
}

if (process.argv[1]?.endsWith("notify-premium-dm-change.ts")) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
