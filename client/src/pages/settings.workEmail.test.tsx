// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Settings from "./Settings";

const profileState = vi.hoisted(() => ({ verified: false }));
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: true, isLoaded: true, signOut: vi.fn(), getToken: vi.fn(async () => null) }),
  useUser: () => ({ user: { emailAddresses: [] } }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: { profile: { mine: { useQuery: () => ({ data: profileState.verified ? { workEmailDomain: "acme.com", workEmailVerifiedAt: new Date() } : null, isLoading: false }) } } },
}));

describe("Settings work email", () => {
  afterEach(() => { cleanup(); profileState.verified = false; window.history.replaceState({}, "", "/"); });

  it("offers Add work email when no verified work email exists", () => {
    render(<Settings />);
    expect(screen.getByText("No verified work email yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add work email" }).getAttribute("href")).toBe("/referrer?setup=work-email");
  });

  it("offers Referrer mode after a work email is verified", () => {
    profileState.verified = true;
    render(<Settings />);
    expect(screen.getByText("Work email verified")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch to Job Referrer mode" })).toBeTruthy();
  });

  it("exposes authenticated privacy controls without claiming an immediate deletion", () => {
    render(<Settings />);
    expect(screen.getByRole("button", { name: "Download my data" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Request account deletion" })).toBeTruthy();
    expect(screen.getByText(/review deletion requests rather than silently removing/i)).toBeTruthy();
  });
});
