/**
 * SKIPPY-3 (D-136 step 3, D-140, D-219/D-367): the one-use money card a seeker
 * approves inside Skippy before paying for extra referrals on Chargebee's page.
 *
 * The card is the quote (D-137): its level, quantity, currency, discount and
 * total come from `bandedReferralQuote` for the seeker's own price book, never
 * from the client. Approve re-reads the offer and recomputes the same quote; a
 * changed price refuses with "The price changed. Nothing was charged." The card
 * is one-use, belongs to the asking account, expires in 10 minutes, and carries
 * its own idempotency key, so a retried approve reuses one provider page.
 *
 * Cards live in process memory (packet ruling 3): a lost card only means asking
 * again, because the ledger, checkout intents and asks are durable. Nothing
 * here charges anything; the provider's hosted page does, and BANDED-grants
 * credits only a verified webhook.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { currencyForRegion, type BillingRegion } from "../shared/billingRegion";
import { LEVEL_DISPLAY_NAME, referralLevelForJobLevel, type JobLevelNumber } from "../shared/planFamily";
import { bandedReferralQuote, bandedReferralCheckoutRequestSchema, type BandedReferralCheckoutRequest } from "../shared/subscriptionManagement";

export const SKIPPIE_CARD_TTL_MS = 10 * 60_000;

/** The quote's level is a validated 1-10 job level; this narrows it for the one shared mapping. */
function asJobLevel(level: number): JobLevelNumber {
  if (!Number.isInteger(level) || level < 1 || level > 10) throw new Error(`unknown job level: ${String(level)}`);
  return level as JobLevelNumber;
}

export type SkippieMoneyCard = {
  id: string;
  userId: number;
  /** The job level the fresh banded quote showed for this request (1-10). */
  level: number;
  /** The quote's shortfall: the referrals this request still needs. */
  quantity: number;
  billingCountry: BillingRegion;
  currency: "INR" | "USD";
  unitAmount: number;
  subtotal: number;
  discountPct: number;
  discount: number;
  total: number;
  /** Sent to the provider as the checkout's idempotency key; a retry reuses the same page. */
  idempotencyKey: string;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
};

export type BuildMoneyCardInput = {
  userId: number;
  level: number;
  quantity: number;
  billingCountry: BillingRegion;
  id: string;
  idempotencyKey: string;
  now: number;
};

/** The card's amounts are the frozen banded quote for its own cart and price book. */
export function buildSkippieMoneyCard(input: BuildMoneyCardInput): SkippieMoneyCard {
  const currency = currencyForRegion(input.billingCountry);
  const quote = bandedReferralQuote([{ level: referralLevelForJobLevel(asJobLevel(input.level)), quantity: input.quantity }], currency);
  const line = quote.lines[0];
  return {
    id: input.id,
    userId: input.userId,
    level: input.level,
    quantity: input.quantity,
    billingCountry: input.billingCountry,
    currency,
    unitAmount: line?.unitAmount ?? 0,
    subtotal: quote.subtotal,
    discountPct: quote.discountPct,
    discount: quote.discount,
    total: quote.total,
    idempotencyKey: input.idempotencyKey,
    createdAt: input.now,
    expiresAt: input.now + SKIPPIE_CARD_TTL_MS,
    usedAt: null,
  };
}

export type CreateMoneyCardInput = { userId: number; level: number; quantity: number; billingCountry: BillingRegion };

export type SkippieCardStore = {
  create: (input: CreateMoneyCardInput) => SkippieMoneyCard;
  get: (id: string) => SkippieMoneyCard | undefined;
  /** True only for the first call on a live card; false when it was already used or is gone. */
  markUsed: (id: string, now: number) => boolean;
  size: () => number;
};

export function createSkippieCardStore(options: { now?: () => number; newId?: () => string; newKey?: () => string } = {}): SkippieCardStore {
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => randomBytes(18).toString("base64url"));
  const newKey = options.newKey ?? (() => randomUUID());
  const cards = new Map<string, SkippieMoneyCard>();
  const sweep = () => {
    const t = now();
    for (const [id, card] of Array.from(cards)) if (card.expiresAt <= t) cards.delete(id);
  };
  return {
    create: input => {
      sweep();
      const card = buildSkippieMoneyCard({ ...input, id: newId(), idempotencyKey: newKey(), now: now() });
      cards.set(card.id, card);
      return card;
    },
    get: id => {
      sweep();
      return cards.get(id);
    },
    markUsed: (id, at) => {
      const card = cards.get(id);
      if (!card || card.usedAt !== null || card.expiresAt <= at) return false;
      card.usedAt = at;
      return true;
    },
    size: () => cards.size,
  };
}

