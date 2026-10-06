// First-party funnel events (#102). No third-party script: the browser posts a
// small allowlisted event to our own API, which writes it to the operational
// activity log as `funnel.<name>`. Never resume content, messages, emails or
// contact data: only the allowlisted props below, each shape-checked.
import express, { type Express } from "express";

export const FUNNEL_EVENTS = ["landing_view", "start_link_pasted", "step1_coverage_shown", "resume_added", "signin_prompted", "request_sent", "referrer_page_view", "fast_track_shared", "invite_sent"] as const;
export type FunnelEvent = typeof FUNNEL_EVENTS[number];

const DOMAIN = /^[a-z0-9][a-z0-9.-]{0,251}[a-z0-9]$/i;
const SHORT = /^[a-z0-9._-]{1,60}$/i;
const PROP_RULES: Record<string, (v: unknown) => boolean> = {
  companyDomain: v => typeof v === "string" && DOMAIN.test(v),
  coverage: v => v === "covered" || v === "waiting",
  channel: v => typeof v === "string" && ["whatsapp", "telegram", "email", "linkedin", "x", "copy", "native"].includes(v),
  referrerHost: v => typeof v === "string" && DOMAIN.test(v),
  utm_source: v => typeof v === "string" && SHORT.test(v),
  utm_medium: v => typeof v === "string" && SHORT.test(v),
  utm_campaign: v => typeof v === "string" && SHORT.test(v),
};

export function sanitizeFunnelEvent(body: unknown): { name: FunnelEvent; props: Record<string, string> } | null {
  if (!body || typeof body !== "object") return null;
  const { name, props } = body as { name?: unknown; props?: unknown };
  if (typeof name !== "string" || !(FUNNEL_EVENTS as readonly string[]).includes(name)) return null;
  const clean: Record<string, string> = {};
  if (props && typeof props === "object") for (const [key, value] of Object.entries(props as Record<string, unknown>)) if (PROP_RULES[key]?.(value)) clean[key] = String(value).toLowerCase();
  return { name: name as FunnelEvent, props: clean };
}

type Deps = { recordActivity: (input: { action: string; outcome: "success"; resourceType: string; companyDomain?: string; metadata?: Record<string, string> }) => Promise<unknown> };
const hits = new Map<string, { start: number; count: number }>();

export function registerFunnelEventRoutes(app: Express, deps: Deps) {
  app.post("/api/events", express.json({ limit: "2kb" }), async (req, res) => {
    const key = req.ip || "unknown", now = Date.now();
    if (hits.size > 5000) hits.clear();
    const hit = hits.get(key);
    if (hit && now - hit.start < 60_000 && hit.count >= 120) return res.status(429).end();
    hits.set(key, !hit || now - hit.start >= 60_000 ? { start: now, count: 1 } : { ...hit, count: hit.count + 1 });
    const event = sanitizeFunnelEvent(req.body);
    if (!event) return res.status(400).end();
    const { companyDomain, ...metadata } = event.props;
    try { await deps.recordActivity({ action: `funnel.${event.name}`, outcome: "success", resourceType: "funnel", companyDomain, metadata }); } catch { /* analytics never breaks the app */ }
    res.status(204).end();
  });
}
