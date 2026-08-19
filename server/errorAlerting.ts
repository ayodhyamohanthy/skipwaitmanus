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
