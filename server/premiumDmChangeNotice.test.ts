import { describe, expect, it, vi } from "vitest";
import { parseNoticeArgs } from "../scripts/notify-premium-dm-change";
import { NoticeEmailNotConfiguredError, planNoticeAudience, runPremiumDmChangeNotice, type EmailOutcome, type NoticeMailer, type NoticeStore, type NoticeWalletRow } from "./premiumDmChangeNotice";
import { formatEffectiveDate, noticeCopy } from "./premiumDmChangeNoticeCopy";

const NOW = new Date("2026-10-15T12:00:00Z");
const LATER = new Date("2026-11-10T00:00:00Z");
const EARLIER = new Date("2026-10-01T00:00:00Z");
const wallet = (over: Partial<NoticeWalletRow> & { userId: number }): NoticeWalletRow => ({ canonicalPersonId: null, email: `user${over.userId}@example.test`, plan: "pro", subscriptionStatus: "active", subscriptionCurrentTermEnd: LATER, subscriptionId: `sub_${over.userId}`, ...over });

const WALLETS: NoticeWalletRow[] = [
  wallet({ userId: 1 }),
  wallet({ userId: 2, plan: "max", subscriptionStatus: "non_renewing" }),
  wallet({ userId: 3, canonicalPersonId: 7 }),
  wallet({ userId: 4, canonicalPersonId: 7, plan: "max" }), // same person as user 3: one notice
  wallet({ userId: 5, email: null, subscriptionId: null }),
  wallet({ userId: 6, subscriptionStatus: "cancelled" }), // not active
  wallet({ userId: 8, subscriptionCurrentTermEnd: EARLIER }), // term ended
  wallet({ userId: 9, plan: "free" }),
];

function memoryStore(wallets: readonly NoticeWalletRow[]) {
  const notifications = new Map<string, number>();
  const outcomes: Array<{ eventKey: string; outcome: EmailOutcome; reason: string }> = [];
  const writes = { notifications: 0, outcomes: 0 };
  const store: NoticeStore = {
    listPaidWallets: async () => wallets,
    existingNotificationKeys: async keys => new Set(keys.filter(key => notifications.has(key))),
    insertNotificationOnce: async input => { writes.notifications += 1; if (notifications.has(input.eventKey)) return "exists"; notifications.set(input.eventKey, input.userId); return "created"; },
    emailOutcomes: async keys => { const latest = new Map<string, EmailOutcome>(); for (const row of outcomes) if (keys.includes(row.eventKey)) latest.set(row.eventKey, row.outcome); return latest; },
    recordEmailOutcome: async input => { writes.outcomes += 1; outcomes.push(input); },
  };
  return { store, notifications, outcomes, writes };
}
const okMailer = () => vi.fn<NoticeMailer>(async () => ({ sent: true, reason: "sent" as const }));

describe("D-012 premium DM change notice: audience", () => {
  it("counts each active Pro/Max person once and skips inactive, ended and free wallets", () => {
    const audience = planNoticeAudience(WALLETS, NOW);
    expect(audience.map(r => r.userId)).toEqual([1, 2, 3, 5]);
    expect(audience.find(r => r.userId === 3)).toMatchObject({ eventKey: "d012-dm-change:p7", plan: "max" });
    expect(audience.find(r => r.userId === 1)?.eventKey).toBe("d012-dm-change:u1");
    expect(audience.find(r => r.userId === 5)).toMatchObject({ email: null, providerBilled: false });
  });
});

describe("D-012 premium DM change notice: dry run", () => {
  it("prints aggregate counts and the draft copy, and writes or sends nothing", async () => {
    const memory = memoryStore(WALLETS);
    const mailer = okMailer();
    const report = await runPremiumDmChangeNotice(memory.store, mailer, { mode: "dry-run", effectiveDate: "2026-10-20", now: NOW });
    expect(mailer).not.toHaveBeenCalled();
    expect(memory.writes).toEqual({ notifications: 0, outcomes: 0 });
    expect(report.results).toBeNull();
    expect(report.audience).toMatchObject({ subscribers: 4, pro: 2, max: 2, renewing: 3, endingAtTermEnd: 1, withEmail: 3, withoutEmail: 1, alreadyNotified: 0 });
    const printed = JSON.stringify(report);
    expect(printed).not.toMatch(/@example\.test/);
    expect(report.copy.email.text).toContain("From 20 October 2026");
  });

  it("defaults the dry run to dry-run mode and today's date", () => {
    expect(parseNoticeArgs([], NOW)).toEqual({ mode: "dry-run", effectiveDate: "2026-10-15" });
    expect(parseNoticeArgs(["--effective-date", "2026-10-20", "--apply"], NOW)).toEqual({ mode: "apply", effectiveDate: "2026-10-20" });
    expect(() => parseNoticeArgs(["--apply"], NOW)).toThrow(/--effective-date/);
    expect(() => parseNoticeArgs(["--apply", "--resend-failed", "--effective-date", "2026-10-20"], NOW)).toThrow(/either/);
    expect(() => parseNoticeArgs(["--send"], NOW)).toThrow(/Unknown option/);
  });
});

