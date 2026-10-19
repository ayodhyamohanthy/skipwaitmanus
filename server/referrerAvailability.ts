// One availability predicate for D-034/D-047/D-062, usable inside db.ts
// transactions and by the company directory. No db.ts or companyDirectory.ts
// import (db.ts imports this; the directory keeps deriving its public boolean
// from the same rule), so there is no import cycle. db.ts and
// companyDirectory.ts re-export these names for their existing callers.
//
// "Available" is stronger than "verified": the employee must have a verified
// work email for the company, not be paused or suspended (account or canonical
// person), and be under their monthly referral capacity. D-062 makes exactly
// this predicate govern whether an ask can reach a referrer (D-034/D-047) and
// whether a poster can take a first look (D-022).

export const DEFAULT_REFERRAL_CAPACITY = 3;

/** The fields every availability check reads. Structural, so any profile-shaped row works. */
export type ReferrerAvailability = {
  accountType?: string | null;
  workEmailDomain?: string | null;
  workEmailVerifiedAt?: Date | null;
  paused?: boolean | null;
  referralCapacity?: number | null;
  userSuspended?: boolean | null;
  personSuspended?: boolean | null;
};

export type ReferrerCandidate = ReferrerAvailability & { userId: number };

export function isVerifiedEmployeeOfCompany(profile: { accountType?: string | null; workEmailDomain?: string | null; workEmailVerifiedAt?: Date | null }, companyDomain: string) {
  return profile.accountType === "referrer" && Boolean(profile.workEmailVerifiedAt) && profile.workEmailDomain?.trim().toLowerCase() === companyDomain.trim().toLowerCase();
}

/** D-062: the employee may receive new asks right now. `allocatedSlots` is their current allocated referral availability. */
export function isOpenReferrer(candidate: ReferrerAvailability, companyDomain: string, allocatedSlots: number): boolean {
  if (!isVerifiedEmployeeOfCompany(candidate, companyDomain)) return false;
  if (candidate.paused || candidate.userSuspended || candidate.personSuspended === true) return false;
  return allocatedSlots < (candidate.referralCapacity ?? DEFAULT_REFERRAL_CAPACITY);
}

/** D-062: how many more waiting asks this employee may be handed right now. */
export function referralCapacityRemaining(candidate: Pick<ReferrerAvailability, "referralCapacity">, allocatedSlots: number): number {
  return Math.max(0, (candidate.referralCapacity ?? DEFAULT_REFERRAL_CAPACITY) - Math.max(0, allocatedSlots));
}
