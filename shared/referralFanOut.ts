// Fan-out contract for the admin flow-health panel.
//
// One seeker action notifies every verified employee of a company, so "how many
// employees did one request reach" is the number that decides whether SkipWait is
// a referral channel or a spam channel (docs/GROWTH_STRATEGY.md v2, move 2).
//
// Every field is a count derived on read. No field may ever carry a name, an
// email, a user id or request text — the panel is admin-only precisely because
// the columns are aggregate.
import { z } from "zod";

export const referralFanOutSummarySchema = z.object({
  /** Pending or decided asks in the requests table, the population `requestsPerRoleLink` folds. */
  requests: z.number().int().nonnegative(),
  /** Recorded create events the notification numbers come from — the panel states this window. */
  creationsScanned: z.number().int().nonnegative(),
  /** In-app notifications employees actually received, one per eligible employee per ask. */
  employeeNotifications: z.number().int().nonnegative(),
  largestRequestFanOut: z.number().int().nonnegative(),
  /** Asks that reached one named referrer through a private link instead of the whole company. */
  fastTrackRequests: z.number().int().nonnegative(),
  /** Single-use review email links granted across the window. */
  reviewGrants: z.number().int().nonnegative(),
  requestsWithGrants: z.number().int().nonnegative(),
  /** One decimal place: 20.5 links per request reads truer than a rounded 21. */
  grantsPerRequest: z.number().nonnegative(),
  mostEmailedEmployee: z.number().int().nonnegative(),
  repeatedRoleLinks: z.number().int().nonnegative(),
  requestsOnRepeatedRoleLinks: z.number().int().nonnegative(),
});

export type ReferralFanOutSummary = z.infer<typeof referralFanOutSummarySchema>;
