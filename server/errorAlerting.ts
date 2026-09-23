import type { RequestHandler } from "express";
import { recordOperationalActivity } from "./db";

const ADMIN_ERROR_RECIPIENT = "ayodhya@skipwait.me";
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
      const apiKey = process.env.RESEND_API_KEY;
      const sender = process.env.ERROR_ALERT_FROM_EMAIL;
      if (!apiKey || !sender) throw new Error("Error alert delivery is not configured");
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: sender, to: [ADMIN_ERROR_RECIPIENT], subject, text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Resend responded with ${response.status}`);
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
      const apiKey = process.env.RESEND_API_KEY;
      const sender = process.env.ERROR_ALERT_FROM_EMAIL;
      if (!apiKey || !sender) throw new Error("Error alert delivery is not configured");
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: sender, to: [ADMIN_ERROR_RECIPIENT], subject, text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Resend responded with ${response.status}`);
      await recordActivity({ action: "system.unmatched_payment_alert_sent", outcome: "success", resourceType: "chargebee_invoice", resourceId: ref, metadata });
      return { alerted: true as const };
    } catch (error) {
      console.warn("[UnmatchedPaymentAlert] Unable to send administrator alert", error instanceof Error ? error.message : error);
      await recordActivity({ action: "system.unmatched_payment_alert_sent", outcome: "failure", resourceType: "chargebee_invoice", resourceId: ref, metadata }).catch(() => undefined);
      return { alerted: false as const };
    }
  };
}
