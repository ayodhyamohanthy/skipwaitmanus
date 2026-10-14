// One typed request path to the Chargebee v2 API for the subscription
// management and billing account features. Every response is parsed with a Zod
// schema before use; a provider error becomes a ChargebeeApiError carrying only
// sanitized codes (never request bodies, card data or download links).
import { z } from "zod";
import { resolveBillingEnvironment, resolveChargebeeRuntime } from "./chargebeeEnvironment";

export type ChargebeeCredentials = { site: string; apiKey: string };
/** The configured billing site; `environment` keeps test and live ids apart in our tables. */
export type ChargebeeSite = ChargebeeCredentials & { environment: "test" | "live" };

/** The process's billing site (BILLING_ENV), or a 503-worthy error when keys are missing. */
export function currentChargebeeSite(): ChargebeeSite {
  const runtime = resolveChargebeeRuntime(undefined);
  return { site: runtime.site, apiKey: runtime.apiKey, environment: resolveBillingEnvironment() };
}

const errorBodySchema = z.object({
  api_error_code: z.string().optional(),
  error_code: z.string().optional(),
  error_cause_id: z.string().optional(),
  type: z.string().optional(),
  message: z.string().optional(),
});

function clean(value: string | undefined, max: number): string {
  return (value ?? "").replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7E]/g, "").slice(0, max);
}

export class ChargebeeApiError extends Error {
  constructor(readonly status: number, readonly apiErrorCode: string, readonly errorCode: string | null, readonly providerMessage: string) {
    super(`Chargebee request failed (${status}, ${apiErrorCode})`);
    this.name = "ChargebeeApiError";
  }
}

export function isChargebeeNotConfiguredError(error: unknown): boolean {
  return error instanceof Error && /Chargebee API key(?:\/site)? is not configured/.test(error.message);
}

export type ChargebeeRequest = {
  method: "GET" | "POST";
  path: string;
  form?: URLSearchParams;
  query?: URLSearchParams;
  timeoutMs?: number;
};

/** Sends one request and parses the 2xx body with `schema`; anything else throws ChargebeeApiError. */
export async function chargebeeRequest<T>(credentials: ChargebeeCredentials, request: ChargebeeRequest, schema: z.ZodType<T>): Promise<T> {
  if (!credentials.apiKey || !credentials.site) throw new Error("Chargebee API key/site is not configured");
  const search = request.query ? request.query.toString() : "";
  const query = search ? `?${search}` : "";
  const response = await fetch(`https://${credentials.site}.chargebee.com/api/v2${request.path}${query}`, {
    method: request.method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.apiKey}:`).toString("base64")}`,
      ...(request.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: request.form,
    signal: AbortSignal.timeout(request.timeoutMs ?? 15_000),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = errorBodySchema.safeParse(body);
    const data = error.success ? error.data : {};
    throw new ChargebeeApiError(response.status, clean(data.api_error_code ?? data.type, 80) || "unknown", clean(data.error_code, 80) || null, clean(data.message, 240));
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ChargebeeApiError(502, "invalid_response", null, "Chargebee returned an unexpected response");
  return parsed.data;
}

/** Path segment for a provider id; ids are opaque, so they are always encoded. */
export function idPath(id: string): string {
  return encodeURIComponent(id);
}

/** Chargebee timestamps are UTC seconds. */
export const providerDate = z.number().int().positive().transform(seconds => new Date(seconds * 1000));
export const toProviderSeconds = (date: Date) => String(Math.floor(date.getTime() / 1000));
