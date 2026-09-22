import { WorkOS } from "@workos-inc/node";
import type { Express, Request, Response } from "express";
import express from "express";
import { z } from "zod";
import { captureServerError } from "./sentry";

/**
 * WorkOS webhook receiver: POST /api/webhooks/workos.
 *
 * The Dashboard endpoint was registered with no handler behind it, so every
 * delivery 404'd and WorkOS retried for 3 days. This closes that loop and the
 * one real gap it exposed: a user deleted in WorkOS kept a valid local app
 * session indefinitely.
 *
 * Contract:
 *   WORKOS_WEBHOOK_SECRET -> verifies the WorkOS-Signature header via the
 *     official SDK. Absent secret fails closed with 503 so WorkOS retries
 *     instead of dropping security events.
 *   user.deleted  -> suspend local account + revoke sessions (200 even when
 *     no local row exists; deletion must never 500 on unknown users).
 *   user.updated  -> sync name/email onto the existing local row; skipped
 *     when the user never signed in (first login creates the row).
 *   everything else subscribed (user.created, session.created, …) ->
 *     verified + acknowledged, no side effects.
 *
 * Every mutation is an idempotent state-set, so redeliveries are safe and no
 * event-dedupe table is needed. Registration must happen BEFORE the global
 * JSON parser: the signature covers the exact raw bytes WorkOS sent.
 */

const verifiedEventSchema = z.object({
  id: z.string().min(1).max(128),
  event: z.string().min(1).max(128),
  data: z.record(z.string(), z.unknown()),
});

type VerifiedEvent = z.infer<typeof verifiedEventSchema>;

export type WorkosActivityEntry = { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number; metadata?: Record<string, string | number | boolean | null | undefined> };

export type WorkosWebhookVerifier = (rawBody: string, sigHeader: string, secret: string) => Promise<VerifiedEvent>;

export type WorkosWebhookDeps = {
  verifyEvent?: WorkosWebhookVerifier;
  secret?: string;
  suspendUserByWorkosId?: (workosUserId: string) => Promise<{ userId: number } | undefined>;
  updateUserProfileByWorkosId?: (workosUserId: string, profile: { name?: string; email?: string }) => Promise<{ userId: number } | undefined>;
  record?: (entry: WorkosActivityEntry) => void;
};

const defaultVerifyEvent: WorkosWebhookVerifier = async (rawBody, sigHeader, secret) => {
  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) throw new Error("WorkOS API key is not configured");
  const event = await new WorkOS(apiKey).webhooks.constructEvent({ payload: rawBody, sigHeader, secret });
  return verifiedEventSchema.parse({ id: (event as { id?: unknown }).id, event: (event as { event?: unknown }).event, data: (event as { data?: unknown }).data });
};

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function registerWorkosWebhookRoutes(app: Express, deps: WorkosWebhookDeps = {}): void {
  const secret = deps.secret ?? process.env.WORKOS_WEBHOOK_SECRET ?? "";
  const verifyEvent = deps.verifyEvent ?? defaultVerifyEvent;
  const record = (entry: WorkosActivityEntry) => {
    try { deps.record?.(entry); } catch { /* ledger is best-effort */ }
  };
  app.post("/api/webhooks/workos", express.raw({ type: "application/json", limit: "256kb" }), async (req: Request, res: Response) => {
    if (!secret) return res.status(503).json({ error: "WorkOS webhook is not configured" });
    const sigHeader = req.header("workos-signature");
    if (!sigHeader) return res.status(401).json({ error: "Invalid webhook signature" });
    let event: VerifiedEvent;
    try {
      event = await verifyEvent((req.body as Buffer).toString("utf8"), sigHeader, secret);
    } catch (error) {
      if (error instanceof Error && /not configured/i.test(error.message)) {
        return res.status(503).json({ error: "WorkOS webhook is not configured" });
      }
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
    try {
      if (event.event === "user.deleted") {
        const workosUserId = stringField(event.data["id"]);
        if (workosUserId && deps.suspendUserByWorkosId) {
          const result = await deps.suspendUserByWorkosId(workosUserId);
          if (result) record({ action: "auth.workos_user_deleted", outcome: "success", resourceType: "user", resourceId: result.userId, metadata: { workosUserId } });
        }
        return res.json({ received: true });
      }
      if (event.event === "user.updated") {
        const workosUserId = stringField(event.data["id"]);
        if (workosUserId && deps.updateUserProfileByWorkosId) {
          // The SDK normalizes user payloads to camelCase; accept snake_case
          // too so raw-shaped fixtures and future payload variants still map.
          const firstName = stringField(event.data["firstName"]) ?? stringField(event.data["first_name"]);
          const lastName = stringField(event.data["lastName"]) ?? stringField(event.data["last_name"]);
          const name = [firstName, lastName].filter(Boolean).join(" ") || undefined;
          const email = stringField(event.data["email"])?.trim().toLowerCase();
          if (name !== undefined || email !== undefined) {
            const result = await deps.updateUserProfileByWorkosId(workosUserId, { ...(name !== undefined ? { name } : {}), ...(email !== undefined ? { email } : {}) });
            if (result) record({ action: "auth.workos_user_updated", outcome: "success", resourceType: "user", resourceId: result.userId, metadata: { workosUserId } });
          }
        }
        return res.json({ received: true });
      }
      return res.json({ received: true });
    } catch (error) {
      captureServerError(error, { source: "workos-webhook", event: event.event });
      return res.status(500).json({ error: "Webhook processing retry required" });
    }
  });
}
