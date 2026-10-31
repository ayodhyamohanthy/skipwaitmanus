import type { Express, Request, Response } from "express";
import { publicOutboundOrigin } from "./_core/authPostGuard";
import { basicAuthMatches, CHARGEBEE_TOKEN_PACKS, createChargebeeCheckout, isTokenPackId, isTokenQuantity, parseGiftEvent, parsePaidPaymentEvent, parsePaymentSourceEvent, parseRefundEvent, parseSubscriptionEvent, retrieveChargebeeHostedPage, scheduleChargebeeSubscriptionCancellation, tokenPackFromAmount } from "./chargebee";
import type { TokenRole, VerifiedChargebeeHostedPage } from "./chargebee";
import { resolveChargebeeRuntime, resolveChargebeeWebhookSecret } from "./chargebeeEnvironment";
import { retrieveCheckoutSubscription, subscriptionEventFromCheckoutPage, type RetrievedCheckoutSubscription } from "./chargebeeSubscriptionApi";
import { freeCreditsRequireCardValidation } from "./billingSettings";
import { giftClaimRequestSchema } from "../shared/giftSubscriptions";
import { PLAN_RETIRED_CODE, kitPlanCheckoutRequestSchema, packCheckoutRequestSchema } from "../shared/subscriptionManagement";
import { isRetiredPlanId, isRetiredPlanItemPrice, resolvePlanItemPrice, type BillablePlanId, type BillingPeriod, type RetiredPlanId } from "../shared/billingCatalog";
import { SINGLE_CREDIT_RETIRED_CODE, SINGLE_CREDIT_RETIRED_ERROR, singleCreditRetired } from "../shared/planCatalog";
import { anyPackAvailableForCurrency, refusalBody, startKitPackCheckout, startKitPlanCheckout, type KitCheckoutDeps } from "./kitCheckout";
import { REFERRER_PURCHASE_REFUSED_CODE, REFERRER_PURCHASE_REFUSED_ERROR, isReferrerPurchaseRefused } from "../shared/referrerPurchases";
import type { RetiredPlanAlertInput } from "./errorAlerting";
import { recordWebhookUnauthorized } from "./webhookAuthAlarm";

export type ChargebeeIdentity = { account: { id: number; email?: string | null; name?: string | null }; primaryEmail?: { emailAddress?: string | null } | null };

type SubscriptionCheckoutIntentRow = { hostedPageId: string; checkoutIntentId: string; userId: number; role: "job_seeker" | "referrer"; plan: string; itemPriceId: string; currency: string; status: string; failureReason?: string | null };

type Deps = {
  resolveIdentity: (req: Request) => Promise<ChargebeeIdentity | undefined>;
  recordActivity?: (input: { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number; metadata?: Record<string, string | number | boolean | null | undefined> }) => Promise<void>;
  createCheckout?: typeof createChargebeeCheckout;
  createPaymentIntent: (input: { hostedPageId: string; checkoutIntentId: string; userId: number; role: TokenRole; tokenCount: number; amount: number; currency: string }) => Promise<unknown>;
  fulfillPayment: (input: { eventId: string; hostedPageId?: string; invoiceId?: string; passThruContent?: string; amount: number; currency: string }) => Promise<unknown>;
  createSubscriptionIntent?: (input: { hostedPageId: string; checkoutIntentId: string; userId: number; role: TokenRole; plan: BillablePlanId; itemPriceId: string; amount: number; currency: "INR" | "USD"; billingPeriod?: BillingPeriod; kind?: "new" | "change" }) => Promise<unknown>;
  /** Kit checkout (a 30/90-day pass, Keep warm yearly, a credit pack): availability and provider calls. */
  kitCheckout?: KitCheckoutDeps;
  applySubscriptionEvent?: (input: NonNullable<ReturnType<typeof parseSubscriptionEvent>>) => Promise<unknown>;
  recordSubscriptionPaymentEvidence?: (input: { eventId: string; subscriptionId: string; occurredAt?: Date }) => Promise<unknown>;
  getUserSubscription?: (userId: number, role: TokenRole) => Promise<{ subscriptionId: string; status: string; currentTermEnd?: Date } | undefined>;
  markSubscriptionNonRenewing?: (userId: number, role: TokenRole, subscriptionId: string, currentTermEnd?: Date) => Promise<unknown>;
  cancelSubscription?: typeof scheduleChargebeeSubscriptionCancellation;
  resolveHostedPage?: (input: { invoiceId?: string; amount: number; currency: string; site: string; apiKey: string }) => Promise<{ hostedPageId: string; invoiceId?: string; passThruContent?: string; amount?: number; currency?: string; pageState: string; invoiceStatus?: string; paymentStatus?: string; paid: boolean } | undefined>;
  getPaymentRecovery?: (userId: number, role: TokenRole, hostedPageId: string) => Promise<{ id: number; status: "pending" | "credited" | "requires_review" | "rejected" | "refunded"; hostedPageId: string | null; checkoutIntentId: string | null; tokenCount: number; amount: number; currency: string; reconciliationReason: string | null } | undefined>;
  getSubscriptionCheckoutIntent?: (hostedPageId: string) => Promise<SubscriptionCheckoutIntentRow | undefined>;
  markSubscriptionCheckoutIntentCancelled?: (hostedPageId: string, failureReason: string) => Promise<void>;
  markSubscriptionCheckoutIntentReview?: (hostedPageId: string, reviewReason: string) => Promise<void>;
  retrieveCheckout?: (hostedPageId: string) => Promise<RetrievedCheckoutSubscription | null>;
  markPaymentForReview?: (paymentId: number, reason: "provider_page_mismatch" | "provider_page_incomplete" | "reconciliation_rejected", evidence?: { invoiceId?: string; paidAmount?: number; paidCurrency?: string }) => Promise<unknown>;
  retrieveHostedPage?: typeof retrieveChargebeeHostedPage;
  getCreditSummary?: (userId: number, role: TokenRole) => Promise<unknown>;
  alertPaymentReview?: (input: { paymentId: number; reason: string; expectedAmount: number; expectedCurrency: string; paidAmount: number; paidCurrency: string }) => Promise<unknown>;
  applyPaymentRefund?: (input: { eventId: string; invoiceId?: string; refundAmount?: number; currency?: string }) => Promise<{ status: string; paymentId?: number; reason?: string }>;
  alertPaymentRefund?: (input: { eventId: string; invoiceId?: string; paymentId?: number; reason: string; refundAmount?: number; currency?: string }) => Promise<unknown>;
  alertUnmatchedPayment?: (input: { eventId: string; invoiceId?: string; hostedPageId?: string; reason: string; paidAmount: number; paidCurrency: string }) => Promise<unknown>;
  /** Durable receipt for a provider gift event (D-067: receipts only; a claimed gift is parked as plan_retired). */
  recordGiftEvent?: (input: { eventId: string; eventType: string; giftId: string; status: string; receiverEmail?: string; receiverCustomerId?: string; subscriptionId?: string; buyerUserId?: number }) => Promise<{ giftId: string; fulfillmentStatus: string; parked: boolean }>;
  listBuyerGifts?: (buyerUserId: number) => Promise<Array<{ giftId: string; plan: RetiredPlanId | null; currency: string | null; amount: number | null; receiverEmail: string | null; providerStatus: string | null; fulfillmentStatus: string; subscriptionId: string | null; creditedAt: Date | null; createdAt: Date }>>;
  listClaimableGifts?: (userId: number) => Promise<Array<{ giftId: string; plan: RetiredPlanId | null; currency: string | null; amount: number | null; subscriptionId: string | null; receiverEmail: string | null; createdAt: Date }>>;
  /** Never credits (D-067): "retired" for a gift not credited (`parked` when this call parked it), "duplicate" for one credited before D-067. */
  claimGift?: (userId: number, giftId: string) => Promise<{ status: "retired"; giftId: string; parked: boolean } | { status: "duplicate" }>;
  /** D-067: anything Chargebee sends for the retired Pro/Max plans, or a claim of such a gift (a human cancels and refunds it), or an item price skipwait.me cannot place (unsupported_plan: reviewed, worded neutrally). */
  alertRetiredPlanEvent?: (input: RetiredPlanAlertInput) => Promise<unknown>;
  /** D-079: apply a provider payment-source event (card validation for free credits). */
  applyCardValidationEvent?: (input: NonNullable<ReturnType<typeof parsePaymentSourceEvent>>) => Promise<{ status: string; userId?: number; granted?: boolean; reason?: string }>;
  /** D-079: every validation failure (unmatched customer, declined or invalid source) reaches the owner at once. */
  alertCardValidationEvent?: (input: { eventId: string; eventType: string; customerId: string; paymentSourceId: string; reason: string }) => Promise<unknown>;
  /** D-079: the provider-hosted page where the seeker validates a card (no charge; provider voids its check). */
  createCardValidationPage?: (input: { userId: number; email?: string | null; name?: string | null; origin: string }) => Promise<{ url: string }>;
  /** D-079: a failure to create that page reaches the owner at once (validation is broken until fixed). */
  alertCardValidationPageError?: (error: unknown) => Promise<unknown>;
};

