import { describe, expect, it } from "vitest";
import { ASK_NOTE_MAX_LENGTH } from "./askNote";
import {
  candidateClaimSchema, delegationSchema, sendApprovalSchema,
  groupPlanDelegationConsentInputSchema, groupPlanSendDecisionInputSchema,
  groupPlanBuyerProposalSchema, groupPlanCandidateProposalSchema, groupPlanCapabilitiesSchema,
  type CandidateClaim, type Delegation, type SendApproval,
} from "./groupPlanConsent";

const groupId = "10000000-0000-4000-8000-000000000001";
const allocationId = "10000000-0000-4000-8000-000000000002";
const delegationId = "10000000-0000-4000-8000-000000000003";
const approvalId = "10000000-0000-4000-8000-000000000004";
const createdAt = "2026-11-26T10:00:00.000Z";
const approvedAt = "2026-11-26T10:01:00.000Z";
const expiresAt = "2026-11-26T10:10:00.000Z";
const before = "2026-11-26T09:59:59.999Z";
const quoteFingerprint = "a".repeat(64);
const claim: CandidateClaim = {
  version: 1, allocationId, groupId, candidateId: 101, verifiedAliasId: 201,
  normalizedEmail: "candidate@example.com", claimedAt: createdAt,
};
const delegation: Delegation = {
  version: 1, id: delegationId, groupId, buyerId: 102, candidateId: 101, allocationId,
  revision: 1, scope: "draft_and_propose", consentVersion: "group-consent-v1",
  consentedAt: createdAt, expiresAt, revokedAt: null,
};
const approval: SendApproval = {
  version: 1, id: approvalId, groupId, delegationId, delegationRevision: 1,
  buyerId: 102, candidateId: 101, jobUrl: "https://careers.example.com/jobs/1",
  companySlug: "example", candidateMessage: "My experience matches this role.", documentIds: [301, 302],
  acceptedCost: { units: 1, band: "early", source: [{ bucket: "included", units: 1, cycleKey: "cycle-1" }] },
  quoteFingerprint, idempotencyKey: "b".repeat(64), createdAt, expiresAt,
  state: "proposed", approvedAt: null, requestId: null,
};
const consentInput = {
  allocationId, scope: "draft_and_propose", consentVersion: "group-consent-v1", expiresAt,
};
const approveInput = {
  approvalId, delegationRevision: 1, decision: "approve", quoteFingerprint,
  documentIds: approval.documentIds, candidateMessage: approval.candidateMessage, acceptedCost: approval.acceptedCost,
};
const denyInput = { approvalId, delegationRevision: 1, decision: "deny" };
const buyerProposal = { id: approvalId, groupId, state: "awaiting_candidate", createdAt, updatedAt: approvedAt };

function withoutField(value: object, field: string): object {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
}

