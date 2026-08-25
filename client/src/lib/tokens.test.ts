import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPurchasedTokens, canSpendToken, getJobSeekerTokens, setJobSeekerTokens, spendToken, TOKEN_ACTION_COST, tokenReturnPath } from "./tokens";

describe("token action balance rules", () => {
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

  it("treats a non-finite balance or top-up count as no tokens", () => {
    expect(addPurchasedTokens(Number.NaN, 2)).toBe(2);
    expect(addPurchasedTokens(-5, 2)).toBe(2);
    expect(addPurchasedTokens(1, 2.7)).toBe(3);
    expect(addPurchasedTokens(1, Number.NaN)).toBe(1);
    expect(canSpendToken(Number.NaN)).toBe(false);
  });
});

describe("browser-stored Job Seeker token balance", () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("grants the three free actions once and never re-grants them afterwards", () => {
    expect(getJobSeekerTokens()).toBe(3);
    expect(store.get("bridge-job-seeker-token-reset-3-free-v1")).toBe("complete");

    setJobSeekerTokens(0);
    expect(getJobSeekerTokens()).toBe(0);
  });

  it("restores the free balance when the stored value is missing or unreadable and never stores a negative balance", () => {
    store.set("bridge-job-seeker-token-reset-3-free-v1", "complete");
    store.set("bridge-tokens", "not-a-number");
    expect(getJobSeekerTokens()).toBe(3);

    store.delete("bridge-tokens");
    expect(getJobSeekerTokens()).toBe(3);
    expect(store.get("bridge-tokens")).toBe("3");

    setJobSeekerTokens(-4);
    expect(store.get("bridge-tokens")).toBe("0");
  });

  it("reports the free balance on the server where no browser storage exists", () => {
    vi.stubGlobal("window", undefined);
    expect(getJobSeekerTokens()).toBe(3);
  });
});
