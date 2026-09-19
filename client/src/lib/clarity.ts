import Clarity from "@microsoft/clarity";

// Single-use links carry secrets in the path (referral review tokens, share
// cards, fast-track codes). Clarity records page URLs alongside its replays,
// so tracking stays off those routes entirely. Mirrors the scrub lists in
// client/src/lib/sentry.ts and server/sentry.ts.
const SENSITIVE_PATHS = [/^\/email-review\//, /^\/share-card\//, /^\/fast\//, /^\/refer\//];

export function shouldTrackClarityPath(pathname: string): boolean {
  return !SENSITIVE_PATHS.some((pattern) => pattern.test(pathname));
}

let initialized = false;

export function initClarity(): boolean {
  if (initialized || typeof window === "undefined") return initialized;
  const projectId = import.meta.env.VITE_CLARITY_PROJECT_ID as string | undefined;
  if (!projectId || !shouldTrackClarityPath(window.location.pathname)) return false;
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
