import { describe, expect, it, vi } from "vitest";
import { COVERAGE_HELD_BATCH, COVERAGE_WAITING_BATCH, type CoverageDeliveryOutcome } from "./coverageDelivery";
import { createCoverageDeliverySweep, type CoverageDeliverySweepDeps } from "./coverageDeliverySweep";

/*
 * D-062: the hourly coverage-delivery-retry job. The unit of work is one ask;
 * this suite pins the window's shape — waiting asks first, then held ones, the
 * batch bounds, and which outcomes count as progress. A held ask still short of
 * a credit, a blocked pair and an ask that already left the queue are not
 * progress; a delivery and a held ask returned to waiting are.
 */

const NOW = new Date("2026-10-18T12:00:00.000Z").getTime();

function sweep(outcomes: Record<number, CoverageDeliveryOutcome>, overrides: Partial<CoverageDeliverySweepDeps> = {}) {
  const calls: Array<{ id: number; nowMs: number }> = [];
  const deps: CoverageDeliverySweepDeps = {
    listWaiting: vi.fn(async () => []),
    listHeld: vi.fn(async () => []),
    deliver: vi.fn(async (requestId: number, nowMs: number) => {
      calls.push({ id: requestId, nowMs });
      const outcome = outcomes[requestId];
      if (!outcome) throw new Error(`unexpected delivery ${requestId}`);
      return outcome;
    }),
    ...overrides,
  };
  return { run: createCoverageDeliverySweep(deps), deps, calls };
}

const delivered = (requestId: number): CoverageDeliveryOutcome => ({ outcome: "delivered", requestId, referrerId: 2, seekerUserId: 7, companyDomain: "acme.com", creditSpent: true });

describe("coverage-delivery-retry", () => {
  it("processes the waiting batch, then the held batch, both bounded and oldest first", async () => {
    const { run, deps, calls } = sweep({
      11: delivered(11),
      12: { outcome: "waiting", requestId: 12, returnedToWaiting: false },
      21: { outcome: "waiting", requestId: 21, returnedToWaiting: true },
    }, {
      listWaiting: vi.fn(async () => [{ id: 11 }, { id: 12 }]),
      listHeld: vi.fn(async () => [{ id: 21 }]),
    });

    expect(await run({ nowMs: NOW, windowKey: "2026-10-18T12:00" })).toEqual({ processed: 2, failed: 0 });
    expect((deps.listWaiting as ReturnType<typeof vi.fn>).mock.calls).toEqual([[COVERAGE_WAITING_BATCH]]);
    expect((deps.listHeld as ReturnType<typeof vi.fn>).mock.calls).toEqual([[COVERAGE_HELD_BATCH]]);
    expect(calls).toEqual([{ id: 11, nowMs: NOW }, { id: 12, nowMs: NOW }, { id: 21, nowMs: NOW }]);
  });

  it("counts only real progress: a delivery or a held ask returned to waiting", async () => {
    const { run } = sweep({
      11: delivered(11),
      12: { outcome: "held", requestId: 12, seekerUserId: 7, companyDomain: "acme.com" },
      13: { outcome: "blocked", requestId: 13 },
      14: { outcome: "settled", requestId: 14 },
      15: { outcome: "waiting", requestId: 15, returnedToWaiting: true },
    }, {
      listWaiting: vi.fn(async () => [{ id: 11 }, { id: 12 }, { id: 13 }, { id: 14 }, { id: 15 }]),
    });

    expect(await run({ nowMs: NOW, windowKey: "2026-10-18T12:00" })).toEqual({ processed: 2, failed: 0 });
  });

  it("keeps the first failure with its real cause and still works the rest of the batch", async () => {
    const failure = new Error("lease lost");
    const { run, calls } = sweep({ 12: delivered(12) }, {
      listWaiting: vi.fn(async () => [{ id: 11 }, { id: 12 }]),
      deliver: vi.fn(async (requestId: number, nowMs: number) => {
        calls.push({ id: requestId, nowMs });
        if (requestId === 11) throw failure;
        return delivered(requestId);
      }),
    });

    expect(await run({ nowMs: NOW, windowKey: "2026-10-18T12:00" })).toEqual({ processed: 1, failed: 1, firstError: failure });
    expect(calls.map(call => call.id)).toEqual([11, 12]);
  });

  it("does nothing when the window has no asks", async () => {
    const { run } = sweep({});
    expect(await run({ nowMs: NOW, windowKey: "2026-10-18T12:00" })).toEqual({ processed: 0, failed: 0 });
  });
});
