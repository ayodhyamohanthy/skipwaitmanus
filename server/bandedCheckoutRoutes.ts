/**
 * BANDED-checkout routes (D-367). While BANDED_SALES_ENABLED is off every
 * checkout route answers 409 not_on_sale first: before sign-in, a database read
 * or a provider call. The decision lives in server/bandedCheckout.ts.
 *
 * A plan checkout records a pending subscriptionCheckoutIntents row (the banded
 * ids are storable since 0123). Until BANDED-grants lands, a paid banded
 * subscription is parked for review as unsupported_plan, never credited. An
 * extra-referral checkout writes no legacy credit-pack intent, so the legacy
 * fulfilment can never add old credits for it; a paid one arrives unmatched and
 * alerts the owner until BANDED-grants credits it from the provider invoice.
 */
import type { Express, Request } from "express";
import { publicOutboundOrigin } from "./_core/authPostGuard";
import { PLAN_FAMILY, type PlanFamilyId } from "../shared/planFamily";
import { REFERRER_PURCHASE_REFUSED_CODE, REFERRER_PURCHASE_REFUSED_ERROR, isReferrerPurchaseRefused } from "../shared/referrerPurchases";
import { BANDED_REFUSALS, bandedOfferResponseSchema, bandedPlanCheckoutRequestSchema, bandedReferralCheckoutRequestSchema } from "../shared/subscriptionManagement";
import { BANDED_NOT_ON_SALE, bandedRuntime, bandedSalesEnabled, startBandedPlanCheckout, startBandedReferralCheckout, type BandedCheckoutDeps, type BandedRefusal } from "./bandedCheckout";
import type { ChargebeeIdentity } from "./chargebeeRoutes";

type Activity = { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number; metadata?: Record<string, string | number | boolean | null | undefined> };

export type BandedSubscriptionIntentInput = { hostedPageId: string; checkoutIntentId: string; userId: number; role: "job_seeker"; plan: PlanFamilyId; itemPriceId: string; amount: number; currency: "INR" | "USD" };

export type BandedRouteDeps = {
  resolveIdentity: (req: Request) => Promise<ChargebeeIdentity | undefined>;
  recordActivity?: (input: Activity) => Promise<void>;
  /** Unset when the server has not wired banded checkout: a switched-on route then answers 503. */
  checkout?: BandedCheckoutDeps;
  createSubscriptionIntent?: (input: BandedSubscriptionIntentInput) => Promise<unknown>;
};

const notOnSaleBody = { error: BANDED_NOT_ON_SALE.error, code: BANDED_REFUSALS.notOnSale };
const notConfigured = { error: "Plan checkout is not available right now. Nothing has been charged." };

function customerOf(identity: ChargebeeIdentity) {
  const [firstName, ...rest] = (identity.account.name ?? "").trim().split(/\s+/);
  return { email: identity.primaryEmail?.emailAddress ?? identity.account.email ?? undefined, firstName: firstName || undefined, lastName: rest.join(" ") || undefined };
}

function refusalBody(refusal: BandedRefusal): { error: string; code?: string } {
  return refusal.code ? { code: refusal.code, error: refusal.error } : { error: refusal.error };
}

