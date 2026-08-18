import type { Express, Request } from "express";
import { basicAuthMatches, CHARGEBEE_TOKEN_PACKS, createChargebeeCheckout, createChargebeeSubscriptionCheckout, isTokenPackId, isTokenQuantity, parsePaidPaymentEvent, parseSubscriptionEvent, retrieveChargebeeHostedPage, scheduleChargebeeSubscriptionCancellation, tokenPackFromAmount } from "./chargebee";
import type { TokenRole } from "./chargebee";
import { SUBSCRIPTION_PLANS, isPaidSubscriptionPlan, type PaidSubscriptionPlan } from "../shared/subscriptionPlans";

export type ChargebeeIdentity = { account: { id: number; email?: string | null; name?: string | null }; primaryEmail?: { emailAddress?: string | null } | null };

type Deps = {
  resolveIdentity: (req: Request) => Promise<ChargebeeIdentity | undefined>;
  createCheckout?: typeof createChargebeeCheckout;
  createPaymentIntent: (input: { hostedPageId: string; checkoutIntentId: string; userId: number; role: TokenRole; tokenCount: number; amount: number; currency: string }) => Promise<unknown>;
  fulfillPayment: (input: { eventId: string; hostedPageId?: string; invoiceId?: string; passThruContent?: string; amount: number; currency: string }) => Promise<unknown>;
  createSubscriptionCheckout?: typeof createChargebeeSubscriptionCheckout;
  createSubscriptionIntent?: (input: { hostedPageId: string; checkoutIntentId: string; userId: number; role: TokenRole; plan: PaidSubscriptionPlan; itemPriceId: string; amount: number; currency: "INR" | "USD" }) => Promise<unknown>;
  applySubscriptionEvent?: (input: NonNullable<ReturnType<typeof parseSubscriptionEvent>>) => Promise<unknown>;
  getUserSubscription?: (userId: number, role: TokenRole) => Promise<{ subscriptionId: string; status: string; currentTermEnd?: Date } | undefined>;
  markSubscriptionNonRenewing?: (userId: number, role: TokenRole, subscriptionId: string, currentTermEnd?: Date) => Promise<unknown>;
  cancelSubscription?: typeof scheduleChargebeeSubscriptionCancellation;
  resolveHostedPage?: (input: { invoiceId?: string; amount: number; currency: string }) => Promise<{ hostedPageId: string; invoiceId?: string; passThruContent?: string; amount?: number; currency?: string } | undefined>;
  getPaymentRecovery?: (userId: number, role: TokenRole, hostedPageId: string) => Promise<{ id: number; status: "pending" | "credited" | "requires_review"; hostedPageId: string | null; checkoutIntentId: string | null; tokenCount: number; amount: number; currency: string; reconciliationReason: string | null } | undefined>;
  markPaymentForReview?: (paymentId: number, reason: "provider_page_mismatch" | "provider_page_incomplete" | "reconciliation_rejected") => Promise<unknown>;
  retrieveHostedPage?: typeof retrieveChargebeeHostedPage;
  getCreditSummary?: (userId: number, role: TokenRole) => Promise<unknown>;
};

function roleFromBody(value: unknown): TokenRole {
  return value === "referrer" ? "referrer" : "job_seeker";
}

