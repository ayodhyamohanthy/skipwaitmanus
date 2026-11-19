import { describe, expect, it, vi } from "vitest";
import { SCHEDULED_JOB_NAMES } from "../shared/scheduledJobs";
import { ASK_TTL_MS, COVERAGE_WAIT_MS } from "../shared/referral";
import { ASK_EXPIRY_SWEEP_BATCH, createAskExpirySweep, type StaleAsk } from "./askExpirySweep";
import { SCHEDULED_JOBS } from "./scheduledJobRegistry";

const NOW = Date.parse("2026-10-14T10:15:00.000Z");
const context = { nowMs: NOW, windowKey: "2026-10-14T10:15Z" };

describe("ask expiry sweep", () => {
  it("asks for stale unclaimed asks with D-061's own window per state (visible 7 days, waiting 90, held personal-link 7), oldest first, in one bounded batch", async () => {
    const listStale = vi.fn(async () => [] as StaleAsk[]);
    const expire = vi.fn();
    expect(await createAskExpirySweep({ listStale, expire })(context)).toEqual({ processed: 0, failed: 0 });
    expect(listStale).toHaveBeenCalledWith({
      visibleBefore: new Date(NOW - ASK_TTL_MS),
      waitingBefore: new Date(NOW - COVERAGE_WAIT_MS),
      heldBefore: new Date(NOW - ASK_TTL_MS),
    }, ASK_EXPIRY_SWEEP_BATCH);
    expect(expire).not.toHaveBeenCalled();
  });

  it("expires each ask as its own seeker only (never another user's id) and counts real transitions", async () => {
    const stale: StaleAsk[] = [{ id: 501, jobSeekerId: 7 }, { id: 502, jobSeekerId: 8 }, { id: 503, jobSeekerId: 7 }];
    // 502 was claimed between the listing and its locked re-check: not expired, not a failure.
    const expire = vi.fn(async (_seeker: number, requestId: number) => ({ expired: requestId !== 502 }));
    const output = await createAskExpirySweep({ listStale: async () => stale, expire })(context);
    expect(output).toEqual({ processed: 2, failed: 0 });
    expect(expire.mock.calls).toEqual([[7, 501, NOW], [8, 502, NOW], [7, 503, NOW]]);
  });

  it("keeps going past a failing ask and reports the first cause", async () => {
    const cause = new Error("Your referral credit wallet is unavailable; contact support to restore this credit");
    const expire = vi.fn(async (_seeker: number, requestId: number) => { if (requestId === 501) throw cause; if (requestId === 502) throw new Error("second"); return { expired: true }; });
    const output = await createAskExpirySweep({ listStale: async () => [{ id: 501, jobSeekerId: 7 }, { id: 502, jobSeekerId: 8 }, { id: 503, jobSeekerId: 9 }], expire })(context);
    expect(output).toEqual({ processed: 1, failed: 2, firstError: cause });
  });

  it("is idempotent across repeated sweeps because expiry itself is", async () => {
    const closed = new Set<number>();
    const expire = vi.fn(async (_seeker: number, requestId: number) => { const fresh = !closed.has(requestId); closed.add(requestId); return { expired: fresh }; });
    const sweep = createAskExpirySweep({ listStale: async () => [{ id: 501, jobSeekerId: 7 }], expire });
    expect((await sweep(context)).processed).toBe(1);
    expect((await sweep(context)).processed).toBe(0);
  });
});

describe("scheduled job registry", () => {
  it("registers exactly the contract's jobs, each once, with whole-minute windows longer than their lease", () => {
    expect(SCHEDULED_JOBS.map(job => job.name)).toEqual([...SCHEDULED_JOB_NAMES]);
    for (const job of SCHEDULED_JOBS) {
      expect(job.windowMs % 60_000).toBe(0);
      expect(job.leaseMs).toBeLessThan(job.windowMs);
      expect(job.description.length).toBeGreaterThan(0);
      expect(job.description.length).toBeLessThanOrEqual(200);
    }
  });
});
