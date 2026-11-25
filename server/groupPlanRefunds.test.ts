import { describe, expect, it } from "vitest";
import { BILLING_CURRENCIES } from "../shared/billingCatalog";
import { REFERRAL_LEVELS } from "../shared/planFamily";
import {
  assessGroupPlanRefund,
  groupPlanRefundEvidenceSchema,
  type GroupPlanRefundEvidence,
} from "./groupPlanRefunds";

function evidence() {
  const scope = { site: "billing-test", customerId: "payer-a", invoiceId: "invoice-a", allocationId: "allocation-a" };
  return {
    expected: { state: "bound", scope, paidTotalMinor: 2000, currency: "USD" },
    refund: { trust: "verified", scope, refundId: "refund-a", amountMinor: 2000, currency: "USD", outcome: "succeeded", recorded: false },
    previousSucceededRefundTotalMinor: 0,
    grant: {
      state: "purchased_lot", scope, grantReference: "grant-a", level: "mid",
      grantedUnits: 10, revokedUnits: 0, unspentUnits: 10,
      balance: { scope, grantReference: "grant-a", level: "mid", availableUnits: 10 },
    },
  } satisfies GroupPlanRefundEvidence;
}

const assess = (input: GroupPlanRefundEvidence) => assessGroupPlanRefund(groupPlanRefundEvidenceSchema.parse(input));
const review = (reason: string) => ({ kind: "requires_review", reason, revokeUnits: 0 });
const scopeFields: Array<keyof ReturnType<typeof evidence>["expected"]["scope"]> = ["site", "customerId", "invoiceId", "allocationId"];
const unfinished: Array<"pending" | "failed"> = ["pending", "failed"];
const unbound: Array<"untrusted" | "unmatched" | "ambiguous"> = ["untrusted", "unmatched", "ambiguous"];

