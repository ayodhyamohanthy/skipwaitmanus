import { describe, expect, it, vi } from "vitest";

// D-174/D-385: with the switch on the hourly sweep must read nothing, close nothing, refund
// nothing and say why — switched off, never deleted (D-042/R-2).
const flags = vi.hoisted(() => ({ noExpiry: true }));
vi.mock("../shared/askNoExpiry", async importOriginal => ({
  ...await importOriginal<typeof import("../shared/askNoExpiry")>(),
  get ASK_NO_EXPIRY_ENABLED() { return flags.noExpiry; },
}));

import { createAskExpirySweep } from "./askExpirySweep";

const NOW = new Date("2026-11-24T12:00:00.000Z").getTime();

describe("ask-expiry-sweep while expiry is suspended (D-174)", () => {
  it("switch on: reads nothing, expires nothing and reports skipped", async () => {
    flags.noExpiry = true;
    const listStale = vi.fn(async () => [{ id: 501, jobSeekerId: 7 }]);
    const expire = vi.fn(async () => ({ expired: true }));
    const output = await createAskExpirySweep({ listStale, expire })({ nowMs: NOW } as never);
    expect(output).toEqual({ processed: 0, failed: 0, skipped: "ask expiry suspended (D-174)" });
    expect(listStale).not.toHaveBeenCalled();
    expect(expire).not.toHaveBeenCalled();
  });

  it("switch off: the sweep still runs today's windows", async () => {
    flags.noExpiry = false;
    const listStale = vi.fn(async () => [{ id: 501, jobSeekerId: 7 }]);
    const expire = vi.fn(async () => ({ expired: true }));
    const output = await createAskExpirySweep({ listStale, expire })({ nowMs: NOW } as never);
    expect(output).toEqual({ processed: 1, failed: 0 });
    expect(listStale).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledWith(7, 501, NOW);
  });
});
