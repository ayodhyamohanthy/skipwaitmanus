// Derived-on-read fan-out measurement. One seeker action notifies every verified
// employee of a company, so "how many individual review grants did one request
// create" is the number that decides whether the product is a referral channel or
// a spam channel. The counting happens in SQL; this module only folds those
// grouped rows, so it stays pure and its limits are the DB's, not Node's memory.

export type FanOutGrantsPerRequest = { requestId: number; grants: number };
export type FanOutGrantsPerEmployee = { referrerId: number; grants: number };
export type FanOutRequestsPerRoleLink = { targetRoleUrl: string | null; requests: number };

export type ReferralFanOutSummary = {
  requests: number;
  reviewGrants: number;
  requestsWithGrants: number;
  grantsPerRequest: number;
  largestRequestFanOut: number;
  mostNotifiedEmployee: number;
  repeatedRoleLinks: number;
  requestsOnRepeatedRoleLinks: number;
};

export function summarizeReferralFanOut(input: {
  grantsPerRequest: readonly FanOutGrantsPerRequest[];
  grantsPerEmployee: readonly FanOutGrantsPerEmployee[];
  requestsPerRoleLink: readonly FanOutRequestsPerRoleLink[];
}): ReferralFanOutSummary {
  const reviewGrants = input.grantsPerRequest.reduce((sum, row) => sum + row.grants, 0);
  // Null is "no role link at all", not a link shared by many requests, so it counts
  // toward the total but never toward the repeat signal.
  const repeated = input.requestsPerRoleLink.filter(row => row.targetRoleUrl !== null && row.requests > 1);
  const largest = input.grantsPerRequest.map(row => row.grants);
  const busiest = input.grantsPerEmployee.map(row => row.grants);
  return {
    requests: input.requestsPerRoleLink.reduce((sum, row) => sum + row.requests, 0),
    reviewGrants,
    requestsWithGrants: input.grantsPerRequest.length,
    grantsPerRequest: input.grantsPerRequest.length === 0 ? 0 : Math.round((reviewGrants / input.grantsPerRequest.length) * 10) / 10,
    largestRequestFanOut: largest.length === 0 ? 0 : Math.max(...largest),
    mostNotifiedEmployee: busiest.length === 0 ? 0 : Math.max(...busiest),
    repeatedRoleLinks: repeated.length,
    requestsOnRepeatedRoleLinks: repeated.reduce((sum, row) => sum + row.requests, 0),
  };
}

export const EMPTY_REFERRAL_FAN_OUT: ReferralFanOutSummary = summarizeReferralFanOut({ grantsPerRequest: [], grantsPerEmployee: [], requestsPerRoleLink: [] });
