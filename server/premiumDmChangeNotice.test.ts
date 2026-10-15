import { describe, expect, it, vi } from "vitest";
import { parseNoticeArgs } from "../scripts/notify-premium-dm-change";
import { NoticeCopyNotApprovedError, NoticeEmailNotConfiguredError, planNoticeAudience, runPremiumDmChangeNotice, type EmailOutcome, type NoticeGiftRow, type NoticeMailer, type NoticeStore, type NoticeWalletRow } from "./premiumDmChangeNotice";

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

function memoryStore(wallets: readonly NoticeWalletRow[], gifts: readonly NoticeGiftRow[] = []) {
  const notifications = new Map<string, number>();
  const outcomes: Array<{ eventKey: string; outcome: EmailOutcome; reason: string }> = [];
  const writes = { notifications: 0, outcomes: 0 };
  const store: NoticeStore = {
    listPaidWallets: async () => wallets,
    giftsForSubscriptions: async ids => gifts.filter(gift => ids.includes(gift.subscriptionId)),
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

  it("offers credits only when nobody in the person's active plans paid for it themselves (D-020)", () => {
    const gift = (subscriptionId: string, buyerUserId: number | null, buyerCanonicalPersonId: number | null = null): NoticeGiftRow => ({ subscriptionId, buyerUserId, buyerCanonicalPersonId });
    const gifts: NoticeGiftRow[] = [gift("sub_1", 99), gift("sub_3", 98), gift("sub_10", 10), gift("sub_11", 40, 12), gift("sub_13", null)];
    const audience = planNoticeAudience([...WALLETS, wallet({ userId: 10 }), wallet({ userId: 11, canonicalPersonId: 12 }), wallet({ userId: 13 })], NOW, gifts);
    const offer = (userId: number) => audience.find(r => r.userId === userId)?.offer;
    expect(offer(1)).toBe("credits_only"); // a gift someone else bought
    expect(offer(2)).toBe("refund_or_credits"); // billed to them, no gift
    expect(offer(3)).toBe("refund_or_credits"); // person 7: one gifted plan, one paid plan
    expect(offer(5)).toBe("credits_only"); // never billed through a provider
    expect(offer(10)).toBe("refund_or_credits"); // a gift they bought for themselves: they paid
    expect(offer(11)).toBe("refund_or_credits"); // bought from another login (user 40) of the same person 12
    expect(offer(13)).toBe("credits_only"); // a gift whose buyer was not signed in
    expect(audience.find(r => r.userId === 1)?.gifted).toBe(true);
    expect(audience.find(r => r.userId === 10)?.gifted).toBe(false);
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
    expect(report.audience).toMatchObject({ subscribers: 4, pro: 2, max: 2, renewing: 3, endingAtTermEnd: 1, withEmail: 3, withoutEmail: 1, alreadyNotified: 0, refundOrCredits: 3, creditsOnly: 1, gifted: 0 });
    const printed = JSON.stringify(report);
    expect(printed).not.toMatch(/@example\.test/);
    expect(report.copy.byOffer.refund_or_credits.email.text).toContain("From 20 October 2026");
    expect(report.copy.byOffer.credits_only.email.text).toContain("From 20 October 2026");
  });

  it("defaults the dry run to dry-run mode and today's date", () => {
    expect(parseNoticeArgs([], NOW)).toEqual({ mode: "dry-run", effectiveDate: "2026-10-15", creditsOnlyCopyApproved: false });
    expect(parseNoticeArgs(["--effective-date", "2026-10-20", "--apply"], NOW)).toEqual({ mode: "apply", effectiveDate: "2026-10-20", creditsOnlyCopyApproved: false });
    expect(parseNoticeArgs(["--apply", "--credits-only-copy-approved", "--effective-date", "2026-10-20"], NOW)).toEqual({ mode: "apply", effectiveDate: "2026-10-20", creditsOnlyCopyApproved: true });
    expect(() => parseNoticeArgs(["--apply"], NOW)).toThrow(/--effective-date/);
    expect(() => parseNoticeArgs(["--apply", "--resend-failed", "--effective-date", "2026-10-20"], NOW)).toThrow(/either/);
    expect(() => parseNoticeArgs(["--send"], NOW)).toThrow(/Unknown option/);
  });
});

