// Derived-on-read fan-out measurement. One seeker action notifies every verified
// employee of a company, so "how many employees did one request reach" is the
// number that decides whether the product is a referral channel or a spam channel.
//
// Two layers, deliberately kept apart because they are not the same population:
// the in-app notification goes to every eligible employee (recorded per request in
// the `company_referral.created` activity log), while a single-use review email
// link is granted only to employees whose verified address is at that exact domain.
// Counting links alone would understate reach.

export type FanOutGrantsPerRequest = { requestId: number; grants: number };
export type FanOutGrantsPerEmployee = { referrerId: number; grants: number };
export type FanOutRequestsPerRoleLink = { targetRoleUrl: string | null; requests: number };
export type FanOutCreation = { notifiedEmployees: number; fastTrack: boolean };

export type ReferralFanOutSummary = {
  requests: number;
  creationsScanned: number;
  employeeNotifications: number;
  largestRequestFanOut: number;
  fastTrackRequests: number;
  reviewGrants: number;
  requestsWithGrants: number;
  grantsPerRequest: number;
  mostEmailedEmployee: number;
  repeatedRoleLinks: number;
  requestsOnRepeatedRoleLinks: number;
};

export function summarizeReferralFanOut(input: {
  grantsPerRequest: readonly FanOutGrantsPerRequest[];
  grantsPerEmployee: readonly FanOutGrantsPerEmployee[];
  requestsPerRoleLink: readonly FanOutRequestsPerRoleLink[];
  creations: readonly FanOutCreation[];
}): ReferralFanOutSummary {
  const reviewGrants = input.grantsPerRequest.reduce((sum, row) => sum + row.grants, 0);
  // Null is "no role link at all", not a link shared by many requests, so it counts
  // toward the total but never toward the repeat signal.
  const repeated = input.requestsPerRoleLink.filter(row => row.targetRoleUrl !== null && row.requests > 1);
  const reached = input.creations.map(creation => creation.notifiedEmployees);
  const emailed = input.grantsPerEmployee.map(row => row.grants);
  return {
    requests: input.requestsPerRoleLink.reduce((sum, row) => sum + row.requests, 0),
    creationsScanned: input.creations.length,
    employeeNotifications: reached.reduce((sum, count) => sum + count, 0),
    largestRequestFanOut: reached.length === 0 ? 0 : Math.max(...reached),
    fastTrackRequests: input.creations.filter(creation => creation.fastTrack).length,
    reviewGrants,
    requestsWithGrants: input.grantsPerRequest.length,
    grantsPerRequest: input.grantsPerRequest.length === 0 ? 0 : Math.round((reviewGrants / input.grantsPerRequest.length) * 10) / 10,
    mostEmailedEmployee: emailed.length === 0 ? 0 : Math.max(...emailed),
    repeatedRoleLinks: repeated.length,
    requestsOnRepeatedRoleLinks: repeated.reduce((sum, row) => sum + row.requests, 0),
  };
}

export const EMPTY_REFERRAL_FAN_OUT: ReferralFanOutSummary = summarizeReferralFanOut({
  grantsPerRequest: [], grantsPerEmployee: [], requestsPerRoleLink: [], creations: [],
});

// `operationalActivityLogs.metadata` is a text column written by our own recorder,
// but it is read here long after the writer changed. A row that no longer matches is
// dropped rather than guessed at, so a schema drift shows up as a smaller scanned
// count instead of a fabricated fan-out.
export function parseReferralCreationNotice(metadata: string | null): FanOutCreation | undefined {
  if (!metadata) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const notice = parsed as { notifiedEmployees?: unknown; fastTrack?: unknown };
  if (typeof notice.notifiedEmployees !== "number" || !Number.isSafeInteger(notice.notifiedEmployees) || notice.notifiedEmployees < 0) return undefined;
  return { notifiedEmployees: notice.notifiedEmployees, fastTrack: notice.fastTrack === true };
}
