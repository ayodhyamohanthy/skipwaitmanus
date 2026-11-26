// D-393 (a): the demo accounts test any company and any referral, with no limits, in a sandbox.
//
// A **sandbox request** is a referral request whose seeker is the reviewer demo seeker
// (`seeker@reviewer.skipwait.me`). It may go to every company with the same job-link checks, composer and
// money rules as everyone else, but with no monthly, slot, per-company or rate limit, and it reaches only
// the demo referrer (`referrer@reviewer.skipwait.me`), who acts as a verified employee of whatever company
// the request names — for sandbox requests only. No real person is ever notified, shown or counted with one.
//
// This module is the only definition. Every chokepoint asks these predicates rather than comparing an
// email itself, so "who is a sandbox account" changes in one place. The demo emails are the fixed
// reviewer accounts in `server/_core/reviewerLogin.ts`; they are not configurable, because a configurable
// sandbox identity would let a real account become one.

export const SANDBOX_DOMAIN = "reviewer.skipwait.me";
export const SANDBOX_SEEKER_EMAIL = `seeker@${SANDBOX_DOMAIN}`;
export const SANDBOX_REFERRER_EMAIL = `referrer@${SANDBOX_DOMAIN}`;

const normalize = (email: string | null | undefined) => (email ?? "").trim().toLowerCase();

/** True for either demo account (the demo seeker or the demo referrer). */
export function isSandboxAccount(email: string | null | undefined): boolean {
  const value = normalize(email);
  return value === SANDBOX_SEEKER_EMAIL || value === SANDBOX_REFERRER_EMAIL;
}

/** True only for the demo seeker: the account whose referral requests are sandbox requests. */
export function isSandboxSeeker(email: string | null | undefined): boolean {
  return normalize(email) === SANDBOX_SEEKER_EMAIL;
}

/** True only for the demo referrer: the only referrer a sandbox request may reach. */
export function isSandboxReferrer(email: string | null | undefined): boolean {
  return normalize(email) === SANDBOX_REFERRER_EMAIL;
}

/**
 * The referrers a request may reach (D-393). A real request keeps exactly the eligible set its
 * company and availability rules produced. A sandbox request reaches the demo referrer alone, and
 * never falls back to a real employee when the demo referrer is missing: an empty result means the
 * request reaches nobody, which is the safe answer.
 */
export function sandboxReachableReferrers<T>(sandbox: boolean, demoReferrer: T | undefined, eligible: readonly T[]): T[] {
  if (!sandbox) return [...eligible];
  return demoReferrer === undefined ? [] : [demoReferrer];
}
