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
  // D-090-BYOR: the one-time bring-your-own-referrer link, raw token and claim suffix.
  rule("/api/ask-invites", 1, true),
  // A storage key can hold slashes and a person's file name: drop everything after the prefix.
  rule("/api/documents/by-key", 1, false),
  // Browser link routes (client/src/App.tsx; /share-card is also served by the server)
  rule("/email-review", 1, true),
  rule("/share-card", 1, true),
  rule("/fast", 1, true),
  rule("/refer", 2, true),
  rule("/r", 1, true),
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

// Sentry can copy the same request data into several places. Drop credential
// fields by name as well as URL query/fragment attributes before serialization.
const KEPT_HEADERS = new Set([
  "host", "user-agent", "content-type", "content-length", "accept", "accept-language",
  "origin", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "cf-ray",
]);
const PRIVATE_FIELD = /(?:^|[._-])(?:query|query_string|fragment|body|cookies?|authorization|email|password|new_password|current_password|confirm_password|password_confirmation|(?:password_)?reset_token|token)$/i;
const HTTP_HEADERS = /^http\.(?:request|response)\.headers?(?:\.|$)/i;
const URL_FIELD = /^(?:url|from|to|referer|referrer)$|^(?:url|http)\..*(?:url|full|path|target|referer|referrer)$/i;
const URL_LABEL = /^([A-Z]+ )?((?:\/|https?:\/\/)\S*)$/;
const EMAIL = /[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/;
const RESET_URL = /\/(?:reset-password\/*|api\/auth\/password\/reset\/verify)[?#]/i;
const CREDENTIAL_VALUE = /\b(?:password|new[_-]?password|confirm[_-]?password|(?:password[_-]?)?reset[_-]?token|token)\s*["']?\s*[:=]\s*\S/i;
const REDACTED = "[redacted]";

type Scrubber = (value: string) => string;
type Attributes = Record<string, unknown>;
type ScrubbableBreadcrumb = { message?: string; data?: Attributes };
type ScrubbableSpan = { description?: string; data?: Attributes };
type ScrubbableEvent = {
  request?: { url?: string; data?: unknown; cookies?: unknown; query_string?: unknown; env?: unknown; headers?: Record<string, string> };
  user?: { id?: string | number; email?: string; ip_address?: string | null };
  breadcrumbs?: readonly ScrubbableBreadcrumb[];
  spans?: readonly ScrubbableSpan[];
  contexts?: Attributes;
  extra?: Attributes;
  tags?: Attributes;
  message?: string;
  transaction?: string;
  sdkProcessingMetadata?: { dynamicSamplingContext?: { transaction?: string } };
  exception?: { values?: readonly { value?: string }[] };
};

/** Redact credential-bearing free text, including encoded reset links and emails. */
export function scrubTelemetryCredentials(value: string): string {
  let decoded = value;
  for (let pass = 0; pass <= 2; pass++) {
    if (RESET_URL.test(decoded) || EMAIL.test(decoded) || CREDENTIAL_VALUE.test(decoded)) return REDACTED;
    const next = decoded.replace(/%([\da-f]{2})/gi, (_escape, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    if (next === decoded) break;
    decoded = next;
  }
  return value;
}

function scrubLabel(value: string, scrubUrl: Scrubber, scrubText: Scrubber): string {
  const match = URL_LABEL.exec(value);
  const url = match?.[2];
  return url ? `${match[1] ?? ""}${scrubUrl(url)}` : scrubText(value);
}

function scrubAttributes(data: Attributes, scrubUrl: Scrubber, scrubText: Scrubber, depth = 0): void {
  for (const [key, value] of Object.entries(data)) {
    const field = key.replace(/([a-z])([A-Z])/g, "$1_$2");
    if (PRIVATE_FIELD.test(field) || HTTP_HEADERS.test(field) || /(?:^|\.)body\./i.test(field)) {
      delete data[key];
    } else if (typeof value === "string" && URL_FIELD.test(key)) {
      data[key] = scrubUrl(value);
    } else {
      data[key] = scrubValue(value, scrubUrl, scrubText, depth + 1);
    }
  }
}

function scrubValue(value: unknown, scrubUrl: Scrubber, scrubText: Scrubber, depth: number): unknown {
  if (typeof value === "string") return scrubText(value);
  if (!value || typeof value !== "object") return value;
  if (depth >= 8) return REDACTED;
  if (Array.isArray(value)) return value.map(item => scrubValue(item, scrubUrl, scrubText, depth + 1));
  const data: Attributes = { ...value };
  scrubAttributes(data, scrubUrl, scrubText, depth);
  return data;
}

export function scrubTelemetryBreadcrumb<T extends ScrubbableBreadcrumb>(breadcrumb: T, scrubUrl: Scrubber, scrubText: Scrubber): T {
  const next = { ...breadcrumb };
  if (typeof next.message === "string") next.message = scrubText(next.message);
  if (next.data) {
    next.data = { ...next.data };
    scrubAttributes(next.data, scrubUrl, scrubText);
  }
  return next;
}

function scrubRequest(request: NonNullable<ScrubbableEvent["request"]>, scrubUrl: Scrubber, scrubText: Scrubber): void {
  delete request.data;
  delete request.cookies;
  delete request.query_string;
  delete request.env;
  if (request.url) request.url = scrubUrl(request.url);
  if (!request.headers) return;
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    const lower = name.toLowerCase();
    if (lower === "referer" || lower === "origin") headers[name] = scrubUrl(value);
    else if (KEPT_HEADERS.has(lower)) headers[name] = scrubText(value);
  }
  request.headers = headers;
}

/** Remove credential-bearing fields from the SDK's final errors and transactions. */
export function scrubTelemetryEvent<T extends ScrubbableEvent>(event: T, scrubUrl: Scrubber, scrubText: Scrubber): T {
  if (event.request) scrubRequest(event.request, scrubUrl, scrubText);
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
  }
  if (event.message) event.message = scrubText(event.message);
  if (event.transaction) event.transaction = scrubLabel(event.transaction, scrubUrl, scrubText);
  const sampling = event.sdkProcessingMetadata?.dynamicSamplingContext;
  if (sampling?.transaction) {
    event.sdkProcessingMetadata = {
      ...event.sdkProcessingMetadata,
      dynamicSamplingContext: { ...sampling, transaction: scrubLabel(sampling.transaction, scrubUrl, scrubText) },
    };
  }
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(crumb => scrubTelemetryBreadcrumb(crumb, scrubUrl, scrubText));
  for (const attributes of [event.contexts, event.extra, event.tags]) {
    if (attributes) scrubAttributes(attributes, scrubUrl, scrubText);
  }
  for (const span of event.spans ?? []) {
    if (span.description) span.description = scrubLabel(span.description, scrubUrl, scrubText);
    if (span.data) scrubAttributes(span.data, scrubUrl, scrubText);
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value);
  }
  return event;
}

/** A full or relative URL reduced to its scrubbed path; anything unparseable becomes `:token`. */
export function scrubTelemetryUrl(value: string, origin: string): string {
  try {
    return scrubTelemetryPath(new URL(value, origin || "http://localhost").pathname);
  } catch {
    return TOKEN;
  }
}
