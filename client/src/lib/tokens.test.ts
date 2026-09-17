import { afterEach, describe, expect, it, vi } from "vitest";
import { addPurchasedTokens, canSpendToken, getJobSeekerTokens, setJobSeekerTokens, spendToken, TOKEN_ACTION_COST, tokenReturnPath } from "./tokens";

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("token action balance rules", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("requires exactly one available token for a referral action", () => {
    expect(TOKEN_ACTION_COST).toBe(1);
    expect(canSpendToken(0)).toBe(false);
    expect(canSpendToken(1)).toBe(true);
  });

  it("never lets a token action take a balance below zero", () => {
    expect(spendToken(3)).toBe(2);
    expect(spendToken(1)).toBe(0);
    expect(spendToken(0)).toBe(0);
  });

  it("restores a Job Seeker from an exhausted balance to a usable request path after a $1 top-up", () => {
    const exhaustedBalance = 0;
    const toppedUpBalance = addPurchasedTokens(exhaustedBalance, 1);
    expect(tokenReturnPath("job_seeker")).toBe("/request");
    expect(toppedUpBalance).toBe(1);
    expect(canSpendToken(toppedUpBalance)).toBe(true);
    expect(spendToken(toppedUpBalance)).toBe(0);
  });

  it("restores a Referrer from an exhausted balance to a usable approval path after a $1 top-up", () => {
    const exhaustedPurchasedBalance = 0;
    const toppedUpPurchasedBalance = addPurchasedTokens(exhaustedPurchasedBalance, 1);
    expect(tokenReturnPath("referrer")).toBe("/referrer");
    expect(toppedUpPurchasedBalance).toBe(1);
    expect(canSpendToken(toppedUpPurchasedBalance)).toBe(true);
    expect(spendToken(toppedUpPurchasedBalance)).toBe(0);
  });

  it("grants the included balance once and then reads back the stored mirror", () => {
    const storage = memoryStorage();
    expect(getJobSeekerTokens(storage)).toBe(3);
    setJobSeekerTokens(1, storage);
    expect(getJobSeekerTokens(storage)).toBe(1);
    storage.setItem("bridge-tokens", "not-a-number");
    expect(getJobSeekerTokens(storage)).toBe(3);
  });

  it("never takes the request page down when browser storage access is blocked", () => {
    vi.stubGlobal("window", {
      get localStorage() { throw new DOMException("Storage blocked", "SecurityError"); },
    });
    expect(getJobSeekerTokens()).toBe(3);
    expect(() => setJobSeekerTokens(2)).not.toThrow();
  });

  it("still falls back to the included balance when a stored write fails", () => {
    const storage = { getItem: () => null, setItem: () => { throw new DOMException("Storage full", "QuotaExceededError"); } };
    expect(getJobSeekerTokens(storage)).toBe(3);
    expect(() => setJobSeekerTokens(2, storage)).not.toThrow();
  });

  it("stores a numeric zero instead of an unreadable balance", () => {
    const storage = memoryStorage();
    expect(getJobSeekerTokens(storage)).toBe(3); // runs the one-time included-balance reset
    setJobSeekerTokens(Number.NaN, storage);
    expect(storage.getItem("bridge-tokens")).toBe("0");
    expect(getJobSeekerTokens(storage)).toBe(0);
    setJobSeekerTokens(-4, storage);
    expect(storage.getItem("bridge-tokens")).toBe("0");
  });
});