/** What a recipient reads when a gift (always a retired Pro/Max gift) is claimed. */
const GIFT_RETIRED_MESSAGE = "This gift was for a plan skipwait.me no longer offers, so it cannot be added to your account. We have told our team so the person who sent it can be refunded.";

type ReviewResult = { status: "requires_review"; reason: string; paymentId: number; expectedAmount: number; expectedCurrency: string; paidAmount: number; paidCurrency: string };

/** What a hosted page says was paid, kept with a payment that recovery holds (only the fields it actually carries). */
function paidEvidence(page: VerifiedChargebeeHostedPage): { invoiceId?: string; paidAmount?: number; paidCurrency?: string } {
  return { invoiceId: page.invoiceId, paidAmount: Number.isInteger(page.amount) ? page.amount : undefined, paidCurrency: page.currency || undefined };
}
function isReviewResult(value: unknown): value is ReviewResult {
  return typeof value === "object" && value !== null && (value as { status?: unknown }).status === "requires_review" && typeof (value as { paymentId?: unknown }).paymentId === "number";
}

function roleFromBody(value: unknown): TokenRole {
  return value === "referrer" ? "referrer" : "job_seeker";
}

function isChargebeeNotConfigured(error: unknown): boolean {
  return error instanceof Error && /Chargebee API key(?:\/site)? is not configured/.test(error.message);
}

