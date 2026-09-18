import type { Express, Request, Response } from "express";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import express from "express";
import { paypalAccessToken, type ActivityInput } from "./payments";

/**
 * Gateway webhooks for the direct payment providers (Razorpay INR, PayPal USD).
 * These routes are server-to-server: no user identity is resolved here.
 *
 * Hard rule (mirrors the Chargebee webhook): a gateway webhook NEVER credits
 * tokens and NEVER writes or mutates paymentFulfillments rows. It only (a)
 * records the delivery in the operational-activity ledger and (b) reports
 * whether the event correlates to a checkout this app initiated. Fulfillment
 * stays with the Chargebee pipeline, which remains the billing source of
 * truth; its recovery flow reconciles from there.
 *
 * Registration order matters: these routes must be registered BEFORE the
 * global express.json() body parser so the Razorpay handler can HMAC the
 * exact raw bytes the provider signed. Each route parses its own body.
 *
 * Env contract:
 *   RAZORPAY_WEBHOOK_SECRET                  -> HMAC-SHA256 over the raw body (x-razorpay-signature, hex)
 *   PAYPAL_CLIENT_ID / PAYPAL_SECRET         -> access token for the verify-webhook-signature API
 *   PAYPAL_WEBHOOK_ID                        -> enables API signature verification; without it
 *                                               deliveries are recorded as requires_review (never fulfilled)
 *   PAYPAL_ENV=sandbox|live                  -> API base, defaults to live
 */

export type GatewayEventInput = { provider: "razorpay" | "paypal"; eventId: string; eventType: string; checkoutIntentId?: string; hostedPageId?: string; paymentId?: string; orderId?: string; refundId?: string; amount?: number; currency?: string; status?: string };

export type PayPalWebhookVerifier = (input: { authAlgo?: string; certUrl?: string; transmissionId?: string; transmissionSig?: string; transmissionTime?: string; event: unknown }) => Promise<"SUCCESS" | "FAILURE">;

const RAZORPAY_EVENTS = ["payment.captured", "payment.failed", "refund.processed"];
const PAYPAL_EVENTS = ["CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.REFUNDED"];

const rawBodies = new WeakMap<IncomingMessage, Buffer>();

function captureRawBody(req: IncomingMessage, _res: ServerResponse, buf: Buffer, _encoding: string) {
  rawBodies.set(req, buf);
}

function razorpaySignatureMatches(raw: Buffer, secret: string, header: string | undefined): boolean {
  if (!header) return false;
  const provided = Buffer.from(header.trim(), "utf8");
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"), "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function integerNote(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

// PayPal order routes use reference "skipwait-<userId>-<ms>"; recover the
// actor for the activity ledger when the reference survives into the event.
function userIdFromReference(value: unknown): number | undefined {
  const match = typeof value === "string" ? value.match(/^skipwait-(\d+)-/) : undefined;
  return match ? Number(match[1]) : undefined;
}

async function verifyPayPalWebhookViaApi(input: { authAlgo?: string; certUrl?: string; transmissionId?: string; transmissionSig?: string; transmissionTime?: string; event: unknown }): Promise<"SUCCESS" | "FAILURE"> {
  const base = process.env.PAYPAL_ENV === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
  const token = await paypalAccessToken();
  const response = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ auth_algo: input.authAlgo, cert_url: input.certUrl, transmission_id: input.transmissionId, transmission_sig: input.transmissionSig, transmission_time: input.transmissionTime, webhook_id: process.env.PAYPAL_WEBHOOK_ID, webhook_event: input.event }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`paypal webhook verification failed: ${response.status}`);
  return ((await response.json()) as { verification_status?: string }).verification_status === "SUCCESS" ? "SUCCESS" : "FAILURE";
}

