// D-065 daily money check: the job reconciles, reports, and never writes.
import { describe, expect, it, vi } from "vitest";
import { createDailyMoneyCheck, FINDINGS_EMAIL_LINE_LIMIT, type DailyMoneyCheckDeps } from "./dailyMoneyCheck";

const NOW = new Date("2026-10-19T02:00:00Z");
const DAY = 24 * 60 * 60_000;

type Sent = { subject: string; text: string };

function makeDeps(overrides: Partial<DailyMoneyCheckDeps> = {}) {
  const sent: Sent[] = [];
  const activity: Array<{ action: string; outcome: string }> = [];
  const deps: DailyMoneyCheckDeps = {
    auditWallets: vi.fn(async () => ({ checkedWallets: 3, mismatches: [], integrity: [] })),
    listCreditedPayments: vi.fn(async () => []),
    countPaymentCreditRows: vi.fn(async () => []),
    listParkedPayments: vi.fn(async () => []),
    listUnmatchedRefunds: vi.fn(async () => []),
    listStaleCheckouts: vi.fn(async () => []),
    sendEmail: vi.fn(async (input: Sent) => { sent.push(input); return true; }),
    recordActivity: vi.fn(async (row: { action: string }) => { activity.push(row as { action: string; outcome: string }); }),
    ...overrides,
  };
  return { deps, sent, activity };
}

const runJob = (deps: DailyMoneyCheckDeps) => createDailyMoneyCheck(deps)({ nowMs: NOW.getTime(), windowKey: "2026-10-19T02:00Z" });

describe("daily-money-check (D-065)", () => {
  it("a clean ledger sends no email and writes no activity row", async () => {
    const { deps, sent, activity } = makeDeps();
    const output = await runJob(deps);
    expect(output).toEqual({ processed: 3, failed: 0 });
    expect(sent).toEqual([]);
    expect(activity).toEqual([]);
  });

  it("wallet mismatches and integrity faults reach the owner email with their detail", async () => {
    const { deps, sent } = makeDeps({
      auditWallets: vi.fn(async () => ({
        checkedWallets: 2,
        mismatches: [{ userId: 7, role: "job_seeker", bucket: "purchased_balance", expected: 3, actual: 2, delta: -1 }],
        integrity: [{ type: "negative_bucket", userId: 9, role: "job_seeker" }],
      })),
    });
    const output = await runJob(deps);
    expect(output.failed).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("skipwait.me daily money check · 2 findings");
    expect(sent[0]!.text).toContain('"bucket":"purchased_balance"');
    expect(sent[0]!.text).toContain('"type":"negative_bucket"');
    expect(sent[0]!.text).toContain("Wallets checked: 2.");
    expect(sent[0]!.text).not.toContain("@"); // no personal data, ids and amounts only
  });

  it("flags a credited payment with no purchase row, a duplicate row, and a short credit", async () => {
    const { deps, sent } = makeDeps({
      listCreditedPayments: vi.fn(async (afterId: number) =>
        afterId === 0 ? [
          { id: 11, userId: 1, role: "job_seeker", tokenCount: 4 },
          { id: 12, userId: 2, role: "job_seeker", tokenCount: 4 },
          { id: 13, userId: 3, role: "job_seeker", tokenCount: 4 },
          { id: 14, userId: 4, role: "job_seeker", tokenCount: 4 },
        ] : []),
      countPaymentCreditRows: vi.fn(async () => [
        { paymentId: 12, creditRows: 2, creditedTokens: 8 },
        { paymentId: 13, creditRows: 1, creditedTokens: 2 },
        { paymentId: 14, creditRows: 1, creditedTokens: 4 },
      ]),
    });
    const output = await runJob(deps);
    expect(output.processed).toBe(3 + 4);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("skipwait.me daily money check · 3 findings");
    expect(sent[0]!.text).toContain("payment #11 expects one purchase row for 4 credits, found 0 row(s)");
    expect(sent[0]!.text).toContain("payment #12 expects one purchase row for 4 credits, found 2 row(s)");
    expect(sent[0]!.text).toContain("payment #13 expects one purchase row for 4 credits, found 1 row(s) totaling 2");
    expect(sent[0]!.text).not.toContain("payment #14");
  });

  it("pages credited payments until a short batch", async () => {
    const first = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, userId: 1, role: "job_seeker", tokenCount: 1 }));
    const calls: number[] = [];
    const { deps, sent } = makeDeps({
      listCreditedPayments: vi.fn(async (afterId: number) => { calls.push(afterId); return afterId === 0 ? first : afterId === 200 ? [{ id: 201, userId: 1, role: "job_seeker", tokenCount: 1 }] : []; }),
      countPaymentCreditRows: vi.fn(async (ids: number[]) => ids.map(id => ({ paymentId: id, creditRows: 1, creditedTokens: 1 }))),
    });
    const output = await runJob(deps);
    expect(calls).toEqual([0, 200]); // the short second batch is the last page
    expect(output.processed).toBe(3 + 201);
    expect(sent).toEqual([]);
  });

  it("lists parked payments, unmatched refunds and day-old checkouts, but not fresh pending ones", async () => {
    const staleSeen: Date[] = [];
    const { deps, sent } = makeDeps({
      listParkedPayments: vi.fn(async () => [{ id: 21, amount: 9900, currency: "INR", reconciliationReason: "checkout_amount_mismatch", createdAt: new Date("2026-10-17T10:00:00Z") }]),
      listUnmatchedRefunds: vi.fn(async () => [{ logId: 31, resourceId: "inv_123", createdAt: new Date("2026-10-18T11:00:00Z") }]),
      listStaleCheckouts: vi.fn(async (olderThan: Date) => { staleSeen.push(olderThan); return [{ id: 41, amount: 9900, currency: "INR", createdAt: new Date("2026-10-17T01:00:00Z") }]; }),
    });
    await runJob(deps);
    expect(staleSeen[0]!.getTime()).toBe(NOW.getTime() - DAY);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("parked payment: #21 9900 INR (checkout_amount_mismatch");
    expect(sent[0]!.text).toContain("unmatched refund: log #31 (inv_123");
    expect(sent[0]!.text).toContain("stale checkout: payment #41 9900 INR pending since 2026-10-17T01:00:00.000Z");
  });

  it("caps the email lines while the subject keeps the full count", async () => {
    const many = Array.from({ length: FINDINGS_EMAIL_LINE_LIMIT + 5 }, (_, i) => ({ userId: i + 1, role: "job_seeker", bucket: "purchased_balance", expected: 1, actual: 0, delta: -1 }));
    const { deps, sent } = makeDeps({
      auditWallets: vi.fn(async () => ({ checkedWallets: many.length, mismatches: many, integrity: [] })),
    });
    await runJob(deps);
    expect(sent[0]!.subject).toBe(`skipwait.me daily money check · ${FINDINGS_EMAIL_LINE_LIMIT + 5} findings`);
    expect(sent[0]!.text).toContain("...and 5 more finding(s) not shown here.");
  });

  it("fails the window when findings exist but the owner email cannot be sent", async () => {
    const { deps, sent, activity } = makeDeps({
      auditWallets: vi.fn(async () => ({ checkedWallets: 1, mismatches: [{ userId: 7, bucket: "purchased_balance" }], integrity: [] })),
      sendEmail: vi.fn(async (input: Sent) => { sent.push(input); return false; }),
    });
    const output = await runJob(deps);
    expect(output.failed).toBe(1);
    expect(String(output.firstError)).toContain("1 finding(s)");
    expect(activity).toEqual([expect.objectContaining({ action: "billing.daily_money_check_alert", outcome: "failure" })]);
  });
});