export function registerChargebeeRoutes(app: Express, deps: Deps) {
  const record = (input: Parameters<NonNullable<typeof deps.recordActivity>>[0]) => { void deps.recordActivity?.(input).catch(() => undefined); };
  // D-055: referrers never pay (shared/referrerPurchases.ts, switched off, not deleted).
  // Answered before any availability probe, provider call or intent row.
  const refuseReferrerPurchase = (res: Response, actorUserId: number, action: "billing.credit_checkout_refused" | "billing.subscription_checkout_refused") => {
    record({ actorUserId, action, outcome: "denied", resourceType: action === "billing.credit_checkout_refused" ? "payment_intent" : "subscription_intent", metadata: { reason: REFERRER_PURCHASE_REFUSED_CODE, role: "referrer" } });
    return res.status(403).json({ error: REFERRER_PURCHASE_REFUSED_ERROR, code: REFERRER_PURCHASE_REFUSED_CODE });
  };
  app.post("/api/chargebee/checkout", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in before purchasing tokens" });
      // Covers both arms below: a kit credit pack and the /premium per-credit token checkout.
      if (isReferrerPurchaseRefused(req.body?.role)) return refuseReferrerPurchase(res, identity.account.id, "billing.credit_checkout_refused");
      const itemPriceId = req.body?.itemPriceId;
      // A kit credit pack names a pack, not a legacy token item price. Refuse
      // before anything else so a pack body never falls through to "unsupported".
      const kitPack = packCheckoutRequestSchema.safeParse(req.body);
      if (kitPack.success) {
        const origin = publicOutboundOrigin(req);
        const started = await startKitPackCheckout({
          req,
          request: kitPack.data,
          customer: { email: identity.primaryEmail?.emailAddress ?? identity.account.email ?? undefined, firstName: identity.account.name?.split(" ")[0], lastName: identity.account.name?.split(" ").slice(1).join(" "), billingCountry: kitPack.data.billingCountry },
          urls: { redirectUrl: `${origin}/plans?role=${kitPack.data.role}&payment=pending`, cancelUrl: `${origin}/plans?role=${kitPack.data.role}&payment=cancelled` },
          deps: deps.kitCheckout,
        });
        if (!started.ok) return res.status(started.status).json(refusalBody(started));
        await deps.createPaymentIntent({ hostedPageId: started.checkout.hostedPageId, checkoutIntentId: started.checkoutIntentId, userId: identity.account.id, role: kitPack.data.role, tokenCount: started.price.credits, amount: started.price.amount, currency: started.price.currency });
        record({ actorUserId: identity.account.id, action: "billing.credit_checkout_started", outcome: "success", resourceType: "payment_intent", resourceId: started.checkout.hostedPageId, metadata: { role: kitPack.data.role, packId: kitPack.data.packId, tokenCount: started.price.credits, amount: started.price.amount, currency: started.price.currency, billingCountry: kitPack.data.billingCountry } });
        return res.json({ checkoutUrl: started.checkout.checkoutUrl, hostedPageId: started.checkout.hostedPageId });
      }
      if (!isTokenPackId(itemPriceId)) return res.status(400).json({ error: "Choose a supported token currency" });
      const billingCountry = req.body?.billingCountry;
      if (billingCountry !== "IN" && billingCountry !== "INTL") return res.status(400).json({ error: "Choose India or international billing" });
      const rawRole = req.body?.role;
      if (rawRole !== undefined && rawRole !== "job_seeker" && rawRole !== "referrer") return res.status(400).json({ error: "Choose a valid account role" });
      const role = roleFromBody(rawRole);
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, "quantity") && req.body.quantity === null) return res.status(400).json({ error: "Choose a whole number of tokens between 1 and 1,000" });
      const quantity = req.body?.quantity ?? 1;
      if (!isTokenQuantity(quantity)) return res.status(400).json({ error: "Choose a whole number of tokens between 1 and 1,000" });
      const pack = CHARGEBEE_TOKEN_PACKS[itemPriceId];
      if ((billingCountry === "IN" && pack.currency !== "INR") || (billingCountry === "INTL" && pack.currency !== "USD")) {
        return res.status(400).json({ error: "That currency is not available for the selected billing route" });
      }
      // D-036: the per-credit checkout retires in a currency once any pack is on
      // sale in it. Pending single-credit checkouts from before the switch still
      // recover and credit; only NEW checkouts are refused.
      if (singleCreditRetired({ currency: pack.currency, anyPackAvailable: await anyPackAvailableForCurrency(req, pack.currency, deps.kitCheckout) })) {
        return res.status(410).json({ error: SINGLE_CREDIT_RETIRED_ERROR, code: SINGLE_CREDIT_RETIRED_CODE });
      }
      const origin = publicOutboundOrigin(req);
      const runtime = deps.createCheckout ? undefined : resolveChargebeeRuntime(req.hostname);
      const checkout = await (deps.createCheckout ?? createChargebeeCheckout)({
        itemPriceId,
        quantity,
        email: identity.primaryEmail?.emailAddress ?? identity.account.email ?? undefined,
        firstName: identity.account.name?.split(" ")[0],
        lastName: identity.account.name?.split(" ").slice(1).join(" "),
        billingAddress: billingCountry === "IN" ? { country: "IN" } : undefined,
        ...(runtime ? { site: runtime.site, apiKey: runtime.apiKey } : {}),
        redirectUrl: `${origin}/premium?role=${role}&payment=pending`,
        cancelUrl: `${origin}/premium?role=${role}&payment=cancelled`,
      });
      await deps.createPaymentIntent({ hostedPageId: checkout.hostedPageId, checkoutIntentId: checkout.checkoutIntentId, userId: identity.account.id, role, tokenCount: pack.tokenCount * quantity, amount: pack.amount * quantity, currency: pack.currency });
      record({ actorUserId: identity.account.id, action: "billing.credit_checkout_started", outcome: "success", resourceType: "payment_intent", resourceId: checkout.hostedPageId, metadata: { role, tokenCount: pack.tokenCount * quantity, amount: pack.amount * quantity, currency: pack.currency, billingCountry } });
      return res.json({ checkoutUrl: checkout.checkoutUrl, hostedPageId: checkout.hostedPageId });
    } catch (error) {
      console.error("[Chargebee] checkout error", error);
      if (isChargebeeNotConfigured(error)) return res.status(503).json({ error: "Chargebee is not configured" });
      return res.status(502).json({ error: "Unable to start Chargebee checkout" });
    }
  });

  app.post("/api/chargebee/subscription-checkout", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in before choosing a plan" });
      if (isReferrerPurchaseRefused(req.body?.role)) return refuseReferrerPurchase(res, identity.account.id, "billing.subscription_checkout_refused");
      // A kit pass/Keep warm body names a plan term. The pre-kit monthly body
      // ({plan: "pro" | "max", ...}) is retired (D-067) and refused below.
      const kitPlan = kitPlanCheckoutRequestSchema.safeParse(req.body);
      if (kitPlan.success) {
        if (!deps.createSubscriptionIntent) return res.status(503).json({ error: "Subscription checkout is not configured" });
        const origin = publicOutboundOrigin(req);
        const started = await startKitPlanCheckout({
          req,
          request: kitPlan.data,
          customer: { email: identity.primaryEmail?.emailAddress ?? identity.account.email ?? undefined, firstName: identity.account.name?.split(" ")[0], lastName: identity.account.name?.split(" ").slice(1).join(" "), billingCountry: kitPlan.data.billingCountry },
          urls: { redirectUrl: `${origin}/plans?role=${kitPlan.data.role}&payment=pending`, cancelUrl: `${origin}/plans?role=${kitPlan.data.role}&payment=cancelled` },
          deps: deps.kitCheckout,
        });
        if (!started.ok) return res.status(started.status).json(refusalBody(started));
        await deps.createSubscriptionIntent({ hostedPageId: started.checkout.hostedPageId, checkoutIntentId: started.checkoutIntentId, userId: identity.account.id, role: kitPlan.data.role, plan: started.price.plan, itemPriceId: started.price.itemPriceId, amount: started.price.amount, currency: started.price.currency, billingPeriod: started.price.interval, kind: "new" });
        record({ actorUserId: identity.account.id, action: "billing.subscription_checkout_started", outcome: "success", resourceType: "subscription_intent", resourceId: started.checkout.hostedPageId, metadata: { role: kitPlan.data.role, plan: started.price.plan, interval: started.price.interval, amount: started.price.amount, currency: started.price.currency, billingCountry: kitPlan.data.billingCountry } });
        return res.json({ checkoutUrl: started.checkout.checkoutUrl, hostedPageId: started.checkout.hostedPageId });
      }
      // D-067: Pro and Max are removed completely. An old client's pre-kit body is
      // refused before any availability probe, provider call or intent row.
      if (isRetiredPlanId(req.body?.plan)) {
        record({ actorUserId: identity.account.id, action: "billing.subscription_checkout_refused", outcome: "denied", resourceType: "subscription_intent", metadata: { reason: PLAN_RETIRED_CODE, plan: req.body.plan } });
        return res.status(410).json({ error: "That plan is no longer sold. Nothing has been charged.", code: PLAN_RETIRED_CODE });
      }
      return res.status(400).json({ error: "Choose a plan and a term on a supported billing route. Nothing has been charged." });
    } catch (error) {
      console.error("[Chargebee] subscription checkout error", error);
      if (isChargebeeNotConfigured(error)) return res.status(503).json({ error: "Chargebee is not configured" });
      return res.status(502).json({ error: "Unable to start the secure plan checkout" });
    }
  });

  // D-067: gifts only ever sold Pro or Max, which are removed completely. The
  // route stays registered so an old client gets a plain answer, and it is off
  // whatever the environment says: no identity read, no provider call, no intent.
  app.post("/api/chargebee/gift-checkout", (_req, res) => res.status(503).json({ error: "Gifting is not available. Nothing has been charged." }));

  app.get("/api/chargebee/gifts/mine", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view your gifts" });
      const [sent, claimable] = await Promise.all([
        deps.listBuyerGifts ? deps.listBuyerGifts(identity.account.id) : [],
        deps.listClaimableGifts ? deps.listClaimableGifts(identity.account.id) : [],
      ]);
      return res.json({ sent, claimable });
    } catch {
      return res.status(500).json({ error: "We could not load your gifts right now" });
    }
  });

  app.post("/api/chargebee/gifts/claim", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to claim your gift" });
      const parsed = giftClaimRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "That gift reference is not valid" });
      if (!deps.claimGift) return res.status(503).json({ error: "Gift claiming is temporarily unavailable" });
      const result = await deps.claimGift(identity.account.id, parsed.data.giftId);
      // D-067: no gift is ever credited. The recipient is told plainly, and a human refunds the sender.
      // The admin is told once per gift: only the call that parked it alerts (a repeat claim, or a gift
      // the provider receipt already parked and alerted, gets the same answer without another email).
      if (result.status === "retired") {
        record({ actorUserId: identity.account.id, action: "billing.gift_claim_refused", outcome: "denied", resourceType: "gift", resourceId: parsed.data.giftId, metadata: { reason: PLAN_RETIRED_CODE, parked: result.parked } });
        return res.status(409).json({ error: GIFT_RETIRED_MESSAGE, code: PLAN_RETIRED_CODE });
      }
      return res.json({ status: result.status });
    } catch (error) {
      if (error instanceof Error && error.message === "We could not find this gift") return res.status(404).json({ error: "We could not find this gift" });
      if (error instanceof Error && error.message === "This gift was sent to a different email address") return res.status(403).json({ error: "This gift was sent to a different email address" });
      console.error("[Chargebee] gift claim error", error);
      return res.status(400).json({ error: error instanceof Error ? error.message : "We could not claim this gift right now" });
    }
  });

  app.post("/api/chargebee/subscription-cancel", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to manage your plan" });
      const role = roleFromBody(req.body?.role);
      const subscription = await deps.getUserSubscription?.(identity.account.id, role);
      if (!subscription) return res.status(404).json({ error: "No active subscription was found for this account" });
      if (subscription.status === "non_renewing") return res.json({ status: "non_renewing", currentTermEnd: subscription.currentTermEnd });
      const runtime = deps.cancelSubscription ? undefined : resolveChargebeeRuntime(req.hostname);
      const result = await (deps.cancelSubscription ?? scheduleChargebeeSubscriptionCancellation)({ subscriptionId: subscription.subscriptionId, ...(runtime ? { site: runtime.site, apiKey: runtime.apiKey } : {}) });
      await deps.markSubscriptionNonRenewing?.(identity.account.id, role, subscription.subscriptionId, result.currentTermEnd);
      record({ actorUserId: identity.account.id, action: "billing.subscription_cancellation_scheduled", outcome: "success", resourceType: "subscription", resourceId: subscription.subscriptionId, metadata: { role, status: result.status } });
      return res.json({ status: result.status, currentTermEnd: result.currentTermEnd });
    } catch (error) {
      console.error("[Chargebee] subscription cancellation error", error);
      if (isChargebeeNotConfigured(error)) return res.status(503).json({ error: "Chargebee is not configured" });
      return res.status(502).json({ error: "We could not schedule your cancellation. Please try again." });
    }
  });

  app.post("/api/chargebee/credit-recovery", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to confirm your referral credits" });
      const role = roleFromBody(req.body?.role);
      const hostedPageId = typeof req.body?.hostedPageId === "string" ? req.body.hostedPageId.trim() : "";
      if (!hostedPageId || hostedPageId.length > 255) return res.status(400).json({ error: "Your secure payment reference is unavailable. Your credits will still appear after provider verification." });
      if (!deps.getPaymentRecovery) return res.status(503).json({ error: "Payment confirmation is temporarily unavailable" });
      const payment = await deps.getPaymentRecovery(identity.account.id, role, hostedPageId);
      if (!payment) return res.status(404).json({ error: "We could not find this payment for your account" });
      const summary = async () => deps.getCreditSummary ? await deps.getCreditSummary(identity.account.id, role) : undefined;
      if (payment.status === "credited") return res.json({ status: "credited", tokenCount: payment.tokenCount, summary: await summary() });
      if (payment.status === "requires_review") return res.json({ status: "requires_review", summary: await summary() });

      const runtime = deps.retrieveHostedPage ? undefined : resolveChargebeeRuntime(req.hostname);
      const hostedPage = await (deps.retrieveHostedPage ?? retrieveChargebeeHostedPage)(hostedPageId, runtime ? { site: runtime.site, apiKey: runtime.apiKey } : undefined);
      if (!hostedPage) return res.json({ status: "pending", summary: await summary() });
      // Recovery is a convenience read, never an alternate trust path: only an
      // explicitly succeeded page with a paid source-of-truth invoice can credit.
      if (!hostedPage.paid) return res.json({ status: "pending", summary: await summary() });
      if (!hostedPage.passThruContent || !Number.isInteger(hostedPage.amount) || !hostedPage.currency) {
        await deps.markPaymentForReview?.(payment.id, "provider_page_incomplete", paidEvidence(hostedPage));
        return res.json({ status: "requires_review", summary: await summary() });
      }
      if (hostedPage.passThruContent !== payment.checkoutIntentId || hostedPage.amount !== payment.amount || hostedPage.currency !== payment.currency) {
        await deps.markPaymentForReview?.(payment.id, "provider_page_mismatch", paidEvidence(hostedPage));
        void deps.alertPaymentReview?.({ paymentId: payment.id, reason: "provider_page_mismatch", expectedAmount: payment.amount, expectedCurrency: payment.currency, paidAmount: hostedPage.amount as number, paidCurrency: hostedPage.currency as string }).catch(() => undefined);
        return res.json({ status: "requires_review", summary: await summary() });
      }
      const result = await deps.fulfillPayment({ eventId: `hosted_page:${hostedPage.hostedPageId}`, hostedPageId: hostedPage.hostedPageId, invoiceId: hostedPage.invoiceId, passThruContent: hostedPage.passThruContent, amount: hostedPage.amount, currency: hostedPage.currency });
      if ((result as { status?: string }).status === "credited" || (result as { status?: string }).status === "duplicate") return res.json({ status: "credited", tokenCount: payment.tokenCount, summary: await summary() });
      await deps.markPaymentForReview?.(payment.id, "reconciliation_rejected", paidEvidence(hostedPage));
      return res.json({ status: "requires_review", summary: await summary() });
    } catch (error) {
      console.error("[Chargebee] payment recovery error", error);
      if (isChargebeeNotConfigured(error)) return res.status(503).json({ error: "Chargebee is not configured" });
      return res.status(502).json({ error: "We are still securely confirming this payment. No action is needed from you." });
    }
  });

  // GO-LIVE-1b ruling 2: a paid pass always activates. When the webhook never
  // arrived, the seeker's return (and the hourly reconcile) recovers the pass
  // from the provider's own checkout page - ownership is proven before the
  // provider is ever called, the activation input is built from the provider
  // QA review (#359 finding 5): recovery re-reads the provider on every call, so a
  // caller gets five tries a minute, not an unbounded provider loop.
  const recoveryTries = new Map<string, number[]>();
  const recoveryThrottled = (userId: number, role: TokenRole): boolean => {
    const now = Date.now();
    const key = `${userId}:${role}`;
    const recent = (recoveryTries.get(key) ?? []).filter(t => now - t < 60_000);
    if (recoveryTries.size > 10_000) recoveryTries.clear();
    if (recent.length >= 5) { recoveryTries.set(key, recent); return true; }
    recent.push(now);
    recoveryTries.set(key, recent);
    return false;
  };

  // page and never the client, and the shared apply grants it exactly once
  // (event id hosted_page:<id>); a webhook for the same subscription afterwards
  // is an ordinary update, not a second grant.
  app.post("/api/chargebee/subscription-recovery", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to confirm your pass" });
      const role = roleFromBody(req.body?.role);
      if (recoveryThrottled(identity.account.id, role)) return res.status(429).json({ error: "Too many confirmation tries. Give it a minute and try again." });
      const hostedPageId = typeof req.body?.hostedPageId === "string" ? req.body.hostedPageId.trim() : "";
      if (!hostedPageId || hostedPageId.length > 255) return res.status(400).json({ error: "Your secure checkout reference is unavailable. Your pass will still activate after provider verification." });
      if (!deps.getSubscriptionCheckoutIntent || !deps.applySubscriptionEvent) return res.status(503).json({ error: "Pass confirmation is temporarily unavailable" });
      const intent = await deps.getSubscriptionCheckoutIntent(hostedPageId);
      if (!intent || intent.userId !== identity.account.id || intent.role !== role) return res.status(404).json({ error: "We could not find this checkout for your account" });
      const summary = async () => deps.getCreditSummary ? await deps.getCreditSummary(identity.account.id, role) : undefined;
      if (intent.status === "activated") return res.json({ status: "activated", summary: await summary() });
      if (intent.status === "cancelled") return res.json({ status: "cancelled", summary: await summary() });
      // Parked for human review (mismatch, refused or a non-access subscription status): say so,
      // never "cancelled", and never alert again - the park already alerted once.
      if (intent.failureReason) return res.json({ status: "requires_review", summary: await summary() });
      // QA review (#359 finding 4): no non-null assertion - the injected reader wins,
      // else the configured site is resolved and a missing one answers 503.
      let page: RetrievedCheckoutSubscription | null;
      if (deps.retrieveCheckout) {
        page = await deps.retrieveCheckout(hostedPageId);
      } else {
        const runtime = resolveChargebeeRuntime(req.hostname);
        if (!runtime) return res.status(503).json({ error: "Chargebee is not configured" });
        page = await retrieveCheckoutSubscription(runtime, hostedPageId);
      }
      if (!page) return res.json({ status: "pending", summary: await summary() });
      if (page.state === "cancelled" || page.state === "expired") {
        await deps.markSubscriptionCheckoutIntentCancelled?.(hostedPageId, "checkout_expired");
        return res.json({ status: "cancelled", summary: await summary() });
      }
      if (page.state !== "succeeded") return res.json({ status: "pending", summary: await summary() });
      const event = subscriptionEventFromCheckoutPage(page);
      if (!event) return res.json({ status: "pending", summary: await summary() });
      // Recovery never grants a checkout that disagrees with its own intent: a
      // different intent id, term (item price) or currency is a human review,
      // and the owner hears about it.
      if (page.passThruContent !== intent.checkoutIntentId || (event.itemPriceId && event.itemPriceId !== intent.itemPriceId) || (event.currency && event.currency !== intent.currency)) {
        await deps.markSubscriptionCheckoutIntentReview?.(hostedPageId, "review_mismatch");
        record({ action: "billing.subscription_recovery_mismatch", outcome: "failure", resourceType: "chargebee_subscription", resourceId: event.subscriptionId, metadata: { hostedPageId, reason: "provider_page_mismatch", itemPriceId: event.itemPriceId } });
        void deps.alertRetiredPlanEvent?.({ eventId: event.eventId, eventType: "subscription_recovery", reason: "unlinked_subscription", subscriptionId: event.subscriptionId, itemPriceId: event.itemPriceId }).catch(() => undefined);
        return res.json({ status: "requires_review", summary: await summary() });
      }
      // QA review (#359 finding 2): only a subscription whose status keeps access
      // (active / non_renewing) may be told "Your pass is active". A cancelled,
      // paused or future subscription at read time is human review, not a grant.
      if (event.status !== "active" && event.status !== "non_renewing") {
        await deps.markSubscriptionCheckoutIntentReview?.(hostedPageId, "review_status");
        record({ action: "billing.subscription_recovery_refused", outcome: "failure", resourceType: "chargebee_subscription", resourceId: event.subscriptionId, metadata: { hostedPageId, reason: `subscription_status_${event.status}`, itemPriceId: event.itemPriceId } });
        void deps.alertRetiredPlanEvent?.({ eventId: event.eventId, eventType: "subscription_recovery", reason: "unlinked_subscription", subscriptionId: event.subscriptionId, itemPriceId: event.itemPriceId }).catch(() => undefined);
        return res.json({ status: "requires_review", summary: await summary() });
      }
      const result = (await deps.applySubscriptionEvent(event)) as { status?: string; reason?: string } | undefined;
      if (result?.status === "applied" || result?.status === "duplicate") return res.json({ status: "activated", summary: await summary() });
      await deps.markSubscriptionCheckoutIntentReview?.(hostedPageId, "review_refused");
      record({ action: "billing.subscription_recovery_refused", outcome: "failure", resourceType: "chargebee_subscription", resourceId: event.subscriptionId, metadata: { hostedPageId, reason: result?.reason ?? result?.status ?? "unknown", itemPriceId: event.itemPriceId } });
      void deps.alertRetiredPlanEvent?.({ eventId: event.eventId, eventType: "subscription_recovery", reason: "unlinked_subscription", subscriptionId: event.subscriptionId, itemPriceId: event.itemPriceId }).catch(() => undefined);
      return res.json({ status: "requires_review", summary: await summary() });
    } catch (error) {
      console.error("[Chargebee] subscription recovery error", error);
      if (isChargebeeNotConfigured(error)) return res.status(503).json({ error: "Chargebee is not configured" });
      return res.status(502).json({ error: "We are still securely confirming your pass. No action is needed from you." });
    }
  });

  // D-079: the provider-hosted page where a signed-in seeker validates a card.
  // No charge is made here; the provider's own card verification (which it
  // voids automatically) is the whole check.
  app.post("/api/chargebee/card-validation", async (req, res) => {
    const identity = await deps.resolveIdentity(req);
    if (!identity) return res.status(401).json({ error: "Sign in to validate your card. Nothing has been charged." });
    // QA review (D-079): gated on the flag so a flag-off deploy is byte-for-byte today.
    if (!freeCreditsRequireCardValidation() || !deps.createCardValidationPage) return res.status(503).json({ error: "Card validation is not available. Nothing has been charged." });
    try {
      const page = await deps.createCardValidationPage({ userId: identity.account.id, email: identity.account.email ?? identity.primaryEmail?.emailAddress ?? null, name: identity.account.name ?? null, origin: publicOutboundOrigin(req) });
      return res.json(page);
    } catch (error) {
      console.error("[Chargebee] card-validation page failed", error);
      void Promise.resolve(deps.alertCardValidationPageError?.(error)).catch(() => undefined);
      return res.status(502).json({ error: "Card validation is unavailable right now. Nothing has been charged." });
    }
  });

  app.post("/api/chargebee/webhook", async (req, res) => {
    const secret = resolveChargebeeWebhookSecret(req.hostname);
    if (!secret || !basicAuthMatches(req.header("authorization"), secret)) {
      // D-212: a drifted secret refuses every refund and renewal; record it (no headers or body) and tell Sentry, throttled.
      recordWebhookUnauthorized(deps.recordActivity);
      return res.status(401).send("Unauthorized");
    }
    const subscription = parseSubscriptionEvent(req.body);
    const payment = parsePaidPaymentEvent(req.body);
    const cardEvent = parsePaymentSourceEvent(req.body);
    const obligations: Record<string, unknown> = {};
    let handled = false;

    // One Chargebee delivery may carry both a subscription transition and a
    // paid invoice. Process each durable obligation independently. Never let
    // the first matching parser short-circuit the other.
    if (subscription && deps.applySubscriptionEvent) {
      handled = true;
      try {
        obligations.subscription = await deps.applySubscriptionEvent(subscription);
      } catch (error) {
        console.error("[Chargebee] subscription entitlement error", error);
        return res.status(500).json({ error: "Subscription synchronization retry required" });
      }
      // D-067: an event that was recorded and granted nothing because of its plan reaches a human.
      // A retired Pro/Max item price, or a wallet/intent still stored as Pro/Max (plan_retired), is
      // cancelled and refunded in Chargebee. Any other price skipwait.me cannot place (unsupported_plan,
      // e.g. a renamed item price on a kit subscription) is reviewed under its own neutral label,
      // never called Pro/Max, so nobody refunds a paying kit customer on a wrong label.
      const applied = obligations.subscription as { status?: string; reason?: string } | undefined;
      const retired = isRetiredPlanItemPrice(subscription.itemPriceId) || applied?.reason === PLAN_RETIRED_CODE;
      const unsupported = !retired && applied?.status === "ignored" && applied.reason === "unsupported_plan";
      // A redelivery of an event already recorded (duplicate) was alerted on its first delivery.
      // GO-LIVE-1b ruling 4: a kit pass Chargebee sells but no checkout intent
      // or wallet can match is never left unactivated silently - the owner is
      // alerted at once (provider ids only), whatever else went right.
      const unlinked = !retired && applied?.status === "ignored" && (applied.reason === "unknown_subscription" || applied.reason === "checkout_intent_mismatch") && resolvePlanItemPrice(subscription.itemPriceId) !== undefined;
      if (applied?.status !== "duplicate" && unlinked) {
        console.error("[Chargebee] unlinked kit subscription needs review", { eventId: subscription.eventId, subscriptionId: subscription.subscriptionId, reason: applied.reason });
        record({ action: "billing.unlinked_subscription", outcome: "failure", resourceType: "chargebee_subscription", resourceId: subscription.subscriptionId, metadata: { eventId: subscription.eventId, eventType: subscription.eventType, reason: applied.reason ?? "unknown", itemPriceId: subscription.itemPriceId } });
        void deps.alertRetiredPlanEvent?.({ eventId: subscription.eventId, eventType: subscription.eventType, reason: "unlinked_subscription", subscriptionId: subscription.subscriptionId, itemPriceId: subscription.itemPriceId }).catch(() => undefined);
      }
      if (applied?.status !== "duplicate" && (retired || unsupported)) {
        const reason = retired ? PLAN_RETIRED_CODE : "unsupported_plan";
        console.error(`[Chargebee] ${retired ? "retired" : "unrecognised"} plan event needs review`, { eventId: subscription.eventId, subscriptionId: subscription.subscriptionId, reason });
        record({ action: retired ? "billing.retired_plan_event" : "billing.unsupported_plan_event", outcome: "failure", resourceType: "chargebee_subscription", resourceId: subscription.subscriptionId, metadata: { eventId: subscription.eventId, eventType: subscription.eventType, reason, itemPriceId: subscription.itemPriceId } });
      }
    }

    // D-079: a provider card confirmation validates the wallet for free credits.
    // Unmatched customers and declined or invalid sources alert the owner at
    // once; a processing error asks Chargebee to retry.
    if (cardEvent && deps.applyCardValidationEvent && freeCreditsRequireCardValidation()) {
      handled = true;
      try {
        obligations.cardValidation = await deps.applyCardValidationEvent(cardEvent);
      } catch (error) {
        console.error("[Chargebee] card-validation event error", error);
        return res.status(500).json({ error: "Card validation synchronization retry required" });
      }
      const appliedCard = obligations.cardValidation as { status?: string; reason?: string } | undefined;
      if (appliedCard?.status === "unmatched" || appliedCard?.status === "invalid_source") {
        console.error("[Chargebee] card-validation event needs review", { eventId: cardEvent.eventId, customerId: cardEvent.customerId, reason: appliedCard.reason });
        record({ action: "billing.card_validation_event", outcome: "failure", resourceType: "chargebee_payment_source", resourceId: cardEvent.paymentSourceId, metadata: { eventId: cardEvent.eventId, eventType: cardEvent.eventType, reason: appliedCard.reason ?? appliedCard.status } });
        void deps.alertCardValidationEvent?.({ eventId: cardEvent.eventId, eventType: cardEvent.eventType, customerId: cardEvent.customerId, paymentSourceId: cardEvent.paymentSourceId, reason: appliedCard.reason ?? appliedCard.status ?? "unknown" }).catch(() => undefined);
      }
    }

    // D-155: a paid event tied to a subscription is provider-verified paid
    // evidence for that wallet, independent of token-pack fulfillment. The
    // parser already enforced a positive integer INR/USD amount and event id;
    // the subscription id it returns comes from the settled invoice, never
    // from a bare or conflicting subscription object. This arm runs for
    // every paid event with such an id, including plan invoices whose
    // amounts are not pack multiples.
    if (payment?.subscriptionIdentityConflict) {
      console.error("[Chargebee] paid event subscription identity conflict", { eventId: payment.eventId, invoiceId: payment.invoiceId });
      record({ action: "billing.paid_evidence_identity_conflict", outcome: "failure", resourceType: "chargebee_invoice", resourceId: payment.invoiceId, metadata: { eventId: payment.eventId } });
    }
    if (payment?.subscriptionId && deps.recordSubscriptionPaymentEvidence) {
      handled = true;
      try {
        obligations.paidEvidence = await deps.recordSubscriptionPaymentEvidence({ eventId: payment.eventId, subscriptionId: payment.subscriptionId, occurredAt: payment.occurredAt });
      } catch (error) {
        console.error("[Chargebee] paid-evidence error", error);
        return res.status(500).json({ error: "Paid evidence synchronization retry required" });
      }
    }

    // A paid event is a credit obligation when its amount is a whole number of
    // packs OR it carries our checkout intent. The second arm matters: a paid
    // invoice with tax/coupon/rounding is not a pack multiple, and dropping it
    // here would be a silent loss of a real payment. fulfillPayment parks
    // amount mismatches for admin review.
    if (payment && (tokenPackFromAmount(payment.amount, payment.currency) || payment.passThruContent)) {
      handled = true;
      try {
        const runtime = (!payment.hostedPageId || !payment.passThruContent) && deps.resolveHostedPage
          ? resolveChargebeeRuntime(req.hostname)
          : undefined;
        const resolvedHostedPage = runtime && deps.resolveHostedPage
          ? await deps.resolveHostedPage({ invoiceId: payment.invoiceId, amount: payment.amount, currency: payment.currency, site: runtime.site, apiKey: runtime.apiKey })
          : undefined;
        obligations.payment = await deps.fulfillPayment({
          ...payment,
          hostedPageId: payment.hostedPageId ?? resolvedHostedPage?.hostedPageId,
          passThruContent: payment.passThruContent ?? resolvedHostedPage?.passThruContent,
        });
        const fulfilled = obligations.payment;
        if (isReviewResult(fulfilled)) {
          console.error("[Chargebee] paid invoice parked for review", { paymentId: fulfilled.paymentId, reason: fulfilled.reason });
          void deps.alertPaymentReview?.({ paymentId: fulfilled.paymentId, reason: fulfilled.reason, expectedAmount: fulfilled.expectedAmount, expectedCurrency: fulfilled.expectedCurrency, paidAmount: fulfilled.paidAmount, paidCurrency: fulfilled.paidCurrency }).catch(() => undefined);
        }
      } catch (error) {
        console.error("[Chargebee] fulfillment error", error);
        return res.status(500).json({ error: "Fulfillment retry required" });
      }
    }

    // #77 safety net: a paid invoice we cannot tie to any checkout or active
    // subscription must never disappear silently. Log it for review and alert
    // the administrator. Subscription renewals (handled above) are not
    // unmatched. A gifted subscription's invoice is (D-067: no plan can be
    // gifted any more, so nothing explains that payment).
    const subscriptionHandled = Boolean(subscription && obligations.subscription && (obligations.subscription as { status?: string }).status !== "ignored");
    const paymentResult = obligations.payment as { status?: string; reason?: string } | undefined;
    const paymentUnmatched = payment && !subscriptionHandled && (
      (paymentResult?.status === "ignored" && ["unknown_checkout", "missing_hosted_page", "missing_checkout_intent"].includes(paymentResult.reason ?? ""))
      || (!paymentResult && !subscriptionHandled)
    );
    if (payment && paymentUnmatched) {
      handled = true;
      const reason = paymentResult?.reason ?? "unpriced_amount";
      obligations.payment = { status: "requires_review", reason };
      console.error("[Chargebee] unmatched paid invoice needs review", { eventId: payment.eventId, invoiceId: payment.invoiceId, reason });
      record({ action: "billing.payment_unmatched", outcome: "failure", resourceType: "chargebee_invoice", resourceId: payment.invoiceId ?? payment.eventId, metadata: { eventId: payment.eventId, hostedPageId: payment.hostedPageId, reason, amount: payment.amount, currency: payment.currency } });
      void deps.alertUnmatchedPayment?.({ eventId: payment.eventId, invoiceId: payment.invoiceId, hostedPageId: payment.hostedPageId, reason, paidAmount: payment.amount, paidCurrency: payment.currency });
    }

    const gift = parseGiftEvent(req.body);
    if (gift && deps.recordGiftEvent) {
      try {
        const receipt = await deps.recordGiftEvent({ ...gift });
        // Every gift event is a durable receipt and moves no credit. Lifecycle events
        // (scheduled/unclaimed/expired/cancelled/updated) end 202 exactly as before
        // gifts existed. D-067: a claimed gift used to credit the recipient with Pro or
        // Max. It is now parked as plan_retired by the receipt above, never fulfilled,
        // answered 2xx so Chargebee stops retrying, and alerted once, by the delivery that
        // parked it, so a human cancels and refunds it in the Chargebee dashboard. A
        // redelivery gets the same answer without a second email; a gift credited before
        // D-067 is history and asks for no refund.
        if (receipt.parked) {
          handled = true;
          obligations.gift = { status: "parked", reason: PLAN_RETIRED_CODE };
          console.error("[Chargebee] claimed gift for a retired plan needs review", { eventId: gift.eventId, giftId: gift.giftId });
          record({ action: "billing.retired_plan_event", outcome: "failure", resourceType: "gift", resourceId: gift.giftId, metadata: { eventId: gift.eventId, eventType: gift.eventType, reason: "gift_claimed", subscriptionId: gift.subscriptionId } });
        } else if (gift.eventType === "gift_claimed" && gift.subscriptionId && gift.receiverEmail) {
          handled = true;
          obligations.gift = receipt.fulfillmentStatus === "credited" ? { status: "duplicate" } : { status: "parked", reason: PLAN_RETIRED_CODE };
        }
      } catch (error) {
        console.error("[Chargebee] gift event error", error);
        return res.status(500).json({ error: "Gift synchronization retry required" });
      }
    }

    // A provider refund is a money-out obligation. A full refund of unspent
    // credits takes them back; everything else is parked and alerted. Failure
    // returns 500 so Chargebee retries; the handler is idempotent per refund.
    const refund = parseRefundEvent(req.body);
    if (refund && deps.applyPaymentRefund) {
      handled = true;
      try {
        const settled = await deps.applyPaymentRefund(refund);
        obligations.refund = settled;
        if (settled.status === "review" || settled.status === "unmatched") {
          const reason = settled.reason ?? "refund_unmatched";
          console.error("[Chargebee] refund needs review", { eventId: refund.eventId, invoiceId: refund.invoiceId, reason });
          record({ action: "billing.refund_needs_review", outcome: "failure", resourceType: "chargebee_invoice", resourceId: refund.invoiceId ?? refund.eventId, metadata: { eventId: refund.eventId, reason, paymentId: settled.paymentId ?? null } });
          void deps.alertPaymentRefund?.({ eventId: refund.eventId, invoiceId: refund.invoiceId, paymentId: settled.paymentId, reason, refundAmount: refund.refundAmount, currency: refund.currency });
        }
      } catch (error) {
        console.error("[Chargebee] refund handling error", error);
        return res.status(500).json({ error: "Refund synchronization retry required" });
      }
    }

    // A 2xx means every recognized obligation reached durable terminal state.
    // Unknown/unpriced events are terminally ignored; provider retries cannot
    // make them valid obligations.
    if (!handled) return res.status(202).json({ received: true, ignored: true });
    const values = Object.values(obligations);
    return res.status(200).json({ received: true, obligations, result: values.length === 1 ? values[0] : undefined });
  });
}
