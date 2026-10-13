// Worker -> container scheduled-jobs tick protocol. No owner secret of its own.
//
// The Cloudflare cron trigger (wrangler.jsonc triggers.crons = [JOBS_CRON])
// fires the Worker's scheduled() handler, which POSTs JOBS_TICK_PATH to the API
// container with JOBS_TICK_HEADER set to
//   hex(HMAC-SHA256(JWT_SECRET, "jobs-tick:" + unix minute))
// The container (server/jobsTickAuth.ts) accepts the previous, current or next
// minute and compares in constant time: the cron fires exactly on a minute
// boundary, so two clocks a few hundred milliseconds apart must not reject it.
// The Worker strips the header from every public request and refuses public
// /api/internal/ paths, so only scheduled() can ever present a token.
// WebCrypto only, no imports: the same code runs in the Worker and in Node 22.

export const JOBS_TICK_PATH = "/api/internal/jobs/tick";
export const INTERNAL_PATH_PREFIX = "/api/internal/";
export const JOBS_TICK_HEADER = "x-skipwait-jobs-tick";
export const JOBS_TICK_MESSAGE_PREFIX = "jobs-tick:";
/** The one cron schedule wrangler.jsonc declares; server/scheduledJobsWorker.test.ts keeps them equal. */
export const JOBS_CRON = "*/15 * * * *";
export const JOBS_TICK_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export function unixMinute(ms: number): number {
  return Math.floor(ms / 60_000);
}

export async function deriveJobsTickToken(secret: string, minute: number): Promise<string> {
  if (!secret) throw new Error("A signing secret is required");
  if (!Number.isSafeInteger(minute) || minute < 0) throw new Error("The minute must be a non-negative integer");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${JOBS_TICK_MESSAGE_PREFIX}${minute}`)));
  return Array.from(signature, byte => byte.toString(16).padStart(2, "0")).join("");
}

/** The scheduled() handler's tick: POST with a token for the minute it is sent in. */
export async function buildJobsTickRequest(secret: string, nowMs: number, origin = "https://skipwait.me"): Promise<Request> {
  return new Request(`${origin}${JOBS_TICK_PATH}`, { method: "POST", headers: { [JOBS_TICK_HEADER]: await deriveJobsTickToken(secret, unixMinute(nowMs)) } });
}

/**
 * True for any path under /api/internal/, which the public route never
 * forwards. Case-insensitive because Express routing is.
 */
export function isInternalApiPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return path === INTERNAL_PATH_PREFIX.slice(0, -1) || path.startsWith(INTERNAL_PATH_PREFIX);
}

/** A public request never carries the tick header into the container. */
export function withoutJobsTickHeader(request: Request): Request {
  if (!request.headers.has(JOBS_TICK_HEADER)) return request;
  const headers = new Headers(request.headers);
  headers.delete(JOBS_TICK_HEADER);
  return new Request(request, { headers });
}
