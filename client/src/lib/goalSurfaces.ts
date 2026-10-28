// One flag module for every goal surface (D-134, D-097). Every surface id is
// pre-declared here with the route pattern it owns; a surface ships to
// production by adding its id to RELEASED in code - never by a workflow edit.
// VITE_GOAL_SURFACES is for local and QA builds only ("all" means every id);
// deploy-pages.yml never passes it. Test-mode rule: under vitest,
// goalSurfaceOn ignores RELEASED and reads only VITE_GOAL_SURFACES (empty by
// default), so releasing an id never makes an unedited kit test render the
// goal page. The three landing/sign-in flags from goalFlags.ts are folded
// into the `home` and `sign-in` ids; goalFlags.ts keeps only the unchanged
// cost export, and PLAN_FAMILY_V2_CLIENT lives in planFamilyFlag.ts.
//
// `skippy` is declared ahead of its split row (the /skippy surface had no
// queue row when the whole-app coverage was audited, Oct 23); it stays off
// until its row lands.

export const GOAL_SURFACES = {
  "home": ["/"],
  "home-signed-in": [] as string[], // shares home's route; the signed-in variant
  "sign-in": ["/sign-in", "/forgot-password", "/reset-password", "/reviewer-sign-in"],
  "inbox": ["/inbox", "/thread"],
  "queue": ["/queue"],
  "ask": ["/ask", "/request"],
  "company": ["/explore/:slug", "/company/claim", "/company/dashboard/:slug"],
  "conversation": ["/conversation/:requestId", "/thread/:requestId"],
  "start": ["/start"],
  "onboarding": ["/onboarding"],
  "verify": ["/verify"],
  "plans": ["/plans", "/wallet", "/billing"],
  "premium": ["/premium"],
  "pricing": ["/pricing"],
  "referrer": ["/referrer", "/referrer/impact"],
  "referrer-home": ["/referrer-home", "/referrer-setup"],
  "invite": ["/invite"],
  "post-opportunity": ["/post-opportunity"],
  "email-review": ["/email-review/:linkToken"],
  "settings": ["/settings"],
  "profile": ["/profile", "/work"],
  "alerts": ["/alerts", "/notifications"],
  "messages": ["/messages"],
  "assistants": ["/assistants", "/approve", "/connect-assistant", "/agents"],
  "support": ["/help", "/report", "/safety", "/support"],
  "landed": ["/landed"],
  "suggest-company": ["/suggest-company"],
  "share": ["/share"],
  "skippy": ["/skippy"],
  "employer": ["/employer", "/employer/opportunities"],
  "employer-talent": ["/employer/talent"],
  "employer-billing": ["/employer/billing"],
  "for-companies": ["/for-companies"],
  "admin": ["/admin", "/admin/activity"],
  "admin-money": ["/admin/payments", "/admin/money-check", "/admin/token-recovery", "/admin/catalog-sync"],
  "admin-people": ["/admin/users", "/admin/privacy-requests"],
  "admin-approvals": ["/admin/approvals", "/admin/approvals/:kind/:id", "/admin-review"],
  "admin-ops": ["/admin/flow-health", "/admin/schema", "/admin/smoke", "/admin/skippie", "/admin/partners"],
  "developers": ["/developers", "/developer-console"],
  "policy": ["/privacy", "/terms", "/refunds", "/shipping", "/cancellations", "/about", "/contact", "/guidelines", "/job-referral-platforms", "/choosing-a-job-referral-platform", "/how-employees-refer-candidates"],
  "system": ["/offline", "/emails", "/app-states"],
  "links": ["/fast/:linkCode", "/refer/:companySlug/:vanityAlias", "/share-card/:token"],
  "discovery": ["/explore", "/wall", "/jobs"],
  "public-profile": ["/p/:handle"],
} as const;

export type GoalSurfaceId = keyof typeof GOAL_SURFACES;

// Production truth in code (D-097): one id per line. `home` renders today's
// live V9 landing; every other id is off until its row's release edit.
const RELEASED: readonly GoalSurfaceId[] = [
  "home",
];

export function releasedGoalSurfaces(): readonly GoalSurfaceId[] {
  return RELEASED;
}

function declaredIds(): GoalSurfaceId[] {
  return Object.keys(GOAL_SURFACES) as GoalSurfaceId[];
}

function envSurfaceIds(): string[] {
  const raw = import.meta.env?.VITE_GOAL_SURFACES;
  if (typeof raw !== "string" || raw.trim() === "") return [];
  return raw.split(",").map(part => part.trim()).filter(Boolean);
}

function assertDeclared(id: string): asserts id is GoalSurfaceId {
  if (!Object.prototype.hasOwnProperty.call(GOAL_SURFACES, id)) {
    throw new Error(`goalSurfaceOn: unknown goal surface id "${id}" (declare it in client/src/lib/goalSurfaces.ts)`);
  }
}

// Pure decision core, exported so tests can pin each mode without stubbing
// import.meta.env. `mode` is import.meta.env.MODE; `env` is the raw
// VITE_GOAL_SURFACES string ("" when unset).
export function goalSurfaceDecision(id: GoalSurfaceId, mode: string, env: string): boolean {
  const named = env.split(",").map(part => part.trim()).filter(Boolean);
  if (mode === "test") {
    // Test-mode rule: RELEASED is ignored; only the env names surfaces.
    return named.includes("all") || named.includes(id);
  }
  if (RELEASED.includes(id)) return true;
  return named.includes("all") || named.includes(id);
}

export function goalSurfaceOn(id: GoalSurfaceId): boolean {
  assertDeclared(id as string);
  for (const named of envSurfaceIds()) {
    if (named !== "all") assertDeclared(named);
  }
  const env = typeof import.meta.env?.VITE_GOAL_SURFACES === "string" ? import.meta.env.VITE_GOAL_SURFACES : "";
  return goalSurfaceDecision(id, import.meta.env?.MODE ?? "production", env);
}

// Guard used by tests and the routes manifest: every declared route pattern
// must be unique across ids (home-signed-in intentionally declares none).
export function duplicateGoalRoutes(): string[] {
  const seen = new Map<string, GoalSurfaceId>();
  const duplicates = new Set<string>();
  for (const [id, routes] of Object.entries(GOAL_SURFACES) as [GoalSurfaceId, readonly string[]][]) {
    for (const route of routes) {
      const prior = seen.get(route);
      if (prior) duplicates.add(`${route} (${prior} + ${id})`);
      else seen.set(route, id);
    }
  }
  return Array.from(duplicates);
}

export { declaredIds as goalSurfaceIds };
