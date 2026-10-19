// Verified-referrer contract: GET /api/company-referrals/access.
//
// The server alone decides who is a verified referrer: the canonical account's
// profile holds a work-email domain verified for that company
// (server/db.ts getVerifiedWorkEmailAccess -> isVerifiedEmployeeOfCompany), the
// same check the company inbox runs. Every referrer surface gates on this
// response through isVerifiedReferrer, never on the sign-in account's own email
// addresses: a Google SSO session that verified a work email by one-time code
// only carries the personal address, yet it is a verified referrer.
import { z } from "zod";
import { companyIdentityFieldsSchema } from "./companies";

export const REFERRER_ACCESS_PATH = "/api/company-referrals/access";

/** The response the server sends; every field is always present. */
export type ReferrerAccessResponse = {
  verifiedCompanyAccess: boolean;
  workEmailDomain: string | null;
  companyName: string | null;
  companyInitials: string | null;
};

/**
 * Parses the access response at the client edge. `verifiedCompanyAccess` is
 * required: a payload without it is an error, never a silent "not verified".
 * Unknown fields are dropped; absent directory name fields read as null.
 */
export const referrerAccessResponseSchema = z.object({
  verifiedCompanyAccess: z.boolean(),
  workEmailDomain: z.string().nullish(),
  ...companyIdentityFieldsSchema.shape,
}).transform((access): ReferrerAccessResponse => ({
  verifiedCompanyAccess: access.verifiedCompanyAccess,
  workEmailDomain: access.workEmailDomain ?? null,
  companyName: access.companyName ?? null,
  companyInitials: access.companyInitials ?? null,
}));

/** The one verified-referrer predicate: the server granted access for a company domain. */
export function isVerifiedReferrer(access: Pick<ReferrerAccessResponse, "verifiedCompanyAccess" | "workEmailDomain"> | null | undefined): boolean {
  return Boolean(access?.verifiedCompanyAccess && access.workEmailDomain);
}
