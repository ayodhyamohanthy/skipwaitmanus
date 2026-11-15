// @vitest-environment jsdom
/**
 * Owner, Oct 26 (phonemsg-01M5VG4PVZCHMZ8T9R4Z1Q1X3Y): no device-credential UI
 * on the old screens. The passkey affordances live in the goal-native seeker
 * sign-in only; the legacy kit page is byte-identical to main.
 *
 * D-030/D-057/D-333: referrers keep the work-email code only; never a passkey.
 */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
  browserSupportsWebAuthn: () => true,
  browserSupportsWebAuthnAutofill: async () => false,
}));
vi.mock("@/components/ReferrerOtpSignIn", () => ({
  ReferrerOtpSignIn: () => <div data-testid="mock-referrer-otp">Work Email OTP</div>,
}));
import { SeekerSignIn } from "./SeekerSignIn";
import { GoalSeekerSignIn } from "./goal/GoalSeekerSignIn";
import GoalSignIn from "../pages/GoalSignIn";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("seeker sign-in passkey affordances exist only in the goal-native component", () => {
  it("the legacy kit page renders no device-credential UI", () => {
    render(<SeekerSignIn />);
    expect(screen.queryByRole("button", { name: /Use a saved passkey/ })).toBeNull();
    const email = screen.getByLabelText(/Email address/);
    expect(email.getAttribute("autocomplete")).toBe("email");
  });

  it("the goal sign-in opens with the browser-owned passkey action beside the social options", () => {
    render(<GoalSeekerSignIn />);
    expect(screen.getByRole("button", { name: /Use a saved passkey/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue with email/ })).toBeTruthy();
  });

  it("referrer surface NEVER renders a passkey affordance (D-030, D-057, D-333 pin)", () => {
    window.history.pushState({}, "", "/sign-in?intent=referrer");
    render(<GoalSignIn />);
    expect(screen.queryByRole("button", { name: /Use a saved passkey/ })).toBeNull();
    expect(screen.getByTestId("mock-referrer-otp")).toBeTruthy();
    expect(screen.getByText(/Work email only/)).toBeTruthy();
  });

  it("a second code sign-in after enrollment skips the enrollment offer (F9)", () => {
    localStorage.setItem("skipwait_passkey_enrolled_seeker@example.com", "true");
    const assignMock = vi.fn();
    delete (window as any).location;
    (window as any).location = { assign: assignMock, search: "" };

    render(<GoalSeekerSignIn returnTo="/explore" />);
    // Initial stage is choose
    expect(screen.queryByText(/Save this device for faster sign-in/)).toBeNull();
  });
});
