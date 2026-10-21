import type { RequestHandler } from "express";
import { recordOperationalActivity } from "./db";

const ADMIN_ERROR_RECIPIENT = "ayodhya@skipwait.me";
/**
 * Owner rule (Oct 22): a payment failure must never sit in an unread mailbox.
 * Every payment-class alert goes to the admin mailbox, the owner's personal
 * Gmail, and the Instinct agent inbox (whose watcher texts the owner), with a
 * fixed subject prefix the watcher filters on.
 */
const PAYMENT_ALERT_RECIPIENTS = [ADMIN_ERROR_RECIPIENT, "ayodhyarammohanthy@gmail.com", "ayodhya@mail.instinct.com"];
export const PAYMENT_ALERT_SUBJECT_PREFIX = "[SKIPWAIT PAYMENT]";
const PAYMENT_ALERT_ATTEMPTS = 2;
const PAYMENT_ALERT_RETRY_DELAY_MS = 1_500;

/** One Resend call to every payment-alert recipient, retried once on failure. */
async function sendPaymentAlertEmail(fetchImpl: typeof fetch, input: { subject: string; text: string; sleep?: (ms: number) => Promise<void> }) {
  const apiKey = process.env.RESEND_API_KEY;
  const sender = process.env.ERROR_ALERT_FROM_EMAIL;
  if (!apiKey || !sender) return { sent: false as const, attempts: 0, error: "Error alert delivery is not configured" };
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  let error = "unknown";
  for (let attempt = 1; attempt <= PAYMENT_ALERT_ATTEMPTS; attempt++) {
    try {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: sender, to: [...PAYMENT_ALERT_RECIPIENTS], subject: input.subject, text: input.text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return { sent: true as const, attempts: attempt };
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      error = `Resend responded with ${response.status}${detail ? `: ${detail}` : ""}`;
    } catch (sendError) {
      error = sendError instanceof Error ? sendError.message : String(sendError);
    }
    if (attempt < PAYMENT_ALERT_ATTEMPTS) await sleep(PAYMENT_ALERT_RETRY_DELAY_MS);
  }
  return { sent: false as const, attempts: PAYMENT_ALERT_ATTEMPTS, error };
}

/**
 * A payment alert that never reached any inbox is itself a payment failure:
 * record a durable undelivered marker the admin console banners until the
 * alert is verified by a human. Never throws.
 */
