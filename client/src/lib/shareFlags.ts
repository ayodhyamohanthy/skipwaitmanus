// Build-time client flags (D-097): all share/signal cards ship off. Server twins gate the matching endpoints.
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
export const SHARE_WIN_CARD = env.VITE_SHARE_WIN_CARD === "true";
export const SHARE_IMPACT_CARD = env.VITE_SHARE_IMPACT_CARD === "true";
