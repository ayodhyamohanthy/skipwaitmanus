import { describe, expect, it } from "vitest";
import { addPurchasedTokens, canSpendToken, spendToken, TOKEN_ACTION_COST, tokenReturnPath } from "./tokens";

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
});