describe("Group refund assessment from validated evidence", () => {
  it("revokes exactly the unused purchased lot after a matching full confirmed refund", () => {
    expect(assess(evidence())).toEqual({ kind: "revoke_purchased", allocationId: "allocation-a", grantReference: "grant-a", level: "mid", revokeUnits: 10 });
  });

  it("keeps two allocations on the same fully refunded invoice independent", () => {
    const first = evidence();
    const scope = { ...first.expected.scope, allocationId: "allocation-b" };
    const second = {
      ...first, expected: { ...first.expected, scope }, refund: { ...first.refund, scope },
      grant: { ...first.grant, scope, grantReference: "grant-b", grantedUnits: 4, unspentUnits: 4, balance: { ...first.grant.balance, scope, grantReference: "grant-b", availableUnits: 4 } },
    };
    expect(assess(first)).toMatchObject({ allocationId: "allocation-a", grantReference: "grant-a", revokeUnits: 10 });
    expect(assess(second)).toMatchObject({ allocationId: "allocation-b", grantReference: "grant-b", revokeUnits: 4 });
    expect(first.expected.paidTotalMinor).toBe(second.expected.paidTotalMinor);
    expect(first.refund.refundId).toBe(second.refund.refundId);
  });

  it("does not count a candidate's share as a full invoice refund", () => {
    const input = evidence();
    expect(assess({ ...input, refund: { ...input.refund, amountMinor: 1000 } })).toEqual(review("partial_refund"));
  });

  it("cannot use a later purchase to cover this lot", () => {
    const input = evidence();
    expect(assess({ ...input, grant: { ...input.grant, balance: { ...input.grant.balance, grantReference: "later-purchase", availableUnits: 100 } } })).toEqual(review("balance_source_mismatch"));
  });

  it("sends a partially spent lot to review even when a balance is available", () => {
    const input = evidence();
    expect(assess({ ...input, grant: { ...input.grant, unspentUnits: 9, balance: { ...input.grant.balance, availableUnits: 9 } } })).toEqual(review("spent_units"));
  });

  it("caps revocation at the units left after earlier revocations", () => {
    const input = evidence();
    expect(assess({ ...input, grant: { ...input.grant, revokedUnits: 3, unspentUnits: 7, balance: { ...input.grant.balance, availableUnits: 7 } } })).toMatchObject({ kind: "revoke_purchased", revokeUnits: 7 });
  });

  it("returns zero after a full earlier revocation without needing another balance", () => {
    const input = evidence();
    expect(assess({ ...input, grant: { ...input.grant, revokedUnits: 10, unspentUnits: 0, balance: null } })).toEqual({ kind: "already_revoked", revokeUnits: 0 });
  });

  it("prevents activation before a grant without inventing an account", () => {
    const input = evidence();
    expect(assess({ ...input, grant: { state: "not_granted", scope: input.expected.scope } })).toEqual({ kind: "prevent_activation", allocationId: "allocation-a", revokeUnits: 0 });
  });

  it("deduplicates a durably recorded refund without another revocation or review", () => {
    const input = evidence();
    expect(assess({ ...input, refund: { ...input.refund, recorded: true } })).toEqual({ kind: "duplicate", revokeUnits: 0 });
    expect(assess({ ...input, refund: { ...input.refund, recorded: true, amountMinor: null, currency: null }, grant: { state: "ambiguous" } })).toEqual({ kind: "duplicate", revokeUnits: 0 });
  });

  it.each(scopeFields)("does not trust a duplicate flag with a different %s", field => {
    const input = evidence();
    expect(assess({ ...input, refund: { ...input.refund, recorded: true, scope: { ...input.refund.scope, [field]: "different" } } })).toEqual(review("refund_scope_mismatch"));
  });

  it("reviews an excess refund", () => {
    const input = evidence();
    expect(assess({ ...input, refund: { ...input.refund, amountMinor: 2001 } })).toEqual(review("refund_exceeds_paid"));
  });

  it("reviews a currency mismatch", () => {
    const input = evidence();
    expect(assess({ ...input, refund: { ...input.refund, currency: "INR" } })).toEqual(review("currency_mismatch"));
  });

  it.each(["amount", "currency", "scope"])("reviews an unreadable refund %s", field => {
    const input = evidence();
    const refund = field === "amount" ? { ...input.refund, amountMinor: null }
      : field === "currency" ? { ...input.refund, currency: null } : { ...input.refund, scope: null };
    expect(assess({ ...input, refund })).toEqual(review("unreadable_refund"));
  });

  it.each(unfinished)("returns not_final for %s, including before a grant", outcome => {
    const input = evidence();
    expect(assess({ ...input, refund: { ...input.refund, outcome } })).toEqual({ kind: "not_final", outcome, revokeUnits: 0 });
    expect(assess({ ...input, refund: { ...input.refund, outcome, amountMinor: null }, grant: { state: "not_granted", scope: input.expected.scope } })).toEqual({ kind: "not_final", outcome, revokeUnits: 0 });
  });

  it.each(unbound)("requires review for %s immutable binding even with a Group-looking id", state => {
    const input = evidence();
    expect(assess({ ...input, expected: { state }, refund: { ...input.refund, scope: { ...input.refund.scope, invoiceId: "group_plan:unrecognized" }, recorded: true } })).toEqual(review(`${state}_binding`));
  });

  it("does not trust an unverified provider receipt or its duplicate flag", () => {
    const input = evidence();
    expect(assess({ ...input, refund: { ...input.refund, trust: "untrusted", recorded: true } })).toEqual(review("untrusted_refund"));
  });

  it("reviews missing cumulative refund evidence", () => {
    expect(assess({ ...evidence(), previousSucceededRefundTotalMinor: null })).toEqual(review("unreadable_refund_history"));
  });

  it("reviews an additional distinct refund rather than revoking twice", () => {
    expect(assess({ ...evidence(), previousSucceededRefundTotalMinor: 1 })).toEqual(review("cumulative_refund_exceeds_paid"));
    expect(assess({ ...evidence(), previousSucceededRefundTotalMinor: 2000 })).toEqual(review("cumulative_refund_exceeds_paid"));
  });

  it.each(scopeFields)("rejects a purchased lot from another %s", field => {
    const input = evidence();
    expect(assess({ ...input, grant: { ...input.grant, scope: { ...input.grant.scope, [field]: "different" } } })).toEqual(review("grant_scope_mismatch"));
  });

  it("cannot prevent activation for another allocation", () => {
    const input = evidence();
    expect(assess({ ...input, grant: { state: "not_granted", scope: { ...input.expected.scope, allocationId: "allocation-b" } } })).toEqual(review("grant_scope_mismatch"));
  });

  it("never treats an included plan or an ambiguous grant as a purchased lot", () => {
    expect(assess({ ...evidence(), grant: { state: "included_plan" } })).toEqual(review("included_plan_requires_review"));
    expect(assess({ ...evidence(), grant: { state: "ambiguous" } })).toEqual(review("ambiguous_grant"));
  });

  it("reviews unavailable and insufficient attributable balances without clamping", () => {
    const input = evidence();
    expect(assess({ ...input, grant: { ...input.grant, balance: null } })).toEqual(review("balance_unavailable"));
    expect(assess({ ...input, grant: { ...input.grant, balance: { ...input.grant.balance, availableUnits: 9 } } })).toEqual(review("insufficient_attributable_balance"));
  });

  it.each(scopeFields)("cannot borrow a balance from another %s", field => {
    const input = evidence();
    expect(assess({ ...input, grant: { ...input.grant, balance: { ...input.grant.balance, scope: { ...input.grant.scope, [field]: "different" } } } })).toEqual(review("balance_source_mismatch"));
  });

  it("cannot borrow another level's balance or interpret surplus as this lot", () => {
    const input = evidence();
    expect(assess({ ...input, grant: { ...input.grant, balance: { ...input.grant.balance, level: "early" } } })).toEqual(review("balance_source_mismatch"));
    expect(assess({ ...input, grant: { ...input.grant, balance: { ...input.grant.balance, availableUnits: 11 } } })).toEqual(review("invalid_balance_evidence"));
  });

  it("uses safe subtraction for maximum integer amounts, cumulative totals and lot units", () => {
    const input = evidence();
    const maximum = Number.MAX_SAFE_INTEGER;
    const large = { ...input, expected: { ...input.expected, paidTotalMinor: maximum }, refund: { ...input.refund, amountMinor: maximum } };
    expect(assess(large)).toMatchObject({ kind: "revoke_purchased", revokeUnits: 10 });
    expect(assess({ ...large, previousSucceededRefundTotalMinor: 1 })).toEqual(review("cumulative_refund_exceeds_paid"));
    expect(assess({ ...input, grant: { ...input.grant, grantedUnits: maximum, revokedUnits: maximum - 1, unspentUnits: 1, balance: { ...input.grant.balance, availableUnits: 1 } } })).toMatchObject({ kind: "revoke_purchased", revokeUnits: 1 });
  });
});

