// Goal surfaces flag module (D-134): every surface id pre-declared, RELEASED
// in code. Absorbs the landing/sign-in flags from goalFlags.ts.
export const GOAL_SURFACE_IDS = [
  "home",
  "sign-in",
  "inbox",
  "queue",
  "ask",
  "company",
  "conversation",
  "start",
  "onboarding",
  "verify",
  "plans",
  "premium",
  "pricing",
  "referrer",
  "referrer-home",
  "invite",
  "post-opportunity",
  "email-review",
  "settings",
  "profile",
  "alerts",
  "messages",
  "assistants",
  "support",
  "landed",
  "suggest-company",
  "share",
  "employer",
  "employer-talent",
  "employer-billing",
  "for-companies",
  "admin",
  "admin-money",
  "admin-people",
  "admin-approvals",
  "admin-ops",
  "developers",
  "policy",
  "system",
  "links",
  "home-signed-in",
  "discovery",
  "public-profile",
] as const;

export type GoalSurfaceId = (typeof GOAL_SURFACE_IDS)[number];

export const GOAL_SURFACE_ROUTES: Record<GoalSurfaceId, string> = {
  "home": "/",
  "sign-in": "/sign-in",
  "inbox": "/inbox",
  "queue": "/queue",
  "ask": "/ask",
  "company": "/explore/:slug",
  "conversation": "/conversation/:requestId",
  "start": "/start",
  "onboarding": "/onboarding",
  "verify": "/verify",
  "plans": "/plans",
  "premium": "/premium",
  "pricing": "/pricing",
  "referrer": "/referrer",
  "referrer-home": "/referrer-home",
  "invite": "/invite",
  "post-opportunity": "/post-opportunity",
  "email-review": "/email-review/:linkToken",
  "settings": "/settings",
  "profile": "/profile",
  "alerts": "/alerts",
  "messages": "/messages",
  "assistants": "/assistants",
  "support": "/support",
  "landed": "/landed",
  "suggest-company": "/suggest-company",
  "share": "/share",
  "employer": "/employer",
  "employer-talent": "/employer/talent",
  "employer-billing": "/employer/billing",
  "for-companies": "/for-companies",
  "admin": "/admin",
  "admin-money": "/admin/payments",
  "admin-people": "/admin/users",
  "admin-approvals": "/admin/approvals",
  "admin-ops": "/admin/activity",
  "developers": "/developers",
  "policy": "/policy",
  "system": "/system",
  "links": "/links",
  "home-signed-in": "/home",
  "discovery": "/explore",
  "public-profile": "/u/:handle",
};

/** Released in code: goes live without env flags. */
export const RELEASED: readonly GoalSurfaceId[] = ["home"] as const;

function parseGoalSurfacesEnv(envValue: string | undefined): Set<string> | "all" {
  const trimmed = (envValue ?? "").trim();
  if (!trimmed) return new Set();
  if (trimmed.toLowerCase() === "all") return "all";
  return new Set(trimmed.split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
}

/**
 * Returns true if the goal surface is enabled.
 * In test mode (import.meta.env.MODE === 'test'), RELEASED is ignored and
 * only VITE_GOAL_SURFACES is consulted.
 */
export function goalSurfaceOn(id: GoalSurfaceId): boolean {
  if (!GOAL_SURFACE_IDS.includes(id)) return false;
  const envSurfaces = parseGoalSurfacesEnv(import.meta.env.VITE_GOAL_SURFACES);
  if (envSurfaces === "all") return true;
  if (envSurfaces.has(id)) return true;
  if (import.meta.env.MODE === "test") return false;
  return RELEASED.includes(id);
}
