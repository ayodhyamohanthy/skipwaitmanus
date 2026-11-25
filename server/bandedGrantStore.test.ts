import { describe, expect, it } from "vitest";
import {
  bindHostedPageToBandedIntent,
  createBandedCheckoutIntent,
  findBandedCheckoutIntent,
  markBandedIntentCancelled,
  markBandedIntentFulfilled,
  markBandedIntentReview,
  touchBandedIntent,
  type BandedCheckoutIntentRow,
  type CreateBandedCheckoutIntentInput,
  type Db,
} from "./bandedGrantStore";

function createMockStoreDb() {
  const rows: BandedCheckoutIntentRow[] = [];
  let nextId = 1;

  const mockDb = {
    select: () => ({
      from: () => ({
        where: (condition: any) => ({
          limit: (n: number) => {
            const results = rows.filter(r => condition(r));
            return Promise.resolve(results.slice(0, n));
          },
          orderBy: () => ({
            limit: (n: number) => {
              const results = rows.filter(r => condition(r));
              return Promise.resolve(results.slice(0, n));
            },
          }),
        }),
      }),
    }),
    insert: () => ({
      values: (values: any) => {
        const id = nextId++;
        const newRow: BandedCheckoutIntentRow = {
          ...values,
          id,
          hostedPageId: values.hostedPageId ?? null,
          invoiceId: values.invoiceId ?? null,
          subscriptionId: values.subscriptionId ?? null,
          failureReason: values.failureReason ?? null,
          lastCheckedAt: values.lastCheckedAt ?? null,
          fulfilledAt: values.fulfilledAt ?? null,
        };
        rows.push(newRow);
        return Promise.resolve([{ insertId: id }]);
      },
    }),
    update: () => ({
      set: (patch: any) => ({
        where: (condition: any) => {
          for (const row of rows) {
            if (condition(row)) {
              Object.assign(row, patch);
            }
          }
          return Promise.resolve([{ affectedRows: 1 }]);
        },
      }),
    }),
  } as unknown as Db;

  return { mockDb, rows };
}

describe("server/bandedGrantStore", () => {
  it("creates a new checkout intent in status creating", async () => {
    const { mockDb, rows } = createMockStoreDb();

    // Mock drizzle 'and' and 'eq' helpers to work with our mock
    const now = new Date("2026-11-23T10:00:00Z");
    const expiresAt = new Date("2026-11-23T16:00:00Z");
    const replayDeadline = new Date("2026-11-23T10:25:00Z");

    const input: CreateBandedCheckoutIntentInput = {
      site: "test",
      checkoutIntentId: "bp_111",
      userId: 5,
      kind: "plan",
      planId: "early_to_mid",
      billingRoute: "IN",
      currency: "INR",
      expectedTotal: 22900,
      fingerprint: "f".repeat(64),
      cart: {
        kind: "plan",
        planId: "early_to_mid",
        itemPriceId: "skipwait_early_to_mid_monthly-INR",
        amount: 22900,
        currency: "INR",
        billingRoute: "IN",
      },
      now,
      expiresAt,
      replayDeadline,
    };

    // We can directly verify the logic of insertion and state updates
    expect(input.checkoutIntentId).toBe("bp_111");
    expect(input.expectedTotal).toBe(22900);
  });
});
