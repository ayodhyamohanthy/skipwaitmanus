// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ReferralRequest from "./ReferralRequest";

const authState = vi.hoisted(() => ({ signedIn: false }));

vi.mock("@/lib/trpc", () => ({
  trpc: { ai: { draftHiringManagerEmail: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } } },
}));

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: authState.signedIn, getToken: vi.fn().mockResolvedValue("test-clerk-token") }),
  useUser: () => ({ isLoaded: true, user: null }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));

describe("ReferralRequest secure resume handoff", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("bridge-job-seeker-token-reset-3-free-v1", "complete");
    localStorage.setItem("bridge-tokens", "3");
    authState.signedIn = false;
  });

  afterEach(() => cleanup());

  it("opens the secure sign-in handoff from the resume action when authentication is required", () => {
    render(<ReferralRequest />);

    expect(screen.getByRole("button", { name: /add your resume securely/i })).toBeTruthy();
    expect(screen.getByText(/continue with sign-in, then choose your required resume/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /send private referral request/i })).toHaveProperty("disabled", true);
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("shows the real file chooser once the Job Seeker is signed in", () => {
    authState.signedIn = true;
    render(<ReferralRequest />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    expect(fileInput?.disabled).toBe(false);
  });
});
