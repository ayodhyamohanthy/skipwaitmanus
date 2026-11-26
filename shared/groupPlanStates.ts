import { z } from "zod";

export const groupPlanIdSchema = z.uuid();
export const groupPlanUserIdSchema = z.number().int().positive().max(2_147_483_647);
export const groupPlanMinorSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
// The recipient parser owns its list cap; quantities match unsigned wallet storage.
export const groupPlanQuantitySchema = z.number().int().positive().max(4_294_967_295);
export const groupPlanFingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const groupPlanInstantSchema = z.iso.datetime({ precision: 3 });
export const groupPlanSiteSchema = z.string().min(1).max(50).regex(/^[a-z0-9-]+$/);
export const groupPlanEnvironmentSchema = z.enum(["test", "live"]);
export const groupPlanCurrencySchema = z.enum(["INR", "USD"]);

export type GroupPlanId = z.infer<typeof groupPlanIdSchema>;
export type GroupPlanUserId = z.infer<typeof groupPlanUserIdSchema>;
export type GroupPlanMinor = z.infer<typeof groupPlanMinorSchema>;
export type GroupPlanQuantity = z.infer<typeof groupPlanQuantitySchema>;
export type GroupPlanFingerprint = z.infer<typeof groupPlanFingerprintSchema>;
export type GroupPlanInstant = z.infer<typeof groupPlanInstantSchema>;
export type GroupPlanSite = z.infer<typeof groupPlanSiteSchema>;
export type GroupPlanEnvironment = z.infer<typeof groupPlanEnvironmentSchema>;
export type GroupPlanCurrency = z.infer<typeof groupPlanCurrencySchema>;

export const GROUP_PLAN_ORDER_STATES = [
  "draft", "quoted", "creating_checkout", "pending_payment", "partially_paid",
  "paid", "activating", "complete", "requires_review", "cancelled",
] as const;
export const GROUP_PLAN_ALLOCATION_STATES = [
  "awaiting_payment", "paid", "claimed", "activating", "active", "requires_review", "refunded", "cancelled",
] as const;
export const GROUP_PLAN_COMPONENT_STATES = [
  "pending", "creating_checkout", "pending_payment", "paid", "requires_review", "cancelled", "refunded",
] as const;
export const GROUP_PLAN_ERRORS = [
  "group_terms_unconfirmed", "not_available", "not_found", "invalid_transition",
  "quote_changed", "idempotency_conflict", "payment_unverified", "candidate_proof_required",
  "consent_required", "delegation_inactive", "approval_expired", "requires_review",
] as const;

export const groupPlanOrderStateSchema = z.enum(GROUP_PLAN_ORDER_STATES);
export const groupPlanAllocationStateSchema = z.enum(GROUP_PLAN_ALLOCATION_STATES);
export const groupPlanComponentStateSchema = z.enum(GROUP_PLAN_COMPONENT_STATES);
export const groupPlanErrorSchema = z.enum(GROUP_PLAN_ERRORS);

export type GroupPlanOrderState = z.infer<typeof groupPlanOrderStateSchema>;
export type GroupPlanAllocationState = z.infer<typeof groupPlanAllocationStateSchema>;
export type GroupPlanComponentState = z.infer<typeof groupPlanComponentStateSchema>;
export type GroupPlanError = z.infer<typeof groupPlanErrorSchema>;

const orderTransitions: Record<GroupPlanOrderState, readonly GroupPlanOrderState[]> = {
  draft: ["quoted", "requires_review", "cancelled"],
  quoted: ["creating_checkout", "requires_review", "cancelled"],
  creating_checkout: ["pending_payment", "requires_review", "cancelled"],
  pending_payment: ["partially_paid", "paid", "requires_review", "cancelled"],
  partially_paid: ["paid", "requires_review", "cancelled"],
  paid: ["activating", "requires_review", "cancelled"],
  activating: ["complete", "requires_review", "cancelled"],
  complete: ["requires_review", "cancelled"],
  requires_review: ["paid", "cancelled"],
  cancelled: [],
};

const allocationTransitions: Record<GroupPlanAllocationState, readonly GroupPlanAllocationState[]> = {
  awaiting_payment: ["paid", "requires_review", "refunded", "cancelled"],
  paid: ["claimed", "requires_review", "refunded", "cancelled"],
  claimed: ["activating", "requires_review", "refunded", "cancelled"],
  activating: ["active", "requires_review", "refunded", "cancelled"],
  active: ["requires_review", "refunded", "cancelled"],
  requires_review: ["paid", "refunded", "cancelled"],
  refunded: [],
  cancelled: [],
};

const componentTransitions: Record<GroupPlanComponentState, readonly GroupPlanComponentState[]> = {
  pending: ["creating_checkout", "requires_review", "cancelled"],
  creating_checkout: ["pending_payment", "requires_review", "cancelled"],
  pending_payment: ["paid", "requires_review", "refunded", "cancelled"],
  paid: ["requires_review", "cancelled", "refunded"],
  requires_review: ["paid", "cancelled", "refunded"],
  cancelled: [],
  refunded: [],
};

// These predicates check adjacency only. Callers validate payment, candidate and
// recovery evidence before effects, including every requires_review -> paid edge.
export function canTransitionGroupPlanOrder(from: GroupPlanOrderState, to: GroupPlanOrderState): boolean {
  return from === to || orderTransitions[from].includes(to);
}

export function canTransitionGroupPlanAllocation(from: GroupPlanAllocationState, to: GroupPlanAllocationState): boolean {
  return from === to || allocationTransitions[from].includes(to);
}

export function canTransitionGroupPlanComponent(from: GroupPlanComponentState, to: GroupPlanComponentState): boolean {
  return from === to || componentTransitions[from].includes(to);
}
