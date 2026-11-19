// @vitest-environment jsdom
// Goal-UI sign-in (D-120 migration): goal line opens the screen per intent,
// intent switch, shared sign-in cores stay wired (seeker social + email code,
// referrer work-email OTP), beta line present, legal copy from moneyCopy.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import GoalSignIn from "./GoalSignIn";
import { MONEY_SENTENCE_SHORT } from "@shared/moneyCopy";

afterEach(cleanup);

describe("GoalSignIn (goal migration)", () => {
  it("opens with the seeker's goal, not a welcome", () => {
    render(<GoalSignIn />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Get referred.");
  });

  it("switches to the referrer goal and work-email OTP on the intent cards", () => {
    render(<GoalSignIn />);
    fireEvent.click(screen.getByRole("button", { name: /Give a referral/ }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Help the right person in.");
    expect(screen.getByTestId("referrer-work-email-otp")).toBeTruthy();
  });

  it("seeker path keeps every provider and the email-code option", () => {
    render(<GoalSignIn />);
    const core = screen.getByTestId("seeker-sign-in");
    for (const provider of ["Google", "Microsoft", "GitHub", "LinkedIn"]) {
      expect(core.textContent).toContain(`Continue with ${provider}`);
    }
    expect(core.textContent).toContain("Continue with email");
  });

  it("goal seeker commits render ink, not kit blue", () => {
    render(<GoalSignIn />);
    const emailCommit = screen.getByRole("button", { name: /Continue with email/ });
    expect(emailCommit.className).toContain("bg-g-ink");
  });

  it("carries the beta line and the legal money sentence", () => {
    render(<GoalSignIn />);
    expect(screen.getByText(/skipwait\.me is in beta/)).toBeTruthy();
    expect(document.body.textContent).toContain(MONEY_SENTENCE_SHORT);
    expect(document.body.textContent).toContain("A referral never guarantees an interview");
  });

  it("marks the screen for QA tooling", () => {
    render(<GoalSignIn />);
    expect(document.querySelector('[data-skipwait-screen="sign-in"]')).toBeTruthy();
  });
});
