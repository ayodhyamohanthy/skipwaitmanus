// Edge contracts and fetchers for the kit Saved alerts tab (/alerts).
//   GET    /api/seeker-alerts                  -> { alerts: SeekerAlert[] } newest first
//   POST   /api/seeker-alerts { companyDomain }-> 201 { alert } | 400 { error } (bad domain, duplicate, Free cap)
//   PATCH  /api/seeker-alerts/:id { paused }   -> { alert }
//   DELETE /api/seeker-alerts/:id              -> { deleted, id }
//   GET    /api/credits/summary?role=job_seeker -> { summary: { plan, ... } } (only the plan is read)
// Routes: server/privateReferralRoutes.ts; engine: server/db.ts; shared contract:
// shared/alerts.ts. The server owns validation and the Free cap; the client
// only parses what comes back so a malformed payload reads as an error.
import { z } from "zod";
import type { SeekerAlert } from "@shared/alerts";
import { readApiJson } from "@/lib/apiResponse";

export const ALERTS_LOAD_ERROR = "We could not load your saved alerts";
export const ALERT_SAVE_ERROR = "We could not save this alert";
export const ALERT_UPDATE_ERROR = "We could not update this alert";
export const ALERT_REMOVE_ERROR = "We could not remove this alert";
export const PLAN_LOAD_ERROR = "We could not load your plan";
export const ALERTS_NETWORK_ERROR = "We could not reach SkipWait. Check your connection and try again.";

export const seekerAlertSchema = z.object({
  id: z.number().int().positive(),
  companyDomain: z.string().min(1),
  paused: z.boolean(),
  notifiedAt: z.string().nullable(),
  createdAt: z.string(),
}) satisfies z.ZodType<SeekerAlert>;

const alertListSchema = z.object({ alerts: z.array(seekerAlertSchema) });
const alertReplySchema = z.object({ alert: seekerAlertSchema });
const pausedReplySchema = z.object({ alert: seekerAlertSchema.pick({ paused: true }) });
const planReplySchema = z.object({ summary: z.object({ plan: z.string().min(1) }) });

export type TokenSource = () => Promise<string | null | undefined>;

async function send(url: string, getToken: TokenSource, init: { method?: "POST" | "PATCH" | "DELETE"; body?: Record<string, unknown> } = {}): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (init.body) headers["Content-Type"] = "application/json";
  try {
    return await fetch(url, {
      ...(init.method ? { method: init.method } : {}),
      credentials: "include",
      headers,
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    throw new Error(ALERTS_NETWORK_ERROR);
  }
}

function serverMessage(payload: Record<string, unknown>, fallback: string): string {
  return typeof payload.error === "string" && payload.error ? payload.error : fallback;
}

async function readParsed<T>(response: Response, schema: z.ZodType<T>, fallback: string): Promise<T> {
  const payload = await readApiJson<Record<string, unknown>>(response, fallback);
  if (!response.ok) throw new Error(serverMessage(payload, fallback));
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error(fallback);
  return parsed.data;
}

export async function fetchSeekerAlerts(getToken: TokenSource): Promise<SeekerAlert[]> {
  const reply = await readParsed(await send("/api/seeker-alerts", getToken), alertListSchema, ALERTS_LOAD_ERROR);
  return reply.alerts;
}

/** The seeker wallet plan. It only words the Free-cap note; the server enforces the cap. */
export async function fetchSeekerPlan(getToken: TokenSource): Promise<string> {
  const reply = await readParsed(await send("/api/credits/summary?role=job_seeker", getToken), planReplySchema, PLAN_LOAD_ERROR);
  return reply.summary.plan;
}

export async function createSeekerAlert(companyDomain: string, getToken: TokenSource): Promise<SeekerAlert> {
  const reply = await readParsed(await send("/api/seeker-alerts", getToken, { method: "POST", body: { companyDomain } }), alertReplySchema, ALERT_SAVE_ERROR);
  return reply.alert;
}

export async function setSeekerAlertPaused(alertId: number, paused: boolean, getToken: TokenSource): Promise<{ id: number; paused: boolean }> {
  const reply = await readParsed(await send(`/api/seeker-alerts/${alertId}`, getToken, { method: "PATCH", body: { paused } }), pausedReplySchema, ALERT_UPDATE_ERROR);
  return { id: alertId, paused: reply.alert.paused };
}

/** Resolves once the server confirmed the delete; the row is only dropped then. */
export async function deleteSeekerAlert(alertId: number, getToken: TokenSource): Promise<number> {
  const response = await send(`/api/seeker-alerts/${alertId}`, getToken, { method: "DELETE" });
  const payload = await readApiJson<Record<string, unknown>>(response, ALERT_REMOVE_ERROR);
  if (!response.ok) throw new Error(serverMessage(payload, ALERT_REMOVE_ERROR));
  return alertId;
}
