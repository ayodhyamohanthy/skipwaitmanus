import { z } from "zod";
import { acceptedAskCostSchema } from "./acceptedAskCost";
import { ASK_NOTE_MAX_LENGTH } from "./askNote";
import { companySlugSchema } from "./companies";
import { recipientListResultSchema } from "./groupPlanRecipients";
import {
  groupPlanFingerprintSchema, groupPlanIdSchema, groupPlanInstantSchema, groupPlanUserIdSchema,
} from "./groupPlanStates";
import { isValidTargetRoleUrl, normalizeTargetRoleUrl } from "./referralUrl";

const normalizedEmailSchema = recipientListResultSchema.unwrap().shape.valid.unwrap().element;
const consentVersionSchema = z.string().trim().min(1).max(128);
const delegationScopeSchema = z.literal("draft_and_propose");
const candidateMessageSchema = z.string().max(ASK_NOTE_MAX_LENGTH)
  .refine(text => text.trim().length > 0, "Confirm a nonempty final note");
const documentIdsSchema = z.array(groupPlanUserIdSchema).min(1).max(20)
  .refine(ids => new Set(ids).size === ids.length, "Select each document once");
const jobUrlSchema = z.string().min(1).max(2048)
  .refine(isValidTargetRoleUrl, "Choose a valid job link")
  .transform(normalizeTargetRoleUrl).pipe(z.string().max(2048));

/** Evidence snapshot only; services must verify the exact alias and canonical owner. */
export const candidateClaimSchema = z.strictObject({
  version: z.literal(1),
  allocationId: groupPlanIdSchema,
  groupId: groupPlanIdSchema,
  candidateId: groupPlanUserIdSchema,
  verifiedAliasId: groupPlanUserIdSchema,
  normalizedEmail: normalizedEmailSchema,
  claimedAt: groupPlanInstantSchema,
});
export type CandidateClaim = z.infer<typeof candidateClaimSchema>;

/** Permission to prepare proposals; every send requires the candidate's own approval. */
export const delegationSchema = z.strictObject({
  version: z.literal(1),
  id: groupPlanIdSchema,
  groupId: groupPlanIdSchema,
  buyerId: groupPlanUserIdSchema,
  candidateId: groupPlanUserIdSchema,
  allocationId: groupPlanIdSchema,
  revision: groupPlanUserIdSchema,
  scope: delegationScopeSchema,
  consentVersion: consentVersionSchema,
  consentedAt: groupPlanInstantSchema,
  expiresAt: groupPlanInstantSchema,
  revokedAt: groupPlanInstantSchema.nullable(),
}).superRefine((value, context) => {
  if (Date.parse(value.expiresAt) <= Date.parse(value.consentedAt)) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "Consent must expire after it was granted" });
  }
  if (value.revokedAt !== null && Date.parse(value.revokedAt) < Date.parse(value.consentedAt)) {
    context.addIssue({ code: "custom", path: ["revokedAt"], message: "Revocation cannot precede consent" });
  }
});
export type Delegation = z.infer<typeof delegationSchema>;

export const groupPlanSendApprovalStateSchema = z.enum([
  "proposed", "approved", "executing", "sent", "denied", "expired", "requires_review",
]);
export type GroupPlanSendApprovalState = z.infer<typeof groupPlanSendApprovalStateSchema>;

