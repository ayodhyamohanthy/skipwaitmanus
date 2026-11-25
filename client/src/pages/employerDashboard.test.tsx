// @vitest-environment jsdom
// D-048-K-employer (D-332): the kit /employer page is gone, so its render
// assertions moved to client/src/pages/goal/employer/employer.goal.test.tsx
// (the Ported assertions table in the pull request lists each one). What stays
// here is the data-layer derivation the goal page also relies on:
// employerData.ts is a behaviour-only module
// (client/src/test/goalPagesBoundary.test.ts) and keeps its own tests.
import { describe, expect, it } from "vitest";
import { creditActivity, isJustJoined } from "@/components/employer/employerData";

const NOW = new Date("2026-10-08T04:30:00.000Z").getTime();
const spend = [
  { kind: "credit_purchase", creditsAdded: 25, pack: "starter", createdAt: "2026-10-01T10:00:00.000Z" },
  { kind: "profile_unlock", creditsSpent: 1, displayRef: "Access record", createdAt: "2026-10-05T10:00:00.000Z" },
  { kind: "sponsorship", creditsSpent: 5, tier: "featured", createdAt: "2026-10-02T10:00:00.000Z" },
  { kind: "profile_unlock", creditsSpent: 1, displayRef: "Access record", createdAt: "2026-08-01T10:00:00.000Z" },
];

describe("employer activity derivation", () => {
  const parsedSpend = spend.map(({ kind, createdAt, creditsSpent, creditsAdded }) => ({ kind: kind as "profile_unlock" | "sponsorship" | "credit_purchase", createdAt, creditsSpent, creditsAdded }));

  it("sums only the last 30 days and flags a ledger that may be cut off", () => {
    expect(creditActivity(parsedSpend, NOW).rows.map(row => row.value)).toEqual([25, 1, 5]);
    expect(creditActivity(parsedSpend, NOW).truncated).toBe(false);
    const full = Array.from({ length: 50 }, () => ({ kind: "profile_unlock" as const, creditsSpent: 1, createdAt: "2026-10-07T00:00:00.000Z" }));
    expect(creditActivity(full, NOW).truncated).toBe(true);
  });

  it("treats any credits, budget, role or ledger entry as not just joined", () => {
    const fresh = { id: 1, companyName: "Acme", billingEmail: "a@acme.com", credits: 0, budgetMonthlyUsdCents: 0 };
    expect(isJustJoined(fresh, { access: "open", opportunities: [], spend: [] })).toBe(true);
    expect(isJustJoined({ ...fresh, credits: 3 }, { access: "open", opportunities: [], spend: [] })).toBe(false);
    expect(isJustJoined(fresh, { access: "open", opportunities: [{ id: 1, isActive: true, isSponsored: false }], spend: [] })).toBe(false);
    expect(isJustJoined(fresh, { access: "open", opportunities: [], spend: parsedSpend })).toBe(false);
    expect(isJustJoined(fresh, undefined)).toBe(false);
  });
});
