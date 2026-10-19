/**
 * D-038 timers on referrers (owner, Oct 16 2026; refined by D-066).
 *
 *  - A claim ("I'm on it") lapses after 48 hours without an accept or decline;
 *    the employee is reminded once at 24 hours. A referrer holds at most five
 *    claims at once. A lapsed claim spends no credit: the ask's credit was
 *    already settled at first visibility (D-034) and stays with the ask.
 *  - After accepting, the referrer has 5 days to tap "Referred — submitted in
 *    our system", with reminders on day 2 and day 4 and one optional 3-day
 *    extension. If the deadline passes without a referral, the ask reopens to
 *    colleagues and the credit is released (D-038); a referrer may also step
 *    back voluntarily after accepting, with the same credit release (D-066).
 *
 * All numbers are changeable with data (the owner's rule) and every timestamp
 * is computed on the JS clock, never from DB NOW() (invariant 5).
 */
export const TIMER_HOUR_MS = 60 * 60 * 1000;
export const TIMER_DAY_MS = 24 * TIMER_HOUR_MS;

export const CLAIM_REMINDER_HOURS = 24;
export const CLAIM_LAPSE_HOURS = 48;
export const MAX_ACTIVE_CLAIMS = 5;
export const REFERRAL_MARK_DAYS = 5;
export const REFERRAL_EXTENSION_DAYS = 3;
/** D-038's named reminders, in whole days after acceptance. */
export const REFERRAL_REMINDER_DAYS = [2, 4] as const;

function toMs(value: Date | string | number | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** The instant a claim lapses (claimedAt + 48 h), or null when the ask is not claimed. */
export function claimLapsesAtMs(claimedAt: Date | string | number | null | undefined): number | null {
  const base = toMs(claimedAt);
  return base === null ? null : base + CLAIM_LAPSE_HOURS * TIMER_HOUR_MS;
}

/** True when a live claim is past D-038's 48-hour decision window. */
export function isClaimLapsed(claimedAt: Date | string | number | null | undefined, nowMs: number = Date.now()): boolean {
  const lapsesAt = claimLapsesAtMs(claimedAt);
  return lapsesAt !== null && nowMs >= lapsesAt;
}

/** The 24-hour reminder window: due once, between 24 h and the 48-hour lapse. */
export function isClaimReminderDue(claimedAt: Date | string | number | null | undefined, nowMs: number = Date.now()): boolean {
  const base = toMs(claimedAt);
  if (base === null) return false;
  const age = nowMs - base;
  return age >= CLAIM_REMINDER_HOURS * TIMER_HOUR_MS && age < CLAIM_LAPSE_HOURS * TIMER_HOUR_MS;
}

/**
 * The absolute deadline for "Referred — submitted in our system": acceptedAt +
 * 5 days, or +3 more days once when the referrer used their one extension.
 * Null for rows accepted before migration 0096 (no acceptedAt): the timer never
 * strands a historical acceptance.
 */
export function referralDeadlineAtMs(input: {
  acceptedAt?: Date | string | number | null;
  referralExtendedAt?: Date | string | number | null;
}): number | null {
  const base = toMs(input.acceptedAt);
  if (base === null) return null;
  const days = REFERRAL_MARK_DAYS + (toMs(input.referralExtendedAt) === null ? 0 : REFERRAL_EXTENSION_DAYS);
  return base + days * TIMER_DAY_MS;
}

/** True only for an accepted, not-yet-referred ask past its referral deadline. */
export function isReferralDeadlinePassed(input: {
  status: string;
  acceptedAt?: Date | string | number | null;
  referralExtendedAt?: Date | string | number | null;
  referredAt?: Date | string | number | null;
}, nowMs: number = Date.now()): boolean {
  if (input.status !== "approved" || toMs(input.referredAt) !== null) return false;
  const deadline = referralDeadlineAtMs(input);
  return deadline !== null && nowMs >= deadline;
}

/** 2 or 4 when a D-038 reminder is due for an accepted ask, else null. */
export function referralReminderDay(input: {
  status: string;
  acceptedAt?: Date | string | number | null;
  referredAt?: Date | string | number | null;
}, nowMs: number = Date.now()): 2 | 4 | null {
  if (input.status !== "approved" || toMs(input.referredAt) !== null) return null;
  const base = toMs(input.acceptedAt);
  if (base === null) return null;
  const days = Math.floor((nowMs - base) / TIMER_DAY_MS);
  return (REFERRAL_REMINDER_DAYS as readonly number[]).includes(days) ? (days as 2 | 4) : null;
}

/** Whole days left before the referral deadline; null when no deadline applies. */
export function referralDaysLeft(input: {
  acceptedAt?: Date | string | number | null;
  referralExtendedAt?: Date | string | number | null;
}, nowMs: number = Date.now()): number | null {
  const deadline = referralDeadlineAtMs(input);
  return deadline === null ? null : Math.ceil((deadline - nowMs) / TIMER_DAY_MS);
}

/** Compact, truthful copy for the referrer's accepted-ask card. */
export function formatReferralDeadline(input: {
  acceptedAt?: Date | string | number | null;
  referralExtendedAt?: Date | string | number | null;
}, nowMs: number = Date.now()): string | null {
  const days = referralDaysLeft(input, nowMs);
  if (days === null) return null;
  if (days <= 0) return "Referral deadline passed";
  if (days === 1) return "Mark referred within 1 day";
  return `Mark referred within ${days} days`;
}
