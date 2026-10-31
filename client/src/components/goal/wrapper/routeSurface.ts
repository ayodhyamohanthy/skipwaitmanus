// Route -> goal surface lookup for the app-wide wrapper states (D-048-F-app-wrapper).
// Read-only over goalSurfaces.ts: no new id, no RELEASED change, no env change.
// The goal variant of a wrapper state renders only where the surface that
// declares the current route is on; everywhere else the legacy variant renders.
import { useLocation } from "wouter";
import { GOAL_SURFACES, goalSurfaceOn, type GoalSurfaceId } from "@/lib/goalSurfaces";

const escape = (segment: string) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function patternToRegExp(pattern: string): RegExp {
  if (pattern === "/") return /^\/$/;
  const body = pattern.split("/").map(segment => (segment.startsWith(":") ? "[^/]+" : escape(segment))).join("/");
  return new RegExp(`^${body}/?$`);
}

const TABLE: readonly { id: GoalSurfaceId; match: RegExp }[] = (Object.entries(GOAL_SURFACES) as [GoalSurfaceId, readonly string[]][])
  .flatMap(([id, routes]) => routes.map(route => ({ id, match: patternToRegExp(route) })));

/** The goal surface that declares `path` (exact route patterns, `:param` segments), or null. */
export function goalSurfaceForPath(path: string): GoalSurfaceId | null {
  const clean = path.split(/[?#]/)[0] || "/";
  return TABLE.find(entry => entry.match.test(clean))?.id ?? null;
}

/** True when the goal surface that declares `path` is on. */
export function goalWrapperOnPath(path: string): boolean {
  const id = goalSurfaceForPath(path);
  return id !== null && goalSurfaceOn(id);
}

/** Same decision for the current route, re-evaluated on client navigation. */
export function useGoalWrapperOn(): boolean {
  const [location] = useLocation();
  return goalWrapperOnPath(location);
}