export function registerPaymentWebhookRoutes(app: Express, deps: { record: (entry: ActivityInput) => Promise<void>; recordGatewayEvent?: (input: GatewayEventInput) => Promise<{ matched: boolean } | undefined>; verifyPayPalWebhook?: PayPalWebhookVerifier; applyUnlockRefund?: (input:{refundId:string;paymentId:string;orderId?:string;amount:number;currency:string})=>Promise<unknown>; fulfillUnlockCredits?: (input: { userId: number; pack: string; paymentId: string; orderId: string; amount: number; currency: string }) => Promise<unknown> }) {
  const paypalConfigured = () => Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET);
  const paypalVerificationConfigured = () => Boolean(process.env.PAYPAL_WEBHOOK_ID) && paypalConfigured();

  async function handleRazorpayWebhook(req: Request, res: Response) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ error: "Webhook not configured" });
    const raw = rawBodies.get(req);
    if (!raw || !razorpaySignatureMatches(raw, secret, req.header("x-razorpay-signature"))) return res.status(400).json({ error: "Invalid webhook signature" });
    const event = typeof req.body?.event === "string" ? req.body.event : "";
    if (!RAZORPAY_EVENTS.includes(event)) return res.status(200).json({ received: true, ignored: true });
    const payment = req.body?.payload?.payment?.entity;
    const refund = req.body?.payload?.refund?.entity;
    const subject = (payment ?? refund) as Record<string, unknown> | undefined;
    const notes = (subject?.notes ?? {}) as Record<string, unknown>;
    const checkoutIntentId = typeof notes.checkoutIntentId === "string" ? notes.checkoutIntentId : undefined;
    // B2B unlock-credit packs self-fulfill on verified capture: notes.kind =
    // "unlock_credits" carries the pack id, and the handler credits the
    // employer wallet (idempotent per payment id). Seeker token fulfillment
    // still never happens here — Chargebee remains that pipeline's truth.
    if (event === "payment.captured" && notes.kind === "unlock_credits" && deps.fulfillUnlockCredits) {
      const unlockUserId = integerNote(notes.userId);
      const pack = typeof notes.pack === "string" ? notes.pack : "";
      const paymentId = typeof payment?.id === "string" ? payment.id : "";
      const orderId = typeof payment?.order_id === "string" ? payment.order_id : "";
      const amount = typeof payment?.amount === "number" ? payment.amount : NaN;
      const currency = typeof payment?.currency === "string" ? payment.currency.toUpperCase() : "";
      if (!unlockUserId || !pack || !paymentId || !orderId || !Number.isInteger(amount) || amount <= 0 || !currency) return res.status(200).json({ received: true, matched: false, fulfillment: "requires_review" });
      try {
        const fulfillment = await deps.fulfillUnlockCredits({ userId: unlockUserId, pack, paymentId, orderId, amount, currency }) as { status?: string } | undefined;
        if (fulfillment?.status === "requires_review") return res.status(200).json({ received: true, matched: false, fulfillment: "requires_review" });
      } catch (error) {
        console.warn("[Payments] Razorpay capture fulfillment failed; retrying:", error);
        return res.status(503).json({ error: "Payment fulfillment pending retry" });
      }
    }
    if(event==="refund.processed"&&deps.applyUnlockRefund){const refundId=typeof refund?.id==="string"?refund.id:"";const paymentId=typeof refund?.payment_id==="string"?refund.payment_id:"";const amount=typeof refund?.amount==="number"?refund.amount:NaN;const currency=typeof refund?.currency==="string"?refund.currency:"";const orderId=typeof refund?.order_id==="string"?refund.order_id:undefined;if(!refundId||!paymentId||!Number.isInteger(amount)||amount<=0||!currency)return res.status(200).json({received:true,matched:false,refund:"requires_review"});try{await deps.applyUnlockRefund({refundId,paymentId,orderId,amount,currency});}catch(error){console.warn("[Payments] Razorpay refund reversal failed; retrying:",error);return res.status(503).json({error:"Refund reversal pending retry"});}}
    // Correlation is a read-only lookup on paymentFulfillments (see
    // recordGatewayPaymentEvent): unmatched deliveries still ack 200 so
    // Razorpay does not retry forever, and nothing is ever fabricated.
    const correlation = checkoutIntentId ? await deps.recordGatewayEvent?.({ provider: "razorpay", eventId: event, eventType: event, checkoutIntentId, hostedPageId: typeof notes.hostedPageId === "string" ? notes.hostedPageId : undefined, paymentId: payment?.id, refundId: refund?.id, orderId: payment?.order_id, amount: typeof payment?.amount === "number" ? payment.amount : undefined, currency: typeof payment?.currency === "string" ? payment.currency : undefined }) : undefined;
    await deps.record({
      actorUserId: integerNote(notes.userId),
      action: `payment.razorpay_${event}`,
      outcome: event === "payment.failed" ? "failure" : "success",
      resourceType: "payment",
      resourceId: (payment?.id ?? refund?.id) as string | undefined,
      metadata: { orderId: payment?.order_id, amount: payment?.amount ?? refund?.amount, currency: payment?.currency ?? refund?.currency, status: typeof subject?.status === "string" ? subject.status : undefined, verification: "hmac_verified" },
    });
    return res.status(200).json({ received: true, matched: correlation?.matched === true });
  }

  // Legacy alias: the Razorpay dashboard had a webhook registered at
  // /api/razorpay/webhook before the handler lived here; keep both paths
  // wired to the same handler so existing registrations keep working.
  app.post("/api/razorpay/webhook", express.json({ limit: "256kb", verify: captureRawBody }), async (req: Request, res: Response) => {
    return handleRazorpayWebhook(req, res);
  });

  app.post("/api/payments/razorpay/webhook", express.json({ limit: "256kb", verify: captureRawBody }), async (req: Request, res: Response) => {
    return handleRazorpayWebhook(req, res);
  });

  app.post("/api/payments/paypal/webhook", express.json({ limit: "256kb" }), async (req: Request, res: Response) => {
    const verifier = deps.verifyPayPalWebhook ?? (paypalVerificationConfigured() ? verifyPayPalWebhookViaApi : undefined);
    if (!verifier && !paypalConfigured()) return res.status(503).json({ error: "Webhook not configured" });
    const event = typeof req.body?.event_type === "string" ? req.body.event_type : "";
    if (!PAYPAL_EVENTS.includes(event)) return res.status(200).json({ received: true, ignored: true });
    const resource = (req.body?.resource ?? {}) as Record<string, unknown>;
    const amount = resource.amount as { value?: string; currency_code?: string } | undefined;
    const unit = Array.isArray(resource.purchase_units) ? (resource.purchase_units[0] as Record<string, unknown> | undefined) : undefined;
    const supplementary = resource.supplementary_data as { related_ids?: { order_id?: string } } | undefined;
    const eventId = typeof req.body?.id === "string" ? req.body.id : String(resource.id ?? event);
    // Fail closed: a verifier that rejects or errors returns 400 so PayPal
    // retries; without any verifier (e.g. sandbox without PAYPAL_WEBHOOK_ID)
    // the delivery is recorded as requires_review and never treated as paid.
    let verified = false;
    if (verifier) {
      try {
        verified = (await verifier({ authAlgo: req.header("PAYPAL-AUTH-ALGO") ?? undefined, certUrl: req.header("PAYPAL-CERT-URL") ?? undefined, transmissionId: req.header("PAYPAL-TRANSMISSION-ID") ?? undefined, transmissionSig: req.header("PAYPAL-TRANSMISSION-SIG") ?? undefined, transmissionTime: req.header("PAYPAL-AUTH-TIMEOUT") ?? req.header("PAYPAL-TRANSMISSION-TIME") ?? undefined, event: req.body })) === "SUCCESS";
      } catch (error) {
        console.warn("[Payments] paypal webhook verification unavailable:", error);
      }
      if (!verified) return res.status(400).json({ error: "Webhook verification failed" });
    }
    const checkoutIntentId = typeof resource.custom_id === "string" ? resource.custom_id : typeof unit?.custom_id === "string" ? unit.custom_id : undefined;
    // Correlate only verified events; unverified deliveries are activity-only.
    const correlation = verified && checkoutIntentId ? await deps.recordGatewayEvent?.({ provider: "paypal", eventId, eventType: event, checkoutIntentId, paymentId: typeof resource.id === "string" ? resource.id : undefined, orderId: supplementary?.related_ids?.order_id ?? (event === "CHECKOUT.ORDER.APPROVED" && typeof resource.id === "string" ? resource.id : undefined), amount: amount?.value === undefined ? undefined : Number(amount.value), currency: amount?.currency_code, status: typeof resource.status === "string" ? resource.status : undefined }) : undefined;
    await deps.record({
      actorUserId: userIdFromReference(resource.reference_id ?? unit?.reference_id),
      action: `payment.paypal_${event}`,
      outcome: verified ? (event === "PAYMENT.CAPTURE.DENIED" ? "failure" : "success") : "denied",
      resourceType: "payment",
      resourceId: typeof resource.id === "string" ? resource.id : eventId,
      metadata: { orderId: supplementary?.related_ids?.order_id ?? (event === "CHECKOUT.ORDER.APPROVED" && typeof resource.id === "string" ? resource.id : undefined), amount: amount?.value === undefined ? undefined : Number(amount.value), currency: amount?.currency_code, status: typeof resource.status === "string" ? resource.status : undefined, verification: verified ? "verified" : "requires_review" },
    });
    if (!verified) return res.status(202).json({ received: true, matched: false, verification: "requires_review" });
    return res.status(200).json({ received: true, matched: correlation?.matched === true, verification: "verified" });
  });
}
