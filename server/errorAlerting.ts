import type { RequestHandler } from "express";
import { recordOperationalActivity } from "./db";
import { createTransactionalEmailSender, type TransactionalEmailInput, type TransactionalEmailResult } from "./emailDelivery";

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
  /** Injectable for tests; defaults to the shared ZeptoMail-then-Resend sender. */
  sendEmail?: (input: TransactionalEmailInput) => Promise<TransactionalEmailResult>;
};

function normalizedPath(path: string) {
  const pathname = path.split("?")[0]?.trim() || "/";
  return pathname.startsWith("/api/") ? pathname.slice(0, 180) : "";
}

function alertKey(input: AlertInput) {
  return `${input.method.toUpperCase()} ${normalizedPath(input.path)} ${input.statusCode}`;
}

export function createMaterialErrorEscalator(dependencies: AlertDependencies = {}) {
  const recordActivity = dependencies.recordActivity ?? recordOperationalActivity;
  const now = dependencies.now ?? Date.now;
  // Route through the shared transactional plane (ZeptoMail first, legacy Resend
  // fallback). Hardcoding Resend here meant administrator error alerts silently
  // stopped on a ZeptoMail-only deployment while every other email path kept
  // working — the failure was only a console.warn.
  const sendEmail = dependencies.sendEmail ?? createTransactionalEmailSender({ fetchImpl: dependencies.fetchImpl });
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
      const delivery = await sendEmail({ to: ADMIN_ERROR_RECIPIENT, subject, text });
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