describe("D-012 premium DM change notice: apply", () => {
  it("creates one notification and one email per subscriber, and a re-run adds nothing", async () => {
    const memory = memoryStore(WALLETS);
    const mailer = okMailer();
    const first = await runPremiumDmChangeNotice(memory.store, mailer, { mode: "apply", effectiveDate: "2026-10-20", now: NOW });
    expect(first.results).toMatchObject({ notificationsCreated: 4, emailsSent: 3, emailsFailed: 0, emailsSkippedNoAddress: 1 });
    expect(mailer).toHaveBeenCalledTimes(3);
    expect(mailer.mock.calls.map(([input]) => input.to)).toEqual(["user1@example.test", "user2@example.test", "user3@example.test"]);
    const second = await runPremiumDmChangeNotice(memory.store, mailer, { mode: "apply", effectiveDate: "2026-10-20", now: NOW });
    expect(second.results).toMatchObject({ notificationsCreated: 0, emailsSent: 0, alreadyNotifiedAndEmailed: 3, emailsSkippedNoAddress: 1 });
    expect(mailer).toHaveBeenCalledTimes(3);
    expect(memory.notifications.size).toBe(4);
  });

  it("records a failed email, does not retry it on --apply, and retries it once with --resend-failed", async () => {
    const memory = memoryStore([wallet({ userId: 1 })]);
    const failing = vi.fn<NoticeMailer>(async () => ({ sent: false, reason: "delivery_failed" as const }));
    expect((await runPremiumDmChangeNotice(memory.store, failing, { mode: "apply", effectiveDate: "2026-10-20", now: NOW })).results).toMatchObject({ emailsFailed: 1, failedUserIds: [1] });
    expect((await runPremiumDmChangeNotice(memory.store, failing, { mode: "apply", effectiveDate: "2026-10-20", now: NOW })).results).toMatchObject({ emailsSent: 0, failedUserIds: [1] });
    expect(failing).toHaveBeenCalledTimes(1);
    const mailer = okMailer();
    expect((await runPremiumDmChangeNotice(memory.store, mailer, { mode: "resend-failed", effectiveDate: "2026-10-20", now: NOW })).results).toMatchObject({ emailsSent: 1, notificationsCreated: 0 });
    expect((await runPremiumDmChangeNotice(memory.store, mailer, { mode: "resend-failed", effectiveDate: "2026-10-20", now: NOW })).results).toMatchObject({ emailsSent: 0 });
    expect(mailer).toHaveBeenCalledTimes(1);
  });

  it("lists a notified subscriber with no recorded email outcome as unconfirmed instead of emailing again", async () => {
    const memory = memoryStore([wallet({ userId: 1 })]);
    memory.notifications.set("d012-dm-change:u1", 1);
    const mailer = okMailer();
    const report = await runPremiumDmChangeNotice(memory.store, mailer, { mode: "apply", effectiveDate: "2026-10-20", now: NOW });
    expect(report.results).toMatchObject({ unconfirmedUserIds: [1], emailsSent: 0 });
    expect(mailer).not.toHaveBeenCalled();
  });

  it("stops at once when email is not configured, keeping the failure recoverable", async () => {
    const memory = memoryStore([wallet({ userId: 1 }), wallet({ userId: 2 })]);
    const unconfigured = vi.fn<NoticeMailer>(async () => ({ sent: false, reason: "not_configured" as const }));
    await expect(runPremiumDmChangeNotice(memory.store, unconfigured, { mode: "apply", effectiveDate: "2026-10-20", now: NOW })).rejects.toBeInstanceOf(NoticeEmailNotConfiguredError);
    expect(memory.notifications.size).toBe(1);
    expect(memory.outcomes).toEqual([{ eventKey: "d012-dm-change:u1", outcome: "failure", reason: "not_configured" }]);
  });
});

describe("D-012 premium DM change notice: copy", () => {
  it("states what changes, when, why, what stays, and the 30-day refund-or-credits choice", () => {
    const copy = noticeCopy("2026-10-20");
    for (const text of [copy.email.text, copy.notification.body]) {
      expect(text).toContain("20 October 2026");
      expect(text).toContain("support@skipwait.me");
      expect(text).toMatch(/pro-rata refund for your current billing cycle/);
      expect(text).toMatch(/bonus referral credits of equal value/);
      expect(text).toMatch(/30 days/);
    }
    expect(copy.email.text).toMatch(/privacy/);
    expect(copy.email.text).toMatch(/If you do nothing, your plan continues as it is/);
    expect(copy.notification.title.length).toBeLessThanOrEqual(180);
    expect(`${copy.email.text} ${copy.notification.body}`).not.toMatch(/reply to this email|hurry|last chance|act now/i);
  });

  it("rejects an effective date that is not a real calendar date", () => {
    expect(formatEffectiveDate("2026-10-20")).toBe("20 October 2026");
    for (const bad of ["2026-02-30", "20-10-2026", "tomorrow", ""]) expect(() => formatEffectiveDate(bad)).toThrow(/YYYY-MM-DD/);
  });
});
