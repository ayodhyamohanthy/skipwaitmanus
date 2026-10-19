// Work-email re-verification policy (queue task 6). One rule shared by the sweep job and the client copy.
export const REVERIFY_DAYS = 90;
/** Existing verified referrers are grandfathered: nobody expires before this date plus REVERIFY_DAYS. */
export const REVERIFY_EPOCH_MS = Date.parse("2026-10-16T00:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

/** The date the 90-day window counts from: the real verification, but never earlier than the epoch. */
export function effectiveVerifiedMs(verifiedAt: Date | string | number | null | undefined): number | null {
  if (verifiedAt === null || verifiedAt === undefined) return null;
  const ms = verifiedAt instanceof Date ? verifiedAt.getTime() : typeof verifiedAt === "number" ? verifiedAt : Date.parse(verifiedAt);
  return Number.isNaN(ms) ? null : Math.max(ms, REVERIFY_EPOCH_MS);
}

/** Whole days left before the badge needs re-verifying (0 or less means due); null when not verified. */
export function reverifyDaysLeft(verifiedAt: Date | string | number | null | undefined, nowMs: number): number | null {
  const effective = effectiveVerifiedMs(verifiedAt);
  if (effective === null) return null;
  return Math.ceil((effective + REVERIFY_DAYS * DAY_MS - nowMs) / DAY_MS);
}

/** Latest `workEmailVerifiedAt` that is due at `nowMs` (used by the sweep query). */
export function reverifyDueCutoff(nowMs: number): Date {
  return new Date(nowMs - REVERIFY_DAYS * DAY_MS);
}
