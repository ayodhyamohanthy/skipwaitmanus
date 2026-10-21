// Build-time client flag (D-097): the referrer impact card ships off. Server twin:
// SHARE_IMPACT_CARD_ENABLED gates GET /api/referrer/impact-card (server/impactCard.ts).
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
export const SHARE_IMPACT_CARD = env.VITE_SHARE_IMPACT_CARD === "true";
