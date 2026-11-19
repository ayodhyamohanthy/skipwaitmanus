import { describe, expect, it, vi } from "vitest";
import { FIRST_LOOK_RELEASE_BATCH, createFirstLookRelease, type LapsedFirstLook } from "./firstLookRelease";

const NOW = Date.parse("2026-10-16T12:00:00.000Z");
const context = { nowMs: NOW, windowKey: "2026-10-16T12:00Z" };

describe("first-look release sweep", () => {
  it("asks for lapsed first looks, oldest first, in one bounded batch", async () => {
    const listLapsed = vi.fn(async () => [] as LapsedFirstLook[]);
    const release = vi.fn();
    expect(await createFirstLookRelease({ listLapsed, release })(context)).toEqual({ processed: 0, failed: 0 });
    expect(listLapsed).toHaveBeenCalledWith(new Date(NOW), FIRST_LOOK_RELEASE_BATCH);
    expect(release).not.toHaveBeenCalled();
  });

  it("releases each lapsed ask under its own row lock and counts only real releases", async () => {
    const lapsed: LapsedFirstLook[] = [{ id: 601 }, { id: 602 }, { id: 603 }];
    // 602 was claimed between the listing and its locked re-check: not released, not a failure.
    const release = vi.fn(async (requestId: number) => ({ released: requestId !== 602 }));
    const output = await createFirstLookRelease({ listLapsed: async () => lapsed, release })(context);
    expect(output).toEqual({ processed: 2, failed: 0 });
    expect(release.mock.calls).toEqual([[601, NOW], [602, NOW], [603, NOW]]);
  });

  it("keeps going past a failing ask and reports the first cause", async () => {
    const cause = new Error("Your referral credit wallet is unavailable; contact support to restore this credit");
    const release = vi.fn(async (requestId: number) => {
      if (requestId === 601) throw cause;
      if (requestId === 602) throw new Error("second");
      return { released: true };
    });
    const output = await createFirstLookRelease({ listLapsed: async () => [{ id: 601 }, { id: 602 }, { id: 603 }], release })(context);
    expect(output).toEqual({ processed: 1, failed: 2, firstError: cause });
  });

  it("releases nothing on a repeated sweep because release itself is idempotent", async () => {
    const released = new Set<number>();
    const release = vi.fn(async (requestId: number) => {
      const fresh = !released.has(requestId);
      released.add(requestId);
      return { released: fresh };
    });
    const sweep = createFirstLookRelease({ listLapsed: async () => [{ id: 601 }], release });
    expect((await sweep(context)).processed).toBe(1);
    expect((await sweep(context)).processed).toBe(0);
  });
});