export function registerBandedCheckoutRoutes(app: Express, deps: BandedRouteDeps) {
  const record = (input: Activity) => { void deps.recordActivity?.(input).catch(() => undefined); };
  const onSale = () => (deps.checkout?.salesEnabled ?? bandedSalesEnabled)();
  const urlsFor = (req: Request) => {
    const origin = publicOutboundOrigin(req);
    return { redirectUrl: `${origin}/plans?payment=pending`, cancelUrl: `${origin}/plans?payment=cancelled` };
  };
  const refused = (actorUserId: number, kind: "plan" | "referral", refusal: BandedRefusal) =>
    record({ actorUserId, action: "billing.banded_checkout_refused", outcome: "denied", resourceType: "banded_checkout", metadata: { kind, reason: refusal.code ?? `http_${refusal.status}` } });

  app.get("/api/chargebee/banded/offer", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (!onSale()) return res.json(bandedOfferResponseSchema.parse({ onSale: false }));
    const checkout = deps.checkout;
    const runtime = checkout ? bandedRuntime(checkout) : null;
    if (!checkout || !runtime) return res.status(503).json(notConfigured);
    try {
      const identity = await deps.resolveIdentity(req).catch(() => undefined);
      const now = (checkout.now ?? (() => new Date()))();
      const [left, membership] = await Promise.all([checkout.foundingPlacesLeft(runtime.environment, now), identity ? checkout.membership(identity.account.id) : Promise.resolve(null)]);
      return res.json(bandedOfferResponseSchema.parse({
        onSale: true,
        memberPlan: membership?.bandedPlan ?? null,
        plans: PLAN_FAMILY.map(plan => ({ planId: plan.id, byApplication: plan.byApplication === true, foundingPlacesLeft: Math.max(0, left[plan.id] ?? 0) })),
      }));
    } catch (error) {
      console.error("[Chargebee] banded offer error", error);
      return res.status(503).json(notConfigured);
    }
  });

  app.post("/api/chargebee/banded/plan-checkout", async (req, res) => {
    if (!onSale()) return res.status(409).json(notOnSaleBody);
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in before choosing a plan" });
      const userId = identity.account.id;
      if (isReferrerPurchaseRefused(req.body?.role)) {
        record({ actorUserId: userId, action: "billing.banded_checkout_refused", outcome: "denied", resourceType: "banded_checkout", metadata: { kind: "plan", reason: REFERRER_PURCHASE_REFUSED_CODE } });
        return res.status(403).json({ error: REFERRER_PURCHASE_REFUSED_ERROR, code: REFERRER_PURCHASE_REFUSED_CODE });
      }
      const parsed = bandedPlanCheckoutRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Choose a plan on a supported billing route. Nothing has been charged." });
      if (!deps.checkout || !deps.createSubscriptionIntent) return res.status(503).json(notConfigured);
      const started = await startBandedPlanCheckout({ userId, request: parsed.data, customer: customerOf(identity), urls: urlsFor(req), deps: deps.checkout });
      if (!started.ok) {
        refused(userId, "plan", started);
        return res.status(started.status).json(refusalBody(started));
      }
      // Written after the page exists, as for every plan checkout; if this write fails the
      // reservation simply expires, and a retry with the same key reopens the same page.
      await deps.createSubscriptionIntent({ hostedPageId: started.checkout.hostedPageId, checkoutIntentId: started.checkoutIntentId, userId, role: "job_seeker", plan: started.price.plan, itemPriceId: started.price.itemPriceId, amount: started.price.amount, currency: started.price.currency });
      record({ actorUserId: userId, action: "billing.banded_checkout_started", outcome: "success", resourceType: "subscription_intent", resourceId: started.checkout.hostedPageId, metadata: { kind: "plan", plan: started.price.plan, amount: started.price.amount, currency: started.price.currency, site: started.site } });
      return res.json({ checkoutUrl: started.checkout.checkoutUrl, hostedPageId: started.checkout.hostedPageId });
    } catch (error) {
      console.error("[Chargebee] banded plan checkout error", error);
      return res.status(502).json({ error: "Unable to start the secure plan checkout. Nothing has been charged." });
    }
  });

  app.post("/api/chargebee/banded/referral-checkout", async (req, res) => {
    if (!onSale()) return res.status(409).json(notOnSaleBody);
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in before buying referral requests" });
      const userId = identity.account.id;
      if (isReferrerPurchaseRefused(req.body?.role)) {
        record({ actorUserId: userId, action: "billing.banded_checkout_refused", outcome: "denied", resourceType: "banded_checkout", metadata: { kind: "referral", reason: REFERRER_PURCHASE_REFUSED_CODE } });
        return res.status(403).json({ error: REFERRER_PURCHASE_REFUSED_ERROR, code: REFERRER_PURCHASE_REFUSED_CODE });
      }
      const parsed = bandedReferralCheckoutRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Choose referral levels and whole quantities on a supported billing route. Nothing has been charged." });
      if (!deps.checkout) return res.status(503).json(notConfigured);
      const started = await startBandedReferralCheckout({ userId, request: parsed.data, customer: customerOf(identity), urls: urlsFor(req), deps: deps.checkout });
      if (!started.ok) {
        refused(userId, "referral", started);
        return res.status(started.status).json(refusalBody(started));
      }
      record({ actorUserId: userId, action: "billing.banded_checkout_started", outcome: "success", resourceType: "banded_referral_checkout", resourceId: started.checkout.hostedPageId, metadata: { kind: "referral", quantity: started.quote.quantity, subtotal: started.quote.subtotal, discount: started.quote.discount, total: started.quote.total, currency: started.quote.currency, levels: started.quote.lines.map(line => `${line.level}:${line.quantity}`).join(","), site: started.site, checkoutIntentId: started.checkoutIntentId } });
      return res.json({ checkoutUrl: started.checkout.checkoutUrl, hostedPageId: started.checkout.hostedPageId });
    } catch (error) {
      console.error("[Chargebee] banded referral checkout error", error);
      return res.status(502).json({ error: "Unable to start the secure checkout. Nothing has been charged." });
    }
  });
}
