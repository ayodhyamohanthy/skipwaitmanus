import Clarity from "@microsoft/clarity";

// Single-use links carry secrets in the path (referral review tokens, share
// cards, fast-track codes). Clarity records page URLs alongside its replays,
// so tracking stays off those routes entirely. Mirrors the scrub list in
// client/src/lib/sentry.ts.
const SENSITIVE_PATHS = [
  /\/company\/claim/i,
  /\/company\/dashboard\//i,
  /\/email-review\//i,
  /\/share-card\//i,
  /\/fast\//i,
  /\/refer\//i,
  /\/r\//i,
  /\/api\/ask-invites\//i,
];
const MAX_DECODE_PASSES = 2;

// Decodes only well-formed escapes, so one broken escape cannot stop the rest
// of a hostile string from being inspected.
function decodeValidEscapes(value: string): string {
  return value.replace(/%([0-9a-f]{2})/gi, match => {
    try {
      return decodeURIComponent(match);
    } catch {
      return match;
    }
  });
}

function matchesSensitive(value: string): boolean {
  return SENSITIVE_PATHS.some((pattern) => pattern.test(value));
}

// Clarity records the full URL, query included, and React Router matches routes
// case-insensitively, so a path is checked as written, percent-decoded up to
// twice, and ignored when it is still encoded or malformed after that
// (D-090 re-review F3 and its post-fix regression round).
function isSensitiveTarget(value: string): boolean {
  let current = value;
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass++) {
    if (matchesSensitive(current)) return true;
    const decoded = decodeValidEscapes(current);
    if (decoded === current) return false;
    current = decoded;
  }
  if (matchesSensitive(current)) return true;
  return /%[0-9a-f]{2}/i.test(current);
}

export function shouldTrackClarityPath(pathname: string, search = ""): boolean {
  if (isSensitiveTarget(pathname)) return false;
  // A malformed query could hide a nested target from every scan below.
  if (/%(?![0-9a-f]{2})/i.test(search)) return false;
  let params: URLSearchParams;
  try { params = new URLSearchParams(search); } catch { return false; }
  // Any query key can name the target (returnTo, next, redirect...), not just
  // the one this app generates.
  let sensitive = false;
  params.forEach((value) => {
    if (isSensitiveTarget(value)) sensitive = true;
  });
  return !sensitive;
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
