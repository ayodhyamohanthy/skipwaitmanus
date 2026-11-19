import { describe, expect, it } from "vitest";
import { retryAfterSecondsUntil, setRetryAfter } from "./retryAfter";

describe("Retry-After helper", () => {
  it("rounds up and never goes below 1 second", () => {
    expect(retryAfterSecondsUntil(10_500, 10_000)).toBe(1);
    expect(retryAfterSecondsUntil(11_001, 10_000)).toBe(2);
    expect(retryAfterSecondsUntil(5_000, 10_000)).toBe(1);
    expect(retryAfterSecondsUntil(Number.NaN, 10_000)).toBe(1);
  });
  it("sets the header as whole delay-seconds and returns it", () => {
    const set: Array<[string, string]> = [];
    expect(setRetryAfter({ set: (k: string, v: string) => { set.push([k, v]); } } as never, 59.2)).toBe(60);
    expect(set).toEqual([["Retry-After", "60"]]);
  });
});
