// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import GoalLandingV9 from "./GoalLandingV9";

afterEach(cleanup);

describe("GoalLandingV9", () => {
  it("mounts the cookie consent banner when no choice is stored", () => {
    window.localStorage.removeItem("skipwait:cookie-consent");
    render(<GoalLandingV9 />);
    expect(screen.getByRole("dialog", { name: /cookie choices/i })).toBeTruthy();
  });

  it("renders the kicker, both new fair rules and the new employee lead (D-323)", () => {
    render(<GoalLandingV9 />);
    expect(screen.getByText("Verified referral matching")).toBeTruthy();
    expect(screen.getByText(/Nobody can buy a referral/)).toBeTruthy();
    expect(screen.getByText(/The employer's process, every time/)).toBeTruthy();
    expect(screen.getByText(/Review requests when it feels right, and refer only people you believe in, through your company's own referral process/)).toBeTruthy();
  });

  it("guards against forbidden marketing phrases in goal-landing content (D-323)", async () => {
    const landing = await import("@shared/landingContent");
    const forbidden = /buy a referral|paid referral|compliant|approved by/i;
    for (const [key, value] of Object.entries(landing)) {
      if (key.startsWith("GOAL_") || key === "LANDING_TITLE") {
        const text = typeof value === "string" ? value : JSON.stringify(value);
        expect(text).not.toMatch(forbidden);
      }
    }
  });
});
