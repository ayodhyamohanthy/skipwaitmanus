import { captureClientError } from "./sentry";

// REL-client-capture (D-212): a thin wrapper over fetch that records the calls
// that fail the way an outage looks (a 5xx, an HTML page where JSON was
// expected, a network failure) and otherwise stays invisible. It returns and
// throws exactly what fetch did, never reads the body, and reports each route at
// most once per page load so a retry loop cannot spend the Sentry quota.
// Reports carry a route template only: no query, token, id, body or message
// from the server (packet rule 3).

type ApiFailureKind = "api_5xx" | "api_html_response" | "api_network_error";

const reportedRoutes = new Set<string>();
const reportedQueryErrors = new Set<string>();

const ID_SEGMENT = /^(?:\d+|[A-Za-z0-9_-]{16,})$/;

/** A path with its query and hash dropped and every id-like segment replaced by `:id`. */
export function apiRouteTemplate(raw: string): string {
  let pathname: string;
  try {
    pathname = new URL(raw, "http://route.invalid").pathname;
  } catch {
    return "[unparsed]";
  }
  return pathname.split("/").map(segment => (ID_SEGMENT.test(segment) ? ":id" : segment)).join("/");
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return "";
}

function requestMethod(input: Parameters<typeof fetch>[0], init: RequestInit | undefined): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function report(kind: ApiFailureKind, input: Parameters<typeof fetch>[0], init: RequestInit | undefined, status?: number): void {
  try {
    const route = apiRouteTemplate(requestUrl(input));
    if (reportedRoutes.has(route)) return;
    reportedRoutes.add(route);
    captureClientError(new Error(`${kind} ${route}`), {
      source: "api-fetch",
      kind,
      route,
      method: requestMethod(input, init),
      ...(status === undefined ? {} : { status }),
    });
  } catch {
    // Reporting must never change what the caller sees.
  }
}

function inspect(response: unknown, input: Parameters<typeof fetch>[0], init: RequestInit | undefined): void {
  try {
    if (!response || typeof response !== "object") return;
    const { status, headers } = response as { status?: unknown; headers?: unknown };
    const code = typeof status === "number" ? status : undefined;
    if (code !== undefined && code >= 500) { report("api_5xx", input, init, code); return; }
    const contentType = headers && typeof (headers as Headers).get === "function" ? (headers as Headers).get("content-type") : null;
    if (contentType && contentType.toLowerCase().includes("text/html")) report("api_html_response", input, init, code);
  } catch {
    // A test double or an unusual response is returned untouched.
  }
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

/** Same signature and result as fetch; records outage-shaped failures. */
export async function apiFetch(...args: Parameters<typeof fetch>): Promise<Response> {
  const [input, init] = args;
  let response: Response;
  try {
    response = await globalThis.fetch(...args);
  } catch (error) {
    if (!isAbort(error)) report("api_network_error", input, init);
    throw error;
  }
  inspect(response, input, init);
  return response;
}

function httpStatusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as { data?: { httpStatus?: unknown } | null; status?: unknown; statusCode?: unknown };
  for (const value of [candidate.data?.httpStatus, candidate.status, candidate.statusCode]) {
    if (typeof value === "number") return value;
  }
  return undefined;
}

/**
 * React Query and mutation cache errors (client/src/main.tsx). A 4xx is the
 * user's or the session's, not an outage, and is not reported. The
 * "Unexpected token '<'" parse error is the API answering HTML: it is reported
 * as api_html_response with a fixed message instead of being dropped.
 */
export function reportQueryCacheError(error: unknown, kind: "query" | "mutation"): void {
  try {
    const source = kind === "query" ? "react-query" : "react-mutation";
    if (error instanceof Error && error.message.includes("Unexpected token '<'")) {
      if (reportedQueryErrors.has("api_html_response")) return;
      reportedQueryErrors.add("api_html_response");
      captureClientError(new Error("api_html_response"), { source, kind: "api_html_response" });
      return;
    }
    const status = httpStatusOf(error);
    if (status !== undefined && status >= 400 && status < 500) return;
    const key = `${source}:${error instanceof Error ? error.message : String(error)}`;
    if (reportedQueryErrors.has(key)) return;
    reportedQueryErrors.add(key);
    captureClientError(error, status === undefined ? { source } : { source, status });
  } catch {
    // Reporting must never break the query cache.
  }
}

export function resetApiFetchReportsForTests(): void {
  reportedRoutes.clear();
  reportedQueryErrors.clear();
}
