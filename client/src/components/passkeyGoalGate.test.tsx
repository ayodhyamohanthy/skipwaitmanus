// @vitest-environment jsdom
/**
 * Owner, Oct 26 (phonemsg-01M5VG4PVZCHMZ8T9R4Z1Q1X3Y): no device-credential UI
 * on the old screens. The passkey affordances live in the goal-native seeker
 * sign-in only; the legacy kit page is byte-identical to main.
 */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
  browserSupportsWebAuthn: () => true,
  browserSupportsWebAuthnAutofill: async () => false,
}));
import { SeekerSignIn } from "./SeekerSignIn";
import { GoalSeekerSignIn } from "./goal/GoalSeekerSignIn";

afterEach(() => { cleanup(); });

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
});
