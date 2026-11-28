import { describe, expect, it } from "vitest";
import { shellActiveNav, shellPageTitle } from "./useGoalShellMeta";

// LAUNCH-qa-fixes (D-371): live QA on release 73be7b31 found /referrer/impact and /invite titled "skipwait.me".
describe("shellPageTitle", () => {
  it.each([
    ["/referrer/impact", "Your impact"],
    ["/invite", "Invite"],
    ["/messages", "Messages"],
    ["/support", "Support"],
    ["/premium", "Premium"],
    ["/agents", "Assistants"],
    ["/work", "Your work"],
  ])("names %s", (path, title) => {
    expect(shellPageTitle(path)).toBe(title);
  });

  it.each([
    ["/explore", "Find a referral"],
    ["/requests", "My referrals"],
    ["/ask", "Ask for a referral"],
    ["/queue", "Referral queue"],
    ["/inbox", "Inbox"],
    ["/plans", "Plans"],
    ["/referrer-home", "Refer"],
  ])("keeps the existing title of %s", (path, title) => {
    expect(shellPageTitle(path)).toBe(title);
  });

  it("falls back to the site name only for an unknown route", () => {
    expect(shellPageTitle("/no-such-page")).toBe("skipwait.me");
  });

  it("does not let /referrer/impact take the /referrer-home title", () => {
    expect(shellPageTitle("/referrer-home")).toBe("Refer");
    expect(shellActiveNav("/referrer/impact")).toBe("find");
  });
});
