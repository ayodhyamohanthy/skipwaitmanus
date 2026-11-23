import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildSkippieMoneyCard } from "./skippieMoneyCards";
import { advanceSkippieSeeker, type SkippieSeekerDeps, type SkippieSession } from "./skippieSeeker";

const NOW = 1_760_000_000_000;
const KEY = "11111111-1111-4111-8111-111111111111";
const NOTE = "I built Node.js services at Acme and would like a referral for this role.";
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

function quoteSession(over: Partial<SkippieSession> = {}): SkippieSession {
  return {
    step: "quote",
    idempotencyKey: "session-key",
    targetRoleUrl: "https://acme.com/jobs/1",
    attachmentId: 11,
    note: NOTE,
    noteSha256: sha256(NOTE),
    quote: { level: 5, cost: 1, totalAvailable: 0, shortfall: 1 },
    ...over,
  };
}

function deps(over: Partial<SkippieSeekerDeps> = {}): SkippieSeekerDeps {
  return {
    previewJob: vi.fn(),
    fetchJobText: vi.fn(),
    extractResumeText: vi.fn(),
    analyzeFit: vi.fn(),
    getQuote: vi.fn(async () => ({ level: 5, cost: 1, totalAvailable: 0, shortfall: 1 })),
    getOwnedResume: vi.fn(),
    createAsk: vi.fn(),
    saveTailoredResume: vi.fn(),
    getBandedOffer: vi.fn(async () => ({ onSale: true })),
    createMoneyCard: vi.fn(input => buildSkippieMoneyCard({ ...input, id: "card-1", idempotencyKey: KEY, now: NOW })),
    ...over,
  };
}

describe("Skippy step 3: buying extra referrals in the chat", () => {
  it("offers no card when the seeker already has enough referrals", async () => {
    const d = deps();
    const out = await advanceSkippieSeeker(7, quoteSession({ quote: { level: 5, cost: 1, totalAvailable: 1, shortfall: 0 } }), { kind: "buy_referrals", billingCountry: "IN" }, d);
    expect(d.createMoneyCard).not.toHaveBeenCalled();
    expect(out.session.moneyCard).toBeUndefined();
    expect(out.replies.join(" ")).toMatch(/enough referrals/i);
  });

  it("offers no card while extra referrals are off sale, and points at /plans", async () => {
    const d = deps({ getBandedOffer: vi.fn(async () => ({ onSale: false })) });
    const out = await advanceSkippieSeeker(7, quoteSession(), { kind: "buy_referrals", billingCountry: "IN" }, d);
    expect(d.createMoneyCard).not.toHaveBeenCalled();
    expect(out.session.moneyCard).toBeUndefined();
    const text = out.replies.join(" ");
    expect(text).toMatch(/not on sale yet/i);
    expect(text).toContain("/plans");
    expect(text).toMatch(/nothing has been charged/i);
  });

  it("creates a card for the quote's own level and shortfall, with the exact total", async () => {
    const d = deps();
    const out = await advanceSkippieSeeker(7, quoteSession(), { kind: "buy_referrals", billingCountry: "IN" }, d);
    expect(d.createMoneyCard).toHaveBeenCalledWith({ userId: 7, level: 5, quantity: 1, billingCountry: "IN" });
    expect(out.session.moneyCard).toMatchObject({ id: "card-1", level: 5, quantity: 1, currency: "INR" });
    const text = out.replies.join(" ");
    expect(text).toContain("1 Senior referral");
    expect(text).toContain("₹");
    expect(text).toMatch(/Chargebee's secure page/);
    expect(text).toContain("skipwait.me/refunds");
    expect(text).not.toMatch(/credit/i);
  });

  it("says nothing was charged when the payment is cancelled", async () => {
    const d = deps();
    const out = await advanceSkippieSeeker(7, quoteSession({ moneyCard: { id: "card-1", level: 5, quantity: 1, currency: "INR", unitAmount: 39900, subtotal: 39900, discountPct: 0, discount: 0, total: 39900, expiresAt: new Date(NOW).toISOString() } }), { kind: "confirm_referrals", outcome: "cancelled" }, d);
    expect(out.session.step).toBe("quote");
    expect(out.session.moneyCard).toBeUndefined();
    expect(out.replies.join(" ")).toBe("Payment didn't go through. Nothing was charged.");
  });

  it("continues at the quote once the credited referrals arrive", async () => {
    const d = deps({ getQuote: vi.fn(async () => ({ level: 5, cost: 1, totalAvailable: 1, shortfall: 0 })) });
    const out = await advanceSkippieSeeker(7, quoteSession(), { kind: "confirm_referrals", outcome: "pending" }, d);
    expect(out.session.step).toBe("quote");
    expect(out.session.quote?.shortfall).toBe(0);
    expect(out.session.moneyCard).toBeUndefined();
    expect(out.replies.join(" ")).toMatch(/extra referrals are in/i);
    expect(out.replies.join(" ")).toMatch(/Send it\?/);
  });

  it("keeps waiting while the payment is still unconfirmed", async () => {
    const d = deps();
    const out = await advanceSkippieSeeker(7, quoteSession(), { kind: "confirm_referrals", outcome: "pending" }, d);
    expect(out.session.step).toBe("quote");
    expect(out.replies.join(" ")).toMatch(/still confirming/i);
    expect(out.replies.join(" ")).toMatch(/nothing more is charged/i);
  });
});