async function recordUndeliveredPaymentAlert(recordActivity: typeof recordOperationalActivity, input: { alert: string; resourceType: string; resourceId: string; metadata: Record<string, unknown>; attempts: number; error?: string }) {
  await recordActivity({
    action: "system.payment_alert_undelivered",
    outcome: "failure",
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    metadata: { ...input.metadata, alert: input.alert, attempts: input.attempts, error: input.error },
  }).catch(() => undefined);
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
  /** Test hook for the alert retry pause; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
};

function normalizedPath(path: string) {
  const pathname = path.split("?")[0]?.trim() || "/";
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
      const apiKey = process.env.RESEND_API_KEY;
      const sender = process.env.ERROR_ALERT_FROM_EMAIL;
      if (!apiKey || !sender) throw new Error("Error alert delivery is not configured");

      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: sender, to: [ADMIN_ERROR_RECIPIENT], subject, text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 500);
        throw new Error(`Resend responded with ${response.status}${detail ? `: ${detail}` : ""}`);
      }

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
    const subject = `${PAYMENT_ALERT_SUBJECT_PREFIX} payment needs review · #${input.paymentId}`;
    const text = [
      "A paid invoice could not be credited automatically and is waiting for admin review.",
      `Payment record: #${input.paymentId}`,
      `Reason: ${input.reason}`,
      `Expected: ${input.expectedAmount} ${input.expectedCurrency}`,
      `Paid: ${input.paidAmount} ${input.paidCurrency}`,
      "Resolve it in Admin > Payments requiring review.",
    ].join("\n");
    const metadata = { paymentId: input.paymentId, reason: input.reason };
    const send = await sendPaymentAlertEmail(fetchImpl, { subject, text, sleep: dependencies.sleep });
    if (send.sent) {
      await recordActivity({ action: "system.payment_review_alert_sent", outcome: "success", resourceType: "payment_fulfillment", resourceId: String(input.paymentId), metadata });
      return { alerted: true as const };
    }
    console.warn("[PaymentReviewAlert] Unable to send administrator alert", send.error);
    await recordActivity({ action: "system.payment_review_alert_sent", outcome: "failure", resourceType: "payment_fulfillment", resourceId: String(input.paymentId), metadata }).catch(() => undefined);
    await recordUndeliveredPaymentAlert(recordActivity, { alert: "payment_review", resourceType: "payment_fulfillment", resourceId: String(input.paymentId), metadata, attempts: send.attempts, error: send.error });
    return { alerted: false as const };
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
    const subject = `${PAYMENT_ALERT_SUBJECT_PREFIX} unmatched payment needs review · ${ref}`;
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
    const send = await sendPaymentAlertEmail(fetchImpl, { subject, text, sleep: dependencies.sleep });
    if (send.sent) {
      await recordActivity({ action: "system.unmatched_payment_alert_sent", outcome: "success", resourceType: "chargebee_invoice", resourceId: ref, metadata });
      return { alerted: true as const };
    }
    console.warn("[UnmatchedPaymentAlert] Unable to send administrator alert", send.error);
    await recordActivity({ action: "system.unmatched_payment_alert_sent", outcome: "failure", resourceType: "chargebee_invoice", resourceId: ref, metadata }).catch(() => undefined);
    await recordUndeliveredPaymentAlert(recordActivity, { alert: "unmatched_payment", resourceType: "chargebee_invoice", resourceId: ref, metadata, attempts: send.attempts, error: send.error });
    return { alerted: false as const };
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
    const subject = `${PAYMENT_ALERT_SUBJECT_PREFIX} refund needs review · ${ref}`;
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
    const send = await sendPaymentAlertEmail(fetchImpl, { subject, text, sleep: dependencies.sleep });
    if (send.sent) {
      await recordActivity({ action: "system.payment_refund_alert_sent", outcome: "success", resourceType: "chargebee_invoice", resourceId: ref, metadata });
      return { alerted: true as const };
    }
    console.warn("[PaymentRefundAlert] Unable to send administrator alert", send.error);
    await recordActivity({ action: "system.payment_refund_alert_sent", outcome: "failure", resourceType: "chargebee_invoice", resourceId: ref, metadata }).catch(() => undefined);
    await recordUndeliveredPaymentAlert(recordActivity, { alert: "payment_refund", resourceType: "chargebee_invoice", resourceId: ref, metadata, attempts: send.attempts, error: send.error });
    return { alerted: false as const };
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
    const subject = `${PAYMENT_ALERT_SUBJECT_PREFIX} card validation needs review · ${input.reason} · ${ref}`;
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
    const send = await sendPaymentAlertEmail(fetchImpl, { subject, text, sleep: dependencies.sleep });
    if (send.sent) {
      await recordActivity({ action: "system.card_validation_alert_sent", outcome: "success", resourceType: "chargebee_payment_source", resourceId: input.paymentSourceId ?? undefined, metadata });
      return { alerted: true as const };
    }
    await recordActivity({ action: "system.card_validation_alert_sent", outcome: "failure", resourceType: "chargebee_payment_source", resourceId: input.paymentSourceId ?? undefined, metadata: { ...metadata, error: send.error } }).catch(() => undefined);
    await recordUndeliveredPaymentAlert(recordActivity, { alert: "card_validation", resourceType: "chargebee_payment_source", resourceId: input.paymentSourceId ?? ref, metadata, attempts: send.attempts, error: send.error });
    throw new Error(send.error ?? "Card-validation alert delivery failed");
  };
}

export type FailedPaymentAlertInput = { eventId: string; invoiceId?: string; subscriptionId?: string; customerId?: string; amount?: number; currency?: string };

/**
 * Owner rule (Oct 22): a FAILED payment must never pass silently either. No
 * money settled and no credits moved, but the customer may think they paid,
 * and a failed renewal needs a human before the subscription lapses. Never
 * deduplicated: every failed attempt is its own provider event.
 */
export function createFailedPaymentAlerter(dependencies: AlertDependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const recordActivity = dependencies.recordActivity ?? recordOperationalActivity;
  return async function alertFailedPayment(input: FailedPaymentAlertInput) {
    const ref = input.invoiceId ?? input.eventId;
    const subject = `${PAYMENT_ALERT_SUBJECT_PREFIX} payment failed · ${ref}`;
    const text = [
      "Chargebee reported a FAILED payment. No money settled and no credits moved.",
      `Invoice: ${input.invoiceId ?? "unknown"}`,
      `Event: ${input.eventId}`,
      `Subscription: ${input.subscriptionId ?? "none"}`,
      `Chargebee customer: ${input.customerId ?? "unknown"}`,
      `Amount attempted: ${input.amount ?? "unknown"} ${input.currency ?? ""}`.trim(),
      "If this was a renewal, Chargebee dunning may retry; check the subscription and the customer in the Chargebee dashboard and, if the customer expects to have paid, tell them the payment did not go through.",
    ].join("\n");
    const metadata = { eventId: input.eventId, invoiceId: input.invoiceId, subscriptionId: input.subscriptionId, customerId: input.customerId };
    const send = await sendPaymentAlertEmail(fetchImpl, { subject, text, sleep: dependencies.sleep });
    if (send.sent) {
      await recordActivity({ action: "system.payment_failed_alert_sent", outcome: "success", resourceType: "chargebee_invoice", resourceId: ref, metadata });
      return { alerted: true as const };
    }
    console.warn("[FailedPaymentAlert] Unable to send administrator alert", send.error);
    await recordActivity({ action: "system.payment_failed_alert_sent", outcome: "failure", resourceType: "chargebee_invoice", resourceId: ref, metadata }).catch(() => undefined);
    await recordUndeliveredPaymentAlert(recordActivity, { alert: "payment_failed", resourceType: "chargebee_invoice", resourceId: ref, metadata, attempts: send.attempts, error: send.error });
    return { alerted: false as const };
  };
}

export function createRetiredPlanAlerter(dependencies: AlertDependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const recordActivity = dependencies.recordActivity ?? recordOperationalActivity;
  return async function alertRetiredPlanEvent(input: RetiredPlanAlertInput) {
    const ref = input.subscriptionId ?? input.giftId ?? input.eventId ?? "unknown";
    const unsupported = input.reason === "unsupported_plan" || input.reason === "unlinked_subscription";
    const subject = `${PAYMENT_ALERT_SUBJECT_PREFIX} ${unsupported ? "unrecognised" : "retired"} plan event needs review · ${ref}`;
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
    const send = await sendPaymentAlertEmail(fetchImpl, { subject, text, sleep: dependencies.sleep });
    if (send.sent) {
      await recordActivity({ action, outcome: "success", resourceType: "chargebee_subscription", resourceId: ref, metadata });
      return { alerted: true as const };
    }
    console.warn("[RetiredPlanAlert] Unable to send administrator alert", send.error);
    await recordActivity({ action, outcome: "failure", resourceType: "chargebee_subscription", resourceId: ref, metadata }).catch(() => undefined);
    await recordUndeliveredPaymentAlert(recordActivity, { alert: unsupported ? "unsupported_plan" : "retired_plan", resourceType: "chargebee_subscription", resourceId: ref, metadata, attempts: send.attempts, error: send.error });
    return { alerted: false as const };
  };
}
