import express, { type Express, type Request } from "express";
import {
  REASONS_COACH_ENABLED, REASONS_COACH_GLOBAL_DAILY, REASONS_COACH_LIMIT_MESSAGE,
  REASONS_COACH_PROMPT, REASONS_COACH_USER_DAILY, filterCoachQuestions, reasonsCoachInputSchema,
} from "../shared/reasonsCoach";
import { modelRouterConfigured, routeChat } from "./_core/modelRouter";
import { captureServerError } from "./sentry";
import { setRetryAfter } from "./retryAfter";

export type ReasonsCoachRouteDeps = {
  resolveIdentity(req: Request): Promise<{ account: { id: number } } | undefined>;
  enabled?: () => boolean;
  configured?: () => boolean;
  chat?: typeof routeChat;
  now?: () => number;
};

const DAY_MS = 86_400_000;
const BODY_LIMIT = 4096;
const UNAVAILABLE = "Coaching is unavailable right now. Your reasons have not changed.";

export function registerReasonsCoachRoutes(app: Express, deps: ReasonsCoachRouteDeps): void {
  const enabled = deps.enabled ?? (() => REASONS_COACH_ENABLED);
  const configured = deps.configured ?? modelRouterConfigured;
  const chat = deps.chat ?? routeChat;
  const now = deps.now ?? Date.now;
  // Process-local only: restarts and replicas reset these allowances. Never
  // enable this route until the packet's durable budget/sole-provider gates pass.
  let day = Math.floor(now() / DAY_MS);
  let total = 0;
  const users = new Map<number, number>();

  app.post("/api/ask/reasons-coach", (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    if (!enabled()) { res.status(404).json({ error: "Not found" }); return; }
    next();
  }, (req, res, next) => {
    express.json({ limit: BODY_LIMIT })(req, res, error => {
      if (error) {
        const oversized = typeof error === "object" && "type" in error && error.type === "entity.too.large";
        res.status(oversized ? 413 : 400).json({ error: oversized ? "Request body is too large" : "Send three reasons as JSON." });
        return;
      }
      next();
    });
  }, (req, res) => {
    void (async () => {
      const identity = await deps.resolveIdentity(req);
      if (!identity) { res.status(401).json({ error: "Sign in to use coaching." }); return; }
      // Also enforce the limit when an upstream application parser ran first.
      if (Buffer.byteLength(JSON.stringify(req.body ?? {})) > BODY_LIMIT) {
        res.status(413).json({ error: "Request body is too large" }); return;
      }
      const parsed = reasonsCoachInputSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: "Send three reasons of up to 140 characters each, with only an optional role and company." }); return; }
      if (!configured()) { res.json({ questions: [] }); return; }
      const userId = identity.account.id;
      const timestamp = now();
      const today = Math.floor(timestamp / DAY_MS);
      if (today > day) { day = today; total = 0; users.clear(); }
      const used = users.get(userId) ?? 0;
      if (used >= REASONS_COACH_USER_DAILY || total >= REASONS_COACH_GLOBAL_DAILY) {
        setRetryAfter(res, Math.max(1, Math.ceil(((day + 1) * DAY_MS - timestamp) / 1000)));
        res.status(429).json({ error: REASONS_COACH_LIMIT_MESSAGE }); return;
      }
      // Reserve synchronously, before awaiting the model, including failed calls.
      users.set(userId, used + 1);
      total += 1;
      const output = await chat({ system: REASONS_COACH_PROMPT, user: JSON.stringify(parsed.data), maxTokens: 240, fallback: "" });
      res.json({ questions: filterCoachQuestions(output.slice(0, 12_000).split(/\r?\n/), parsed.data) });
    })().catch(() => {
      captureServerError(new Error("Reasons coach request failed"), { route: "/api/ask/reasons-coach" });
      res.status(503).json({ error: UNAVAILABLE });
    });
  });
}
