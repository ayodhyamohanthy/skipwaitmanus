// Kit checkout from /plans (GO-LIVE-1 C4). A Buy press posts the kit body built
// from the one catalog response on screen, so the currency and the billing
// country always agree, with the bearer token and cookies like the page's other
// calls. The server decides every amount and refuses before any provider call;
// on 200 the page stores { hostedPageId, role } for the return-page recovery
// (client/src/lib/pendingCheckout.ts) and opens the provider's hosted page.
// Every refusal is shown in plain words and says nothing was charged.
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { PlanCatalogResponse } from "@shared/billingCatalog";
import type { CatalogInterval, CatalogPackId, CatalogPlanId } from "@shared/planCatalog";
import { checkoutResponseSchema, kitPlanCheckoutRequestSchema, packCheckoutRequestSchema, type KitPlanCheckoutRequest, type PackCheckoutRequest } from "@shared/subscriptionManagement";
import { readApiJson } from "@/lib/apiResponse";
import { openChargebeeCheckout } from "@/lib/chargebeeCheckout";
import { savePendingCheckout } from "@/lib/pendingCheckout";
import { captureClientError } from "@/lib/sentry";
import { NETWORK_ERROR } from "./billingApi";

export const NOT_ON_SALE_ERROR = "Not on sale yet. Nothing has been charged.";
export const PAYMENTS_DOWN_ERROR = "Payments are not available right now. Nothing has been charged.";
export const CHECKOUT_ERROR = "We couldn't start checkout. Nothing has been charged.";

export type KitPurchase = { kind: "pack"; packId: CatalogPackId } | { kind: "plan"; planId: CatalogPlanId; interval: CatalogInterval };
export type CheckoutFailure = { kind: KitPurchase["kind"]; message: string };

type CheckoutRequest = { path: "/api/chargebee/checkout"; body: PackCheckoutRequest } | { path: "/api/chargebee/subscription-checkout"; body: KitPlanCheckoutRequest };
type Outcome = { ok: true; checkoutUrl: string; hostedPageId: string } | { ok: false; notAvailable: boolean; message: string };

const refusalSchema = z.object({ error: z.string().min(1) });
const SAYS_NOTHING_CHARGED = /nothing (?:has been|was) charged/i;

/** A refusal in the server's own words, always saying nothing was charged (never twice). */
function refusalMessage(serverError: string): string {
  const sentence = serverError.trim();
  if (SAYS_NOTHING_CHARGED.test(sentence)) return sentence;
  return `${sentence}${/[.!?]$/.test(sentence) ? "" : "."} Nothing has been charged.`;
}

/** One key per buyable item, so a card can show that its own press is sending. */
export function purchaseKey(purchase: KitPurchase): string {
  return purchase.kind === "pack" ? purchase.packId : `${purchase.planId}:${purchase.interval}`;
}

/** The endpoint and body for one purchase from the catalog on screen; null when it would not pass the server's contract. */
export function kitCheckoutRequest(purchase: KitPurchase, catalog: PlanCatalogResponse): CheckoutRequest | null {
  if (purchase.kind === "pack") {
    const body = packCheckoutRequestSchema.safeParse({ packId: purchase.packId, billingCountry: catalog.region, role: "job_seeker" });
    return body.success ? { path: "/api/chargebee/checkout", body: body.data } : null;
  }
  const body = kitPlanCheckoutRequestSchema.safeParse({ planId: purchase.planId, interval: purchase.interval, currency: catalog.currency, billingCountry: catalog.region, role: "job_seeker" });
  return body.success ? { path: "/api/chargebee/subscription-checkout", body: body.data } : null;
}

async function postCheckout(request: CheckoutRequest, token: string | null | undefined): Promise<Outcome> {
  let response: Response;
  try {
    response = await fetch(request.path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(request.body) });
  } catch {
    return { ok: false, notAvailable: false, message: NETWORK_ERROR };
  }
  let payload: Record<string, unknown> = {};
  try { payload = await readApiJson<Record<string, unknown>>(response, CHECKOUT_ERROR); } catch { payload = {}; }
  if (response.ok) {
    const parsed = checkoutResponseSchema.safeParse(payload);
    if (parsed.success) return { ok: true, ...parsed.data };
    captureClientError(new Error("Kit checkout answered without a hosted page"), { source: "plans-checkout", status: response.status });
    return { ok: false, notAvailable: false, message: CHECKOUT_ERROR };
  }
  if (response.status === 409) return { ok: false, notAvailable: true, message: NOT_ON_SALE_ERROR };
  if (response.status === 503) return { ok: false, notAvailable: false, message: PAYMENTS_DOWN_ERROR };
  // A server or provider failure (for example the 502 when the provider's checkout call fails) reads the plain fallback.
  if (response.status >= 500) return { ok: false, notAvailable: false, message: CHECKOUT_ERROR };
  const refusal = refusalSchema.safeParse(payload);
  return { ok: false, notAvailable: false, message: refusal.success ? refusalMessage(refusal.data.error) : CHECKOUT_ERROR };
}

type KitCheckoutInput = {
  catalog: PlanCatalogResponse | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  getToken: () => Promise<string | null | undefined>;
  openSignIn: (options: { returnTo: string }) => void;
  /** A 409: the item went off sale, so the screen refreshes the catalog. */
  onNotAvailable: () => void;
};

/**
 * One purchase at a time: every Buy is disabled while one is sending, and a
 * second press reuses the request in flight. After a hosted page opens the
 * request stays in flight (the page is leaving); a back-navigation restore
 * from the browser cache clears it.
 */
export function useKitCheckout(input: KitCheckoutInput) {
  const inFlight = useRef<Promise<void> | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [failure, setFailure] = useState<CheckoutFailure | null>(null);

  useEffect(() => {
    const restored = (event: PageTransitionEvent) => { if (event.persisted) { inFlight.current = null; setSending(null); } };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);

  const buy = (purchase: KitPurchase): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const { catalog } = input;
    if (!catalog || !input.isLoaded) return Promise.resolve();
    if (!input.isSignedIn) {
      input.openSignIn({ returnTo: `/plans?role=job_seeker&currency=${catalog.currency}#credits` });
      return Promise.resolve();
    }
    const request = kitCheckoutRequest(purchase, catalog);
    if (!request) {
      setFailure({ kind: purchase.kind, message: CHECKOUT_ERROR });
      return Promise.resolve();
    }
    const fail = (outcome: CheckoutFailure, notAvailable: boolean) => {
      inFlight.current = null;
      setSending(null);
      setFailure(outcome);
      if (notAvailable) input.onNotAvailable();
    };
    setFailure(null);
    setSending(purchaseKey(purchase));
    const run = (async () => {
      try {
        const outcome = await postCheckout(request, await input.getToken());
        if (!outcome.ok) return fail({ kind: purchase.kind, message: outcome.message }, outcome.notAvailable);
        savePendingCheckout({ hostedPageId: outcome.hostedPageId, role: "job_seeker" });
        openChargebeeCheckout(outcome.checkoutUrl);
      } catch (error) {
        captureClientError(error, { source: "plans-checkout" });
        fail({ kind: purchase.kind, message: CHECKOUT_ERROR }, false);
      }
    })();
    inFlight.current = run;
    return run;
  };

  return { buy, sending, failure };
}
