/**
 * Pricing region (docs/PRICING_RECOMMENDATION.md, "Guarding against VPN
 * arbitrage"): the region comes from Cloudflare's CF-IPCountry for display, and
 * checkout locks it to the billing country. India sees the INR "India price"
 * (GST wording only once registered, D-007); everyone else sees the one global
 * USD price. INR is charged only with an Indian billing address.
 *
 * The Worker (src/worker.ts) rewrites the header from the edge's own
 * request.cf.country before the request reaches the container, so a caller
 * cannot pick a region by sending the header. No Node imports: the Worker
 * bundles this file too.
 */
export const BILLING_REGIONS = ["IN", "INTL"] as const;
export type BillingRegion = (typeof BILLING_REGIONS)[number];
export type RegionCurrency = "INR" | "USD";

export const EDGE_COUNTRY_HEADER = "cf-ipcountry";
/**
 * Shown beside every INR price. skipwait.me is an Indian sole proprietorship with
 * Udyam (MSME) registration and is **not** GST-registered (D-007), so no GST is
 * charged and the label says only "India price". `INDIA_PRICE_NOTE_GST` is used
 * once a GSTIN exists and the Chargebee tax mode is switched on.
 */
export const INDIA_PRICE_NOTE = "India price";
export const INDIA_PRICE_NOTE_GST = "India price, incl. GST";

/** The label beside an INR price: GST wording only once the seller is GST-registered. */
export function indiaPriceNote(gstRegistered: boolean): string {
  return gstRegistered ? INDIA_PRICE_NOTE_GST : INDIA_PRICE_NOTE;
}

const COUNTRY = /^[A-Z]{2}$/;

/** IN for India, INTL for every other or unknown country (Cloudflare sends XX or T1 when it cannot tell). */
export function regionForCountry(country: unknown): BillingRegion {
  return typeof country === "string" && country.trim().toUpperCase() === "IN" ? "IN" : "INTL";
}

export function currencyForRegion(region: BillingRegion): RegionCurrency {
  return region === "IN" ? "INR" : "USD";
}

/** The region of an incoming request from its (Worker-set) CF-IPCountry header value; a repeated header reads as unknown. */
export function regionFromHeader(value: string | string[] | null | undefined): BillingRegion {
  return regionForCountry(Array.isArray(value) ? null : value);
}

/** The edge's country for a Worker request (request.cf.country), or null when Cloudflare did not attach one. */
export function edgeCountryOf(request: Request): string | null {
  const cf: unknown = Reflect.get(request, "cf");
  if (typeof cf !== "object" || cf === null) return null;
  const country: unknown = Reflect.get(cf, "country");
  return typeof country === "string" && COUNTRY.test(country) ? country : null;
}

/** The request the container sees: CF-IPCountry set from the edge, never from the caller. */
export function withEdgeCountry(request: Request): Request {
  const country = edgeCountryOf(request);
  if (request.headers.get(EDGE_COUNTRY_HEADER) === country) return request;
  const headers = new Headers(request.headers);
  if (country) headers.set(EDGE_COUNTRY_HEADER, country);
  else headers.delete(EDGE_COUNTRY_HEADER);
  return new Request(request, { headers });
}
