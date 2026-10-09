import { AppWindow, BadgeCheck, Bot, Clock, ShieldAlert, Webhook, type LucideIcon } from "lucide-react";
import type { AppKind, DeveloperAppStatus } from "@shared/assistant";

export const KINDS: ReadonlyArray<{ key: AppKind; label: string; description: string; Icon: LucideIcon }> = [
  { key: "web_app", label: "Web or mobile app", description: "Job trackers, career tools, ATS-like apps", Icon: AppWindow },
  { key: "agent_mcp", label: "AI agent or MCP client", description: "Assistants that apply on a user's behalf", Icon: Bot },
  { key: "server_integration", label: "Server integration", description: "Back-office sync with webhooks", Icon: Webhook },
];

/** Short kind names for list rows and the details subtitle ("AI agent · Live"). */
export const KIND_SHORT: Record<AppKind, string> = { web_app: "Web or mobile app", agent_mcp: "AI agent", server_integration: "Server integration" };
export const KIND_ICON: Record<AppKind, LucideIcon> = { web_app: AppWindow, agent_mcp: Bot, server_integration: Webhook };

export const ALL_SCOPES = [
  { key: "companies:read", label: "Search companies open to referrals" },
  { key: "requests:read", label: "Read the user's requests and replies" },
  { key: "asks:draft", label: "Create draft asks" },
  { key: "asks:send", label: "Send asks — user approves each one in SkipWait" },
  { key: "profile:read", label: "Basic profile and resume (with user consent)" },
  { key: "credits:spend", label: "Run paid tools — user approves cost each time" },
  { key: "webhooks", label: "Accepted / passed / message events" },
] as const;

export const DEFAULT_SCOPES: readonly string[] = ["companies:read", "requests:read", "asks:draft"];

export const STATUS_META: Record<DeveloperAppStatus, { label: string; Icon: LucideIcon }> = {
  test: { label: "Test", Icon: Clock },
  in_review: { label: "In review", Icon: Clock },
  live: { label: "Live", Icon: BadgeCheck },
  rejected: { label: "Rejected", Icon: ShieldAlert },
  suspended: { label: "Suspended", Icon: ShieldAlert },
};

/** Row subtitle: kind plus what the status means for the developer. */
export function appSubtitle(kind: AppKind, status: DeveloperAppStatus): string {
  if (status === "test") return `${KIND_SHORT[kind]} · Test mode`;
  if (status === "live") return `${KIND_SHORT[kind]} · Live · verified`;
  return `${KIND_SHORT[kind]} · ${STATUS_META[status].label}`;
}
