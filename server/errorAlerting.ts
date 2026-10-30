import { createTransactionalEmailSender } from "./emailDelivery";
import type { RequestHandler } from "express";
import { recordOperationalActivity } from "./db";
import { scrubSentryPath } from "./sentry";

const ADMIN_ERROR_RECIPIENT = "ayodhya@skipwait.me";
// Second recipient: the owner mailbox. Best effort: the primary result decides success.
export const ADMIN_ALERT_COPY_RECIPIENT = "ayodhya@mail.instinct.com";

export async function sendAdminAlertEmail(fetchImpl: typeof fetch | undefined, input: { subject: string; text: string }) {
  const send = createTransactionalEmailSender({ fetchImpl });
  const primary = await send({ to: ADMIN_ERROR_RECIPIENT, ...input });
  try { await send({ to: ADMIN_ALERT_COPY_RECIPIENT, ...input }); } catch { /* copy is best effort */ }
  return primary;
}
const DEDUPLICATION_WINDOW_MS = 10 * 60 * 1000;

type AlertInput = {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
};

type AlertDependencies = {
  fetchImpl?: typeof fetch;
  recordActivity?: typeof recordOperationalActivity;
  now?: () => number;
};

function normalizedPath(path: string) {
  const pathname = scrubSentryPath(path).trim() || "/";
  return pathname.startsWith("/api/") ? pathname.slice(0, 180) : "";
}

function alertKey(input: AlertInput) {
  return `${input.method.toUpperCase()} ${normalizedPath(input.path)} ${input.statusCode}`;
}

export function createMaterialErrorEscalator(dependencies: AlertDependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const recordActivity = dependencies.recordActivity ?? recordOperationalActivity;
  const now = dependencies.now ?? Date.now;
  const recentAlerts = new Map<string, number>();

  return async function escalateMaterialError(input: AlertInput) {
    const route = normalizedPath(input.path);
    if (!route || input.statusCode < 500) return { alerted: false, reason: "not_material" as const };

    const key = alertKey(input);
    const timestamp = now();
    recentAlerts.forEach((sentAt, existingKey) => {
      if (timestamp - sentAt > DEDUPLICATION_WINDOW_MS) recentAlerts.delete(existingKey);
    });
    if (recentAlerts.has(key)) return { alerted: false, reason: "deduplicated" as const };
    recentAlerts.set(key, timestamp);

    const subject = `skipwait.me error alert · ${input.statusCode}`;
    const text = [
      "skipwait.me detected a material API error.",
      `Status: ${input.statusCode}`,
      `Route: ${input.method.toUpperCase()} ${route}`,
      `Duration: ${Math.max(0, Math.round(input.durationMs))} ms`,
      "No request body, resume, job link, referral text, OTP, payment data, or authentication secret is included.",
    ].join("\n");

    try {
      const delivery = await sendAdminAlertEmail(fetchImpl, { subject, text });
      if (!delivery.sent) throw new Error(delivery.reason === "not_configured" ? "Error alert delivery is not configured" : "Error alert delivery failed");

      await recordActivity({
        action: "system.error_alert_sent",
        outcome: "success",
        resourceType: "api_route",
        resourceId: route,
        metadata: { method: input.method.toUpperCase(), statusCode: input.statusCode, durationMs: Math.max(0, Math.round(input.durationMs)) },
      });
      return { alerted: true, reason: "sent" as const };
    } catch (error) {
      console.warn("[ErrorAlert] Unable to send administrator error alert", error instanceof Error ? error.message : error);
      await recordActivity({
        action: "system.error_alert_sent",
        outcome: "failure",
        resourceType: "api_route",
        resourceId: route,
        metadata: { method: input.method.toUpperCase(), statusCode: input.statusCode, durationMs: Math.max(0, Math.round(input.durationMs)) },
      }).catch(() => undefined);
      return { alerted: false, reason: "delivery_failed" as const };
    }
  };
}

const escalateMaterialError = createMaterialErrorEscalator();

