import { describe, expect, it } from "vitest";
import {
  SANDBOX_REFERRER_EMAIL,
  SANDBOX_SEEKER_EMAIL,
  isSandboxAccount,
  isSandboxReferrer,
  isSandboxSeeker,
  sandboxReachableReferrers,
} from "./sandboxRequests";

// D-393 (a): the demo accounts test any company and any referral in a sandbox.
// These are the contract tests for the one definition every chokepoint asks.

describe("sandbox account identity", () => {
  it("names the two reviewer demo accounts", () => {
    expect(SANDBOX_SEEKER_EMAIL).toBe("seeker@reviewer.skipwait.me");
    expect(SANDBOX_REFERRER_EMAIL).toBe("referrer@reviewer.skipwait.me");
  });

  it("recognises the demo seeker and nobody else", () => {
    expect(isSandboxSeeker("seeker@reviewer.skipwait.me")).toBe(true);
    expect(isSandboxSeeker("  Seeker@Reviewer.SkipWait.Me ")).toBe(true);
    expect(isSandboxSeeker("referrer@reviewer.skipwait.me")).toBe(false);
    expect(isSandboxSeeker("someone@reviewer.skipwait.me")).toBe(false);
    expect(isSandboxSeeker("seeker@example.com")).toBe(false);
    expect(isSandboxSeeker(null)).toBe(false);
    expect(isSandboxSeeker(undefined)).toBe(false);
  });

  it("recognises the demo referrer and nobody else", () => {
    expect(isSandboxReferrer("referrer@reviewer.skipwait.me")).toBe(true);
    expect(isSandboxReferrer("REFERRER@reviewer.skipwait.me")).toBe(true);
    expect(isSandboxReferrer("seeker@reviewer.skipwait.me")).toBe(false);
    expect(isSandboxReferrer("referrer@example.com")).toBe(false);
    expect(isSandboxReferrer(null)).toBe(false);
  });

  it("treats both demo accounts as sandbox accounts", () => {
    expect(isSandboxAccount("seeker@reviewer.skipwait.me")).toBe(true);
    expect(isSandboxAccount("referrer@reviewer.skipwait.me")).toBe(true);
    expect(isSandboxAccount("admin@reviewer.skipwait.me")).toBe(false);
    expect(isSandboxAccount("employer@reviewer.skipwait.me")).toBe(false);
    expect(isSandboxAccount("someone@example.com")).toBe(false);
  });
});

describe("sandbox referrer selection", () => {
  const demo = { userId: 501 };
  const realOne = { userId: 11 };
  const realTwo = { userId: 12 };

  it("sends a sandbox request to the demo referrer alone, never to a real employee", () => {
    expect(sandboxReachableReferrers(true, demo, [realOne, realTwo])).toEqual([demo]);
  });

  it("never falls back to real employees when the demo referrer is missing", () => {
    expect(sandboxReachableReferrers(true, undefined, [realOne, realTwo])).toEqual([]);
  });

  it("leaves a real request's reachable referrers untouched", () => {
    expect(sandboxReachableReferrers(false, demo, [realOne, realTwo])).toEqual([realOne, realTwo]);
  });
});
