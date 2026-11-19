import { z } from "zod";

/*
 * Skippy step 5 (D-141): a seeker's own AI agents, granted by the seeker in
 * their signed-in session. Draft-only in this step: an agent may look up
 * companies and prices and draft an ask. Sending is NOT in this step and
 * agents can never buy credits or plans. The key is shown once and stored
 * hashed; every call is in an audit log the seeker can read.
 */

/** Agent key format: "swa_" + 64 hex chars (32 random bytes). Shown once at grant time. */
export const AGENT_KEY_PREFIX = "swa_";
export const AGENT_KEY_PATTERN = /^swa_[0-9a-f]{64}$/;

/** Scopes in this step. Send is deliberately absent (step 6). */
export const AGENT_SCOPES = ["lookup", "draft"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

/** Per-agent call caps, lower than a person's (a person can send 30 messages an hour). */
export const AGENT_HOURLY_CALL_CAP = 20;
export const AGENT_DAILY_CALL_CAP = 60;

export const AGENT_EXPIRY_DEFAULT_DAYS = 7;
export const AGENT_EXPIRY_MAX_DAYS = 30;

/** Changeable defaults the grant screen starts from (D-141 names the knobs, not the numbers). */
export const AGENT_LIMIT_DEFAULTS = { creditsPerAsk: 10, creditsPerDay: 20, creditsPerWeek: 50, asksPerDay: 3 } as const;
export const AGENT_LIMIT_MAX = { creditsPerAsk: 200, creditsPerDay: 500, creditsPerWeek: 1000, asksPerDay: 10 } as const;

const limitSchema = (max: number) => z.number().int().min(1).max(max);

export const agentLimitsSchema = z.strictObject({
  creditsPerAsk: limitSchema(AGENT_LIMIT_MAX.creditsPerAsk),
  creditsPerDay: limitSchema(AGENT_LIMIT_MAX.creditsPerDay),
  creditsPerWeek: limitSchema(AGENT_LIMIT_MAX.creditsPerWeek),
  asksPerDay: limitSchema(AGENT_LIMIT_MAX.asksPerDay),
});
export type AgentLimits = z.infer<typeof agentLimitsSchema>;

export const createAgentGrantInputSchema = z.strictObject({
  name: z.string().trim().min(1, "Name the agent").max(120),
  scopes: z.array(z.enum(AGENT_SCOPES)).min(1, "Pick at least one permission").max(AGENT_SCOPES.length).optional(),
  limits: agentLimitsSchema.partial().optional(),
  expiresInDays: z.number().int().min(1).max(AGENT_EXPIRY_MAX_DAYS).optional(),
});
export type CreateAgentGrantInput = z.infer<typeof createAgentGrantInputSchema>;

export const agentDraftInputSchema = z.strictObject({
  companySlug: z.string().trim().regex(/^[a-z0-9-]{1,48}$/, "Choose a company from the list"),
  targetRoleUrl: z.string().trim().min(1).max(2048),
  note: z.string().max(2000).optional(),
});
export type AgentDraftInput = z.infer<typeof agentDraftInputSchema>;

export type AgentDraftStatus = "draft" | "discarded";

/** What the seeker's screen and the agent itself may know about a grant. Never the key. */
export type AgentGrantView = {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: AgentScope[];
  limits: AgentLimits;
  status: "active" | "paused" | "expired" | "revoked";
  expiresAt: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export type AgentDraftView = {
  id: number;
  companySlug: string;
  targetRoleUrl: string;
  note: string;
  jobLevel: number;
  creditCost: number;
  status: AgentDraftStatus;
  createdAt: string;
};

export type AgentEventView = {
  id: number;
  agentName: string;
  action: string;
  outcome: "success" | "denied" | "failure";
  detail: string | null;
  createdAt: string;
};

export const AGENT_ERROR = {
  badKey: "This agent key is not valid",
  revoked: "This agent's access was revoked",
  expired: "This agent's access expired. Ask your seeker for a new key.",
  paused: "Your seeker paused all agents",
  scope: "This agent does not have that permission",
  rateLimited: "This agent is calling too quickly. Wait before trying again.",
  askLimit: "This agent reached its daily draft limit",
  creditLimit: "That ask would cost more credits than this agent's per-ask limit",
} as const;
