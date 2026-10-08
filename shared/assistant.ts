/**
 * Assistant access (kit screens 22 / 23 / 24 / 26).
 * Assistants, API tokens, developer apps and assistant approvals.
 * Kit's top tier "Land" maps to the live `max` plan (kit tier names
 * were not adopted; live pricing is free/pro/max).
 * Timestamps and expiries are computed in JavaScript, never DB NOW().
 */

export const ASSISTANT_MIN_PLAN = "max";

export const ASSISTANT_PROVIDERS = ["chatgpt", "claude", "custom"] as const;
export type AssistantProvider = (typeof ASSISTANT_PROVIDERS)[number];

export const ASSISTANT_SCOPES = ["read", "draft", "send", "credits"] as const;
export type AssistantScope = (typeof ASSISTANT_SCOPES)[number];

export const APP_KINDS = ["web_app", "agent_mcp", "server_integration"] as const;
export type AppKind = (typeof APP_KINDS)[number];

export const DEVELOPER_APP_SCOPES = [
  "companies:read",
  "requests:read",
  "asks:draft",
  "asks:send",
  "profile:read",
  "credits:spend",
  "webhooks",
] as const;
export type DeveloperAppScope = (typeof DEVELOPER_APP_SCOPES)[number];

/** Scopes that need a SkipWait team review before an app can use them. */
export const DEVELOPER_APP_REVIEW_SCOPES: readonly string[] = ["asks:send", "profile:read", "credits:spend"];

export type AssistantConnectionStatus = "connected" | "declined" | "expired" | "revoked";
export type AssistantApprovalKind = "ask_send" | "credit_spend";
export type AssistantApprovalStatus = "pending" | "approved" | "declined" | "expired";
export type DeveloperAppStatus = "test" | "in_review" | "live" | "rejected" | "suspended";

export type AssistantConnection = {
  id: number;
  provider: AssistantProvider;
  appName: string;
  scopes: string[];
  status: AssistantConnectionStatus;
  lastUsedAt: string | null;
  connectedAt: string;
};

export type AssistantToken = {
  id: number;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export type AssistantApproval = {
  id: number;
  kind: AssistantApprovalKind;
  status: AssistantApprovalStatus;
  provider: string;
  companyDomain: string | null;
  role: string | null;
  note: string | null;
  creditCount: number | null;
  slotCount: number | null;
  createdAt: string;
  expiresAt: string;
};

export type DeveloperApp = {
  id: number;
  name: string;
  kind: AppKind;
  description: string;
  website: string | null;
  redirectUrls: string[];
  scopes: string[];
  status: DeveloperAppStatus;
  rejectReasons: string[];
  webhookUrl: string | null;
  clientId: string;
  createdAt: string;
};

/** Unanswered assistant approvals expire after 24 hours (kit /approve). */
export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export function getApprovalExpiresAtMs(createdMs: number): number {
  return createdMs + APPROVAL_TTL_MS;
}

export function isApprovalExpired(expiresAtMs: number, nowMs: number = Date.now()): boolean {
  return nowMs >= expiresAtMs;
}

export function normalizeAssistantProvider(raw: unknown): AssistantProvider | null {
  return (ASSISTANT_PROVIDERS as readonly unknown[]).includes(raw) ? (raw as AssistantProvider) : null;
}

export function normalizeScopes(raw: unknown, allowed: readonly string[]): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const scopes = raw.filter((scope): scope is string => typeof scope === "string" && (allowed as readonly unknown[]).includes(scope));
  if (scopes.length === 0 || scopes.length !== raw.length) return null;
  return Array.from(new Set(scopes));
}

export function normalizeAppKind(raw: unknown): AppKind | null {
  return (APP_KINDS as readonly unknown[]).includes(raw) ? (raw as AppKind) : null;
}

export function normalizeDeveloperAppStatus(raw: unknown): DeveloperAppStatus | null {
  const statuses: readonly string[] = ["test", "in_review", "live", "rejected", "suspended"];
  return statuses.includes(raw as string) ? (raw as DeveloperAppStatus) : null;
}

export function validateAppName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return null;
  return name;
}

export function validateUrl(raw: unknown, maxLength = 512): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  if (!url || url.length > maxLength) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

export function validateRedirectUrls(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 10) return null;
  const urls: string[] = [];
  for (const entry of raw) {
    const url = validateUrl(entry);
    if (!url) return null;
    urls.push(url);
  }
  return Array.from(new Set(urls));
}

export function validateDescription(raw: unknown, maxLength = 2000): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text || text.length > maxLength) return null;
  return text;
}

export function validateApprovalNote(raw: unknown, maxLength = 4000): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || text.length > maxLength) return null;
  return text;
}
