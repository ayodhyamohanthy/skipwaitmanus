// Referrer home read model (queue task 18 PR 1). READ ONLY: it reports facts and changes no routing, state or credits.
// "Used this month" counts distinct asks this referrer claimed or accepted since the start of the UTC calendar month.
// That definition is an interim product call, pending the founder's confirmation.
export type RoutingState = "unverified" | "paused" | "at_capacity" | "active";

export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function buildReferrerHome(input: { verified: boolean; paused: boolean; capacity: number; usedThisMonth: number; waiting: number; expiringSoon: number }) {
  const total = Math.max(1, Math.floor(input.capacity) || 3);
  const used = Math.max(0, Math.floor(input.usedThisMonth));
  const left = Math.max(0, total - used);
  const state: RoutingState = !input.verified ? "unverified" : input.paused ? "paused" : left === 0 ? "at_capacity" : "active";
  return { capacity: { total, usedThisMonth: used, left }, routing: { state }, waiting: Math.max(0, input.waiting), expiringSoon: Math.max(0, input.expiringSoon) };
}
