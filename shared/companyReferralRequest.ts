import { z } from "zod";
import { acceptedAskCostSchema } from "./acceptedAskCost";
import { askJobFunctionInputSchema } from "./jobFunctions";
import { askWorkItemIdsSchema } from "./askWorkItems";
import { COMPANY_SLUG_PATTERN } from "./companies";

/**
 * Body schema for POST /api/company-referrals (D-174-ask-from-job, D-193 §5.8).
 * Covers every field the route reads, with optional catalogJobId.
 * Unknown fields are refused.
 */
export const companyReferralRequestBodySchema = z
  .object({
    targetRoleUrl: z.string().trim().max(2048).nullish(),
    catalogJobId: z.number().int().positive().nullish(),
    opportunityId: z.number().int().positive().nullish(),
    attachmentIds: z.array(z.number().int().positive()).nullish(),
    companySlug: z.string().regex(COMPANY_SLUG_PATTERN).or(z.literal("")).nullish(),
    confirmedCompanyDomain: z.string().max(255).nullish(),
    compensation: z.string().max(80).nullish(),
    fastTrackCode: z.string().max(64).nullish(),
    fastTrackCompanySlug: z.string().max(48).nullish(),
    fastTrackAlias: z.string().max(30).nullish(),
    expectedCoverage: z.literal("waiting_for_company_coverage").nullish(),
    jobFunction: askJobFunctionInputSchema,
    candidateMessage: z.string().nullish(),
    personalPitch: z.string().nullish(),
    workItemIds: askWorkItemIdsSchema.nullish(),
    expectedCost: acceptedAskCostSchema.nullish(),
  })
  .strict();

export type CompanyReferralRequestBody = z.infer<typeof companyReferralRequestBodySchema>;
