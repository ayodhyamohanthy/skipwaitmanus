// Posting caps and expiry for employee-shared openings. Numbers are the ops
// default (founder-changeable) and are configurable through env, never schema.
const positiveInt = (raw: string | undefined, fallback: number) => {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 && value <= 1000 ? value : fallback;
};

export const opportunityLimits = () => ({
  maxOpenPerUser: positiveInt(process.env.OPPORTUNITY_MAX_OPEN_PER_USER, 3),
  maxPerUserPerDay: positiveInt(process.env.OPPORTUNITY_MAX_PER_USER_PER_DAY, 10),
  hiringNowTtlDays: positiveInt(process.env.OPPORTUNITY_HIRING_NOW_TTL_DAYS, 30),
});

export type OpportunityLifecycle = { isActive: boolean; kind: "hiring_now" | "walk_in"; createdAt: Date; walkInEndsAt: Date | null };

/** An opening is live while active and unexpired: hiring-now for the TTL, a walk-in until it ends. */
export function isOpportunityLive(row: OpportunityLifecycle, now = new Date(), ttlDays = opportunityLimits().hiringNowTtlDays) {
  if (!row.isActive) return false;
  if (row.kind === "walk_in") return Boolean(row.walkInEndsAt && row.walkInEndsAt.getTime() > now.getTime());
  return row.createdAt.getTime() > now.getTime() - ttlDays * 86_400_000;
}

export function checkPostingAllowance(input: { openCount: number; lastDayCount: number }, limits = opportunityLimits()) {
  if (input.openCount >= limits.maxOpenPerUser) return `You can keep ${limits.maxOpenPerUser} openings live at once. Let one close before adding another.`;
  if (input.lastDayCount >= limits.maxPerUserPerDay) return `You have reached today's posting limit of ${limits.maxPerUserPerDay}. Try again tomorrow.`;
  return null;
}
