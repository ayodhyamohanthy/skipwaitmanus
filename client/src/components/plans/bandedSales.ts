// BANDED-ui (D-367): what /plans may sell comes only from the server's answer
// to GET /api/chargebee/banded/offer, never a client flag or a guess. Buying
// posts the plan or extra-referral checkout with a fresh idempotency key and
// the billing route, then opens the provider's hosted page. Amounts are the
// server's: the client sends a plan id or levels and quantities only.
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BANDED_REFUSALS, bandedOfferResponseSchema, checkoutResponseSchema, type BandedOfferResponse } from "@shared/subscriptionManagement";
import { REFERRER_PURCHASE_REFUSED_CODE } from "@shared/referrerPurchases";
import type { PlanFamilyId, PlanPriceBook, ReferralLevel } from "@shared/planFamily";
import { openChargebeeCheckout } from "@/lib/chargebeeCheckout";
import { clearPendingCheckout } from "./PlansKitSections";

export const BANDED_OFFER_PATH = "/api/chargebee/banded/offer";
export const BANDED_PLAN_CHECKOUT_PATH = "/api/chargebee/banded/plan-checkout";
export const BANDED_REFERRAL_CHECKOUT_PATH = "/api/chargebee/banded/referral-checkout";

const NOTHING_CHARGED = "Nothing has been charged.";
type RefusalCode = (typeof BANDED_REFUSALS)[keyof typeof BANDED_REFUSALS] | typeof REFERRER_PURCHASE_REFUSED_CODE;

/** One plain line per refusal code in the contract (D-180: referral words only). */
export const BANDED_REFUSAL_COPY: Record<RefusalCode, string> = {
  not_on_sale: `These plans are not on sale yet. ${NOTHING_CHARGED}`,
  application_required: `This plan is by application. Apply and we’ll set it up with you. ${NOTHING_CHARGED}`,
  founding_full: `Founding places for this plan are taken. ${NOTHING_CHARGED}`,
  active_subscription: `You already have a plan. Manage it from Billing. ${NOTHING_CHARGED}`,
  no_plan: `Extra referrals are for plan members. Choose a plan first. ${NOTHING_CHARGED}`,
  outside_band: `Your plan covers only the referral levels in its band. ${NOTHING_CHARGED}`,
  not_available_yet: `This isn’t on sale yet. Try again later. ${NOTHING_CHARGED}`,
  checkout_key_used: `That checkout was already started. Try again to open a new one. ${NOTHING_CHARGED}`,
  referrers_never_pay: `Referrers never pay on skipwait.me. ${NOTHING_CHARGED}`,
};

export const BANDED_NETWORK_LINE = `We couldn’t reach skipwait.me. Check your connection and try again. ${NOTHING_CHARGED}`;
const STATUS_LINE: Record<number, string> = {
  400: `We couldn’t start that checkout. Refresh the page and try again. ${NOTHING_CHARGED}`,
  401: `Sign in to continue. ${NOTHING_CHARGED}`,
  503: `Payments are not available right now. Try again in a moment. ${NOTHING_CHARGED}`,
};
const FALLBACK_LINE = `We couldn’t open the secure checkout. Try again. ${NOTHING_CHARGED}`;

function isRefusalCode(code: unknown): code is RefusalCode {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(BANDED_REFUSAL_COPY, code);
}

/** The line a failed checkout shows: the refusal code's line, else the status line, else the fallback. */
export function bandedFailureLine(status: number, code: unknown): string {
  if (isRefusalCode(code)) return BANDED_REFUSAL_COPY[code];
  return STATUS_LINE[status] ?? FALLBACK_LINE;
}

/** A v4 UUID for one checkout attempt (the contract's idempotencyKey). */
export function newCheckoutKey(): string {
  const cryptoRef = globalThis.crypto;
  if (typeof cryptoRef?.randomUUID === "function") return cryptoRef.randomUUID();
  const bytes = cryptoRef.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A load failure the page renders with a retry; network failures get their own words. */
export class BandedOfferError extends Error {}
export const BANDED_OFFER_ERROR = "Nothing is charged. Try again in a moment.";
export const BANDED_OFFER_NETWORK = "We couldn’t reach skipwait.me. Check your connection and try again.";

const authHeaders = (token: string | null): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

export async function fetchBandedOffer(getToken: () => Promise<string | null>): Promise<BandedOfferResponse> {
  let response: Response;
  try {
    response = await fetch(BANDED_OFFER_PATH, { credentials: "include", headers: authHeaders(await getToken()) });
  } catch {
    throw new BandedOfferError(BANDED_OFFER_NETWORK);
  }
  const payload: unknown = await response.json().catch(() => null);
  // The route answers 200 {onSale:false} while sales are off; a 409 not_on_sale means the same.
  if (response.status === 409 && typeof payload === "object" && payload !== null && Reflect.get(payload, "code") === BANDED_REFUSALS.notOnSale) return { onSale: false };
  if (!response.ok) throw new BandedOfferError(BANDED_OFFER_ERROR);
  const parsed = bandedOfferResponseSchema.safeParse(payload);
  if (!parsed.success) throw new BandedOfferError(BANDED_OFFER_ERROR);
  return parsed.data;
}

export type BandedOfferState =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; offer: BandedOfferResponse };

