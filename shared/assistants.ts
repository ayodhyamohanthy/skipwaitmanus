import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "./subscriptionPlans";

/**
 * Connected assistants (ChatGPT, Claude, own tools). Contract shared by the
 * server and the screens.
 *
 * Hard rules the product states on the consent screen. They are enforced on the
 * server, never only in copy: an assistant can search, read, draft, and - only
 * after the user approves each one in the app - send an ask or run a paid tool.
 */
export const ASSISTANT_SCOPES = ["search", "read", "draft", "send", "paid_tools"] as const;
export type AssistantScope = (typeof ASSISTANT_SCOPES)[number];

/** Always granted, shown locked on the consent screen. */
export const ASSISTANT_REQUIRED_SCOPES: readonly AssistantScope[] = ["search", "read"];
/** The user may untick these on the consent screen. */
export const ASSISTANT_OPTIONAL_SCOPES: readonly AssistantScope[] = ["draft", "send", "paid_tools"];

export const ASSISTANT_SCOPE_LABELS: Record<AssistantScope, string> = {
  search: "Search companies open to referrals",
  read: "See your requests, alerts and replies",
  draft: "Draft asks for you to review",
  send: "Send an ask - only after you approve each one",
  paid_tools: "Run paid tools - shows the credit cost, you approve first",
};

/** Shown on the consent screen under "It can never". Enforced by the server. */
export const ASSISTANT_NEVER: readonly string[] = [
  "Accept, pass or refer on anyone's behalf",
  "See referrers' work emails or other people's data",
  "Skip the queue or go past your open-request limit",
  "Buy plans or credits",
];

/**
 * Who can use assistants. The founder's rule (Oct 9, 2026): the Max plan only.
 * Access is this explicit list of plan ids, never derived from a price, so a
 * future price change cannot silently change who has access. The test in
 * assistants.test.ts pins the Max price this decision was made against and
 * fails when it changes, so the rule gets re-confirmed on purpose.
 */
export const ASSISTANT_PLANS: readonly SubscriptionPlan[] = ["max"];

export function canUseAssistants(plan: unknown): boolean {
  return typeof plan === "string" && (ASSISTANT_PLANS as readonly string[]).includes(plan);
}

/** The Max USD price (cents) the access rule was confirmed against. */
export const ASSISTANT_GATE_CONFIRMED_MAX_USD_CENTS = SUBSCRIPTION_PLANS.max.prices.USD.amount;

export function isAssistantScope(value: unknown): value is AssistantScope {
  return typeof value === "string" && (ASSISTANT_SCOPES as readonly string[]).includes(value);
}

/**
 * Normalises a requested scope list: unknown scopes dropped, required scopes
 * always present, stable order, no duplicates. Paid tools never imply send.
 */
export function normalizeAssistantScopes(requested: unknown): AssistantScope[] {
  const asked = new Set<AssistantScope>(ASSISTANT_REQUIRED_SCOPES);
  if (Array.isArray(requested)) for (const item of requested) if (isAssistantScope(item)) asked.add(item);
  return ASSISTANT_SCOPES.filter(scope => asked.has(scope));
}

/** Approvals expire; an assistant cannot sit on a pending approval forever. */
export const ASSISTANT_APPROVAL_TTL_MS = 30 * 60 * 1000;