export function registerChargebeeRoutes(app: Express, deps: Deps) {
  app.post("/api/chargebee/checkout", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in before purchasing tokens" });
      const itemPriceId = req.body?.itemPriceId;
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
      const checkout = await (deps.createCheckout ?? createChargebeeCheckout)({
        itemPriceId,
        quantity,
        email: identity.primaryEmail?.emailAddress ?? identity.account.email ?? undefined,
        firstName: identity.account.name?.split(" ")[0],
        lastName: identity.account.name?.split(" ").slice(1).join(" "),
        redirectUrl: `${origin}/premium?role=${role}&payment=pending`,
        cancelUrl: `${origin}/premium?role=${role}&payment=cancelled`,
      });
      await deps.createPaymentIntent({ hostedPageId: checkout.hostedPageId, checkoutIntentId: checkout.checkoutIntentId, userId: identity.account.id, role, tokenCount: pack.tokenCount * quantity, amount: pack.amount * quantity, currency: pack.currency });
      return res.json({ checkoutUrl: checkout.checkoutUrl, hostedPageId: checkout.hostedPageId });
    } catch (error) {
      console.error("[Chargebee] checkout error", error);
      return res.status(502).json({ error: "Unable to start Chargebee checkout" });
    }
  });

  app.post("/api/chargebee/subscription-checkout", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in before choosing a plan" });
      const plan = req.body?.plan;
      const currency = req.body?.currency;
      const billingCountry = req.body?.billingCountry;
      const role = roleFromBody(req.body?.role);
      if (!isPaidSubscriptionPlan(plan)) return res.status(400).json({ error: "Choose Pro or Max" });
      if ((currency !== "INR" && currency !== "USD") || (billingCountry !== "IN" && billingCountry !== "INTL")) return res.status(400).json({ error: "Choose a supported billing route" });
      if ((billingCountry === "IN" && currency !== "INR") || (billingCountry === "INTL" && currency !== "USD")) return res.status(400).json({ error: "That currency is not available for the selected billing route" });
      const selectedCurrency = currency as "INR" | "USD";
      const origin = `${req.protocol}://${req.get("host")}`;
      const checkout = await (deps.createSubscriptionCheckout ?? createChargebeeSubscriptionCheckout)({
        plan,
        currency: selectedCurrency,
        email: identity.primaryEmail?.emailAddress ?? identity.account.email ?? undefined,
        firstName: identity.account.name?.split(" ")[0],
        lastName: identity.account.name?.split(" ").slice(1).join(" "),
        redirectUrl: `${origin}/plans?role=${role}&payment=pending`,
        cancelUrl: `${origin}/plans?role=${role}&payment=cancelled`,
      });
      const price = SUBSCRIPTION_PLANS[plan].prices[selectedCurrency];
      if (!deps.createSubscriptionIntent) throw new Error("Subscription intent storage is not configured");
      await deps.createSubscriptionIntent({ hostedPageId: checkout.hostedPageId, checkoutIntentId: checkout.checkoutIntentId, userId: identity.account.id, role, plan, itemPriceId: price.itemPriceId, amount: price.amount, currency: selectedCurrency });
      return res.json({ checkoutUrl: checkout.checkoutUrl, hostedPageId: checkout.hostedPageId });
    } catch (error) {
      console.error("[Chargebee] subscription checkout error", error);
      return res.status(502).json({ error: "Unable to start the secure plan checkout" });
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
      const result = await (deps.cancelSubscription ?? scheduleChargebeeSubscriptionCancellation)({ subscriptionId: subscription.subscriptionId });
      await deps.markSubscriptionNonRenewing?.(identity.account.id, role, subscription.subscriptionId, result.currentTermEnd);
      return res.json({ status: result.status, currentTermEnd: result.currentTermEnd });
    } catch (error) {
      console.error("[Chargebee] subscription cancellation error", error);
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

      const hostedPage = await (deps.retrieveHostedPage ?? retrieveChargebeeHostedPage)(hostedPageId);
      if (!hostedPage) return res.json({ status: "pending", summary: await summary() });
      if (!hostedPage.passThruContent || !Number.isInteger(hostedPage.amount) || !hostedPage.currency) {
        await deps.markPaymentForReview?.(payment.id, "provider_page_incomplete");
        return res.json({ status: "requires_review", summary: await summary() });
      }
      if (hostedPage.passThruContent !== payment.checkoutIntentId || hostedPage.amount !== payment.amount || hostedPage.currency !== payment.currency) {
        await deps.markPaymentForReview?.(payment.id, "provider_page_mismatch");
        return res.json({ status: "requires_review", summary: await summary() });
      }
      const result = await deps.fulfillPayment({ eventId: `hosted_page:${hostedPage.hostedPageId}`, hostedPageId: hostedPage.hostedPageId, invoiceId: hostedPage.invoiceId, passThruContent: hostedPage.passThruContent, amount: hostedPage.amount, currency: hostedPage.currency });
      if ((result as { status?: string }).status === "credited" || (result as { status?: string }).status === "duplicate") return res.json({ status: "credited", tokenCount: payment.tokenCount, summary: await summary() });
      await deps.markPaymentForReview?.(payment.id, "reconciliation_rejected");
      return res.json({ status: "requires_review", summary: await summary() });
    } catch (error) {
      console.error("[Chargebee] payment recovery error", error);
      return res.status(502).json({ error: "We are still securely confirming this payment. No action is needed from you." });
    }
  });

  app.post("/api/chargebee/webhook", async (req, res) => {
    const secret = process.env.CHARGEBEE_WEBHOOK_SECRET;
    if (!secret || !basicAuthMatches(req.header("authorization"), secret)) return res.status(401).send("Unauthorized");
    const subscription = parseSubscriptionEvent(req.body);
    if (subscription && deps.applySubscriptionEvent) {
      try {
        const result = await deps.applySubscriptionEvent(subscription);
        return res.status(200).json({ received: true, result });
      } catch (error) {
        console.error("[Chargebee] subscription entitlement error", error);
        return res.status(500).json({ error: "Subscription synchronization retry required" });
      }
    }
    const parsed = parsePaidPaymentEvent(req.body);
    if (!parsed) return res.status(202).json({ received: true, ignored: true });
    if (!tokenPackFromAmount(parsed.amount, parsed.currency)) return res.status(202).json({ received: true, ignored: true });
    try {
      const resolvedHostedPage = (!parsed.hostedPageId || !parsed.passThruContent) && deps.resolveHostedPage
        ? await deps.resolveHostedPage({ invoiceId: parsed.invoiceId, amount: parsed.amount, currency: parsed.currency })
        : undefined;
      const result = await deps.fulfillPayment({
        ...parsed,
        hostedPageId: parsed.hostedPageId ?? resolvedHostedPage?.hostedPageId,
        passThruContent: parsed.passThruContent ?? resolvedHostedPage?.passThruContent,
      });
      return res.status(200).json({ received: true, result });
    } catch (error) {
      console.error("[Chargebee] fulfillment error", error);
      return res.status(500).json({ error: "Fulfillment retry required" });
    }
  });
}
