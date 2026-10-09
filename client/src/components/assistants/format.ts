// Display helpers for the assistant screens (/assistants, /approve).
// Pure functions: every label is derived from real server rows, never sample data.

export type AssistantConnection = {
  id: number;
  provider: string;
  appName: string;
  scopes: string[];
  status: string;
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

export type AssistantEvent = {
  action: string;
  outcome: string;
  resourceType: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AssistantApproval = {
  id: number;
  kind: "ask_send" | "credit_spend";
  status: "pending" | "approved" | "declined" | "expired";
  provider: string;
  companyDomain: string | null;
  role: string | null;
  note: string | null;
  creditCount: number | null;
  slotCount: number | null;
  createdAt: string;
  expiresAt: string;
};

const PROVIDER_LABEL: Readonly<Record<string, string>> = { chatgpt: "ChatGPT", claude: "Claude", custom: "Assistant", assistant: "Your assistant" };

/** Kit scope wording: "Read · Draft · Send with approval · Credits with approval". */
const SCOPE_LABEL: Readonly<Record<string, string>> = { read: "Read", draft: "Draft", send: "Send with approval", credits: "Credits with approval" };

export function providerLabel(provider: unknown, fallback = "Assistant"): string {
  if (typeof provider !== "string" || !provider.trim()) return fallback;
  return PROVIDER_LABEL[provider.trim().toLowerCase()] ?? provider.trim();
}

export function scopeSummary(scopes: readonly string[]): string {
  return scopes.map(scope => SCOPE_LABEL[scope] ?? scope).join(" · ");
}

function plural(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

/** Lowercase relative time in the kit's wording: "just now", "2 hours ago", "3 days ago". */
export function timeAgo(value: string, nowMs: number = Date.now()): string {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "just now";
  const minutes = Math.max(0, Math.floor((nowMs - time) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${plural(minutes, "minute")} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${plural(hours, "hour")} ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${plural(days, "day")} ago`;
}

/** Time left before an approval expires: "23 h left", "40 min left", "expired". */
export function timeLeft(expiresAt: string, nowMs: number = Date.now()): string {
  const ms = new Date(expiresAt).getTime() - nowMs;
  if (Number.isNaN(ms) || ms <= 0) return "expired";
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `${hours} h left`;
  return `${Math.max(1, Math.floor(ms / 60000))} min left`;
}

function startOfDay(ms: number) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Kit date: "1 Oct". */
export function shortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Kit token row date: "today", "1 Oct". */
export function createdLabel(value: string, nowMs: number = Date.now()): string {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  return startOfDay(time) === startOfDay(nowMs) ? "today" : shortDate(value);
}

/** Kit activity stamp: "Today 10:14", "Yesterday", "2 Oct". */
export function activityStamp(value: string, nowMs: number = Date.now()): string {
  const date = new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time)) return "";
  const dayDiff = Math.round((startOfDay(nowMs) - startOfDay(time)) / 86400000);
  if (dayDiff <= 0) return `Today ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`;
  if (dayDiff === 1) return "Yesterday";
  return shortDate(value);
}

const TOOL_SUMMARY: Readonly<Record<string, string>> = {
  search_jobs: "Searched roles",
  list_my_requests: "Read your open requests",
  list_my_alerts: "Read your alerts",
  list_my_resumes: "Read your resume list",
  propose_ask: "Drafted an ask",
};

function approvalSummary(kind: unknown): string {
  if (kind === "ask_send") return "Drafted an ask";
  if (kind === "credit_spend") return "Asked to use credits";
  return "Asked you to approve an action";
}

export type ActivityRow = { stamp: string; who: string; what: string; note: string; blocked: boolean };

/** Maps one real activity-log row to the kit's "time · who / what / note" row. */
export function describeEvent(event: AssistantEvent, nowMs: number = Date.now()): ActivityRow {
  const meta = event.metadata ?? {};
  const failed = event.outcome === "failure";
  const fromToken = event.resourceType === "assistant_token";
  const who = typeof meta.provider === "string" && meta.provider ? providerLabel(meta.provider) : fromToken ? "API token" : "Assistant";
  const base = { stamp: activityStamp(event.createdAt, nowMs), who, note: failed ? "Did not complete" : "", blocked: failed };
  switch (event.action) {
    case "assistant.connected": return { ...base, what: `Connected ${providerLabel(meta.provider, "an assistant")}` };
    case "assistant.disconnected": return { ...base, what: "Disconnected an assistant" };
    case "assistant.token_created": return { ...base, what: "Created an API token" };
    case "assistant.token_revoked": return { ...base, what: "Revoked an API token" };
    case "assistant.approval_requested": return { ...base, what: approvalSummary(meta.kind) };
    case "assistant.approval_approved": return { ...base, what: approvalSummary(meta.kind), note: "Approved by you" };
    case "assistant.approval_declined": return { ...base, what: approvalSummary(meta.kind), note: "Declined by you" };
    case "assistant.mcp.tool": {
      const tool = typeof meta.tool === "string" ? meta.tool : "";
      return { ...base, what: TOOL_SUMMARY[tool] ?? (tool ? `Used ${tool}` : "Used a SkipWait tool") };
    }
    case "assistant.mcp.denied": return { ...base, what: "Tried to use SkipWait", note: "Blocked: your plan does not include assistants", blocked: true };
    default: return { ...base, what: event.action };
  }
}

export function creditsLabel(count: number): string {
  return plural(count, "credit");
}