describe("Group Plan candidate consent contracts", () => {
  it.each([
    ["claim", candidateClaimSchema, claim], ["delegation", delegationSchema, delegation],
    ["approval", sendApprovalSchema, approval], ["consent input", groupPlanDelegationConsentInputSchema, consentInput],
    ["approve input", groupPlanSendDecisionInputSchema, approveInput],
    ["deny input", groupPlanSendDecisionInputSchema, denyInput],
    ["buyer", groupPlanBuyerProposalSchema, buyerProposal],
    ["capabilities", groupPlanCapabilitiesSchema, { enabled: false, delegatedSendEnabled: false }],
  ] as const)("round trips %s and rejects unknown envelope fields", (_name, schema, value) => {
    const parsed = schema.parse(value);
    expect(schema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    expect(schema.safeParse({ ...value, unexpected: true }).success).toBe(false);
  });

  it.each(["allocationId", "groupId", "candidateId", "verifiedAliasId", "normalizedEmail", "claimedAt"])(
    "requires candidate claim evidence %s", field => {
      expect(candidateClaimSchema.safeParse(withoutField(claim, field)).success).toBe(false);
    },
  );
  it.each([
    { buyerId: 102 }, { version: 2 }, { candidateId: 0 }, { candidateId: 2_147_483_648 },
    { verifiedAliasId: 1.5 }, { allocationId: "not-an-id" },
    { normalizedEmail: "Candidate@example.com" }, { normalizedEmail: "candidate" },
    { normalizedEmail: `${"a".repeat(250)}@example.com` },
    { claimedAt: "2026-11-26T10:00:00Z" }, { claimedAt: "2026-11-26T10:00:00.000+01:00" },
  ])("rejects invalid claim proof %#", patch => {
    expect(candidateClaimSchema.safeParse({ ...claim, ...patch }).success).toBe(false);
  });

  it.each([
    { scope: "send" }, { scope: "purchase" }, { scope: "impersonate" }, { autoSend: true },
    { revision: 0 }, { revision: 2_147_483_648 }, { consentVersion: " " }, { consentVersion: "v".repeat(129) },
    { expiresAt: createdAt }, { expiresAt: before }, { revokedAt: before },
  ])("rejects broader delegation or invalid consent ordering %#", patch => {
    expect(delegationSchema.safeParse({ ...delegation, ...patch }).success).toBe(false);
  });
  it("accepts revocation at consent time and preserves the exact revision", () => {
    expect(delegationSchema.parse({ ...delegation, revokedAt: createdAt, revision: 3 }))
      .toMatchObject({ revokedAt: createdAt, revision: 3 });
  });
  it.each(["consentVersion", "consentedAt", "expiresAt", "revokedAt", "revision"])("requires delegation field %s", field => {
    expect(delegationSchema.safeParse(withoutField(delegation, field)).success).toBe(false);
  });

  it.each(["approved", "executing", "sent"])("requires approval evidence in %s", state => {
    expect(sendApprovalSchema.safeParse({ ...approval, state }).success).toBe(false);
    const value = { ...approval, state, approvedAt, requestId: state === "sent" ? 401 : null };
    expect(sendApprovalSchema.parse(value)).toEqual(value);
  });
  it.each(["proposed", "denied", "expired"])("refuses approval evidence in %s", state => {
    expect(sendApprovalSchema.safeParse({ ...approval, state, approvedAt }).success).toBe(false);
  });
  it.each(["proposed", "approved", "executing", "denied", "expired", "requires_review"])(
    "refuses a request id before sent: %s", state => {
      expect(sendApprovalSchema.safeParse({ ...approval, state, approvedAt, requestId: 401 }).success).toBe(false);
    },
  );
  it("requires a request receipt for sent and allows review with or without approval evidence", () => {
    expect(sendApprovalSchema.safeParse({ ...approval, state: "sent", approvedAt }).success).toBe(false);
    for (const evidence of [null, approvedAt]) {
      expect(sendApprovalSchema.safeParse({ ...approval, state: "requires_review", approvedAt: evidence }).success).toBe(true);
    }
  });
  it.each([
    { expiresAt: createdAt }, { expiresAt: before },
    { state: "approved", approvedAt: before }, { state: "approved", approvedAt: expiresAt },
    { state: "approved", approvedAt: "2026-11-26T10:11:00.000Z" },
    { documentIds: [] }, { documentIds: [301, 301] }, { documentIds: [0] },
    { documentIds: [1.5] }, { documentIds: [2_147_483_648] },
    { documentIds: Array.from({ length: 21 }, (_, index) => index + 1) },
    { candidateMessage: " " }, { candidateMessage: "a".repeat(ASK_NOTE_MAX_LENGTH + 1) },
    { jobUrl: "javascript:alert(1)" }, { jobUrl: "mailto:someone@example.com" }, { jobUrl: "role at Example" },
    { companySlug: "Example" }, { companySlug: "example company" }, { companySlug: "e".repeat(49) },
    { quoteFingerprint: "A".repeat(64) }, { idempotencyKey: "send-this" },
    { delegationRevision: 0 }, { delegationRevision: 2_147_483_648 }, { state: "auto_send" },
  ])("rejects invalid send binding %#", patch => {
    expect(sendApprovalSchema.safeParse({ ...approval, ...patch }).success).toBe(false);
  });
  it.each(["acceptedCost", "quoteFingerprint", "idempotencyKey", "documentIds", "candidateMessage", "approvedAt", "requestId"])(
    "requires send binding %s", field => {
      expect(sendApprovalSchema.safeParse(withoutField(approval, field)).success).toBe(false);
    },
  );
  it("completes and normalizes bare links through the existing job-link contract", () => {
    const value = { ...approval, jobUrl: "www.careers.example.com/jobs/1#details" };
    expect(sendApprovalSchema.parse(value).jobUrl).toBe(approval.jobUrl);
  });
  it("preserves the exact final note bytes through approval and candidate decision round trips", () => {
    const finalNote = " \r\n  My cafe\u0301 experience matches this role. 技術\n\t ";
    const snapshot = sendApprovalSchema.parse(JSON.parse(JSON.stringify({ ...approval, candidateMessage: finalNote })));
    const decision = groupPlanSendDecisionInputSchema.parse(JSON.parse(JSON.stringify({ ...approveInput, candidateMessage: finalNote })));
    const approved = sendApprovalSchema.parse({ ...snapshot, state: "approved", approvedAt });
    expect(approved.candidateMessage).toBe(finalNote);
    expect(decision).toMatchObject({ decision: "approve", candidateMessage: finalNote });
    if (decision.decision !== "approve") throw new Error("Expected candidate approval");
    const encoder = new TextEncoder();
    expect(encoder.encode(snapshot.candidateMessage)).toEqual(encoder.encode(finalNote));
    expect(encoder.encode(decision.candidateMessage)).toEqual(encoder.encode(finalNote));
  });
  it("supports a waiting request's no-charge accepted cost", () => {
    expect(sendApprovalSchema.safeParse({ ...approval, acceptedCost: { units: 0, band: "early", source: [] } }).success).toBe(true);
  });
  it.each([
    { ...approval.acceptedCost, candidateId: 999 },
    { ...approval.acceptedCost, source: [{ bucket: "included", units: 1, cycleKey: "cycle-1", privateData: "hidden" }] },
    { ...approval.acceptedCost, units: 0 },
    { ...approval.acceptedCost, source: [{ bucket: "included", units: 1, cycleKey: null }] },
  ])("preserves accepted-cost strictness and source invariants %#", acceptedCost => {
    expect(sendApprovalSchema.safeParse({ ...approval, acceptedCost }).success).toBe(false);
    expect(groupPlanSendDecisionInputSchema.safeParse({ ...approveInput, acceptedCost }).success).toBe(false);
  });

  it.each(["candidateId", "buyerId", "verifiedAliasId", "groupId"])("rejects caller-asserted identity %s", field => {
    for (const [schema, input] of [
      [groupPlanDelegationConsentInputSchema, consentInput], [groupPlanSendDecisionInputSchema, approveInput],
      [groupPlanSendDecisionInputSchema, denyInput],
    ] as const) {
      expect(schema.safeParse({ ...input, [field]: 999 }).success).toBe(false);
    }
  });
  it.each(["quoteFingerprint", "documentIds", "candidateMessage", "acceptedCost"] as const)("approve requires %s; denial rejects it", field => {
    expect(groupPlanSendDecisionInputSchema.safeParse(withoutField(approveInput, field)).success).toBe(false);
    expect(groupPlanSendDecisionInputSchema.safeParse({ ...denyInput, [field]: approveInput[field] }).success).toBe(false);
  });
  it.each([
    { acceptedCost: null }, { documentIds: [301, 301] }, { documentIds: [] }, { candidateMessage: " " },
    { quoteFingerprint: "bad" }, { delegationRevision: 0 }, { decision: "send" },
  ])("rejects incomplete or malformed candidate decision %#", patch => {
    expect(groupPlanSendDecisionInputSchema.safeParse({ ...approveInput, ...patch }).success).toBe(false);
  });
  it("keeps delegation consent draft-only with bounded expiry and version", () => {
    for (const patch of [{ scope: "send" }, { consentVersion: " " }, { expiresAt: "tomorrow" }]) {
      expect(groupPlanDelegationConsentInputSchema.safeParse({ ...consentInput, ...patch }).success).toBe(false);
    }
  });

  it.each([
    "candidateId", "candidateIds", "buyerId", "normalizedEmail", "documentIds", "documents", "resumeBytes",
    "referrerId", "referrer", "privateReply", "blockReason", "requestId", "acceptedCost", "jobUrl", "candidateMessage",
  ])("buyer progress refuses private field %s", field => {
    expect(groupPlanBuyerProposalSchema.safeParse({ ...buyerProposal, [field]: "private" }).success).toBe(false);
  });
  it.each(["awaiting_candidate", "sent", "closed"])("exposes only coarse buyer state %s", state => {
    expect(groupPlanBuyerProposalSchema.safeParse({ ...buyerProposal, state }).success).toBe(true);
  });
  it("refuses internal buyer state and timestamps before creation", () => {
    expect(groupPlanBuyerProposalSchema.safeParse({ ...buyerProposal, state: "approved" }).success).toBe(false);
    expect(groupPlanBuyerProposalSchema.safeParse({ ...buyerProposal, updatedAt: before }).success).toBe(false);
  });
  it("keeps candidate view bound to the full approval contract without extra data", () => {
    expect(groupPlanCandidateProposalSchema).toBe(sendApprovalSchema);
    expect(groupPlanCandidateProposalSchema.parse(approval)).toEqual(approval);
    for (const field of ["autoSend", "apiKey", "resumeBytes", "referrerId"]) {
      expect(groupPlanCandidateProposalSchema.safeParse({ ...approval, [field]: "private" }).success).toBe(false);
    }
  });
  it.each([
    [false, false, true], [true, false, true], [true, true, true], [false, true, false],
  ])("capabilities enabled=%s send=%s validates=%s", (enabled, delegatedSendEnabled, valid) => {
    expect(groupPlanCapabilitiesSchema.safeParse({ enabled, delegatedSendEnabled }).success).toBe(valid);
  });
});