export type BandedCartItem = { level: ReferralLevel; quantity: number };
export const EXTRAS_KEY = "referrals";
export const planKey = (planId: PlanFamilyId) => `plan:${planId}`;

export type BandedSales = {
  offer: BandedOfferState;
  book: PlanPriceBook;
  /** The item key whose checkout is opening, or null. */
  buying: string | null;
  failure: { key: string; message: string } | null;
  buyPlan: (planId: PlanFamilyId) => Promise<void>;
  buyReferrals: (items: BandedCartItem[]) => Promise<void>;
};

export const bandedOfferKey = (signedIn: boolean) => ["banded-offer", signedIn] as const;

export function useBandedSales(input: { book: PlanPriceBook; isSignedIn: boolean; getToken: () => Promise<string | null>; openSignIn: () => void; enabled?: boolean }): BandedSales {
  const queryClient = useQueryClient();
  const query = useQuery<BandedOfferResponse, Error>({
    queryKey: bandedOfferKey(input.isSignedIn),
    queryFn: () => fetchBandedOffer(input.getToken),
    enabled: input.enabled ?? true,
    staleTime: 60_000,
    retry: false,
  });
  const [buying, setBuying] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  // One key per attempt: a retry after a lost answer reuses it (the server replays the same page and
  // founding place); a definitive answer or a different cart starts the next attempt with a new key.
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const billingCountry = input.book === "INR" ? "IN" : "INTL";

  const keyFor = (fingerprint: string) => {
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newCheckoutKey() };
    return attempt.current.key;
  };

  const start = async (itemKey: string, path: string, fields: Record<string, unknown>): Promise<void> => {
    if (!input.isSignedIn) { input.openSignIn(); return; }
    if (buying !== null) return;
    const fingerprint = JSON.stringify([path, billingCountry, fields]);
    const body = { ...fields, billingCountry, idempotencyKey: keyFor(fingerprint) };
    setBuying(itemKey);
    setFailure(null);
    try {
      let response: Response;
      try {
        response = await fetch(path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...authHeaders(await input.getToken()) }, body: JSON.stringify(body) });
      } catch {
        setFailure({ key: itemKey, message: BANDED_NETWORK_LINE });
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      const hosted = response.ok ? checkoutResponseSchema.safeParse(payload) : null;
      if (hosted?.success) {
        attempt.current = null;
        // The return lands on /plans?payment=pending; the legacy pass recovery must not run for a banded page.
        clearPendingCheckout();
        openChargebeeCheckout(hosted.data.checkoutUrl);
        return;
      }
      const code = typeof payload === "object" && payload !== null ? Reflect.get(payload, "code") : undefined;
      // A lost or failed answer keeps the key for the retry; any other answer is final for this attempt.
      if (response.status < 500) attempt.current = null;
      if (response.status === 401) input.openSignIn();
      setFailure({ key: itemKey, message: bandedFailureLine(response.status, code) });
      // The offer may have changed under us (sold out, switched off, a plan bought elsewhere): reload it.
      if (response.status === 409 || response.status === 403) void queryClient.invalidateQueries({ queryKey: ["banded-offer"] });
    } finally {
      setBuying(null);
    }
  };

  const offer: BandedOfferState = query.isPending
    ? { status: "loading" }
    : query.isError
      ? { status: "error", message: query.error instanceof BandedOfferError ? query.error.message : BANDED_OFFER_ERROR, retry: () => void query.refetch() }
      : { status: "ready", offer: query.data };

  return {
    offer,
    book: input.book,
    buying,
    failure,
    buyPlan: planId => start(planKey(planId), BANDED_PLAN_CHECKOUT_PATH, { planId }),
    buyReferrals: items => start(EXTRAS_KEY, BANDED_REFERRAL_CHECKOUT_PATH, { items: items.filter(item => item.quantity > 0) }),
  };
}