/** Private candidate-owned snapshot; parsing does not authorize sending or document access. */
export const sendApprovalSchema = z.strictObject({
  version: z.literal(1),
  id: groupPlanIdSchema,
  groupId: groupPlanIdSchema,
  delegationId: groupPlanIdSchema,
  delegationRevision: groupPlanUserIdSchema,
  buyerId: groupPlanUserIdSchema,
  candidateId: groupPlanUserIdSchema,
  jobUrl: jobUrlSchema,
  companySlug: companySlugSchema,
  candidateMessage: candidateMessageSchema,
  documentIds: documentIdsSchema,
  acceptedCost: acceptedAskCostSchema,
  quoteFingerprint: groupPlanFingerprintSchema,
  idempotencyKey: groupPlanFingerprintSchema,
  createdAt: groupPlanInstantSchema,
  expiresAt: groupPlanInstantSchema,
  state: groupPlanSendApprovalStateSchema,
  approvedAt: groupPlanInstantSchema.nullable(),
  requestId: groupPlanUserIdSchema.nullable(),
}).superRefine((value, context) => {
  if (Date.parse(value.expiresAt) <= Date.parse(value.createdAt)) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "Proposal must expire after creation" });
  }
  if (["approved", "executing", "sent"].includes(value.state) && value.approvedAt === null) {
    context.addIssue({ code: "custom", path: ["approvedAt"], message: "Candidate approval evidence is required" });
  }
  if (["proposed", "denied", "expired"].includes(value.state) && value.approvedAt !== null) {
    context.addIssue({ code: "custom", path: ["approvedAt"], message: "This state cannot carry approval evidence" });
  }
  if (value.approvedAt !== null && (Date.parse(value.approvedAt) < Date.parse(value.createdAt)
    || Date.parse(value.approvedAt) >= Date.parse(value.expiresAt))) {
    context.addIssue({ code: "custom", path: ["approvedAt"], message: "Approval must occur during the proposal's lifetime" });
  }
  if ((value.state === "sent") !== (value.requestId !== null)) {
    context.addIssue({ code: "custom", path: ["requestId"], message: "Only a sent proposal must carry a request receipt" });
  }
});
export type SendApproval = z.infer<typeof sendApprovalSchema>;

/** Candidate and buyer identities come from the session and owned allocation. */
export const groupPlanDelegationConsentInputSchema = z.strictObject({
  allocationId: groupPlanIdSchema,
  scope: delegationScopeSchema,
  consentVersion: consentVersionSchema,
  expiresAt: groupPlanInstantSchema,
});
export type GroupPlanDelegationConsentInput = z.infer<typeof groupPlanDelegationConsentInputSchema>;

export const groupPlanSendDecisionInputSchema = z.discriminatedUnion("decision", [
  z.strictObject({
    approvalId: groupPlanIdSchema,
    delegationRevision: groupPlanUserIdSchema,
    decision: z.literal("approve"),
    quoteFingerprint: groupPlanFingerprintSchema,
    documentIds: documentIdsSchema,
    candidateMessage: candidateMessageSchema,
    acceptedCost: acceptedAskCostSchema,
  }),
  z.strictObject({
    approvalId: groupPlanIdSchema,
    delegationRevision: groupPlanUserIdSchema,
    decision: z.literal("deny"),
  }),
]);
export type GroupPlanSendDecisionInput = z.infer<typeof groupPlanSendDecisionInputSchema>;

/** Buyer progress exposes no candidate, document, referrer or request-access identifiers. */
export const groupPlanBuyerProposalSchema = z.strictObject({
  id: groupPlanIdSchema,
  groupId: groupPlanIdSchema,
  state: z.enum(["awaiting_candidate", "sent", "closed"]),
  createdAt: groupPlanInstantSchema,
  updatedAt: groupPlanInstantSchema,
}).refine(value => Date.parse(value.updatedAt) >= Date.parse(value.createdAt), {
  path: ["updatedAt"], message: "Progress cannot precede creation",
});
export type GroupPlanBuyerProposal = z.infer<typeof groupPlanBuyerProposalSchema>;

export const groupPlanCandidateProposalSchema = sendApprovalSchema;
export type GroupPlanCandidateProposal = z.infer<typeof groupPlanCandidateProposalSchema>;

export const groupPlanCapabilitiesSchema = z.strictObject({
  enabled: z.boolean(),
  delegatedSendEnabled: z.boolean(),
}).refine(value => value.enabled || !value.delegatedSendEnabled, {
  path: ["delegatedSendEnabled"], message: "Delegated sending requires Group Plan access",
});
export type GroupPlanCapabilities = z.infer<typeof groupPlanCapabilitiesSchema>;
