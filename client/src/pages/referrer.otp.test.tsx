// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Referrer from "./Referrer";

const clerkState = vi.hoisted(() => {
  const emailAddress = {
    id: "work-email-id",
    emailAddress: "employee@acme.com",
    verification: { status: "unverified" },
    prepareVerification: vi.fn().mockResolvedValue(undefined),
    attemptVerification: vi.fn(async () => {
      emailAddress.verification.status = "verified";
      return { verification: { status: "verified" } };
    }),
  };
  return { emailAddress, createEmailAddress: vi.fn().mockResolvedValue(emailAddress), reload: vi.fn().mockResolvedValue(undefined), isSignedIn: true };
});

const employeeSignInState = vi.hoisted(() => ({
  signIn: { create: vi.fn(), prepareFirstFactor: vi.fn(), attemptFirstFactor: vi.fn() },
  signUp: { create: vi.fn(), prepareEmailAddressVerification: vi.fn(), attemptEmailAddressVerification: vi.fn(), createEmailLinkFlow: vi.fn() },
  setActive: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: clerkState.isSignedIn, getToken: vi.fn().mockResolvedValue("test-clerk-token") }),
  useClerk: () => ({ openUserProfile: vi.fn() }),
  useUser: () => ({ isLoaded: true, user: { emailAddresses: [clerkState.emailAddress], createEmailAddress: clerkState.createEmailAddress, reload: clerkState.reload } }),
  useReverification: (action: (...args: any[]) => unknown) => action,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@clerk/react/legacy", () => ({
  useSignIn: () => ({ isLoaded: true, signIn: employeeSignInState.signIn, setActive: employeeSignInState.setActive }),
  useSignUp: () => ({ isLoaded: true, signUp: employeeSignInState.signUp, setActive: employeeSignInState.setActive }),
}));

describe("Referrer work-email OTP verification", () => {
  beforeEach(() => {
    localStorage.clear();
    clerkState.isSignedIn = true;
    clerkState.emailAddress.verification.status = "unverified";
    clerkState.createEmailAddress.mockClear(); clerkState.reload.mockClear(); clerkState.emailAddress.prepareVerification.mockClear(); clerkState.emailAddress.attemptVerification.mockClear();
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = String(input);
      if (url.endsWith("/inbox")) return { ok: true, json: async () => ({ requests: [] }) };
      if (url.endsWith("/verify-work-email")) return { ok: true, json: async () => ({ verified: true, workEmailDomain: "acme.com" }) };
      return { ok: true, json: async () => ({}) };
    }));
  });

  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("asks a signed-in personal account to switch to the dedicated work-email sign-in instead of adding a potentially taken company address", async () => {
    render(<Referrer />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue with work email" })).toBeTruthy());
    expect(clerkState.createEmailAddress).not.toHaveBeenCalled();
  });

  it("opens directly to one compact company-email OTP action before secure employee sign-in", () => {
    clerkState.isSignedIn = false;
    render(<Referrer />);
    expect(screen.getByLabelText("Company email for secure employee sign in").parentElement?.className).not.toContain("sr-only");
    expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(document.querySelector("[data-skipwait-logo-mark='true']")).toBeNull();
    expect(screen.queryByText("skipwait.me")).toBeNull();
    expect(screen.queryByText(/no password, social sign-in, or personal email access/i)).toBeNull();
  });

  it("rejects a personal email before initiating private Referrer authentication", () => {
    clerkState.isSignedIn = false;
    render(<Referrer />);
    fireEvent.change(screen.getByLabelText("Company email for secure employee sign in"), { target: { value: "person@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(screen.getByText(/personal email providers cannot access private referral requests/i)).toBeTruthy();
    expect(employeeSignInState.signIn.create).not.toHaveBeenCalled();
  });

  it("shows an icon-first request mockup and one voluntary share action only after company-email enrollment", async () => {
    sessionStorage.setItem("skipwait:employee-sign-in-email", "employee@acme.com");
    render(<Referrer />);
    await waitFor(() => expect(document.querySelector('[data-skipwait-empty-preview="referrer"]')).toBeTruthy());
    expect(screen.getByRole("button", { name: "Share with someone looking for work" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back" })).toBeTruthy();
    expect(screen.queryByText(/Here is how a request will arrive/i)).toBeNull();
    expect(screen.queryByText(/Example only/i)).toBeNull();
  });
});
