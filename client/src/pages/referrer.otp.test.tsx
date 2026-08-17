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

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: clerkState.isSignedIn, getToken: vi.fn().mockResolvedValue("test-clerk-token") }),
  useClerk: () => ({ openUserProfile: vi.fn() }),
  useUser: () => ({ isLoaded: true, user: { emailAddresses: [clerkState.emailAddress], createEmailAddress: clerkState.createEmailAddress, reload: clerkState.reload } }),
  useReverification: (action: (...args: any[]) => unknown) => action,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
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

  it("sends a code, verifies it with Clerk, then enrolls only the verified company email", async () => {
    render(<Referrer />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Company email"), { target: { value: "employee@acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(clerkState.createEmailAddress).toHaveBeenCalledWith({ email: "employee@acme.com" }));
    await waitFor(() => expect(clerkState.emailAddress.prepareVerification).toHaveBeenCalledWith({ strategy: "email_code" }));
    fireEvent.change(screen.getByLabelText("One-time code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));
    await waitFor(() => expect(clerkState.emailAddress.attemptVerification).toHaveBeenCalledWith({ code: "123456" }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url).endsWith("/verify-work-email") && String(init?.body).includes("employee@acme.com"))).toBe(true));
  });

  it("sets the passwordless email-code and magic-link expectation before secure employee sign-in", () => {
    clerkState.isSignedIn = false;
    render(<Referrer />);
    expect(screen.getByText(/one-time code or secure magic link/i)).toBeTruthy();
    expect(screen.getByText(/no password required/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Secure employee sign in" })).toBeTruthy();
  });
});