describe("strict Group refund evidence contract", () => {
  it("round trips valid evidence and reuses supported currencies and referral levels", () => {
    const input = evidence();
    expect(groupPlanRefundEvidenceSchema.parse(JSON.parse(JSON.stringify(input)))).toEqual(input);
    for (const currency of BILLING_CURRENCIES) {
      for (const level of REFERRAL_LEVELS) {
        expect(assess({ ...input, expected: { ...input.expected, currency }, refund: { ...input.refund, currency }, grant: { ...input.grant, level, balance: { ...input.grant.balance, level } } })).toMatchObject({ kind: "revoke_purchased", level });
      }
    }
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid paid/refunded amounts %s", amount => {
    const input = evidence();
    expect(groupPlanRefundEvidenceSchema.safeParse({ ...input, expected: { ...input.expected, paidTotalMinor: amount } }).success).toBe(false);
    expect(groupPlanRefundEvidenceSchema.safeParse({ ...input, refund: { ...input.refund, amountMinor: amount } }).success).toBe(false);
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid unit/history integers %s", value => {
    const input = evidence();
    for (const field of ["grantedUnits", "revokedUnits", "unspentUnits"]) {
      expect(groupPlanRefundEvidenceSchema.safeParse({ ...input, grant: { ...input.grant, [field]: value } }).success).toBe(false);
    }
    expect(groupPlanRefundEvidenceSchema.safeParse({ ...input, grant: { ...input.grant, balance: { ...input.grant.balance, availableUnits: value } } }).success).toBe(false);
    expect(groupPlanRefundEvidenceSchema.safeParse({ ...input, previousSucceededRefundTotalMinor: value }).success).toBe(false);
  });

  it("rejects malformed and overflowing lot arithmetic instead of rounding", () => {
    const input = evidence();
    for (const grant of [
      { ...input.grant, grantedUnits: 0 },
      { ...input.grant, revokedUnits: 11, unspentUnits: 0 },
      { ...input.grant, revokedUnits: 3, unspentUnits: 8 },
      { ...input.grant, grantedUnits: Number.MAX_SAFE_INTEGER, revokedUnits: Number.MAX_SAFE_INTEGER, unspentUnits: 1 },
    ]) expect(groupPlanRefundEvidenceSchema.safeParse({ ...input, grant }).success).toBe(false);
  });

  it("rejects extra fields at every object boundary", () => {
    const input = evidence();
    const invalid = [
      { ...input, extra: true },
      { ...input, expected: { ...input.expected, extra: true } },
      { ...input, expected: { state: "unmatched", paidTotalMinor: 2000 } },
      { ...input, expected: { ...input.expected, scope: { ...input.expected.scope, extra: true } } },
      { ...input, refund: { ...input.refund, extra: true } },
      { ...input, refund: { ...input.refund, scope: { ...input.refund.scope, extra: true } } },
      { ...input, grant: { ...input.grant, extra: true } },
      { ...input, grant: { ...input.grant, scope: { ...input.grant.scope, extra: true } } },
      { ...input, grant: { ...input.grant, balance: { ...input.grant.balance, accountBalance: 100 } } },
      { ...input, grant: { ...input.grant, balance: { ...input.grant.balance, scope: { ...input.grant.balance.scope, extra: true } } } },
      { ...input, grant: { state: "not_granted", scope: input.expected.scope, candidateId: 1 } },
      { ...input, grant: { state: "included_plan", purchasedUnits: 10 } },
    ];
    for (const value of invalid) expect(groupPlanRefundEvidenceSchema.safeParse(value).success).toBe(false);
  });

  it("rejects missing evidence, invalid identifiers, states and unsupported currency/level", () => {
    const input = evidence();
    const invalid = [
      {}, { ...input, refund: { ...input.refund, refundId: "" } },
      { ...input, expected: { ...input.expected, scope: { ...input.expected.scope, invoiceId: " " } } },
      { ...input, expected: { ...input.expected, currency: "EUR" } },
      { ...input, refund: { ...input.refund, currency: "EUR" } },
      { ...input, refund: { ...input.refund, outcome: "paid" } },
      { ...input, refund: { ...input.refund, recorded: "yes" } },
      { ...input, grant: { ...input.grant, level: "unsupported" } },
      { ...input, previousSucceededRefundTotalMinor: undefined },
    ];
    for (const value of invalid) expect(groupPlanRefundEvidenceSchema.safeParse(value).success).toBe(false);
  });
});
