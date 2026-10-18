import type { Express, Request } from "express";
import { basicAuthMatches, CHARGEBEE_TOKEN_PACKS, createChargebeeCheckout, isTokenPackId, isTokenQuantity, parseGiftEvent, parsePaidPaymentEvent, parseRefundEvent, parseSubscriptionEvent, retrieveChargebeeHostedPage, scheduleChargebeeSubscriptionCancellation, tokenPackFromAmount } from "./chargebee";
import type { TokenRole, VerifiedChargebeeHostedPage } from "./chargebee";
import { resolveChargebeeRuntime, resolveChargebeeWebhookSecret } from "./chargebeeEnvironment";
import { giftClaimRequestSchema } from "../shared/giftSubscriptions";
import { kitPlanCheckoutRequestSchema, packCheckoutRequestSchema } from "../shared/subscriptionManagement";
import type { BillablePlanId, BillingPeriod } from "../shared/billingCatalog";
import { refusalBody, startKitPackCheckout, startKitPlanCheckout, type KitCheckoutDeps } from "./kitCheckout";

export type ChargebeeIdentity = { account: { id: number; email?: string | null; name?: string | null }; primaryEmail?: { emailAddress?: string | null } | null };

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
  getUserSubscription?: (userId: number, role: TokenRole) => Promise<{ subscriptionId: string; status: string; currentTermEnd?: Date } | undefined>;
  markSubscriptionNonRenewing?: (userId: number, role: TokenRole, subscriptionId: string, currentTermEnd?: Date) => Promise<unknown>;
  cancelSubscription?: typeof scheduleChargebeeSubscriptionCancellation;
  resolveHostedPage?: (input: { invoiceId?: string; amount: number; currency: string; site: string; apiKey: string }) => Promise<{ hostedPageId: string; invoiceId?: string; passThruContent?: string; amount?: number; currency?: string; pageState: string; invoiceStatus?: string; paymentStatus?: string; paid: boolean } | undefined>;
  getPaymentRecovery?: (userId: number, role: TokenRole, hostedPageId: string) => Promise<{ id: number; status: "pending" | "credited" | "requires_review" | "rejected" | "refunded"; hostedPageId: string | null; checkoutIntentId: string | null; tokenCount: number; amount: number; currency: string; reconciliationReason: string | null } | undefined>;
  markPaymentForReview?: (paymentId: number, reason: "provider_page_mismatch" | "provider_page_incomplete" | "reconciliation_rejected", evidence?: { invoiceId?: string; paidAmount?: number; paidCurrency?: string }) => Promise<unknown>;
  retrieveHostedPage?: typeof retrieveChargebeeHostedPage;
  getCreditSummary?: (userId: number, role: TokenRole) => Promise<unknown>;
  alertPaymentReview?: (input: { paymentId: number; reason: string; expectedAmount: number; expectedCurrency: string; paidAmount: number; paidCurrency: string }) => Promise<unknown>;
  applyPaymentRefund?: (input: { eventId: string; invoiceId?: string; refundAmount?: number; currency?: string }) => Promise<{ status: string; paymentId?: number; reason?: string }>;
  alertPaymentRefund?: (input: { eventId: string; invoiceId?: string; paymentId?: number; reason: string; refundAmount?: number; currency?: string }) => Promise<unknown>;
  alertUnmatchedPayment?: (input: { eventId: string; invoiceId?: string; hostedPageId?: string; reason: string; paidAmount: number; paidCurrency: string }) => Promise<unknown>;
  /**
   * D-067 (owner, Oct 18 2026): gifting a Pro/Max subscription is retired, so
   * no checkout or provider re-read exists any more. These read and settle
   * historic gift rows only, which is why a row's plan is a plain string.
   */
  recordGiftEvent?: (input: { eventId: string; eventType: string; giftId: string; status: string; receiverEmail?: string; receiverCustomerId?: string; subscriptionId?: string; buyerUserId?: number; plan?: string; currency?: "INR" | "USD"; amount?: number }) => Promise<{ giftId: string; fulfillmentStatus: string; plan?: string | null; currency?: string | null; subscriptionId?: string | null }>;
  resolveGiftRecipient?: (normalizedEmail: string) => Promise<{ status: string; userId?: number }>;
  fulfillGift?: (input: { giftId: string; subscriptionId: string; plan: string; currency: "INR" | "USD"; status: string; currentTermStart?: Date; currentTermEnd?: Date; resourceVersion?: number; receiverEmail: string; recipientUserId: number; role: TokenRole }) => Promise<unknown>;
  listBuyerGifts?: (buyerUserId: number) => Promise<Array<{ giftId: string; plan: string | null; currency: string | null; amount: number | null; receiverEmail: string | null; providerStatus: string | null; fulfillmentStatus: string; subscriptionId: string | null; creditedAt: Date | null; createdAt: Date }>>;
  listClaimableGifts?: (userId: number) => Promise<Array<{ giftId: string; plan: string | null; currency: string | null; amount: number | null; subscriptionId: string | null; receiverEmail: string | null; createdAt: Date }>>;
  claimGift?: (userId: number, giftId: string) => Promise<unknown>;
};

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
  app.post("/api/chargebee/checkout", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in before purchasing tokens" });
      const itemPriceId = req.body?.itemPriceId;
      // A kit credit pack names a pack, not a legacy token item price. Refuse
      // before anything else so a pack body never falls through to "unsupported".
      const kitPack = packCheckoutRequestSchema.safeParse(req.body);
      if (kitPack.success) {
        const origin = `${req.protocol}://${req.get("host")}`;
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
      const role = roleFromBody(req.body?.role);
      const quantity = req.body?.quantity ?? 1;
      if (!isTokenQuantity(quantity)) return res.status(400).json({ error: "Choose a whole number of tokens between 1 and 1,000" });
      const pack = CHARGEBEE_TOKEN_PACKS[itemPriceId];
      if ((billingCountry === "IN" && pack.currency !== "INR") || (billingCountry === "INTL" && pack.currency !== "USD")) {
        return res.status(400).json({ error: "That currency is not available for the selected billing route" });
      }
      const origin = `${req.protocol}://${req.get("host")}`;
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
      // D-067 (owner, Oct 18 2026): Pro/Max are removed. The pre-kit
      // ({plan, currency, billingCountry}) body is retired: it answers 410 with
      // the plan catalog, and the kit pass/Keep warm body below is the only
      // subscription checkout. Stored pro/max wallets read as Free.
      const kitPlan = kitPlanCheckoutRequestSchema.safeParse(req.body);
      if (kitPlan.success) {
        if (!deps.createSubscriptionIntent) return res.status(503).json({ error: "Subscription checkout is not configured" });
        const origin = `${req.protocol}://${req.get("host")}`;
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
      const plan = req.body?.plan;
      const currency = req.body?.currency;
      const billingCountry = req.body?.billingCountry;
      if (typeof plan === "string" || typeof currency === "string" || typeof billingCountry === "string") {
        return res.status(410).json({ error: "Pro and Max are retired. Choose a plan in Plans & credits.", code: "legacy_plan_retired" });
      }
      return res.status(400).json({ error: "Choose a plan in Plans & credits" });
    } catch (error) {
      console.error("[Chargebee] subscription checkout error", error);
      if (isChargebeeNotConfigured(error)) return res.status(503).json({ error: "Chargebee is not configured" });
      return res.status(502).json({ error: "Unable to start the secure plan checkout" });
    }
  });

  app.post("/api/chargebee/gift-checkout", async (_req, res) => {
    // D-067 (owner, Oct 18 2026): gifting a Pro/Max subscription is removed with
    // the plans. Historic gift rows stay readable through the claim route below;
    // no new gift checkout can start.
    return res.status(410).json({ error: "Gifting is no longer available", code: "gift_retired" });
  });

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
      const attempt = async () => deps.claimGift!(identity.account.id, parsed.data.giftId);
      // D-067 (owner, Oct 18 2026): gifting is retired. A historic row with no
      // plan recorded used to be resolved by re-reading the provider, which
      // needed a Pro/Max item price that no longer exists. It answers the
      // retired code now instead of a retry that could never succeed.
      let result: unknown;
      try {
        result = await attempt();
      } catch (error) {
        if (error instanceof Error && error.message === "This gift is not ready to claim yet") {
          return res.status(410).json({ error: "Gifting is retired. This gift can no longer be claimed.", code: "gift_retired" });
        }
        throw error;
      }
      record({ actorUserId: identity.account.id, action: "billing.gift_claimed", outcome: "success", resourceType: "gift", resourceId: parsed.data.giftId });
      return res.json({ status: (result as { status?: string }).status ?? "credited" });
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

  app.post("/api/chargebee/webhook", async (req, res) => {
    const secret = resolveChargebeeWebhookSecret(req.hostname);
    if (!secret || !basicAuthMatches(req.header("authorization"), secret)) return res.status(401).send("Unauthorized");
    const subscription = parseSubscriptionEvent(req.body);
    const payment = parsePaidPaymentEvent(req.body);
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

    // #77 safety net: a paid invoice we cannot tie to any checkout, active
    // subscription, or gift must never disappear silently. Log it for review
    // and alert the administrator. Subscription renewals (handled above) and
    // gifted subscriptions (tracked by gift events) are not unmatched.
    const giftPaid = Boolean(req.body?.content?.gift || req.body?.content?.subscription?.gift_id || req.body?.content?.invoice?.gift_id);
    const subscriptionHandled = Boolean(subscription && obligations.subscription && (obligations.subscription as { status?: string }).status !== "ignored");
    const paymentResult = obligations.payment as { status?: string; reason?: string } | undefined;
    const paymentUnmatched = payment && !subscriptionHandled && !giftPaid && (
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
        const recorded = await deps.recordGiftEvent({ ...gift });
        // Lifecycle events (scheduled/unclaimed/expired/cancelled/updated) are
        // durable receipts only: no credit moves, handled stays false, and the
        // delivery ends 202 exactly as before gifts existed. Only a claimed
        // gift naming a receiver subscription is a credit obligation.
        if (gift.eventType === "gift_claimed" && gift.subscriptionId && gift.receiverEmail) {
          handled = true;
          // D-067 (owner, Oct 18 2026): gifting is retired, so a gift carries
          // the plan its own row already recorded. The provider re-read that
          // filled a missing plan needed a Pro/Max item price that no longer
          // exists; a row without one is settled as history and moves no credit.
          const plan = recorded.plan ?? undefined;
          const currency = (recorded.currency === "INR" || recorded.currency === "USD" ? recorded.currency : undefined);
          if (plan && currency && deps.resolveGiftRecipient && deps.fulfillGift) {
            const recipient = await deps.resolveGiftRecipient(gift.receiverEmail);
            if (recipient.status === "resolved" && recipient.userId) {
              obligations.gift = await deps.fulfillGift({
                giftId: gift.giftId, subscriptionId: gift.subscriptionId, plan, currency,
                status: "non_renewing", receiverEmail: gift.receiverEmail,
                recipientUserId: recipient.userId, role: "job_seeker", resourceVersion: gift.resourceVersion,
              });
            } else {
              obligations.gift = { status: "pending", reason: `recipient_${recipient.status}` };
            }
          } else {
            obligations.gift = { status: "pending", reason: !plan || !currency ? "plan_unresolved" : "recipient_unresolved" };
          }
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
