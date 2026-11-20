// Build-time client flags (D-097). Each ships off; the matching server flag must also be on.
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

/** D-104 company responsiveness signal. Off: no request, nothing rendered. Server twin: COMPANY_RESPONSE_SIGNAL_ENABLED. */
export const COMPANY_RESPONSE_SIGNAL = env.VITE_COMPANY_RESPONSE_SIGNAL === "true";

/** D-090 BYOR one-time invite links. Off: no action renders, no request is made, `/r/:token` shows unavailable. Server twin: BYOR_LINK_ENABLED. */
export const BYOR_LINK = env.VITE_BYOR_LINK === "true";
