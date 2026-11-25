import { z } from "zod";
import { BILLING_CURRENCIES } from "../shared/billingCatalog";
import { REFERRAL_LEVELS } from "../shared/planFamily";

/**
 * Recovery-owned evidence projection, not Group order/provider/storage contracts.
 * This pure assessment is not wired until GROUP-grants/GROUP-notifications and
 * their dependencies land. It neither settles money nor provisions candidates.
 *
 * The caller verifies provider truth and stored immutable bindings under durable
 * component/allocation/lot locks, then atomically commits the refund receipt and
 * its decision (revocation, activation prevention or review obligation).
 * paidTotalMinor is the FULL component/invoice paid total, never a seat's share.
 * A shared invoice is projected separately for each allocation; receipts are
 * deduplicated by site/refund id/allocation, not merely invoice or event id.
 * recorded means that exact scoped refund already has a durable final decision.
 * Previous succeeded totals count other distinct refunds of that component/invoice
 * once, excluding this refund and repeated processing for other allocations.
 */
const identifier = z.string().min(1).max(255).regex(/^\S+$/);
const units = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveInteger = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const currency = z.enum(BILLING_CURRENCIES);
const level = z.enum(REFERRAL_LEVELS);
const scope = z.strictObject({
  site: identifier,
  customerId: identifier,
  invoiceId: identifier,
  allocationId: identifier,
}).readonly();
type RefundScope = z.infer<typeof scope>;

const expected = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("bound"), scope,
    paidTotalMinor: positiveInteger, currency,
  }).readonly(),
  z.strictObject({ state: z.enum(["untrusted", "unmatched", "ambiguous"]) }).readonly(),
]);

// Balance proof must name this exact purchased lot, never an account/level total.
const lotBalance = z.strictObject({
  scope, grantReference: identifier, level, availableUnits: units,
}).readonly();
const purchasedLot = z.strictObject({
  state: z.literal("purchased_lot"), scope, grantReference: identifier, level,
  grantedUnits: positiveInteger, revokedUnits: units, unspentUnits: units,
  balance: lotBalance.nullable(),
}).refine(lot => lot.revokedUnits <= lot.grantedUnits
  && lot.unspentUnits <= lot.grantedUnits - lot.revokedUnits, {
  message: "Revoked and unspent units cannot exceed the original grant",
}).readonly();

export const groupPlanRefundEvidenceSchema = z.strictObject({
  expected,
  refund: z.strictObject({
    trust: z.enum(["verified", "untrusted"]),
    scope: scope.nullable(),
    refundId: identifier,
    amountMinor: positiveInteger.nullable(),
    currency: currency.nullable(),
    outcome: z.enum(["succeeded", "pending", "failed"]),
    recorded: z.boolean(),
  }).readonly(),
  previousSucceededRefundTotalMinor: units.nullable(),
  grant: z.discriminatedUnion("state", [
    z.strictObject({ state: z.literal("not_granted"), scope }).readonly(),
    purchasedLot,
    z.strictObject({ state: z.literal("included_plan") }).readonly(),
    z.strictObject({ state: z.literal("ambiguous") }).readonly(),
  ]),
}).readonly();
export type GroupPlanRefundEvidence = z.infer<typeof groupPlanRefundEvidenceSchema>;

const reviewReason = z.enum([
  "invalid_evidence", "untrusted_binding", "unmatched_binding", "ambiguous_binding",
  "untrusted_refund", "unreadable_refund", "refund_scope_mismatch", "currency_mismatch",
  "partial_refund", "refund_exceeds_paid", "unreadable_refund_history",
  "cumulative_refund_exceeds_paid", "grant_scope_mismatch", "ambiguous_grant",
  "included_plan_requires_review", "spent_units", "balance_unavailable",
  "balance_source_mismatch", "insufficient_attributable_balance", "invalid_balance_evidence",
]);
type ReviewReason = z.infer<typeof reviewReason>;

