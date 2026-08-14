// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AccountStatus } from "./AccountStatus";

const signOut = vi.fn().mockResolvedValue(undefined);
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: true, signOut }),
  useUser: () => ({ isLoaded: true, user: { firstName: "Ayodhya", primaryEmailAddress: { emailAddress: "ayodhya@skipwait.me" } } }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));

describe("AccountStatus", () => {
  afterEach(() => { cleanup(); signOut.mockClear(); });
  it("shows the signed-in identity, mode-aware switching label, and sign-out", () => {
    render(<AccountStatus mode="job-seeker" />);
    expect(screen.getByText(/Active: ayodhya@skipwait.me/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch to personal email" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("shows a work-email switch in Referrer mode", () => {
    render(<AccountStatus mode="referrer" />);
    expect(screen.getByRole("button", { name: "Switch to work email" })).toBeTruthy();
  });
});
