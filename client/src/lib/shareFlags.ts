// Build-time client flag (D-097): the seeker win card ships off. No server twin: the card is built from
// the role, company and status the seeker already sees on their own ask.
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
export const SHARE_WIN_CARD = env.VITE_SHARE_WIN_CARD === "true";
