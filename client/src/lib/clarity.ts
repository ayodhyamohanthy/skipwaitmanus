import Clarity from "@microsoft/clarity";

// Single-use links carry secrets in the path (referral review tokens, share
// cards, fast-track codes). Clarity records page URLs alongside its replays,
// so tracking stays off those routes entirely. Mirrors the scrub lists in
// client/src/lib/sentry.ts and server/sentry.ts.
const SENSITIVE_PATHS = [/^\/company\/claim/, /^\/company\/dashboard\//,/^\/email-review\//, /^\/share-card\//, /^\/fast\//, /^\/refer\//, /^\/r\//];

const matchesSensitive = (path: string) => SENSITIVE_PATHS.some((pattern) => pattern.test(path));

// Clarity records the full URL, query included. A page whose returnTo names a
// sensitive route (for example /sign-in?returnTo=/r/<token>) carries the same
// secret in its query, so it is never tracked either (D-090 re-review F3). A
// returnTo that cannot be read, or that is still encoded after one decode,
// fails safe to "do not track".
function returnToIsSensitive(search: string): boolean {
  let params: URLSearchParams;
  try { params = new URLSearchParams(search); } catch { return true; }
  for (const value of params.getAll("returnTo")) {
    let target = value;
    for (let pass = 0; pass < 2; pass++) {
      if (/%[0-9a-f]{2}/i.test(target)) {
        try { target = decodeURIComponent(target); } catch { return true; }
      }
    }
    if (/%[0-9a-f]{2}/i.test(target) || matchesSensitive(target)) return true;
  }
  return /%(?![0-9a-f]{2})/i.test(search);
}

export function shouldTrackClarityPath(pathname: string, search = ""): boolean {
  return !matchesSensitive(pathname) && !returnToIsSensitive(search);
}

let initialized = false;

export function initClarity(): boolean {
  if (initialized || typeof window === "undefined") return initialized;
  const projectId = import.meta.env.VITE_CLARITY_PROJECT_ID as string | undefined;
  if (!projectId || !shouldTrackClarityPath(window.location.pathname, window.location.search)) return false;
  try {
    Clarity.init(projectId);
  } catch {
    return false;
  }
  initialized = true;
  return true;
}

export function isClarityActive(): boolean {
  return initialized;
}

// Best-effort product-moment event (share/copy). No-op until init succeeds, so
// consent and the sensitive-path guard still gate every event.
export function trackClarityEvent(eventName: string): void {
  if (!initialized) return;
  try {
    Clarity.event(eventName);
  } catch {
    /* analytics is best-effort */
  }
}

// Clarity hashes the id client-side before upload; pass the internal person
// id, never raw emails. No-op until init succeeds.
export function identifyClarity(userId: string | null | undefined): void {
  if (!initialized || !userId) return;
  try {
    Clarity.identify(userId);
  } catch {
    /* analytics is best-effort */
  }
}
