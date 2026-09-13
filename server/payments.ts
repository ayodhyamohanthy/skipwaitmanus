import type { Express, Request, Response } from "express";

/**
 * Payment providers: Razorpay for domestic (INR) checkouts, PayPal for global
 * (USD). Chargebee remains the fallback when neither provider key is set, so
 * existing subscription management keeps working unchanged.
 *
 * Env contract:
 *   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET   -> INR orders (api.razorpay.com)
 *   PAYPAL_CLIENT_ID / PAYPAL_SECRET        -> USD orders (api-m.s.paypal.com)
 *   PAYPAL_ENV=sandbox|live                 -> defaults to live
 */

export function razorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET);
}

async function razorpayOrder(input: { amountInRupees: number; receipt: string; notes?: Record<string, string> }) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: Math.round(input.amountInRupees * 100), currency: "INR", receipt: input.receipt, notes: input.notes }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`razorpay order failed: ${response.status}`);
  return (await response.json()) as { id: string; amount: number; currency: string };
}

// Paise-native variant for fixed-price B2B packs (employer unlock credits),
// where the price is already defined in the smallest currency unit.
export async function razorpayOrderInPaise(input: { amountInPaise: number; receipt: string; notes?: Record<string, string> }) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: Math.round(input.amountInPaise), currency: "INR", receipt: input.receipt, notes: input.notes }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`razorpay order failed: ${response.status}`);
  return (await response.json()) as { id: string; amount: number; currency: string };
}

export async function paypalAccessToken(): Promise<string> {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString("base64");
  const base = process.env.PAYPAL_ENV === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
  const response = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`paypal token failed: ${response.status}`);
  return ((await response.json()) as { access_token: string }).access_token;
}

async function paypalOrder(input: { amountUsd: number; reference: string }) {
  const base = process.env.PAYPAL_ENV === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
  const token = await paypalAccessToken();
  const response = await fetch(`${base}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{ reference_id: input.reference, amount: { currency_code: "USD", value: input.amountUsd.toFixed(2) } }],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`paypal order failed: ${response.status}`);
  return (await response.json()) as { id: string; status: string };
}

type PlanPricing = { inrAmount: number; usdAmount: number };

export type ActivityInput = { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number; companyDomain?: string; metadata?: Record<string, string | number | boolean | null | undefined> };

export function registerPaymentRoutes(
  app: Express,
  deps: {
    planPricing: (planId: string, tokens: number) => PlanPricing | undefined;
    resolveIdentity: (req: Request) => Promise<{ account: { id: number } } | undefined>;
    record: (entry: ActivityInput) => Promise<void>;
    /**
     * Set true ONLY once a fulfillment path exists for seeker plan purchases
     * made through these gateways. Until then the order routes fail closed.
     *
     * Why: the Razorpay/PayPal webhooks deliberately never credit tokens (see
     * paymentWebhooks.ts — only `notes.kind === "unlock_credits"` self-fulfills)
     * and Chargebee remains the billing source of truth for subscriptions. An
     * order minted here carries `notes: { userId, planId }`, which nothing
     * fulfills, so the user would be charged and receive nothing.
     */
    planPurchaseFulfillmentEnabled?: boolean;
  }
) {
  const fulfillmentAvailable = deps.planPurchaseFulfillmentEnabled === true;
  app.post("/api/payments/razorpay/order", async (req, res) => {
    try {
      if (!razorpayConfigured()) return res.status(503).json({ error: "Razorpay is not configured" });
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to purchase credits" });
      const planId = typeof req.body?.planId === "string" ? req.body.planId : "";
      const tokens = Number(req.body?.tokens);
      const pricing = deps.planPricing(planId, tokens);
      if (!pricing) return res.status(400).json({ error: "Unknown plan" });
      // Fail closed: refuse BEFORE the order is minted, so no money can move.
      if (!fulfillmentAvailable) {
        await deps.record({ actorUserId: identity.account.id, action: "payment.razorpay_order_blocked", outcome: "denied", resourceType: "payment", metadata: { planId, reason: "no_fulfillment_path" } });
        return res.status(501).json({ error: "Card checkout for credit packs is not available yet. Use the subscription checkout instead." });
      }
      const order = await razorpayOrder({ amountInRupees: pricing.inrAmount, receipt: `skipwait_${identity.account.id}_${Date.now()}`, notes: { userId: String(identity.account.id), planId } });
      await deps.record({ actorUserId: identity.account.id, action: "payment.razorpay_order_created", outcome: "success", resourceType: "payment", metadata: { planId, orderId: order.id } });
      res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
    } catch (error) {
      console.warn("[Payments] razorpay order error:", error);
      res.status(502).json({ error: "We could not start the Razorpay checkout. Try again shortly." });
    }
  });

  app.post("/api/payments/paypal/order", async (req, res) => {
    try {
      if (!paypalConfigured()) return res.status(503).json({ error: "PayPal is not configured" });
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to purchase credits" });
      const planId = typeof req.body?.planId === "string" ? req.body.planId : "";
      const tokens = Number(req.body?.tokens);
      const pricing = deps.planPricing(planId, tokens);
      if (!pricing) return res.status(400).json({ error: "Unknown plan" });
      // Fail closed — see the Razorpay route above and the deps doc comment.
      if (!fulfillmentAvailable) {
        await deps.record({ actorUserId: identity.account.id, action: "payment.paypal_order_blocked", outcome: "denied", resourceType: "payment", metadata: { planId, reason: "no_fulfillment_path" } });
        return res.status(501).json({ error: "PayPal checkout for credit packs is not available yet. Use the subscription checkout instead." });
      }
      const order = await paypalOrder({ amountUsd: pricing.usdAmount, reference: `skipwait-${identity.account.id}-${Date.now()}` });
      await deps.record({ actorUserId: identity.account.id, action: "payment.paypal_order_created", outcome: "success", resourceType: "payment", metadata: { planId, orderId: order.id } });
      res.json({ orderId: order.id, status: order.status });
    } catch (error) {
      console.warn("[Payments] paypal order error:", error);
      res.status(502).json({ error: "We could not start the PayPal checkout. Try again shortly." });
    }
  });
}
