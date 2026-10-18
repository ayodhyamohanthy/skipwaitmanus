/**
 * What error and performance telemetry (Sentry events, transactions and breadcrumbs) may carry, for both
 * server/sentry.ts and client/src/lib/sentry.ts. Never a request body, cookie, query string, fragment, auth
 * header or any header outside a short allowlist: those carry what people type into forms (passwords,
 * emails), WorkOS reset tokens and session cookies. URLs keep their origin and path; each side passes its own
 * URL scrubber so its single-use link paths are redacted too. Everything is rewritten in place, so one set of
 * rules covers errors, transactions and breadcrumbs alike.
 */
export type TelemetryUrlScrubber = (value: string) => string;

type Attributes = Record<string, unknown>;
type ScrubbableBreadcrumb = { data?: Attributes };
export type ScrubbableEvent = {
  request?: { url?: string; data?: unknown; cookies?: unknown; query_string?: unknown; env?: unknown; headers?: Record<string, string> };
  breadcrumbs?: ScrubbableBreadcrumb[];
  spans?: Array<{ data?: Attributes; description?: string; op?: string }>;
  contexts?: { trace?: { data?: Attributes } };
  transaction?: string;
  user?: { ip_address?: unknown; email?: unknown };
};

/** Request headers worth keeping for diagnosis; every other header (cookie, authorization, forwarding) is dropped. */
const KEPT_HEADERS = new Set(["host", "user-agent", "content-type", "content-length", "accept", "accept-language", "origin", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "cf-ray"]);
/** Span and breadcrumb attributes that hold a query, fragment, body, cookie or header value. */
const DROPPED_ATTRIBUTE = /(?:^|\.)(?:query|fragment|query_string|cookies?|authorization)$|^http\.(?:request|response)\.header\.|\.body(?:\.|$)/i;
/** Attributes that hold a URL (fetch and http breadcrumbs, navigation from/to, OpenTelemetry url attributes). */
const URL_ATTRIBUTE = /^(?:url|from|to)$|(?:^|\.)(?:url|full|target)$/i;

export function stripUrlQuery(value: string): string {
  const cut = value.search(/[?#]/);
  return cut === -1 ? value : value.slice(0, cut);
}

export function scrubTelemetryAttributes(data: Attributes | undefined, scrubUrl: TelemetryUrlScrubber): void {
  if (!data) return;
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (DROPPED_ATTRIBUTE.test(key)) delete data[key];
    else if (typeof value === "string" && URL_ATTRIBUTE.test(key)) data[key] = scrubUrl(value);
  }
}

export function scrubTelemetryBreadcrumb<T extends ScrubbableBreadcrumb>(breadcrumb: T, scrubUrl: TelemetryUrlScrubber): T {
  scrubTelemetryAttributes(breadcrumb.data, scrubUrl);
  return breadcrumb;
}

function keptHeaders(headers: Record<string, string>, scrubUrl: TelemetryUrlScrubber): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower === "referer") kept[name] = scrubUrl(value);
    else if (KEPT_HEADERS.has(lower)) kept[name] = value;
  }
  return kept;
}

/** "POST /path?x" (server) or "/path" (browser): the path part scrubbed like any URL. */
function scrubTransactionName(name: string, scrubUrl: TelemetryUrlScrubber): string {
  const match = /^([A-Z]+ )?(\/\S*)$/.exec(name);
  return match ? `${match[1] ?? ""}${scrubUrl(match[2])}` : name;
}

export function scrubTelemetryEvent<T extends ScrubbableEvent>(event: T, scrubUrl: TelemetryUrlScrubber): T {
  const request = event.request;
  if (request) {
    delete request.data;
    delete request.cookies;
    delete request.query_string;
    delete request.env;
    if (request.url) request.url = scrubUrl(request.url);
    if (request.headers) request.headers = keptHeaders(request.headers, scrubUrl);
  }
  if (event.user) {
    delete event.user.ip_address;
    delete event.user.email;
  }
  event.breadcrumbs?.forEach(breadcrumb => scrubTelemetryBreadcrumb(breadcrumb, scrubUrl));
  scrubTelemetryAttributes(event.contexts?.trace?.data, scrubUrl);
  event.spans?.forEach(span => {
    scrubTelemetryAttributes(span.data, scrubUrl);
    if (span.description && span.op?.startsWith("http")) span.description = stripUrlQuery(span.description);
  });
  if (event.transaction) event.transaction = scrubTransactionName(event.transaction, scrubUrl);
  return event;
}
