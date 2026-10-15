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
 *
 * Two copy variants (D-020): "refund_or_credits" for people who paid for
 * their plan, "credits_only" for a gifted or never-billed plan.
 *
 * --apply creates one in-app notification per subscriber (unique eventKey
 * d012-dm-change:<person>) and emails each newly notified subscriber through
 * the transactional mailer, recording every email outcome. Re-running --apply
 * never notifies or emails anyone twice. --resend-failed retries only emails
 * whose last recorded outcome failed. Unconfirmed user ids (no recorded email
 * outcome, e.g. after a crash) need a manual check in the mail provider log.
 * --effective-date (the day the change went live) is required for both
 * writing modes so the copy states the real date; the dry run defaults to today.
 */
import type { NoticeMode } from "../server/premiumDmChangeNotice";
import { NOTICE_OFFERS } from "../server/premiumDmChangeNoticeCopy";

export type NoticeArgs = { mode: NoticeMode; effectiveDate: string };

export function parseNoticeArgs(argv: readonly string[], today: Date = new Date()): NoticeArgs {
  let mode: NoticeMode = "dry-run";
  let effectiveDate: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply" || arg === "--resend-failed") {
      const next: NoticeMode = arg === "--apply" ? "apply" : "resend-failed";
      if (mode !== "dry-run" && mode !== next) throw new Error("Use either --apply or --resend-failed, not both.");
      mode = next;
      continue;
    }
    if (arg === "--effective-date") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--effective-date needs a date written YYYY-MM-DD");
      effectiveDate = value;
      i++;
      continue;
    }
    throw new Error(`Unknown option ${arg}. Use --effective-date <YYYY-MM-DD>, --apply or --resend-failed.`);
  }
  if (mode !== "dry-run" && effectiveDate === null) throw new Error(`--${mode} needs --effective-date <YYYY-MM-DD>, the day the change went live.`);
  return { mode, effectiveDate: effectiveDate ?? today.toISOString().slice(0, 10) };
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
    const { notification, email } = report.copy.byOffer[offer];
    console.log(`\n===== Offer: ${offer} (${offer === "refund_or_credits" ? report.audience.refundOrCredits : report.audience.creditsOnly} subscribers) =====`);
    console.log(`\n--- In-app notification ---\nTitle: ${notification.title}\n${notification.body}`);
    console.log(`\n--- Email ---\nSubject: ${email.subject}\n\n${email.text}\n`);
  }
  if (report.results) console.log(`Results: ${JSON.stringify(report.results, null, 2)}`);
  else console.log("Dry run: nothing was written and no email was sent. Re-run with --apply after the owner approves the copy.");
  process.exit(0);
}

if (process.argv[1]?.endsWith("notify-premium-dm-change.ts")) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