describe("D-012 premium DM change notice: apply", () => {
  it("creates one notification and one email per subscriber, and a re-run adds nothing", async () => {
    const memory = memoryStore(WALLETS);
    const mailer = okMailer();
    const first = await runPremiumDmChangeNotice(memory.store, mailer, { mode: "apply", effectiveDate: "2026-10-20", now: NOW, creditsOnlyCopyApproved: true });
    expect(first.results).toMatchObject({ notificationsCreated: 4, emailsSent: 3, emailsFailed: 0, emailsSkippedNoAddress: 1 });
    expect(mailer).toHaveBeenCalledTimes(3);
    expect(mailer.mock.calls.map(([input]) => input.to)).toEqual(["user1@example.test", "user2@example.test", "user3@example.test"]);
    const second = await runPremiumDmChangeNotice(memory.store, mailer, { mode: "apply", effectiveDate: "2026-10-20", now: NOW, creditsOnlyCopyApproved: true });
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

  it("sends each person the copy for their offer: credits only for a gifted plan", async () => {
    const memory = memoryStore([wallet({ userId: 1 }), wallet({ userId: 2 })], [{ subscriptionId: "sub_2", buyerUserId: 50, buyerCanonicalPersonId: 51 }]);
    const mailer = okMailer();
    const bodies = new Map<number, string>();
    const store: NoticeStore = { ...memory.store, insertNotificationOnce: async input => { bodies.set(input.userId, input.body); return memory.store.insertNotificationOnce(input); } };
    await runPremiumDmChangeNotice(store, mailer, { mode: "apply", effectiveDate: "2026-10-20", now: NOW, creditsOnlyCopyApproved: true });
    const email = (to: string) => mailer.mock.calls.map(([input]) => input).find(input => input.to === to)?.text ?? "";
    expect(email("user1@example.test")).toMatch(/pro-rata refund/);
    expect(email("user2@example.test")).not.toMatch(/refund/i);
    expect(email("user2@example.test")).toMatch(/bonus referral credits equal in value/);
    expect(bodies.get(1)).toMatch(/pro-rata refund/);
    expect(bodies.get(2)).not.toMatch(/refund/i);
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

describe("D-012 premium DM change notice: unapproved credits-only copy (D-020)", () => {
  const gifted = (): NoticeGiftRow[] => [{ subscriptionId: "sub_2", buyerUserId: 50, buyerCanonicalPersonId: 51 }];

  it("refuses --apply before any write while someone would get the credits-only text", async () => {
    const memory = memoryStore(WALLETS);
    const mailer = okMailer();
    const run = runPremiumDmChangeNotice(memory.store, mailer, { mode: "apply", effectiveDate: "2026-10-20", now: NOW });
    await expect(run).rejects.toBeInstanceOf(NoticeCopyNotApprovedError);
    await expect(run).rejects.toMatchObject({ creditsOnlyRecipients: 1, message: expect.stringMatching(/--credits-only-copy-approved/) });
    expect(mailer).not.toHaveBeenCalled();
    expect(memory.writes).toEqual({ notifications: 0, outcomes: 0 });
    await expect(runPremiumDmChangeNotice(memory.store, mailer, { mode: "apply", effectiveDate: "2026-10-20", now: NOW, creditsOnlyCopyApproved: false })).rejects.toBeInstanceOf(NoticeCopyNotApprovedError);
    expect(memory.writes).toEqual({ notifications: 0, outcomes: 0 });
  });

  it("refuses --resend-failed for a failed credits-only email, and allows it for paid ones", async () => {
    const memory = memoryStore([wallet({ userId: 1 }), wallet({ userId: 2 })], gifted());
    const failing = vi.fn<NoticeMailer>(async () => ({ sent: false, reason: "delivery_failed" as const }));
    await runPremiumDmChangeNotice(memory.store, failing, { mode: "apply", effectiveDate: "2026-10-20", now: NOW, creditsOnlyCopyApproved: true });
    const mailer = okMailer();
    await expect(runPremiumDmChangeNotice(memory.store, mailer, { mode: "resend-failed", effectiveDate: "2026-10-20", now: NOW })).rejects.toMatchObject({ creditsOnlyRecipients: 1 });
    expect(mailer).not.toHaveBeenCalled();
    const paidOnly = memoryStore([wallet({ userId: 1 }), wallet({ userId: 2 })], gifted());
    await runPremiumDmChangeNotice(paidOnly.store, failing, { mode: "apply", effectiveDate: "2026-10-20", now: NOW, creditsOnlyCopyApproved: true });
    paidOnly.outcomes.push({ eventKey: "d012-dm-change:u2", outcome: "success", reason: "sent" });
    expect((await runPremiumDmChangeNotice(paidOnly.store, mailer, { mode: "resend-failed", effectiveDate: "2026-10-20", now: NOW })).results).toMatchObject({ emailsSent: 1 });
    expect(mailer.mock.calls.map(([input]) => input.to)).toEqual(["user1@example.test"]);
  });

  it("lets a paid-only run proceed when every credits-only person was already notified", async () => {
    const memory = memoryStore([wallet({ userId: 1 }), wallet({ userId: 2 })], gifted());
    memory.notifications.set("d012-dm-change:u2", 2);
    memory.outcomes.push({ eventKey: "d012-dm-change:u2", outcome: "success", reason: "sent" });
    const mailer = okMailer();
    expect((await runPremiumDmChangeNotice(memory.store, mailer, { mode: "apply", effectiveDate: "2026-10-20", now: NOW })).results).toMatchObject({ notificationsCreated: 1, emailsSent: 1, alreadyNotifiedAndEmailed: 1 });
  });
});
