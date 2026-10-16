/**
 * Planned-maintenance write freeze (database move). When the Worker variable WRITE_FREEZE is exactly "1",
 * every state-changing API request is answered 503 + Retry-After at the edge, before it reaches the container,
 * so nothing writes to the database. Reads (GET/HEAD/OPTIONS) and /api/health* pass. Payment webhooks that
 * get 503 are retried by the provider. Default (unset or anything else) = no behaviour change.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const WRITE_FREEZE_RETRY_AFTER_SECONDS = 120;

export function isWriteFrozen(env: Record<string, unknown>): boolean {
  return env.WRITE_FREEZE === "1";
}

export function writeFreezeResponse(env: Record<string, unknown>, method: string, pathname: string): Response | null {
  if (!isWriteFrozen(env)) return null;
  if (SAFE_METHODS.has(method.toUpperCase())) return null;
  if (pathname === "/api/health" || pathname.startsWith("/api/health/")) return null;
  return new Response(JSON.stringify({ error: "SkipWait is in short planned maintenance. Please retry in a couple of minutes." }), {
    status: 503,
    headers: { "content-type": "application/json", "cache-control": "no-store", "retry-after": String(WRITE_FREEZE_RETRY_AFTER_SECONDS) },
  });
}
