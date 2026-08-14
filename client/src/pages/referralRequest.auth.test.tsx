// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ReferralRequest from "./ReferralRequest";

const authState = vi.hoisted(() => ({ signedIn: false, openSignIn: vi.fn() }));

vi.mock("@/lib/trpc", () => ({
  trpc: { ai: { draftHiringManagerEmail: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } } },
}));

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: authState.signedIn, getToken: vi.fn().mockResolvedValue("test-clerk-token") }),
  useClerk: () => ({ openUserProfile: vi.fn() }),
  useUser: () => ({ isLoaded: true, user: null }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <span onClick={authState.openSignIn}>{children}</span>,
}));

describe("ReferralRequest secure resume handoff", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("bridge-job-seeker-token-reset-3-free-v1", "complete");
    localStorage.setItem("bridge-tokens", "3");
    authState.signedIn = false;
    authState.openSignIn.mockReset();
  });

  afterEach(() => cleanup());

  it("lets unsigned Job Seekers choose a resume before opening sign-in from Send", () => {
    render(<ReferralRequest />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const openFileChooser = vi.spyOn(fileInput, "click");
    fireEvent.click(screen.getByText("Add your resume").closest("button") as HTMLButtonElement);
    expect(openFileChooser).toHaveBeenCalledTimes(1);
    fireEvent.change(fileInput, { target: { files: [new File(["resume"], "avery-resume.pdf", { type: "application/pdf" })] } });
    expect(screen.getByText("avery-resume.pdf")).toBeTruthy();
    const send = screen.getByRole("button", { name: /send private referral request/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(authState.openSignIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /secure sign in/i })).toBeNull();
  });

  it("shows the real file chooser once the Job Seeker is signed in", () => {
    authState.signedIn = true;
    render(<ReferralRequest />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    expect(fileInput?.disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Account menu" })).toBeTruthy();
    const openFileChooser = vi.spyOn(fileInput as HTMLInputElement, "click");
    fireEvent.click(screen.getByText("Add your resume").closest("button") as HTMLButtonElement);
    expect(openFileChooser).toHaveBeenCalledTimes(1);
  });
});
