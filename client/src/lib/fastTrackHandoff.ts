/**
 * D-017 hand-off: a referrer's personal link (/fast/:code or
 * /refer/:company/:alias) must keep the chosen referrer and the job link
 * through /start → /request → /ask and sign-in, so the ask goes to that
 * referrer, not the whole company. The server already routes an ask carrying
 * fastTrackCode (or fastTrackCompanySlug+fastTrackAlias) to the link's owner;
 * these helpers keep the URL parameters alive across the /request → /ask
 * redirect and turn them into the ask payload's fields.
 */
export type FastTrackAskFields =
  | { fastTrackCode: string }
  | { fastTrackCompanySlug: string; fastTrackAlias: string }
  | Record<string, never>;

/** The ask payload fields a URL's search string carries (at most one link). */
export function fastTrackAskFields(search: string): FastTrackAskFields {
  const params = new URLSearchParams(search);
  const fastTrackCode = params.get("fast")?.trim();
  if (fastTrackCode) return { fastTrackCode };
  const fastTrackCompanySlug = params.get("referCompany")?.trim();
  const fastTrackAlias = params.get("referAlias")?.trim();
  if (fastTrackCompanySlug && fastTrackAlias) return { fastTrackCompanySlug, fastTrackAlias };
  return {};
}

/** /request → /ask keeps the referral-link parameters it was handed. */
export function askRedirectTarget(search: string): string {
  return `/ask${search || ""}`;
}