/** What the client may see of a card: no idempotency key, no internal timestamps. */
export type SkippieMoneyCardView = {
  id: string;
  level: number;
  quantity: number;
  currency: "INR" | "USD";
  unitAmount: number;
  subtotal: number;
  discountPct: number;
  discount: number;
  total: number;
  expiresAt: string;
};

export function moneyCardView(card: SkippieMoneyCard): SkippieMoneyCardView {
  return {
    id: card.id,
    level: card.level,
    quantity: card.quantity,
    currency: card.currency,
    unitAmount: card.unitAmount,
    subtotal: card.subtotal,
    discountPct: card.discountPct,
    discount: card.discount,
    total: card.total,
    expiresAt: new Date(card.expiresAt).toISOString(),
  };
}

/** Minor units -> "₹399" / "$4.49", the same shape the plans page prints. */
export function formatMinor(amountMinor: number, currency: string): string {
  const whole = amountMinor % 100 === 0;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(whole ? 0 : 2)} ${currency}`;
  }
}

/** The card's own line: level, number of referrals, exact total, discount and currency. */
export function moneyCardLine(card: SkippieMoneyCard): string {
  const level = LEVEL_DISPLAY_NAME[referralLevelForJobLevel(asJobLevel(card.level))];
  const referrals = `${card.quantity} ${level} referral${card.quantity === 1 ? "" : "s"}`;
  const discount = card.discount > 0 ? ` (${formatMinor(card.discount, card.currency)} off ${formatMinor(card.subtotal, card.currency)})` : "";
  return `${referrals} for ${formatMinor(card.total, card.currency)}${discount}. Payment happens on Chargebee's secure page.`;
}

/** The undo line: the same words /plans shows for extra referrals, with the refund page. */
export const MONEY_CARD_UNDO_LINE = "Refunds follow the refund policy: skipwait.me/refunds";

export type MoneyCardCheckoutResult =
  | { ok: true; checkoutUrl: string; hostedPageId: string }
  | { ok: false; status: number; code?: string; error: string };

export type ApproveMoneyCardDeps = {
  /** GET /api/chargebee/banded/offer's answer: no card is sold while extra referrals are off sale. */
  offer: () => Promise<{ onSale: boolean }>;
  /** The same server function the POST /api/chargebee/banded/referral-checkout route uses. */
  startCheckout: (input: { userId: number; request: BandedReferralCheckoutRequest; card: SkippieMoneyCard }) => Promise<MoneyCardCheckoutResult>;
  markUsed: (cardId: string, now: number) => boolean;
  now?: () => number;
};

const NOTHING_CHARGED = "Nothing has been charged.";
const notFound: MoneyCardCheckoutResult = { ok: false, status: 404, code: "card_not_found", error: `That payment card is not available. ${NOTHING_CHARGED}` };

/**
 * Approve one card: ownership, one use, expiry, the offer, then the exact quote.
 * The card is marked used before the provider call, so a concurrent or retried
 * approve can never open a second checkout for the same card.
 */
export async function approveSkippieMoneyCard(input: { card: SkippieMoneyCard | undefined; userId: number; deps: ApproveMoneyCardDeps }): Promise<MoneyCardCheckoutResult> {
  const { card, userId, deps } = input;
  const now = (deps.now ?? Date.now)();
  if (!card || card.userId !== userId) return notFound;
  if (card.usedAt !== null) return { ok: false, status: 409, code: "card_used", error: `This card was already used. ${NOTHING_CHARGED}` };
  if (card.expiresAt <= now) return { ok: false, status: 409, code: "card_expired", error: `This card expired. ${NOTHING_CHARGED} Ask Skippy for a fresh one.` };
  const offer = await deps.offer();
  if (!offer.onSale) return { ok: false, status: 409, code: "not_on_sale", error: `Extra referrals are not on sale yet. ${NOTHING_CHARGED}` };
  const fresh = buildSkippieMoneyCard({ userId: card.userId, level: card.level, quantity: card.quantity, billingCountry: card.billingCountry, id: card.id, idempotencyKey: card.idempotencyKey, now: card.createdAt });
  if (fresh.currency !== card.currency || fresh.total !== card.total || fresh.quantity !== card.quantity || fresh.level !== card.level) {
    return { ok: false, status: 409, code: "price_changed", error: "The price changed. Nothing was charged." };
  }
  if (!deps.markUsed(card.id, now)) return { ok: false, status: 409, code: "card_used", error: `This card was already used. ${NOTHING_CHARGED}` };
  const request = bandedReferralCheckoutRequestSchema.parse({
    items: [{ level: referralLevelForJobLevel(asJobLevel(card.level)), quantity: card.quantity }],
    billingCountry: card.billingCountry,
    idempotencyKey: card.idempotencyKey,
  });
  return deps.startCheckout({ userId, request, card });
}
