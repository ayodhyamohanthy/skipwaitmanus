// FND-4: single-use link tokens, vanity aliases and storage keys never reach Sentry,
// admin alert emails or the activity log. One scrubber for server and client.
//
// Each rule keeps the fixed part of a route and replaces its token segment with
// `:token`. Rules match the way Express routes do (case-insensitive, optional
// trailing slash), and the first matching rule wins, so the vanity route is listed
// before the plain fast-track route it would otherwise look like.
// Query and hash are always dropped.

const TOKEN = ":token";

type Rule = { pattern: RegExp; replace: (match: RegExpMatchArray) => string };

const SEGMENT = "[^/]+";

function rule(prefix: string, tokenSegments: number, keepTail: boolean): Rule {
  const tokens = Array.from({ length: tokenSegments }, () => `/${SEGMENT}`).join("");
  const tail = keepTail ? "(/.*)?" : "(?:/.*)?";
  const pattern = new RegExp(`^(${prefix})${tokens}${tail}$`, "i");
  return {
    pattern,
    replace: match => `${match[1]}${`/${TOKEN}`.repeat(tokenSegments)}${keepTail ? (match[2] ?? "") : ""}`,
  };
}

function ruleKeepingOne(prefix: string): Rule {
  // `/api/referrer-fast-track/vanity/:companySlug/:vanityAlias`: the company slug is
  // public, the alias names one referrer (personal data, D-163), so only it goes.
  const pattern = new RegExp(`^(${prefix}/${SEGMENT})/${SEGMENT}(/.*)?$`, "i");
  return { pattern, replace: match => `${match[1]}/${TOKEN}${match[2] ?? ""}` };
}

const RULES: Rule[] = [
  // API routes (server/privateReferralRoutes.ts, server/_core/storageProxy.ts)
  ruleKeepingOne("/api/referrer-fast-track/vanity"),
  rule("/api/referrer-fast-track", 1, true),
  rule("/api/referral-share-cards/public", 1, true),
  rule("/api/referrer-review-links", 1, true),
  // A storage key can hold slashes and a person's file name: drop everything after the prefix.
  rule("/api/documents/by-key", 1, false),
  // Browser link routes (client/src/App.tsx; /share-card is also served by the server)
  rule("/email-review", 1, true),
  rule("/share-card", 1, true),
  rule("/fast", 1, true),
  rule("/refer", 2, true),
];

/** A path (or path with query/hash) with every token segment replaced by `:token`, query and hash dropped. */
export function scrubTelemetryPath(value: string): string {
  const path = (value.split(/[?#]/, 1)[0] ?? "").trim() || "/";
  for (const { pattern, replace } of RULES) {
    const match = path.match(pattern);
    if (match) return replace(match);
  }
  return path;
}

/** A full or relative URL reduced to its scrubbed path; anything unparseable becomes `:token`. */
export function scrubTelemetryUrl(value: string, origin: string): string {
  try {
    return scrubTelemetryPath(new URL(value, origin || "http://localhost").pathname);
  } catch {
    return TOKEN;
  }
}