export const materialErrorAlertMiddleware: RequestHandler = (req, res, next) => {
  const startedAt = Date.now();
  res.once("finish", () => {
    void escalateMaterialError({
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
  next();
};

export type PaymentReviewAlertInput = {
  paymentId: number;
  reason: string;
  expectedAmount: number;
  expectedCurrency: string;
  paidAmount: number;
  paidCurrency: string;
};

/**
 * Emails the administrator when a paid provider invoice could not be credited
 * automatically and was parked as requires_review. Unlike route errors this is
 * never deduplicated: every parked payment is a user who paid and is waiting.
 * Only the internal payment id, reason, and amounts are included.
 */
export function createPaymentReviewAlerter(dependencies: AlertDependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const recordActivity = dependencies.recordActivity ?? recordOperationalActivity;
  return async function alertPaymentReview(input: PaymentReviewAlertInput) {
    const subject = `skipwait.me payment needs review · #${input.paymentId}`;
    const text = [
      "A paid invoice could not be credited automatically and is waiting for admin review.",
      `Payment record: #${input.paymentId}`,
      `Reason: ${input.reason}`,
      `Expected: ${input.expectedAmount} ${input.expectedCurrency}`,
      `Paid: ${input.paidAmount} ${input.paidCurrency}`,
      "Resolve it in Admin > Payments requiring review.",
    ].join("\n");
    const metadata = { paymentId: input.paymentId, reason: input.reason };
    try {
      const delivery = await sendAdminAlertEmail(fetchImpl, { subject, text });
      if (!delivery.sent) throw new Error(delivery.reason === "not_configured" ? "Error alert delivery is not configured" : "Error alert delivery failed");
      await recordActivity({ action: "system.payment_review_alert_sent", outcome: "success", resourceType: "payment_fulfillment", resourceId: String(input.paymentId), metadata });
      return { alerted: true as const };
    } catch (error) {
      console.warn("[PaymentReviewAlert] Unable to send administrator alert", error instanceof Error ? error.message : error);
      await recordActivity({ action: "system.payment_review_alert_sent", outcome: "failure", resourceType: "payment_fulfillment", resourceId: String(input.paymentId), metadata }).catch(() => undefined);
      return { alerted: false as const };
    }
  };
}

export type UnmatchedPaymentAlertInput = { eventId: string; invoiceId?: string; hostedPageId?: string; reason: string; paidAmount: number; paidCurrency: string };

/**
 * #77: emails the administrator when Chargebee reports a paid invoice that no
 * checkout, subscription, or gift explains. Someone paid and nothing was
 * credited, so this is never deduplicated. Provider ids and amounts only.
 */
export function createUnmatchedPaymentAlerter(dependencies: AlertDependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const recordActivity = dependencies.recordActivity ?? recordOperationalActivity;
  return async function alertUnmatchedPayment(input: UnmatchedPaymentAlertInput) {
    const ref = input.invoiceId ?? input.eventId;
    const subject = `skipwait.me unmatched payment needs review · ${ref}`;
    const text = [
      "Chargebee reported a paid invoice that matches no checkout, subscription, or gift. Nothing was credited.",
      `Invoice: ${input.invoiceId ?? "unknown"}`,
      `Event: ${input.eventId}`,
      `Hosted page: ${input.hostedPageId ?? "unknown"}`,
      `Reason: ${input.reason}`,
      `Paid: ${input.paidAmount} ${input.paidCurrency}`,
      "Look it up in Chargebee and credit or refund the customer.",
    ].join("\n");
    const metadata = { eventId: input.eventId, invoiceId: input.invoiceId, reason: input.reason };
    try {
      const delivery = await sendAdminAlertEmail(fetchImpl, { subject, text });
      if (!delivery.sent) throw new Error(delivery.reason === "not_configured" ? "Error alert delivery is not configured" : "Error alert delivery failed");
      await recordActivity({ action: "system.unmatched_payment_alert_sent", outcome: "success", resourceType: "chargebee_invoice", resourceId: ref, metadata });
      return { alerted: true as const };
    } catch (error) {
      console.warn("[UnmatchedPaymentAlert] Unable to send administrator alert", error instanceof Error ? error.message : error);
      await recordActivity({ action: "system.unmatched_payment_alert_sent", outcome: "failure", resourceType: "chargebee_invoice", resourceId: ref, metadata }).catch(() => undefined);
      return { alerted: false as const };
    }
  };
}

export type PaymentRefundAlertInput = { eventId: string; invoiceId?: string; paymentId?: number; reason: string; refundAmount?: number; currency?: string };

/**
 * Emails the administrator when a Chargebee refund could not be settled
 * automatically (partial refund, credits already spent, or a refund that maps
 * to no credit purchase). The money has already moved at the provider, so this
 * is never deduplicated. Provider ids and amounts only.
 */
export function createPaymentRefundAlerter(dependencies: AlertDependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const recordActivity = dependencies.recordActivity ?? recordOperationalActivity;
  return async function alertPaymentRefund(input: PaymentRefundAlertInput) {
    const ref = input.invoiceId ?? input.eventId;
    const subject = `skipwait.me refund needs review · ${ref}`;
    const text = [
      "Chargebee refunded a payment and the credits could not be taken back automatically. The user's wallet was not changed.",
      `Invoice: ${input.invoiceId ?? "unknown"}`,
      `Event: ${input.eventId}`,
      `Payment record: ${input.paymentId ? `#${input.paymentId}` : "none found"}`,
      `Reason: ${input.reason}`,
      `Refunded: ${input.refundAmount ?? "unknown"} ${input.currency ?? ""}`.trim(),
      "Decide in Admin > Payments requiring review, or look it up in Chargebee.",
    ].join("\n");
    const metadata = { eventId: input.eventId, invoiceId: input.invoiceId, paymentId: input.paymentId, reason: input.reason };
    try {
      const delivery = await sendAdminAlertEmail(fetchImpl, { subject, text });
      if (!delivery.sent) throw new Error(delivery.reason === "not_configured" ? "Error alert delivery is not configured" : "Error alert delivery failed");
      await recordActivity({ action: "system.payment_refund_alert_sent", outcome: "success", resourceType: "chargebee_invoice", resourceId: ref, metadata });
      return { alerted: true as const };
    } catch (error) {
      console.warn("[PaymentRefundAlert] Unable to send administrator alert", error instanceof Error ? error.message : error);
      await recordActivity({ action: "system.payment_refund_alert_sent", outcome: "failure", resourceType: "chargebee_invoice", resourceId: ref, metadata }).catch(() => undefined);
      return { alerted: false as const };
    }
  };
}

/**
 * Why a plan event reached a human: plan_retired (a Pro/Max subscription, D-067), gift_claimed /
 * gift_claim_refused (a gift of one), or unsupported_plan (an item price skipwait.me cannot place).
 */
export type RetiredPlanAlertReason = "plan_retired" | "gift_claimed" | "gift_claim_refused" | "unsupported_plan" | "unlinked_subscription";
export type RetiredPlanAlertInput = { eventId?: string; eventType?: string; reason: RetiredPlanAlertReason; subscriptionId?: string; giftId?: string; itemPriceId?: string };

/**
 * D-067: emails the administrator when Chargebee sends anything for the retired
 * Pro/Max plans (a renewal, a change, a claimed gift) or a recipient tries to
 * claim such a gift. Nothing is granted for these, so a human must cancel the
 * subscription and refund the customer in the Chargebee dashboard. An event on
 * an item price skipwait.me cannot place (unsupported_plan) is not called Pro/Max
 * and carries no refund instruction: it may be a paying kit customer, so it asks
 * for a review. Never deduplicated here (callers alert once per transition).
 * Provider ids only.
 */
export type CardValidationAlertInput = { eventId?: string; eventType?: string; customerId?: string; paymentSourceId?: string; reason: string };

/** D-079: a card-validation failure reaches the owner immediately (owner's rule). */
export function createCardValidationAlerter(dependencies: AlertDependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const recordActivity = dependencies.recordActivity ?? recordOperationalActivity;
  return async function alertCardValidationEvent(input: CardValidationAlertInput) {
    const ref = input.customerId ?? input.eventId ?? "unknown";
    const subject = `skipwait.me card validation needs review · ${input.reason} · ${ref}`;
    const text = [
      "Chargebee sent a payment-source event skipwait.me could not apply to a wallet. No free credits were granted.",
      `Reason: ${input.reason}`,
      `Event: ${input.eventId ?? "none"}${input.eventType ? ` (${input.eventType})` : ""}`,
      `Chargebee customer: ${input.customerId ?? "unknown"}`,
      `Payment source: ${input.paymentSourceId ?? "unknown"}`,
      input.reason === "no_user_for_customer"
        ? "The Chargebee customer is not linked to any skipwait.me account. In the Chargebee dashboard, find the customer by this id; if it is a real user, link the customer id on their account (or re-run validation from their credits page)."
        : input.reason === "hosted_page_creation_failed"
          ? "A signed-in seeker asked to validate a card and skipwait.me could not create Chargebee's hosted page, so free credits stay locked for them. Nothing was charged. Check the Chargebee site and API key configuration and the hosted-pages setup."
          : "The card did not validate. No charge settles (Chargebee voids its verification). If this repeats for the same customer, check the gateway's card-verification log in Chargebee.",
    ].join("\n");
    const metadata = { eventId: input.eventId, reason: input.reason, customerId: input.customerId, paymentSourceId: input.paymentSourceId };
    try {
      const delivery = await sendAdminAlertEmail(fetchImpl, { subject, text });
      if (!delivery.sent) throw new Error(delivery.reason === "not_configured" ? "Error alert delivery is not configured" : "Error alert delivery failed");
      await recordActivity({ action: "system.card_validation_alert_sent", outcome: "success", resourceType: "chargebee_payment_source", resourceId: input.paymentSourceId ?? undefined, metadata });
      return { alerted: true as const };
    } catch (error) {
      await recordActivity({ action: "system.card_validation_alert_sent", outcome: "failure", resourceType: "chargebee_payment_source", resourceId: input.paymentSourceId ?? undefined, metadata: { ...metadata, error: error instanceof Error ? error.message : String(error) } }).catch(() => undefined);
      throw error;
    }
  };
}

export function createRetiredPlanAlerter(dependencies: AlertDependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const recordActivity = dependencies.recordActivity ?? recordOperationalActivity;
  return async function alertRetiredPlanEvent(input: RetiredPlanAlertInput) {
    const ref = input.subscriptionId ?? input.giftId ?? input.eventId ?? "unknown";
    const unsupported = input.reason === "unsupported_plan" || input.reason === "unlinked_subscription";
    const subject = `skipwait.me ${unsupported ? "unrecognised" : "retired"} plan event needs review · ${ref}`;
    const text = [
      unsupported
        ? input.reason === "unlinked_subscription"
          ? "Chargebee sold a kit pass that no checkout intent or wallet on skipwait.me could match - a paid pass must never sit unactivated (GO-LIVE-1b). Nothing was granted automatically."
          : "Chargebee sent a subscription event for an item price skipwait.me could not match to a plan it sells. Nothing was granted."
        : "Chargebee sent an event for a plan skipwait.me no longer sells (Pro/Max, or a gift of one; D-067). Nothing was granted.",
      `Reason: ${input.reason}`,
      `Event: ${input.eventId ?? "none"}${input.eventType ? ` (${input.eventType})` : ""}`,
      `Subscription: ${input.subscriptionId ?? "unknown"}`,
      `Gift: ${input.giftId ?? "none"}`,
      `Item price: ${input.itemPriceId ?? "unknown"}`,
      unsupported
        ? input.reason === "unlinked_subscription"
          ? "Find the seeker's checkout intent by hosted page or subscription id and activate the pass from the provider page (subscription-recovery), or refund the customer in the Chargebee dashboard if no intent exists."
          : "In the Chargebee dashboard, check which plan this subscription is on and whether the item price was renamed. Do not cancel or refund until you know; if it is a current plan, fix the price book so its next event applies."
        : "In the Chargebee dashboard, cancel the subscription and refund the customer for any payment it took.",
    ].join("\n");
    const action = unsupported ? "system.unsupported_plan_alert_sent" : "system.retired_plan_alert_sent";
    const metadata = { eventId: input.eventId, reason: input.reason, subscriptionId: input.subscriptionId, giftId: input.giftId };
    try {
      const delivery = await sendAdminAlertEmail(fetchImpl, { subject, text });
      if (!delivery.sent) throw new Error(delivery.reason === "not_configured" ? "Error alert delivery is not configured" : "Error alert delivery failed");
      await recordActivity({ action, outcome: "success", resourceType: "chargebee_subscription", resourceId: ref, metadata });
      return { alerted: true as const };
    } catch (error) {
      console.warn("[RetiredPlanAlert] Unable to send administrator alert", error instanceof Error ? error.message : error);
      await recordActivity({ action, outcome: "failure", resourceType: "chargebee_subscription", resourceId: ref, metadata }).catch(() => undefined);
      return { alerted: false as const };
    }
  };
}