export type GroupPlanRefundDecision =
  | { readonly kind: "revoke_purchased"; readonly allocationId: string;
      readonly grantReference: string; readonly level: z.infer<typeof level>; readonly revokeUnits: number }
  | { readonly kind: "prevent_activation"; readonly allocationId: string; readonly revokeUnits: 0 }
  | { readonly kind: "already_revoked"; readonly revokeUnits: 0 }
  | { readonly kind: "duplicate"; readonly revokeUnits: 0 }
  | { readonly kind: "not_final"; readonly outcome: "pending" | "failed"; readonly revokeUnits: 0 }
  | { readonly kind: "requires_review"; readonly reason: ReviewReason; readonly revokeUnits: 0 };

function requiresReview(reason: ReviewReason): GroupPlanRefundDecision {
  return { kind: "requires_review", reason, revokeUnits: 0 };
}

function sameScope(left: RefundScope, right: RefundScope): boolean {
  return left.site === right.site && left.customerId === right.customerId
    && left.invoiceId === right.invoiceId && left.allocationId === right.allocationId;
}

/** No I/O. The caller owns durable idempotency, locks and atomic effects. */
export function assessGroupPlanRefund(input: GroupPlanRefundEvidence): GroupPlanRefundDecision {
  const validation = groupPlanRefundEvidenceSchema.safeParse(input);
  if (!validation.success) return requiresReview("invalid_evidence");
  const { expected, refund, grant, previousSucceededRefundTotalMinor } = validation.data;

  // A receipt for this refund in another allocation is not this allocation's replay.
  if (expected.state === "bound" && refund.trust === "verified"
    && refund.scope !== null && sameScope(expected.scope, refund.scope) && refund.recorded) {
    return { kind: "duplicate", revokeUnits: 0 };
  }
  if (refund.outcome !== "succeeded") {
    return { kind: "not_final", outcome: refund.outcome, revokeUnits: 0 };
  }
  if (expected.state !== "bound") return requiresReview(`${expected.state}_binding`);
  if (refund.trust !== "verified") return requiresReview("untrusted_refund");
  if (refund.scope === null) return requiresReview("unreadable_refund");
  if (!sameScope(expected.scope, refund.scope)) return requiresReview("refund_scope_mismatch");
  if (refund.amountMinor === null || refund.currency === null) return requiresReview("unreadable_refund");
  if (refund.currency !== expected.currency) return requiresReview("currency_mismatch");
  if (refund.amountMinor < expected.paidTotalMinor) return requiresReview("partial_refund");
  if (refund.amountMinor > expected.paidTotalMinor) return requiresReview("refund_exceeds_paid");
  if (previousSucceededRefundTotalMinor === null) return requiresReview("unreadable_refund_history");
  // Subtract instead of adding potentially overflowing individually safe integers.
  if (previousSucceededRefundTotalMinor > expected.paidTotalMinor - refund.amountMinor) {
    return requiresReview("cumulative_refund_exceeds_paid");
  }

  // Included-term cancellation requires its own evidence and policy assessment.
  if (grant.state === "included_plan") return requiresReview("included_plan_requires_review");
  if (grant.state === "ambiguous") return requiresReview("ambiguous_grant");
  if (!sameScope(expected.scope, grant.scope)) return requiresReview("grant_scope_mismatch");
  if (grant.state === "not_granted") {
    return { kind: "prevent_activation", allocationId: expected.scope.allocationId, revokeUnits: 0 };
  }

  const remainingUnits = grant.grantedUnits - grant.revokedUnits;
  if (grant.unspentUnits !== remainingUnits) return requiresReview("spent_units");
  if (remainingUnits === 0) return { kind: "already_revoked", revokeUnits: 0 };
  if (grant.balance === null) return requiresReview("balance_unavailable");
  if (!sameScope(grant.scope, grant.balance.scope)
    || grant.grantReference !== grant.balance.grantReference || grant.level !== grant.balance.level) {
    return requiresReview("balance_source_mismatch");
  }
  if (grant.balance.availableUnits < remainingUnits) return requiresReview("insufficient_attributable_balance");
  if (grant.balance.availableUnits > remainingUnits) return requiresReview("invalid_balance_evidence");
  return {
    kind: "revoke_purchased", allocationId: expected.scope.allocationId,
    grantReference: grant.grantReference, level: grant.level, revokeUnits: remainingUnits,
  };
}
