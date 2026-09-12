import { describe, expect, it, vi } from "vitest";
import { createWorkEmailOtpService } from "./workEmailOtp";

// Regression coverage for the work-email OTP receipt binding.
//
// The receipt (`consumedAt`) used to be looked up by email address alone, so a
// consumed code was treated as proof for whichever account called the enrollment
// endpoint. Because the referrer OTP login flow also consumes a code for the
// same address, any signed-in account that knew a colleague's work email could
// enroll as a verified employee of that company inside the 10-minute window.

type Row = {
  id: number;
  email: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  verifiedByUserId: number | null;
  createdAt: Date;
};

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  updates: [] as Array<Record<string, unknown>>,
}));

const fakeDb = {
  select: () => ({ from: () => ({ where: () => state.rows }) }),
  insert: () => ({ values: () => undefined }),
  update: () => ({
    set: (payload: Record<string, unknown>) => ({
      where: () => {
        state.updates.push(payload);
      },
    }),
  }),
};

vi.mock(import("./db"), async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, getDb: async () => fakeDb };
});

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 1,
    email: "ref@acme.com",
    codeHash: "hash",
    attempts: 0,
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    verifiedByUserId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function reset(rows: Row[]) {
  state.rows = rows;
  state.updates = [];
}

describe("work email OTP receipt is bound to the account that consumed it", () => {
  it("records the consuming account id when a code is verified", async () => {
    reset([row()]);
    const service = createWorkEmailOtpService();
    const verified = await service.verifyCode("ref@acme.com", "123456", {
      verifiedByUserId: 42,
    });
    expect(verified).toBe(true);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ verifiedByUserId: 42 });
    expect(state.updates[0].consumedAt).toBeInstanceOf(Date);
  });

  it("does not let a receipt consumed by another account authorize enrollment", async () => {
    const consumedAt = new Date();
    reset([row({ consumedAt, verifiedByUserId: 42 })]);
    const service = createWorkEmailOtpService();
    // Account 42 consumed the code; account 99 must not inherit the proof.
    expect(
      await service.hasRecentVerification("ref@acme.com", { userId: 42 })
    ).toBe(true);
    expect(
      await service.hasRecentVerification("ref@acme.com", { userId: 99 })
    ).toBe(false);
  });

  it("treats a receipt with no recorded account as unproven (login-flow and pre-migration rows)", async () => {
    reset([row({ consumedAt: new Date(), verifiedByUserId: null })]);
    const service = createWorkEmailOtpService();
    expect(
      await service.hasRecentVerification("ref@acme.com", { userId: 42 })
    ).toBe(false);
  });

  it("requires a caller identity before reporting any proof", async () => {
    reset([row({ consumedAt: new Date(), verifiedByUserId: 42 })]);
    const service = createWorkEmailOtpService();
    expect(
      await service.hasRecentVerification("ref@acme.com", { userId: 0 })
    ).toBe(false);
    expect(
      await service.hasRecentVerification("ref@acme.com", { userId: -1 })
    ).toBe(false);
    expect(
      await service.hasRecentVerification("ref@acme.com", { userId: 1.5 })
    ).toBe(false);
  });

  it("still expires a correctly-attributed receipt once the window has passed", async () => {
    reset([
      row({
        consumedAt: new Date(Date.now() - 11 * 60 * 1000),
        verifiedByUserId: 42,
      }),
    ]);
    const service = createWorkEmailOtpService();
    expect(
      await service.hasRecentVerification("ref@acme.com", { userId: 42 })
    ).toBe(false);
  });
});
